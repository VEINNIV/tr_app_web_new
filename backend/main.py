"""
TransLingua PDF Servisi (v2 — kutusuz redaction)
=================================================
PyMuPDF (fitz) ile profesyonel kalite çeviri PDF üretimi:
  • Metin koordinatlarını çıkarır
  • Orijinal metni FİZİKSEL olarak siler (add_redact_annot + apply_redactions)
  • Çevirisini aynı bölgeye yazar — gömülü font kullanır

Beyaz kutu / overlay yoktur. Adobe Acrobat'ın Redact aracıyla aynı yöntem.

Kurulum:
    pip install -r requirements.txt

Çalıştırma:
    uvicorn main:app --reload --port 5050

Frontend kullanımı:
    .env.local'e ekle: VITE_PDF_SERVICE_URL=http://localhost:5050
"""

import io
import os
import base64
import json
from typing import Optional

import fitz  # PyMuPDF
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

app = FastAPI(title="TransLingua PDF Service", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Modeller ──────────────────────────────────────────────────────────────────

class TextBlock(BaseModel):
    text: str
    x: float
    y: float
    w: float
    h: float
    fontSize: float
    fontName: str = ""
    bold: bool = False
    color: Optional[list[float]] = None  # [r, g, b] 0-1 aralığında


class PageData(BaseModel):
    pageNum: int
    pageWidthPts: float
    pageHeightPts: float
    blocks: list[TextBlock]


class ExtractResponse(BaseModel):
    pages: list[PageData]
    totalPages: int


# ── Yardımcı ──────────────────────────────────────────────────────────────────

def open_pdf(data: bytes) -> fitz.Document:
    return fitz.open(stream=data, filetype="pdf")


# Türkçe karakter destekli Unicode font (PDF'e gömülür)
# Önce yerel TTF'yi dener; yoksa PyMuPDF'in built-in "helv" (limited unicode)
def get_font_path() -> Optional[str]:
    candidates = [
        os.path.join(os.path.dirname(__file__), "fonts", "NotoSans-Regular.ttf"),
        os.path.join(os.path.dirname(__file__), "..", "public", "fonts", "NotoSans-Regular.ttf"),
        "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            return os.path.abspath(p)
    return None


# ── 1) Metin koordinatı çıkarma ──────────────────────────────────────────────

@app.post("/extract", response_model=ExtractResponse)
async def extract_pdf(file: UploadFile = File(...)):
    """PDF'den tüm metin bloklarını koordinat + font bilgisiyle döndürür."""
    data = await file.read()
    doc = open_pdf(data)
    pages: list[PageData] = []

    for page_idx in range(doc.page_count):
        page: fitz.Page = doc[page_idx]
        pw, ph = page.rect.width, page.rect.height

        text_dict = page.get_text(
            "dict",
            flags=fitz.TEXT_PRESERVE_WHITESPACE | fitz.TEXT_MEDIABOX_CLIP,
        )

        blocks: list[TextBlock] = []
        for blk in text_dict.get("blocks", []):
            if blk.get("type") != 0:
                continue
            for line in blk.get("lines", []):
                spans = line.get("spans", [])
                if not spans:
                    continue
                text = " ".join(s["text"].strip() for s in spans if s["text"].strip())
                if not text:
                    continue
                x0 = min(s["bbox"][0] for s in spans)
                y0 = min(s["bbox"][1] for s in spans)
                x1 = max(s["bbox"][2] for s in spans)
                y1 = max(s["bbox"][3] for s in spans)
                first_span = spans[0]
                fs = float(first_span.get("size", 10))
                font_name = first_span.get("font", "")
                flags = int(first_span.get("flags", 0))
                is_bold = bool(flags & 2**4)

                # Renk: PyMuPDF packed int → [r, g, b] 0-1
                color_int = int(first_span.get("color", 0))
                color_rgb = [
                    ((color_int >> 16) & 0xFF) / 255,
                    ((color_int >> 8)  & 0xFF) / 255,
                    ( color_int        & 0xFF) / 255,
                ]

                blocks.append(TextBlock(
                    text=text,
                    x=max(0.0, x0 / pw),
                    y=max(0.0, y0 / ph),
                    w=min(1.0, (x1 - x0) / pw),
                    h=min(1.0, (y1 - y0) / ph),
                    fontSize=fs,
                    fontName=font_name,
                    bold=is_bold,
                    color=color_rgb,
                ))

        # ── Tablo desteği ────────────────────────────────────────────────
        # find_tables() ile tablo hücrelerini doğru sırada çıkar;
        # hücrelerin üst üste bindiği regular blokları filtrele.
        table_rects_pts: list[fitz.Rect] = []
        table_cell_blocks: list[TextBlock] = []
        try:
            finder = page.find_tables()
            for tab in finder.tables:
                table_rects_pts.append(fitz.Rect(tab.bbox))
                rows = tab.extract()  # list[list[str|None]]
                if not rows:
                    continue
                ncols = max(len(r) for r in rows)
                if ncols == 0:
                    continue
                flat_cells = getattr(tab, "cells", [])
                for r_idx, row in enumerate(rows):
                    for c_idx, cell_text in enumerate(row):
                        if not isinstance(cell_text, str) or not cell_text.strip():
                            continue
                        cell_idx = r_idx * ncols + c_idx
                        if cell_idx >= len(flat_cells):
                            continue
                        cell_bbox = flat_cells[cell_idx]
                        if cell_bbox is None:
                            continue
                        try:
                            cx0 = float(cell_bbox[0])
                            cy0 = float(cell_bbox[1])
                            cx1 = float(cell_bbox[2])
                            cy1 = float(cell_bbox[3])
                        except (TypeError, IndexError):
                            continue
                        if cx1 - cx0 < 2 or cy1 - cy0 < 2:
                            continue
                        table_cell_blocks.append(TextBlock(
                            text=cell_text.strip(),
                            x=max(0.0, cx0 / pw),
                            y=max(0.0, cy0 / ph),
                            w=max(0.0, min(1.0, (cx1 - cx0) / pw)),
                            h=max(0.0, min(1.0, (cy1 - cy0) / ph)),
                            fontSize=9.0,
                            fontName="",
                            bold=False,
                            color=[0.0, 0.0, 0.0],
                        ))
        except Exception as e:
            print(f"  [INFO] Tablo tespiti p{page_idx + 1}: {e}")

        # Tablo alanlarıyla çakışan regular blokları çıkar, tablo hücrelerini ekle
        if table_rects_pts:
            filtered: list[TextBlock] = []
            for b in blocks:
                cx = (b.x + b.w / 2) * pw
                cy = (b.y + b.h / 2) * ph
                in_table = any(
                    tr.x0 <= cx <= tr.x1 and tr.y0 <= cy <= tr.y1
                    for tr in table_rects_pts
                )
                if not in_table:
                    filtered.append(b)
            blocks = filtered + table_cell_blocks
            blocks.sort(key=lambda b: (b.y, b.x))

        pages.append(PageData(
            pageNum=page_idx + 1,
            pageWidthPts=pw,
            pageHeightPts=ph,
            blocks=blocks,
        ))

    doc.close()
    return ExtractResponse(pages=pages, totalPages=len(pages))


# ── 2) Sayfa görüntüsü render ────────────────────────────────────────────────

@app.post("/render-page")
async def render_page(
    file: UploadFile = File(...),
    page_num: int = Form(1),
    scale: float = Form(1.5),
):
    """Belirtilen sayfayı JPEG base64 data URL olarak döndürür."""
    data = await file.read()
    doc = open_pdf(data)

    if page_num < 1 or page_num > doc.page_count:
        raise HTTPException(400, f"Geçersiz sayfa numarası: {page_num}")

    page: fitz.Page = doc[page_num - 1]
    mat = fitz.Matrix(scale, scale)
    pix: fitz.Pixmap = page.get_pixmap(matrix=mat, alpha=False)
    img_bytes = pix.tobytes("jpeg", jpg_quality=88)
    b64 = base64.b64encode(img_bytes).decode()
    doc.close()
    return {
        "imageDataURL": f"data:image/jpeg;base64,{b64}",
        "width": pix.width,
        "height": pix.height,
    }


# ── 3) Redaction tabanlı çeviri yazımı (BEYAZ KUTU YOK) ──────────────────────

@app.post("/write-pdf")
async def write_pdf(
    file: UploadFile = File(...),
    pages_json: str = Form(...),
):
    """
    Profesyonel çeviri yazımı:
      1. Her sayfa için çeviri bloklarına redaction annotation eklenir
      2. apply_redactions() ile orijinal metin fiziksel olarak silinir
         (PDF content stream'inden çıkarılır — beyaz kutu / overlay yok)
      3. Çevrilmiş metin Unicode font ile aynı bölgeye yazılır

    Sonuç: Adobe Acrobat Redact + Edit Text kalitesinde çıktı.
    """
    data = await file.read()
    try:
        pages_data: list[list[dict]] = json.loads(pages_json)
    except json.JSONDecodeError as e:
        raise HTTPException(400, f"Geçersiz JSON: {e}")

    doc = open_pdf(data)

    # Unicode font gömülecekse path'ini al (yoksa varsayılan Helvetica)
    font_path = get_font_path()
    font_alias = "tlfont" if font_path else None

    for page_idx, page_blocks in enumerate(pages_data):
        if page_idx >= doc.page_count:
            break

        page: fitz.Page = doc[page_idx]
        pw, ph = page.rect.width, page.rect.height

        # ── 1. Faz: Tüm metin bölgeleri için redaction annotation ekle ──────
        rects_with_info: list[tuple[fitz.Rect, dict]] = []
        for blk in page_blocks:
            x = float(blk.get("x", 0)) * pw
            y = float(blk.get("y", 0)) * ph
            w = float(blk.get("w", 0)) * pw
            h = float(blk.get("h", 0)) * ph
            text = str(blk.get("translated", "")).strip()
            if not text or w <= 0 or h <= 0:
                continue

            rect = fitz.Rect(
                max(0, x - 0.5),
                max(0, y - 0.5),
                min(pw, x + w + 0.5),
                min(ph, y + h + 0.5),
            )
            page.add_redact_annot(rect, fill=None)
            rects_with_info.append((rect, blk))

        # ── 2. Faz: Redaction'ları uygula — metin fiziksel olarak silinir ──
        page.apply_redactions(
            images=fitz.PDF_REDACT_IMAGE_NONE,
            graphics=fitz.PDF_REDACT_LINE_ART_NONE,
            text=fitz.PDF_REDACT_TEXT_REMOVE,
        )

        # ── 3. Faz: Font'u apply_redactions'tan SONRA kaydet ────────────────
        # apply_redactions() içten clean_contents() çağırır → font kaynakları temizlenir.
        # Bu yüzden font'u redaction'dan SONRA tekrar kaydetmek gerekir.
        effective_alias = None
        if font_path:
            try:
                page.insert_font(fontfile=font_path, fontname="noto")
                effective_alias = "noto"
            except Exception as e:
                print(f"  [WARN] Font kaydedilemedi: {e}")

        # ── 4. Faz: Çevirileri temiz alana yaz ─────────────────────────────
        for rect, blk in rects_with_info:
            text = str(blk.get("translated", "")).strip()
            if not text:
                continue
            fs = float(blk.get("fontSize", 10))

            # Orijinal rengi kullan; yoksa near-black
            raw_color = blk.get("color")
            if isinstance(raw_color, list) and len(raw_color) == 3:
                text_color = tuple(float(c) for c in raw_color)
            else:
                text_color = (0.05, 0.05, 0.08)

            # Font sığdırma: kutuya sığana kadar küçült (min 4pt)
            cur_size = max(fs, 7.0)
            while cur_size >= 4:
                try:
                    rc = page.insert_textbox(
                        rect,
                        text,
                        fontsize=cur_size,
                        fontname=effective_alias if effective_alias else "helv",
                        color=text_color,
                        align=0,
                    )
                    if rc >= 0:
                        break
                except Exception as e:
                    print(f"  [WARN] insert_textbox hatası: {e}")
                    break
                cur_size -= 0.5

    # Optimize edilmiş PDF (referansları temizle, sıkıştır)
    pdf_bytes = doc.tobytes(garbage=4, deflate=True, clean=True)
    doc.close()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=translated.pdf"},
    )


# ── 4) OCR ile metin çıkarma (taranmış PDF'ler için) ─────────────────────────

@app.post("/ocr-extract", response_model=ExtractResponse)
async def ocr_extract(
    file: UploadFile = File(...),
    language: str = Form("tur"),
    min_chars_per_page: int = Form(50),
):
    """
    Taranmış veya görüntü-tabanlı PDF'lerden OCR ile metin çıkarır.
    Tesseract yüklü olması gerekir. Her sayfada yeterli metin varsa
    normal çıkarmayı kullanır; yetersizse OCR'a geçer.

    language: Tesseract dil kodu — tur (Türkçe), eng (İngilizce), vb.
    min_chars_per_page: Bu kadar karakterden azsa sayfa OCR'a gönderilir.
    """
    data = await file.read()
    doc = open_pdf(data)
    pages: list[PageData] = []

    for page_idx in range(doc.page_count):
        page: fitz.Page = doc[page_idx]
        pw, ph = page.rect.width, page.rect.height

        # Önce normal çıkarma dene
        normal_text = page.get_text("text")
        use_ocr = len(normal_text.strip()) < min_chars_per_page

        blocks: list[TextBlock] = []

        if use_ocr:
            # OCR modu: sayfayı rasterize et, Tesseract ile metin çıkar
            try:
                tp = page.get_textpage_ocr(flags=0, language=language, dpi=300, full=False)
                text_dict = page.get_text("dict", textpage=tp,
                                          flags=fitz.TEXT_PRESERVE_WHITESPACE)
            except Exception as ocr_err:
                print(f"  [WARN] OCR başarısız p{page_idx + 1}: {ocr_err}")
                # OCR başarısız → normal çıkarmaya dön
                text_dict = page.get_text(
                    "dict",
                    flags=fitz.TEXT_PRESERVE_WHITESPACE | fitz.TEXT_MEDIABOX_CLIP,
                )
        else:
            text_dict = page.get_text(
                "dict",
                flags=fitz.TEXT_PRESERVE_WHITESPACE | fitz.TEXT_MEDIABOX_CLIP,
            )

        for blk in text_dict.get("blocks", []):
            if blk.get("type") != 0:
                continue
            for line in blk.get("lines", []):
                spans = line.get("spans", [])
                if not spans:
                    continue
                text = " ".join(s["text"].strip() for s in spans if s["text"].strip())
                if not text:
                    continue
                x0 = min(s["bbox"][0] for s in spans)
                y0 = min(s["bbox"][1] for s in spans)
                x1 = max(s["bbox"][2] for s in spans)
                y1 = max(s["bbox"][3] for s in spans)
                first_span = spans[0]
                fs = float(first_span.get("size", 10))

                color_int = int(first_span.get("color", 0))
                color_rgb = [
                    ((color_int >> 16) & 0xFF) / 255,
                    ((color_int >> 8)  & 0xFF) / 255,
                    ( color_int        & 0xFF) / 255,
                ]

                blocks.append(TextBlock(
                    text=text,
                    x=max(0.0, x0 / pw),
                    y=max(0.0, y0 / ph),
                    w=min(1.0, (x1 - x0) / pw),
                    h=min(1.0, (y1 - y0) / ph),
                    fontSize=fs,
                    fontName=first_span.get("font", ""),
                    bold=bool(int(first_span.get("flags", 0)) & 2**4),
                    color=color_rgb,
                ))

        pages.append(PageData(
            pageNum=page_idx + 1,
            pageWidthPts=pw,
            pageHeightPts=ph,
            blocks=blocks,
        ))

    doc.close()
    return ExtractResponse(pages=pages, totalPages=len(pages))


# ── 5) Health + capabilities ──────────────────────────────────────────────────

@app.get("/health")
async def health():
    font_path = get_font_path()
    # Tesseract / OCR desteği kontrol et
    ocr_available = False
    try:
        test_doc = fitz.open()
        test_page = test_doc.new_page()
        test_page.get_textpage_ocr(flags=0, language="eng", dpi=72, full=False)
        test_doc.close()
        ocr_available = True
    except Exception:
        ocr_available = False

    return {
        "status": "ok",
        "pymupdf": fitz.version[0],
        "version": "2.1.0",
        "unicodeFont": bool(font_path),
        "fontPath": font_path,
        "capabilities": {
            "extract": True,
            "render": True,
            "redactionWrite": True,
            "tableExtract": True,
            "ocr": ocr_available,
        },
    }

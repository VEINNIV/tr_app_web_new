"""
TransLingua PDF Servisi (v3 — gelişmiş redaction + görüntü desteği)
===================================================================
PyMuPDF (fitz) ile profesyonel kalite çeviri PDF üretimi:
  • Metin koordinatlarını çıkarır (hizalama + italic tespiti)
  • Paragraf gruplama ile bağlamsal çeviri desteği
  • Orijinal metni FİZİKSEL olarak siler (add_redact_annot + apply_redactions)
  • Çevirisini aynı bölgeye yazar — gömülü font kullanır (bold/regular)
  • Arka plan rengi otomatik örnekleme ile kusursuz redaction
  • Gömülü görselleri çıkarır ve metin değiştirme yapabilir (Pillow)

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
import math
from typing import Optional
from collections import Counter

import fitz  # PyMuPDF
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

# Pillow opsiyonel — görüntü metin değiştirme için gerekli
PILLOW_AVAILABLE = False
try:
    from PIL import Image, ImageDraw, ImageFont
    PILLOW_AVAILABLE = True
except ImportError:
    pass

app = FastAPI(title="TransLingua PDF Service", version="3.0.0")

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
    italic: bool = False
    color: Optional[list[float]] = None  # [r, g, b] 0-1 aralığında
    alignment: int = 0  # 0=sol, 1=orta, 2=sağ


class PageData(BaseModel):
    pageNum: int
    pageWidthPts: float
    pageHeightPts: float
    blocks: list[TextBlock]
    hasImages: bool = False


class ExtractResponse(BaseModel):
    pages: list[PageData]
    totalPages: int
    hasTranslatableImages: bool = False


# ── Paragraf gruplama modelleri ───────────────────────────────────────────────

class ParagraphBlock(BaseModel):
    mergedText: str
    x: float
    y: float
    w: float
    h: float
    fontSize: float
    bold: bool = False
    color: Optional[list[float]] = None
    alignment: int = 0
    blockIndices: list[int]  # orijinal bloklara indeks


class ParagraphPage(BaseModel):
    pageNum: int
    paragraphs: list[ParagraphBlock]
    originalBlockCount: int


class ParagraphResponse(BaseModel):
    pages: list[ParagraphPage]


# ── Görüntü çıkarma modelleri ─────────────────────────────────────────────────

class ImageInfo(BaseModel):
    xref: int
    x: float  # 0-1 oran
    y: float
    w: float
    h: float
    widthPx: int
    heightPx: int
    format: str  # jpeg, png, vb.
    dataBase64: str


class ImagePage(BaseModel):
    pageNum: int
    images: list[ImageInfo]


class ImageExtractResponse(BaseModel):
    pages: list[ImagePage]
    totalImages: int


# ── Yardımcı ──────────────────────────────────────────────────────────────────

def open_pdf(data: bytes) -> fitz.Document:
    return fitz.open(stream=data, filetype="pdf")


# Türkçe karakter destekli Unicode font (PDF'e gömülür)
# Önce yerel TTF'yi dener; yoksa PyMuPDF'in built-in "helv" (limited unicode)
def get_font_path(bold: bool = False) -> Optional[str]:
    """Regular veya Bold font dosyasının yolunu döndürür."""
    filename = "NotoSans-Bold.ttf" if bold else "NotoSans-Regular.ttf"
    candidates = [
        os.path.join(os.path.dirname(__file__), "fonts", filename),
        os.path.join(os.path.dirname(__file__), "..", "public", "fonts", filename),
    ]
    # Fallback: sistem fontları
    if not bold:
        candidates.extend([
            "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
            "C:/Windows/Fonts/arial.ttf",
        ])
    else:
        candidates.extend([
            "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
            "C:/Windows/Fonts/arialbd.ttf",
        ])
    for p in candidates:
        if os.path.exists(p):
            return os.path.abspath(p)
    return None


def detect_alignment(x_ratio: float, w_ratio: float) -> int:
    """
    Metin bloğunun hizalamasını tespit eder.
    0=sol, 1=orta, 2=sağ
    """
    left_margin = x_ratio
    right_margin = 1.0 - (x_ratio + w_ratio)
    center_offset = abs(left_margin - right_margin)
    if center_offset < 0.05 and left_margin > 0.1:
        return 1  # orta
    elif right_margin < 0.08 and left_margin > 0.15:
        return 2  # sağ
    else:
        return 0  # sol


def sample_background_color(page: fitz.Page, rect: fitz.Rect) -> Optional[tuple]:
    """
    Redaction öncesi metin bölgesinin arka plan rengini örnekler.
    Kenar piksellerinden en yaygın rengi bulur.
    (r, g, b) 0-1 aralığında tuple döndürür.
    """
    try:
        # Küçük DPI ile hızlı örnekleme
        clip = fitz.Rect(rect)
        pix = page.get_pixmap(clip=clip, dpi=72, alpha=False)
        w, h = pix.width, pix.height
        if w < 2 or h < 2:
            return None

        edge_pixels: list[tuple] = []

        # Üst satır
        for x in range(w):
            pixel = pix.pixel(x, 0)
            edge_pixels.append(pixel)
        # Alt satır
        for x in range(w):
            pixel = pix.pixel(x, h - 1)
            edge_pixels.append(pixel)
        # Sol sütun
        for y in range(1, h - 1):
            pixel = pix.pixel(0, y)
            edge_pixels.append(pixel)
        # Sağ sütun
        for y in range(1, h - 1):
            pixel = pix.pixel(w - 1, y)
            edge_pixels.append(pixel)

        if not edge_pixels:
            return None

        # En yaygın renk
        most_common = Counter(edge_pixels).most_common(1)[0][0]
        # (R, G, B) 0-255 → 0-1 aralığına dönüştür
        return (most_common[0] / 255.0, most_common[1] / 255.0, most_common[2] / 255.0)
    except Exception as e:
        print(f"  [WARN] Arka plan örnekleme hatası: {e}")
        return None


def _extract_blocks_from_text_dict(
    text_dict: dict,
    pw: float,
    ph: float,
    detect_italic_flag: bool = True,
    detect_align: bool = True,
) -> list[TextBlock]:
    """Text dict'ten TextBlock listesi oluşturur (ortak mantık)."""
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
            is_italic = bool(flags & 2) if detect_italic_flag else False

            # Renk: PyMuPDF packed int → [r, g, b] 0-1
            color_int = int(first_span.get("color", 0))
            color_rgb = [
                ((color_int >> 16) & 0xFF) / 255,
                ((color_int >> 8)  & 0xFF) / 255,
                ( color_int        & 0xFF) / 255,
            ]

            x_ratio = max(0.0, x0 / pw)
            w_ratio = min(1.0, (x1 - x0) / pw)
            alignment = detect_alignment(x_ratio, w_ratio) if detect_align else 0

            blocks.append(TextBlock(
                text=text,
                x=x_ratio,
                y=max(0.0, y0 / ph),
                w=w_ratio,
                h=min(1.0, (y1 - y0) / ph),
                fontSize=fs,
                fontName=font_name,
                bold=is_bold,
                italic=is_italic,
                color=color_rgb,
                alignment=alignment,
            ))
    return blocks


def _page_has_images(page: fitz.Page) -> bool:
    """Sayfada gömülü görüntü olup olmadığını kontrol eder."""
    try:
        images = page.get_image_info(xrefs=True)
        # En az 40x40 piksel boyutunda bir görüntü varsa True
        for img in images:
            w = img.get("width", 0)
            h = img.get("height", 0)
            if w >= 40 and h >= 40:
                return True
    except Exception:
        pass
    return False


# ── 1) Metin koordinatı çıkarma ──────────────────────────────────────────────

@app.post("/extract", response_model=ExtractResponse)
async def extract_pdf(file: UploadFile = File(...)):
    """PDF'den tüm metin bloklarını koordinat + font + hizalama bilgisiyle döndürür."""
    data = await file.read()
    doc = open_pdf(data)
    pages: list[PageData] = []
    any_translatable_images = False

    for page_idx in range(doc.page_count):
        page: fitz.Page = doc[page_idx]
        pw, ph = page.rect.width, page.rect.height

        text_dict = page.get_text(
            "dict",
            flags=fitz.TEXT_PRESERVE_WHITESPACE | fitz.TEXT_MEDIABOX_CLIP,
        )

        blocks = _extract_blocks_from_text_dict(text_dict, pw, ph)

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
                            italic=False,
                            color=[0.0, 0.0, 0.0],
                            alignment=0,
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

        # Sayfada görüntü var mı kontrol et
        has_images = _page_has_images(page)
        if has_images:
            any_translatable_images = True

        pages.append(PageData(
            pageNum=page_idx + 1,
            pageWidthPts=pw,
            pageHeightPts=ph,
            blocks=blocks,
            hasImages=has_images,
        ))

    doc.close()
    return ExtractResponse(
        pages=pages,
        totalPages=len(pages),
        hasTranslatableImages=any_translatable_images,
    )


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
    images_json: Optional[str] = Form(None),
):
    """
    Profesyonel çeviri yazımı:
      1. Her sayfa için çeviri bloklarına arka plan rengi örneklenir
      2. Redaction annotation eklenir (örneklenen arka plan rengiyle)
      3. apply_redactions() ile orijinal metin fiziksel olarak silinir
         (PDF content stream'inden çıkarılır — beyaz kutu / overlay yok)
      4. Regular + Bold font kaydedilir
      5. Çevrilmiş metin Unicode font ile aynı bölgeye yazılır
         (hizalama, bold/regular seçimi, akıllı boyutlandırma)

    Opsiyonel: images_json ile gömülü görseller de değiştirilebilir.

    Sonuç: Adobe Acrobat Redact + Edit Text kalitesinde çıktı.
    """
    data = await file.read()
    try:
        pages_data: list[list[dict]] = json.loads(pages_json)
    except json.JSONDecodeError as e:
        raise HTTPException(400, f"Geçersiz JSON: {e}")

    # Opsiyonel görüntü değiştirme verisi
    image_replacements: list[dict] = []
    if images_json:
        try:
            image_replacements = json.loads(images_json)
        except json.JSONDecodeError as e:
            raise HTTPException(400, f"Geçersiz images_json: {e}")

    doc = open_pdf(data)

    # Unicode font yollarını al
    font_path_regular = get_font_path(bold=False)
    font_path_bold = get_font_path(bold=True)

    for page_idx, page_blocks in enumerate(pages_data):
        if page_idx >= doc.page_count:
            break

        page: fitz.Page = doc[page_idx]
        pw, ph = page.rect.width, page.rect.height

        # ── 1. Faz: Arka plan renklerini REDACTION ÖNCESİ örnekle ──────────
        rects_with_info: list[tuple[fitz.Rect, dict, Optional[tuple]]] = []
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

            # Arka plan rengini redaction öncesi örnekle
            bg_color = sample_background_color(page, rect)

            rects_with_info.append((rect, blk, bg_color))

        # ── 2. Faz: Redaction annotation ekle (arka plan rengiyle) ─────────
        for rect, blk, bg_color in rects_with_info:
            fill_color = bg_color if bg_color else None
            page.add_redact_annot(rect, fill=fill_color)

        # ── 3. Faz: Redaction'ları uygula — metin fiziksel olarak silinir ──
        page.apply_redactions(
            images=fitz.PDF_REDACT_IMAGE_NONE,
            graphics=fitz.PDF_REDACT_LINE_ART_NONE,
            text=fitz.PDF_REDACT_TEXT_REMOVE,
        )

        # ── 4. Faz: Fontları apply_redactions'tan SONRA kaydet ─────────────
        # apply_redactions() içten clean_contents() çağırır → font kaynakları temizlenir.
        # Bu yüzden fontları redaction'dan SONRA tekrar kaydetmek gerekir.
        effective_alias_regular = None
        effective_alias_bold = None
        if font_path_regular:
            try:
                page.insert_font(fontfile=font_path_regular, fontname="noto")
                effective_alias_regular = "noto"
            except Exception as e:
                print(f"  [WARN] Regular font kaydedilemedi: {e}")
        if font_path_bold:
            try:
                page.insert_font(fontfile=font_path_bold, fontname="notobold")
                effective_alias_bold = "notobold"
            except Exception as e:
                print(f"  [WARN] Bold font kaydedilemedi: {e}")

        # ── 5. Faz: Çevirileri temiz alana yaz ────────────────────────────
        for rect, blk, bg_color in rects_with_info:
            text = str(blk.get("translated", "")).strip()
            if not text:
                continue
            fs = float(blk.get("fontSize", 10))
            is_bold = bool(blk.get("bold", False))
            alignment = int(blk.get("alignment", 0))

            # Orijinal rengi kullan; yoksa near-black
            raw_color = blk.get("color")
            if isinstance(raw_color, list) and len(raw_color) == 3:
                text_color = tuple(float(c) for c in raw_color)
            else:
                text_color = (0.05, 0.05, 0.08)

            # Bold/Regular font seçimi
            if is_bold and effective_alias_bold:
                chosen_font = effective_alias_bold
            elif effective_alias_regular:
                chosen_font = effective_alias_regular
            else:
                chosen_font = "helv"

            # Akıllı font boyutlandırma: çeviri uzunluğuna göre ön ayar
            original_text = str(blk.get("original", blk.get("text", "")))
            if original_text and len(original_text) > 0:
                length_ratio = len(text) / len(original_text)
            else:
                length_ratio = 1.0

            start_size = max(fs, 7.0)
            if length_ratio > 1.3:
                # Çeviri orijinalden uzunsa boyutu ön-küçült
                start_size = max(start_size / length_ratio, 5.0)

            # Font sığdırma: kutuya sığana kadar küçült (min 4pt)
            cur_size = start_size
            while cur_size >= 4:
                try:
                    rc = page.insert_textbox(
                        rect,
                        text,
                        fontsize=cur_size,
                        fontname=chosen_font,
                        color=text_color,
                        align=alignment,
                        lineheight=1.2,
                    )
                    if rc >= 0:
                        break
                except Exception as e:
                    print(f"  [WARN] insert_textbox hatası: {e}")
                    break
                cur_size -= 0.5

    # ── Görüntü değiştirme (opsiyonel) ────────────────────────────────────
    for img_rep in image_replacements:
        try:
            page_idx = int(img_rep.get("pageNum", 1)) - 1
            xref = int(img_rep.get("xref", 0))
            img_b64 = str(img_rep.get("imageBase64", ""))
            if page_idx < 0 or page_idx >= doc.page_count or not img_b64:
                continue
            img_bytes = base64.b64decode(img_b64)
            page = doc[page_idx]
            page.replace_image(xref, stream=img_bytes)
        except Exception as e:
            print(f"  [WARN] Görüntü değiştirme hatası xref={img_rep.get('xref')}: {e}")

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
    any_translatable_images = False

    for page_idx in range(doc.page_count):
        page: fitz.Page = doc[page_idx]
        pw, ph = page.rect.width, page.rect.height

        # Önce normal çıkarma dene
        normal_text = page.get_text("text")
        use_ocr = len(normal_text.strip()) < min_chars_per_page

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

        blocks = _extract_blocks_from_text_dict(text_dict, pw, ph)

        # Sayfada görüntü var mı kontrol et
        has_images = _page_has_images(page)
        if has_images:
            any_translatable_images = True

        pages.append(PageData(
            pageNum=page_idx + 1,
            pageWidthPts=pw,
            pageHeightPts=ph,
            blocks=blocks,
            hasImages=has_images,
        ))

    doc.close()
    return ExtractResponse(
        pages=pages,
        totalPages=len(pages),
        hasTranslatableImages=any_translatable_images,
    )


# ── 5) Paragraf gruplama ─────────────────────────────────────────────────────

@app.post("/group-paragraphs", response_model=ParagraphResponse)
async def group_paragraphs(file: UploadFile = File(...)):
    """
    Metin bloklarını paragraf gruplarına ayırır.
    Ardışık bloklar şu koşulları sağlıyorsa aynı paragrafa dahil edilir:
      a) Dikey mesafe < 1.5 * satır yüksekliği
      b) Font boyutu benzer (±%20)
      c) Aynı bold durumu
      d) Yatay örtüşme > %30
    """
    data = await file.read()
    doc = open_pdf(data)
    pages: list[ParagraphPage] = []

    for page_idx in range(doc.page_count):
        page: fitz.Page = doc[page_idx]
        pw, ph = page.rect.width, page.rect.height

        text_dict = page.get_text(
            "dict",
            flags=fitz.TEXT_PRESERVE_WHITESPACE | fitz.TEXT_MEDIABOX_CLIP,
        )

        blocks = _extract_blocks_from_text_dict(text_dict, pw, ph)
        original_block_count = len(blocks)

        if not blocks:
            pages.append(ParagraphPage(
                pageNum=page_idx + 1,
                paragraphs=[],
                originalBlockCount=0,
            ))
            continue

        # Blokları y → x sırasına göre sırala
        blocks.sort(key=lambda b: (b.y, b.x))

        # Paragraf gruplama
        groups: list[list[int]] = [[0]]  # ilk bloğun indeksi

        for i in range(1, len(blocks)):
            prev = blocks[i - 1]
            curr = blocks[i]

            # a) Dikey mesafe kontrolü: gap < 1.5 * satır yüksekliği
            prev_bottom = prev.y + prev.h
            vertical_gap = curr.y - prev_bottom
            line_height = prev.h  # sayfa oranı cinsinden
            vertical_ok = vertical_gap < 1.5 * line_height and vertical_gap >= -0.5 * line_height

            # b) Font boyutu benzerliği (±%20)
            if prev.fontSize > 0 and curr.fontSize > 0:
                size_ratio = min(prev.fontSize, curr.fontSize) / max(prev.fontSize, curr.fontSize)
                size_ok = size_ratio >= 0.8
            else:
                size_ok = True

            # c) Aynı bold durumu
            bold_ok = prev.bold == curr.bold

            # d) Yatay örtüşme > %30
            prev_left = prev.x
            prev_right = prev.x + prev.w
            curr_left = curr.x
            curr_right = curr.x + curr.w
            overlap_left = max(prev_left, curr_left)
            overlap_right = min(prev_right, curr_right)
            overlap_width = max(0, overlap_right - overlap_left)
            min_block_width = min(prev.w, curr.w)
            if min_block_width > 0:
                horizontal_overlap = overlap_width / min_block_width
            else:
                horizontal_overlap = 0
            horizontal_ok = horizontal_overlap > 0.3

            if vertical_ok and size_ok and bold_ok and horizontal_ok:
                groups[-1].append(i)
            else:
                groups.append([i])

        # Gruplardan ParagraphBlock oluştur
        paragraphs: list[ParagraphBlock] = []
        for group_indices in groups:
            group_blocks = [blocks[idx] for idx in group_indices]

            merged_text = " ".join(b.text for b in group_blocks)
            min_x = min(b.x for b in group_blocks)
            min_y = min(b.y for b in group_blocks)
            max_x_w = max(b.x + b.w for b in group_blocks)
            max_y_h = max(b.y + b.h for b in group_blocks)

            first_block = group_blocks[0]

            paragraphs.append(ParagraphBlock(
                mergedText=merged_text,
                x=min_x,
                y=min_y,
                w=max_x_w - min_x,
                h=max_y_h - min_y,
                fontSize=first_block.fontSize,
                bold=first_block.bold,
                color=first_block.color,
                alignment=first_block.alignment,
                blockIndices=group_indices,
            ))

        pages.append(ParagraphPage(
            pageNum=page_idx + 1,
            paragraphs=paragraphs,
            originalBlockCount=original_block_count,
        ))

    doc.close()
    return ParagraphResponse(pages=pages)


# ── 6) Gömülü görselleri çıkarma ─────────────────────────────────────────────

@app.post("/extract-images", response_model=ImageExtractResponse)
async def extract_images(file: UploadFile = File(...)):
    """
    PDF'den gömülü görselleri çıkarır.
    Filtreler:
      - 40x40 pikselden küçük görseller atlanır
      - Dekoratif görseller atlanır (en-boy oranı > 10:1)
    """
    data = await file.read()
    doc = open_pdf(data)
    pages: list[ImagePage] = []
    total_images = 0

    for page_idx in range(doc.page_count):
        page: fitz.Page = doc[page_idx]
        pw, ph = page.rect.width, page.rect.height

        page_images: list[ImageInfo] = []

        try:
            image_infos = page.get_image_info(xrefs=True)
        except Exception as e:
            print(f"  [WARN] Görüntü bilgisi alınamadı p{page_idx + 1}: {e}")
            pages.append(ImagePage(pageNum=page_idx + 1, images=[]))
            continue

        seen_xrefs: set[int] = set()

        for img_info in image_infos:
            xref = img_info.get("xref", 0)
            if xref <= 0 or xref in seen_xrefs:
                continue

            width_px = img_info.get("width", 0)
            height_px = img_info.get("height", 0)

            # Boyut filtresi: 40x40'tan küçükleri atla
            if width_px < 40 or height_px < 40:
                continue

            # Dekoratif filtre: çok dar en-boy oranını atla (> 10:1)
            aspect_ratio = max(width_px, height_px) / max(min(width_px, height_px), 1)
            if aspect_ratio > 10:
                continue

            # Görüntü konumu (bbox → 0-1 oran)
            bbox = img_info.get("bbox", (0, 0, 0, 0))
            img_x = max(0.0, bbox[0] / pw) if pw > 0 else 0
            img_y = max(0.0, bbox[1] / ph) if ph > 0 else 0
            img_w = min(1.0, (bbox[2] - bbox[0]) / pw) if pw > 0 else 0
            img_h = min(1.0, (bbox[3] - bbox[1]) / ph) if ph > 0 else 0

            # Görüntü verisini çıkar
            try:
                extracted = doc.extract_image(xref)
                if not extracted or not extracted.get("image"):
                    continue
                img_bytes = extracted["image"]
                img_format = extracted.get("ext", "png")
                img_b64 = base64.b64encode(img_bytes).decode()
            except Exception as e:
                print(f"  [WARN] Görüntü çıkarılamadı xref={xref}: {e}")
                continue

            seen_xrefs.add(xref)

            page_images.append(ImageInfo(
                xref=xref,
                x=img_x,
                y=img_y,
                w=img_w,
                h=img_h,
                widthPx=width_px,
                heightPx=height_px,
                format=img_format,
                dataBase64=img_b64,
            ))

        total_images += len(page_images)
        pages.append(ImagePage(pageNum=page_idx + 1, images=page_images))

    doc.close()
    return ImageExtractResponse(pages=pages, totalImages=total_images)


# ── 7) Görüntü metin değiştirme (Pillow) ─────────────────────────────────────

@app.post("/replace-image-text")
async def replace_image_text(
    image_base64: str = Form(...),
    image_format: str = Form("png"),
    regions_json: str = Form(...),
):
    """
    Görüntüdeki metin bölgelerini Pillow ile değiştirir.
    Her bölge için:
      1. Arka plan rengi örneklenir (kenar pikselleri)
      2. Bölge arka plan rengiyle doldurulur
      3. Çevrilmiş metin bölgenin ortasına yazılır
    """
    if not PILLOW_AVAILABLE:
        raise HTTPException(
            501,
            "Pillow kütüphanesi yüklü değil. "
            "Görüntü metin değiştirme için 'pip install Pillow>=10.0.0' çalıştırın.",
        )

    try:
        regions: list[dict] = json.loads(regions_json)
    except json.JSONDecodeError as e:
        raise HTTPException(400, f"Geçersiz regions_json: {e}")

    # Görüntüyü aç
    try:
        img_bytes = base64.b64decode(image_base64)
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    except Exception as e:
        raise HTTPException(400, f"Görüntü açılamadı: {e}")

    img_w, img_h = img.size
    draw = ImageDraw.Draw(img)

    # Noto Sans font yolu
    noto_font_path = get_font_path(bold=False)

    for region in regions:
        try:
            # Piksel koordinatlarını hesapla (0-1 oran → piksel)
            rx = int(float(region.get("x", 0)) * img_w)
            ry = int(float(region.get("y", 0)) * img_h)
            rw = int(float(region.get("w", 0)) * img_w)
            rh = int(float(region.get("h", 0)) * img_h)

            if rw <= 0 or rh <= 0:
                continue

            translated = str(region.get("translated", "")).strip()
            if not translated:
                continue

            font_size = int(float(region.get("fontSize", 12)))

            # Arka plan rengi: sağlanan veya kenar piksellerinden örneklenen
            bg_color_input = region.get("bgColor")
            if bg_color_input and isinstance(bg_color_input, list) and len(bg_color_input) == 3:
                bg_color = tuple(int(c) for c in bg_color_input)
            else:
                # Kenar piksellerinden örnekle (4px kenar şeridi)
                bg_color = _sample_pillow_bg(img, rx, ry, rw, rh)

            # Bölgeyi arka plan rengiyle doldur
            draw.rectangle([rx, ry, rx + rw, ry + rh], fill=bg_color)

            # Metin rengi: sağlanan veya kontrast renk
            text_color_input = region.get("textColor")
            if text_color_input and isinstance(text_color_input, list) and len(text_color_input) == 3:
                text_color = tuple(int(c) for c in text_color_input)
            else:
                # Arka plan rengine göre kontrast renk seç
                brightness = (bg_color[0] * 299 + bg_color[1] * 587 + bg_color[2] * 114) / 1000
                text_color = (0, 0, 0) if brightness > 128 else (255, 255, 255)

            # Font yükle
            try:
                if noto_font_path:
                    font = ImageFont.truetype(noto_font_path, size=font_size)
                else:
                    font = ImageFont.load_default()
            except Exception:
                font = ImageFont.load_default()

            # Metni bölgenin ortasına yaz
            text_bbox = draw.textbbox((0, 0), translated, font=font)
            text_w = text_bbox[2] - text_bbox[0]
            text_h = text_bbox[3] - text_bbox[1]
            text_x = rx + (rw - text_w) / 2
            text_y = ry + (rh - text_h) / 2
            draw.text((text_x, text_y), translated, fill=text_color, font=font)

        except Exception as e:
            print(f"  [WARN] Bölge metin değiştirme hatası: {e}")
            continue

    # Sonucu kaydet
    output_format = image_format.upper()
    if output_format == "JPG":
        output_format = "JPEG"

    out_buffer = io.BytesIO()
    try:
        img.save(out_buffer, format=output_format)
    except Exception:
        # Bilinmeyen format → PNG'ye dön
        img.save(out_buffer, format="PNG")
        image_format = "png"

    result_b64 = base64.b64encode(out_buffer.getvalue()).decode()
    return {"imageBase64": result_b64, "format": image_format.lower()}


def _sample_pillow_bg(
    img: "Image.Image", rx: int, ry: int, rw: int, rh: int
) -> tuple:
    """
    Pillow görüntüsünde bir bölgenin kenar piksellerinden arka plan rengi örnekler.
    4px kenar şeridi kullanır.
    """
    edge_pixels: list[tuple] = []
    border = min(4, rw // 2, rh // 2)
    if border < 1:
        border = 1

    for dx in range(rw):
        for dy in range(border):
            # Üst kenar
            px, py = rx + dx, ry + dy
            if 0 <= px < img.width and 0 <= py < img.height:
                edge_pixels.append(img.getpixel((px, py)))
            # Alt kenar
            px, py = rx + dx, ry + rh - 1 - dy
            if 0 <= px < img.width and 0 <= py < img.height:
                edge_pixels.append(img.getpixel((px, py)))

    for dy in range(border, rh - border):
        for dx in range(border):
            # Sol kenar
            px, py = rx + dx, ry + dy
            if 0 <= px < img.width and 0 <= py < img.height:
                edge_pixels.append(img.getpixel((px, py)))
            # Sağ kenar
            px, py = rx + rw - 1 - dx, ry + dy
            if 0 <= px < img.width and 0 <= py < img.height:
                edge_pixels.append(img.getpixel((px, py)))

    if not edge_pixels:
        return (255, 255, 255)

    # En yaygın renk
    most_common = Counter(edge_pixels).most_common(1)[0][0]
    # RGB tuple olarak döndür (zaten tuple)
    if isinstance(most_common, (tuple, list)) and len(most_common) >= 3:
        return (most_common[0], most_common[1], most_common[2])
    return (255, 255, 255)


# ── 8) Health + capabilities ──────────────────────────────────────────────────

@app.get("/health")
async def health():
    font_path = get_font_path(bold=False)
    bold_font_path = get_font_path(bold=True)

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
        "version": "3.0.0",
        "unicodeFont": bool(font_path),
        "fontPath": font_path,
        "boldFontPath": bold_font_path,
        "pillow": PILLOW_AVAILABLE,
        "capabilities": {
            "extract": True,
            "render": True,
            "redactionWrite": True,
            "tableExtract": True,
            "ocr": ocr_available,
            "imageTranslation": PILLOW_AVAILABLE,
            "paragraphGrouping": True,
        },
    }

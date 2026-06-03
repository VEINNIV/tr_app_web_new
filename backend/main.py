"""
TransLingua PDF Servisi (v4 — Temiz Çeviri: fill=None + OpenCV Inpaint)
=======================================================================
Yeni yaklaşım (bant/kutu sorunu çözüldü):

  Yöntem A — "Invisible Ink" (düz/beyaz arka planlar):
    • add_redact_annot(fill=None) → arka plana HİÇ dokunmaz
    • apply_redactions() sadece metin content-stream nesnesini siler
    • Gradyan, şekil, görüntü olduğu gibi korunur
    • Üstüne çeviri yazılır — sıfır bant garantili

  Yöntem B — OpenCV TELEA Inpainting (karmaşık/gradyanlı arka planlar):
    • Sayfa 300 DPI görüntüye dönüştürülür
    • Metin bölgeleri maskelenir
    • cv2.inpaint() komşu piksellerden arka planı yeniden üretir
    • Çeviri doğrudan görüntü üzerine yazılır
    • Sonuç görüntü olarak PDF'e geri gömülür

  Otomatik seçim: arka plan piksel standart sapması > STD_DEV_THRESHOLD ise Yöntem B

Kurulum:
    pip install -r requirements.txt

Çalıştırma:
    uvicorn main:app --reload --port 5050
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

# Pillow opsiyonel — görüntü metin değiştirme için
PILLOW_AVAILABLE = False
try:
    from PIL import Image, ImageDraw, ImageFont
    PILLOW_AVAILABLE = True
except ImportError:
    pass

# OpenCV opsiyonel — inpaint modu için
CV2_AVAILABLE = False
try:
    import cv2
    import numpy as np
    CV2_AVAILABLE = True
except ImportError:
    pass

app = FastAPI(title="TransLingua PDF Service", version="4.0.0")

# ── Yapılandırma ──────────────────────────────────────────────────────────────
_allowed_raw = os.environ.get("ALLOWED_ORIGINS", "*").strip()
ALLOWED_ORIGINS = (
    ["*"] if _allowed_raw == "*" or not _allowed_raw
    else [o.strip() for o in _allowed_raw.split(",") if o.strip()]
)
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "30"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

# Arka plan karmaşıklık eşiği: piksel std sapması bu değerin üzerindeyse Yöntem B
STD_DEV_THRESHOLD = float(os.environ.get("BG_STD_THRESHOLD", "18"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
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
    color: Optional[list[float]] = None
    alignment: int = 0


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
    blockIndices: list[int]


class ParagraphPage(BaseModel):
    pageNum: int
    paragraphs: list[ParagraphBlock]
    originalBlockCount: int


class ParagraphResponse(BaseModel):
    pages: list[ParagraphPage]


class ImageInfo(BaseModel):
    xref: int
    x: float
    y: float
    w: float
    h: float
    widthPx: int
    heightPx: int
    format: str
    dataBase64: str


class ImagePage(BaseModel):
    pageNum: int
    images: list[ImageInfo]


class ImageExtractResponse(BaseModel):
    pages: list[ImagePage]
    totalImages: int


# ── Yardımcı fonksiyonlar ─────────────────────────────────────────────────────

async def read_upload(file: UploadFile) -> bytes:
    """Yüklemeyi okur; boş veya boyut sınırını aşan dosyaları reddeder."""
    data = await file.read()
    if not data:
        raise HTTPException(400, "Boş dosya yüklendi.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Dosya çok büyük (en fazla {MAX_UPLOAD_MB} MB).")
    return data


def open_pdf(data: bytes) -> fitz.Document:
    """PDF'i açar; bozuk/şifreli/PDF-olmayan girdilerde 400 döndürür."""
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as e:
        raise HTTPException(400, f"PDF açılamadı veya geçersiz dosya: {e}")
    if doc.needs_pass:
        doc.close()
        raise HTTPException(400, "Şifre korumalı PDF'ler desteklenmiyor.")
    if doc.page_count == 0:
        doc.close()
        raise HTTPException(400, "PDF hiç sayfa içermiyor.")
    return doc


def get_font_path(bold: bool = False) -> Optional[str]:
    """Regular veya Bold Noto Sans font dosyasının yolunu döndürür."""
    filename = "NotoSans-Bold.ttf" if bold else "NotoSans-Regular.ttf"
    candidates = [
        os.path.join(os.path.dirname(__file__), "fonts", filename),
        os.path.join(os.path.dirname(__file__), "..", "public", "fonts", filename),
    ]
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
    left_margin = x_ratio
    right_margin = 1.0 - (x_ratio + w_ratio)
    center_offset = abs(left_margin - right_margin)
    if center_offset < 0.05 and left_margin > 0.1:
        return 1
    elif right_margin < 0.08 and left_margin > 0.15:
        return 2
    return 0


def _extract_blocks_from_text_dict(
    text_dict: dict,
    pw: float,
    ph: float,
    detect_italic_flag: bool = True,
    detect_align: bool = True,
) -> list[TextBlock]:
    """Text dict'ten TextBlock listesi oluşturur."""
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
    try:
        images = page.get_image_info(xrefs=True)
        for img in images:
            if img.get("width", 0) >= 40 and img.get("height", 0) >= 40:
                return True
    except Exception:
        pass
    return False


# ── Yeni: Arka plan karmaşıklık tespiti ──────────────────────────────────────

def measure_bg_complexity(page_pix, sx: float, sy: float, rect: fitz.Rect) -> float:
    """
    Bir metin bloğunun ETRAFINDA kalan piksel standart sapmasını ölçer.
    Yüksek std sapma → karmaşık arka plan (gradyan, fotoğraf).
    Düşük std sapma → düz renk → Yöntem A yeterli.
    """
    if page_pix is None or not CV2_AVAILABLE:
        return 0.0
    try:
        # Bloğun 5px dışında bir bölgeyi örnekle
        margin = 5
        px0 = max(0, int(rect.x0 * sx) - margin)
        py0 = max(0, int(rect.y0 * sy) - margin)
        px1 = min(page_pix.width,  int(rect.x1 * sx) + margin)
        py1 = min(page_pix.height, int(rect.y1 * sy) + margin)

        if px1 - px0 < 4 or py1 - py0 < 4:
            return 0.0

        # Pixmap'ten numpy array'e
        pix_bytes = page_pix.tobytes("rgb")
        arr = np.frombuffer(pix_bytes, dtype=np.uint8).reshape(
            page_pix.height, page_pix.width, 3
        )
        region = arr[py0:py1, px0:px1]
        return float(np.std(region.astype(np.float32)))
    except Exception:
        return 0.0


def page_pix_to_numpy(page_pix) -> Optional["np.ndarray"]:
    """PyMuPDF Pixmap'i BGR numpy array'e çevirir (OpenCV için)."""
    if not CV2_AVAILABLE:
        return None
    try:
        pix_bytes = page_pix.tobytes("rgb")
        arr = np.frombuffer(pix_bytes, dtype=np.uint8).reshape(
            page_pix.height, page_pix.width, 3
        )
        return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    except Exception:
        return None


# ── YÖNTEMİ B: OpenCV Inpaint ile sayfa işleme ───────────────────────────────

def inpaint_page_and_write(
    page: fitz.Page,
    page_blocks: list[dict],
    font_path_regular: Optional[str],
    font_path_bold: Optional[str],
) -> Optional[bytes]:
    """
    Sayfayı 300 DPI'da rasterize et, metin alanlarını inpaint et,
    çevirileri görüntü üzerine yaz, JPEG olarak döndür.
    None döndürürse Yöntem A'ya geri düş.
    """
    if not CV2_AVAILABLE or not PILLOW_AVAILABLE:
        return None

    pw, ph = page.rect.width, page.rect.height
    dpi = 300
    scale = dpi / 72.0

    try:
        pix = page.get_pixmap(dpi=dpi, alpha=False)
        sx = pix.width / pw
        sy = pix.height / ph
        img_np = page_pix_to_numpy(pix)
        if img_np is None:
            return None
    except Exception as e:
        print(f"  [WARN] Inpaint rasterize hatası: {e}")
        return None

    # Maske oluştur: metin bölgelerini beyaz yap
    mask = np.zeros((pix.height, pix.width), dtype=np.uint8)
    valid_blocks = []
    for blk in page_blocks:
        x = float(blk.get("x", 0)) * pw
        y = float(blk.get("y", 0)) * ph
        w = float(blk.get("w", 0)) * pw
        h = float(blk.get("h", 0)) * ph
        text = str(blk.get("translated", "")).strip()
        if not text or w <= 0 or h <= 0:
            continue

        # Piksel koordinatları (biraz genişlet)
        mx0 = max(0, int((x - 1) * sx))
        my0 = max(0, int((y - 1) * sy))
        mx1 = min(pix.width,  int((x + w + 1) * sx))
        my1 = min(pix.height, int((y + h + 1) * sy))

        mask[my0:my1, mx0:mx1] = 255
        valid_blocks.append((blk, mx0, my0, mx1, my1))

    if not valid_blocks:
        return None

    # TELEA inpainting — komşu piksellerden arka planı yeniden üret
    try:
        inpainted = cv2.inpaint(img_np, mask, inpaintRadius=4, flags=cv2.INPAINT_TELEA)
    except Exception as e:
        print(f"  [WARN] cv2.inpaint hatası: {e}")
        return None

    # Pillow'a geç — metin yazmak için
    img_rgb = cv2.cvtColor(inpainted, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(img_rgb)
    draw = ImageDraw.Draw(pil_img)

    noto_reg = get_font_path(bold=False)
    noto_bold = get_font_path(bold=True)

    for blk, mx0, my0, mx1, my1 in valid_blocks:
        text = str(blk.get("translated", "")).strip()
        if not text:
            continue

        is_bold = bool(blk.get("bold", False))
        fs_pt = float(blk.get("fontSize", 10))
        alignment = int(blk.get("alignment", 0))

        # Piksel font boyutu (pt → px dönüşümü: DPI/72)
        fs_px = max(6, int(fs_pt * dpi / 72))

        # Metin rengi
        raw_color = blk.get("color")
        if isinstance(raw_color, list) and len(raw_color) == 3:
            text_color = tuple(int(c * 255) for c in raw_color)
        else:
            text_color = (13, 13, 20)

        # Font
        font_file = (noto_bold if is_bold else noto_reg) or noto_reg
        font = None
        if font_file:
            try:
                font = ImageFont.truetype(font_file, size=fs_px)
            except Exception:
                pass
        if font is None:
            font = ImageFont.load_default()

        box_w = mx1 - mx0
        box_h = my1 - my0

        # Metni satırlara böl ve kutuya sığdır
        lines = _wrap_text_to_box(draw, text, font, box_w - 4)
        total_h = sum(draw.textbbox((0, 0), ln, font=font)[3] for ln in lines)

        # Kutuya sığmazsa font küçült
        shrink_steps = 0
        while total_h > box_h and fs_px > 6 and shrink_steps < 20:
            fs_px = max(6, fs_px - 1)
            shrink_steps += 1
            if font_file:
                try:
                    font = ImageFont.truetype(font_file, size=fs_px)
                except Exception:
                    pass
            lines = _wrap_text_to_box(draw, text, font, box_w - 4)
            total_h = sum(draw.textbbox((0, 0), ln, font=font)[3] for ln in lines)

        # Dikey ortalama
        cur_y = my0 + max(0, (box_h - total_h) // 2)

        for line in lines:
            lbb = draw.textbbox((0, 0), line, font=font)
            lw = lbb[2] - lbb[0]
            lh = lbb[3] - lbb[1]

            if alignment == 1:  # orta
                cur_x = mx0 + (box_w - lw) / 2
            elif alignment == 2:  # sağ
                cur_x = mx1 - lw - 2
            else:  # sol
                cur_x = mx0 + 2

            draw.text((cur_x, cur_y), line, fill=text_color, font=font)
            cur_y += lh + max(1, int(fs_px * 0.15))

    # JPEG olarak döndür
    out_buf = io.BytesIO()
    pil_img.save(out_buf, format="JPEG", quality=95)
    return out_buf.getvalue()


def _wrap_text_to_box(draw, text: str, font, max_width: int) -> list[str]:
    """Metni verilen genişliğe göre satırlara böler."""
    words = text.split()
    lines = []
    current = ""
    for word in words:
        test = (current + " " + word).strip()
        bb = draw.textbbox((0, 0), test, font=font)
        if bb[2] - bb[0] <= max_width or not current:
            current = test
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or [""]


# ── YÖNTEMİ A: fill=None Redaction (temiz vektör) ────────────────────────────

def write_page_vector_mode(
    page: fitz.Page,
    page_blocks: list[dict],
    font_path_regular: Optional[str],
    font_path_bold: Optional[str],
):
    """
    fill=None redaction ile vektör PDF'e temiz çeviri yazar.
    ✓ Arka plana HİÇ dokunmaz — bant yok, kutu yok
    ✓ Gradyan, şekil, görüntü korunur
    ✓ Metin content-stream'den fiziksel olarak silinir
    """
    pw, ph = page.rect.width, page.rect.height

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
        rects_with_info.append((rect, blk))

    if not rects_with_info:
        return

    # Faz 1: Redaction annotation — fill=None → arka plana hiç dokunma
    for rect, _ in rects_with_info:
        page.add_redact_annot(
            rect,
            fill=None,      # ← KRİTİK: arka plan rengi değişmez
            text="",        # annotation içine metin yazma
        )

    # Faz 2: Redaction'ları uygula — sadece metin nesneleri silinir
    page.apply_redactions(
        images=fitz.PDF_REDACT_IMAGE_NONE,
        graphics=fitz.PDF_REDACT_LINE_ART_NONE,
        text=fitz.PDF_REDACT_TEXT_REMOVE,
    )

    # Faz 3: Fontları apply_redactions'tan SONRA kaydet
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

    # Faz 4: Çevirileri yaz
    for rect, blk in rects_with_info:
        text = str(blk.get("translated", "")).strip()
        if not text:
            continue

        fs = float(blk.get("fontSize", 10))
        is_bold = bool(blk.get("bold", False))
        alignment = int(blk.get("alignment", 0))

        raw_color = blk.get("color")
        if isinstance(raw_color, list) and len(raw_color) == 3:
            text_color = tuple(float(c) for c in raw_color)
        else:
            text_color = (0.05, 0.05, 0.08)

        if is_bold and effective_alias_bold:
            chosen_font = effective_alias_bold
        elif effective_alias_regular:
            chosen_font = effective_alias_regular
        else:
            chosen_font = "helv"

        # Akıllı boyutlandırma: çeviri uzunluğuna göre ön ayar
        original_text = str(blk.get("original", blk.get("text", "")))
        if original_text:
            length_ratio = len(text) / max(len(original_text), 1)
        else:
            length_ratio = 1.0

        start_size = max(fs, 7.0)
        if length_ratio > 1.3:
            start_size = max(start_size / length_ratio, 5.0)

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


# ── 1) Metin koordinatı çıkarma ──────────────────────────────────────────────

@app.post("/extract", response_model=ExtractResponse)
async def extract_pdf(file: UploadFile = File(...)):
    """PDF'den tüm metin bloklarını koordinat + font + hizalama bilgisiyle döndürür."""
    data = await read_upload(file)
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

        # Tablo desteği
        table_rects_pts: list[fitz.Rect] = []
        table_cell_blocks: list[TextBlock] = []
        try:
            finder = page.find_tables()
            for tab in finder.tables:
                table_rects_pts.append(fitz.Rect(tab.bbox))
                rows = tab.extract()
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
                            cx0, cy0, cx1, cy1 = (
                                float(cell_bbox[0]), float(cell_bbox[1]),
                                float(cell_bbox[2]), float(cell_bbox[3]),
                            )
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


# ── 2) Sayfa görüntüsü render ─────────────────────────────────────────────────

@app.post("/render-page")
async def render_page(
    file: UploadFile = File(...),
    page_num: int = Form(1),
    scale: float = Form(1.5),
):
    """Belirtilen sayfayı JPEG base64 data URL olarak döndürür."""
    data = await read_upload(file)
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


# ── 3) Hibrit çeviri yazımı (ANA ENDPOINT) ───────────────────────────────────

@app.post("/write-pdf")
async def write_pdf(
    file: UploadFile = File(...),
    pages_json: str = Form(...),
    image_replacements_json: Optional[str] = Form(None),
    images_json: Optional[str] = Form(None),
    render_mode: str = Form("auto"),  # "auto" | "vector" | "raster"
):
    """
    Hibrit PDF çeviri yazımı:

    AUTO modu:
      • Her sayfa için arka plan karmaşıklığı ölçülür
      • Düz/beyaz arka plan → Yöntem A (fill=None vektör redaction) — BANT YOK
      • Karmaşık/gradyanlı arka plan → Yöntem B (OpenCV inpaint) — MÜKEMMEL TEMİZLİK

    VECTOR modu: Her zaman Yöntem A (hızlı, vektör kalitesi)
    RASTER modu: Her zaman Yöntem B (en temiz görsel kalite)
    """
    data = await read_upload(file)
    try:
        pages_data: list[list[dict]] = json.loads(pages_json)
    except json.JSONDecodeError as e:
        raise HTTPException(400, f"Geçersiz JSON: {e}")

    raw_images = image_replacements_json or images_json
    image_replacements: list[dict] = []
    if raw_images:
        try:
            image_replacements = json.loads(raw_images)
        except json.JSONDecodeError as e:
            raise HTTPException(400, f"Geçersiz image_replacements_json: {e}")

    doc = open_pdf(data)

    font_path_regular = get_font_path(bold=False)
    font_path_bold = get_font_path(bold=True)

    # Raster modda inpaint ile işlenmiş sayfaların pixmap'lerini tutar
    # {page_idx: jpeg_bytes} — sonradan PDF'e görüntü olarak gömülür
    raster_pages: dict[int, bytes] = {}

    for page_idx, page_blocks in enumerate(pages_data):
        if page_idx >= doc.page_count:
            break

        page: fitz.Page = doc[page_idx]
        pw, ph = page.rect.width, page.rect.height

        if not page_blocks:
            continue

        # Hangi yöntemi kullanacağımızı belirle
        use_raster = False

        if render_mode == "raster" and CV2_AVAILABLE and PILLOW_AVAILABLE:
            use_raster = True

        elif render_mode == "auto" and CV2_AVAILABLE and PILLOW_AVAILABLE:
            # Sayfayı hızlı önizleme DPI'da rasterize et ve karmaşıklık ölç
            try:
                preview_pix = page.get_pixmap(dpi=72, alpha=False)
                preview_sx = preview_pix.width / pw if pw > 0 else 1.0
                preview_sy = preview_pix.height / ph if ph > 0 else 1.0

                # Blokların arka plan karmaşıklığını ölç
                max_complexity = 0.0
                for blk in page_blocks[:10]:  # İlk 10 blok yeterli
                    x = float(blk.get("x", 0)) * pw
                    y = float(blk.get("y", 0)) * ph
                    w = float(blk.get("w", 0)) * pw
                    h = float(blk.get("h", 0)) * ph
                    if w <= 0 or h <= 0:
                        continue
                    rect = fitz.Rect(x, y, x + w, y + h)
                    complexity = measure_bg_complexity(preview_pix, preview_sx, preview_sy, rect)
                    max_complexity = max(max_complexity, complexity)

                use_raster = max_complexity > STD_DEV_THRESHOLD
                print(f"  [INFO] Sayfa {page_idx+1}: max_complexity={max_complexity:.1f}, raster={use_raster}")
            except Exception as e:
                print(f"  [WARN] Karmaşıklık ölçümü hatası p{page_idx+1}: {e}")
                use_raster = False

        if use_raster:
            # Yöntem B: OpenCV inpaint
            print(f"  [INFO] Sayfa {page_idx+1}: Yöntem B (OpenCV inpaint)")
            jpeg_bytes = inpaint_page_and_write(page, page_blocks, font_path_regular, font_path_bold)
            if jpeg_bytes:
                raster_pages[page_idx] = jpeg_bytes
            else:
                # Fallback: Yöntem A
                print(f"  [WARN] Sayfa {page_idx+1}: Inpaint başarısız, Yöntem A'ya geç")
                write_page_vector_mode(page, page_blocks, font_path_regular, font_path_bold)
        else:
            # Yöntem A: fill=None redaction
            print(f"  [INFO] Sayfa {page_idx+1}: Yöntem A (fill=None redaction)")
            write_page_vector_mode(page, page_blocks, font_path_regular, font_path_bold)

    # Raster sayfaları PDF'e görüntü olarak gömme
    # Yöntem B ile işlenen sayfalar için: orijinal sayfayı beyaz yap, görüntüyü gömme
    for page_idx, jpeg_bytes in raster_pages.items():
        if page_idx >= doc.page_count:
            continue
        page: fitz.Page = doc[page_idx]
        pw, ph = page.rect.width, page.rect.height

        # Sayfayı temizle ve görüntüyü tam sayfa olarak gömme
        try:
            # Tüm içeriği temizle
            page.clean_contents()
            # Mevcut tüm text/graphics annotation'ları kaldır
            for annot in list(page.annots()):
                page.delete_annot(annot)

            # JPEG'i PyMuPDF formatına çevir
            pil_img = Image.open(io.BytesIO(jpeg_bytes))
            img_w, img_h = pil_img.size

            # Sayfanın tüm içeriğini redact et
            full_rect = fitz.Rect(0, 0, pw, ph)
            page.add_redact_annot(full_rect, fill=(1, 1, 1))
            page.apply_redactions(
                images=fitz.PDF_REDACT_IMAGE_REMOVE,
                graphics=fitz.PDF_REDACT_LINE_ART_REMOVE,
                text=fitz.PDF_REDACT_TEXT_REMOVE,
            )

            # Görüntüyü tam sayfaya gömme
            page.insert_image(
                fitz.Rect(0, 0, pw, ph),
                stream=jpeg_bytes,
                keep_proportion=False,
            )
        except Exception as e:
            print(f"  [WARN] Raster gömme hatası p{page_idx+1}: {e}")

    # Görüntü değiştirme (opsiyonel)
    for img_rep in image_replacements:
        try:
            p_idx = int(img_rep.get("pageNum", 1)) - 1
            xref = int(img_rep.get("xref", 0))
            img_b64 = str(img_rep.get("imageBase64", ""))
            if p_idx < 0 or p_idx >= doc.page_count or not img_b64:
                continue
            img_bytes_rep = base64.b64decode(img_b64)
            doc[p_idx].replace_image(xref, stream=img_bytes_rep)
        except Exception as e:
            print(f"  [WARN] Görüntü değiştirme hatası xref={img_rep.get('xref')}: {e}")

    pdf_bytes = doc.tobytes(garbage=4, deflate=True, clean=True)
    doc.close()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=translated.pdf"},
    )


# ── 4) OCR ile metin çıkarma ──────────────────────────────────────────────────

@app.post("/ocr-extract", response_model=ExtractResponse)
async def ocr_extract(
    file: UploadFile = File(...),
    language: str = Form("tur"),
    min_chars_per_page: int = Form(50),
):
    """
    Taranmış veya görüntü-tabanlı PDF'lerden OCR ile metin çıkarır.
    """
    data = await read_upload(file)
    doc = open_pdf(data)
    pages: list[PageData] = []
    any_translatable_images = False

    for page_idx in range(doc.page_count):
        page: fitz.Page = doc[page_idx]
        pw, ph = page.rect.width, page.rect.height

        normal_text = page.get_text("text")
        use_ocr = len(normal_text.strip()) < min_chars_per_page

        if use_ocr:
            try:
                tp = page.get_textpage_ocr(flags=0, language=language, dpi=300, full=False)
                text_dict = page.get_text("dict", textpage=tp,
                                          flags=fitz.TEXT_PRESERVE_WHITESPACE)
            except Exception as ocr_err:
                print(f"  [WARN] OCR başarısız p{page_idx + 1}: {ocr_err}")
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


# ── 5) Paragraf gruplama ──────────────────────────────────────────────────────

@app.post("/group-paragraphs", response_model=ParagraphResponse)
async def group_paragraphs(file: UploadFile = File(...)):
    """Metin bloklarını paragraf gruplarına ayırır."""
    data = await read_upload(file)
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

        blocks.sort(key=lambda b: (b.y, b.x))
        groups: list[list[int]] = [[0]]

        for i in range(1, len(blocks)):
            prev = blocks[i - 1]
            curr = blocks[i]

            prev_bottom = prev.y + prev.h
            vertical_gap = curr.y - prev_bottom
            line_height = prev.h
            vertical_ok = vertical_gap < 1.5 * line_height and vertical_gap >= -0.5 * line_height

            if prev.fontSize > 0 and curr.fontSize > 0:
                size_ratio = min(prev.fontSize, curr.fontSize) / max(prev.fontSize, curr.fontSize)
                size_ok = size_ratio >= 0.8
            else:
                size_ok = True

            bold_ok = prev.bold == curr.bold

            prev_left, prev_right = prev.x, prev.x + prev.w
            curr_left, curr_right = curr.x, curr.x + curr.w
            overlap_left = max(prev_left, curr_left)
            overlap_right = min(prev_right, curr_right)
            overlap_width = max(0, overlap_right - overlap_left)
            min_block_width = min(prev.w, curr.w)
            horizontal_overlap = overlap_width / min_block_width if min_block_width > 0 else 0
            horizontal_ok = horizontal_overlap > 0.3

            if vertical_ok and size_ok and bold_ok and horizontal_ok:
                groups[-1].append(i)
            else:
                groups.append([i])

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
    """PDF'den gömülü görselleri çıkarır."""
    data = await read_upload(file)
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

            if width_px < 40 or height_px < 40:
                continue

            aspect_ratio = max(width_px, height_px) / max(min(width_px, height_px), 1)
            if aspect_ratio > 10:
                continue

            bbox = img_info.get("bbox", (0, 0, 0, 0))
            img_x = max(0.0, bbox[0] / pw) if pw > 0 else 0
            img_y = max(0.0, bbox[1] / ph) if ph > 0 else 0
            img_w = min(1.0, (bbox[2] - bbox[0]) / pw) if pw > 0 else 0
            img_h = min(1.0, (bbox[3] - bbox[1]) / ph) if ph > 0 else 0

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
                x=img_x, y=img_y, w=img_w, h=img_h,
                widthPx=width_px, heightPx=height_px,
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
    """Görüntüdeki metin bölgelerini Pillow + OpenCV inpaint ile değiştirir."""
    if not PILLOW_AVAILABLE:
        raise HTTPException(501, "Pillow kütüphanesi yüklü değil.")

    try:
        regions: list[dict] = json.loads(regions_json)
    except json.JSONDecodeError as e:
        raise HTTPException(400, f"Geçersiz regions_json: {e}")

    try:
        img_bytes = base64.b64decode(image_base64)
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    except Exception as e:
        raise HTTPException(400, f"Görüntü açılamadı: {e}")

    img_w, img_h = img.size

    # OpenCV inpaint varsa kullan
    if CV2_AVAILABLE:
        img_np = np.array(img)
        img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
        mask = np.zeros((img_h, img_w), dtype=np.uint8)

        for region in regions:
            rx = int(float(region.get("x", 0)) * img_w)
            ry = int(float(region.get("y", 0)) * img_h)
            rw = int(float(region.get("w", 0)) * img_w)
            rh = int(float(region.get("h", 0)) * img_h)
            if rw > 0 and rh > 0:
                mask[ry:ry+rh, rx:rx+rw] = 255

        inpainted_bgr = cv2.inpaint(img_bgr, mask, inpaintRadius=4, flags=cv2.INPAINT_TELEA)
        inpainted_rgb = cv2.cvtColor(inpainted_bgr, cv2.COLOR_BGR2RGB)
        img = Image.fromarray(inpainted_rgb)
    
    draw = ImageDraw.Draw(img)
    noto_font_path = get_font_path(bold=False)

    for region in regions:
        try:
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

            text_color_input = region.get("textColor")
            if text_color_input and isinstance(text_color_input, list) and len(text_color_input) == 3:
                text_color = tuple(int(c) for c in text_color_input)
            else:
                # Bölgenin arka planını örnekle
                bg_sample = _sample_pillow_bg(img, rx, ry, rw, rh)
                brightness = (bg_sample[0] * 299 + bg_sample[1] * 587 + bg_sample[2] * 114) / 1000
                text_color = (0, 0, 0) if brightness > 128 else (255, 255, 255)

            try:
                font = ImageFont.truetype(noto_font_path, size=font_size) if noto_font_path else ImageFont.load_default()
            except Exception:
                font = ImageFont.load_default()

            text_bbox = draw.textbbox((0, 0), translated, font=font)
            text_w = text_bbox[2] - text_bbox[0]
            text_h = text_bbox[3] - text_bbox[1]
            text_x = rx + (rw - text_w) / 2
            text_y = ry + (rh - text_h) / 2
            draw.text((text_x, text_y), translated, fill=text_color, font=font)

        except Exception as e:
            print(f"  [WARN] Bölge metin değiştirme hatası: {e}")
            continue

    output_format = image_format.upper()
    if output_format == "JPG":
        output_format = "JPEG"

    out_buffer = io.BytesIO()
    try:
        img.save(out_buffer, format=output_format)
    except Exception:
        img.save(out_buffer, format="PNG")
        image_format = "png"

    result_b64 = base64.b64encode(out_buffer.getvalue()).decode()
    return {"imageBase64": result_b64, "format": image_format.lower()}


def _sample_pillow_bg(img: "Image.Image", rx: int, ry: int, rw: int, rh: int) -> tuple:
    """Pillow görüntüsünde bir bölgenin kenar piksellerinden arka plan rengi örnekler."""
    edge_pixels: list[tuple] = []
    border = min(4, rw // 2, rh // 2)
    if border < 1:
        border = 1

    for dx in range(rw):
        for dy in range(border):
            px, py = rx + dx, ry + dy
            if 0 <= px < img.width and 0 <= py < img.height:
                edge_pixels.append(img.getpixel((px, py)))
            px, py = rx + dx, ry + rh - 1 - dy
            if 0 <= px < img.width and 0 <= py < img.height:
                edge_pixels.append(img.getpixel((px, py)))

    for dy in range(border, rh - border):
        for dx in range(border):
            px, py = rx + dx, ry + dy
            if 0 <= px < img.width and 0 <= py < img.height:
                edge_pixels.append(img.getpixel((px, py)))
            px, py = rx + rw - 1 - dx, ry + dy
            if 0 <= px < img.width and 0 <= py < img.height:
                edge_pixels.append(img.getpixel((px, py)))

    if not edge_pixels:
        return (255, 255, 255)

    most_common = Counter(edge_pixels).most_common(1)[0][0]
    if isinstance(most_common, (tuple, list)) and len(most_common) >= 3:
        return (most_common[0], most_common[1], most_common[2])
    return (255, 255, 255)


# ── 8) Health + capabilities ──────────────────────────────────────────────────

@app.get("/health")
async def health():
    font_path = get_font_path(bold=False)
    bold_font_path = get_font_path(bold=True)

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
        "version": "4.0.0",
        "unicodeFont": bool(font_path),
        "fontPath": font_path,
        "boldFontPath": bold_font_path,
        "pillow": PILLOW_AVAILABLE,
        "opencv": CV2_AVAILABLE,
        "bgStdThreshold": STD_DEV_THRESHOLD,
        "capabilities": {
            "extract": True,
            "render": True,
            "vectorWrite": True,      # Yöntem A: fill=None redaction
            "inpaintWrite": CV2_AVAILABLE,  # Yöntem B: OpenCV inpaint
            "autoMode": CV2_AVAILABLE and PILLOW_AVAILABLE,
            "tableExtract": True,
            "ocr": ocr_available,
            "imageTranslation": PILLOW_AVAILABLE,
            "paragraphGrouping": True,
        },
    }

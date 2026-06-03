/**
 * Python PDF Servis İstemcisi
 *
 * VITE_PDF_SERVICE_URL ayarlıysa PyMuPDF (fitz) tabanlı Python servisi kullanılır.
 * Bu servis PDF.js'ten çok daha doğru koordinat ve font bilgisi verir.
 *
 * Ayarlı değilse tüm fonksiyonlar null döner → caller PDF.js'e geri döner.
 *
 * Kurulum:
 *   cd backend && pip install -r requirements.txt
 *   uvicorn main:app --reload --port 5050
 *
 * .env.local:
 *   VITE_PDF_SERVICE_URL=http://localhost:5050
 */

const RAW_SERVICE_URL = (import.meta.env.VITE_PDF_SERVICE_URL as string | undefined)?.replace(/\/$/, '');

// Üretim build'inde localhost servis URL'sini yok say. .env.local'deki dev değeri
// (http://localhost:5050) yanlışlıkla prod bundle'ına gömülürse, kullanıcı tarayıcısında
// her PDF işleminde başarısız fetch denemesi yapılmasın (PDF.js fallback'i zaten devrede).
const SERVICE_URL =
  import.meta.env.PROD && RAW_SERVICE_URL && /\/\/(localhost|127\.0\.0\.1)/.test(RAW_SERVICE_URL)
    ? undefined
    : RAW_SERVICE_URL;

export function isPDFServiceAvailable(): boolean {
  return !!SERVICE_URL;
}

export interface ServiceTextBlock {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  fontName: string;
  bold: boolean;
  /** Orijinal metin rengi [r, g, b] 0-1 aralığında */
  color?: [number, number, number];
  alignment?: number;
}

export interface ServicePageData {
  pageNum: number;
  pageWidthPts: number;
  pageHeightPts: number;
  blocks: ServiceTextBlock[];
}

/**
 * PDF dosyasından tüm sayfaların metin bloklarını PyMuPDF ile çıkarır.
 * Başarısız olursa null döner (caller PDF.js'e geçer).
 */
export async function extractPDFPages(file: File): Promise<ServicePageData[] | null> {
  if (!SERVICE_URL) return null;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`${SERVICE_URL}/extract`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      console.warn(`PDF servisi /extract hatası: HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data.pages as ServicePageData[];
  } catch (e) {
    console.warn('PDF servisine ulaşılamıyor, PDF.js kullanılıyor:', e);
    return null;
  }
}

/**
 * Belirtilen sayfayı Python servisiyle render eder.
 * Başarısız olursa null döner (caller PDF.js render kullanır).
 */
export async function renderPageWithService(
  file: File,
  pageNum: number,
  scale = 1.5,
): Promise<string | null> {
  if (!SERVICE_URL) return null;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('page_num', String(pageNum));
  formData.append('scale', String(scale));

  try {
    const res = await fetch(`${SERVICE_URL}/render-page`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.imageDataURL as string;
  } catch {
    return null;
  }
}

/**
 * Çevrilmiş overlay bloklarını PDF'e doğrudan yazar.
 * PyMuPDF font-scaling ile orijinal bounding box'a tam sığdırır.
 * Başarısız olursa null döner (caller jsPDF overlay yöntemini kullanır).
 */
/**
 * render_mode:
 *   'auto'   — arka plan karmaşıklığına göre otomatik seç (varsayılan)
 *   'vector' — her zaman fill=None redaction (hızlı, vektör kalitesi)
 *   'raster' — her zaman OpenCV inpaint (en temiz görsel, yavaş)
 */
export type RenderMode = 'auto' | 'vector' | 'raster';

export async function writePDFWithTranslations(
  file: File,
  pages: Array<Array<{
    x: number; y: number; w: number; h: number;
    fontSize: number; translated: string; original: string;
    color?: [number, number, number];
    bold?: boolean;
    alignment?: number;
  }>>,
  imageReplacements?: Array<{ pageNum: number; xref: number; imageBase64: string }>,
  renderMode: RenderMode = 'auto',
): Promise<Blob | null> {
  if (!SERVICE_URL) return null;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('pages_json', JSON.stringify(pages));
  formData.append('render_mode', renderMode);
  if (imageReplacements && imageReplacements.length > 0) {
    formData.append('image_replacements_json', JSON.stringify(imageReplacements));
  }

  try {
    const res = await fetch(`${SERVICE_URL}/write-pdf`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

/** Servisin çalışıp çalışmadığını kontrol eder */
export async function checkServiceHealth(): Promise<boolean> {
  if (!SERVICE_URL) return false;
  try {
    const res = await fetch(`${SERVICE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export interface ServiceCapabilities {
  available: boolean;
  version?: string;
  unicodeFont?: boolean;
  /** Yöntem A: fill=None redaction (v4+) */
  vectorWrite?: boolean;
  /** Yöntem B: OpenCV TELEA inpaint (v4+) */
  inpaintWrite?: boolean;
  /** Otomatik mod: karmaşıklığa göre A/B seçimi (v4+) */
  autoMode?: boolean;
  /** Eski alan adı — geriye dönük uyumluluk */
  redactionWrite?: boolean;
  imageTranslation?: boolean;
  paragraphGrouping?: boolean;
  opencv?: boolean;
}

export async function getServiceCapabilities(): Promise<ServiceCapabilities> {
  if (!SERVICE_URL) return { available: false };
  try {
    const res = await fetch(`${SERVICE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { available: false };
    const data = await res.json();
    return {
      available: true,
      version: data.version,
      unicodeFont: data.unicodeFont,
      opencv: data.opencv,
      vectorWrite: data.capabilities?.vectorWrite,
      inpaintWrite: data.capabilities?.inpaintWrite,
      autoMode: data.capabilities?.autoMode,
      // Geriye dönük uyumluluk
      redactionWrite: data.capabilities?.vectorWrite ?? data.capabilities?.redactionWrite,
      imageTranslation: data.capabilities?.imageTranslation,
      paragraphGrouping: data.capabilities?.paragraphGrouping,
    };
  } catch {
    return { available: false };
  }
}

/** PDF'deki gömülü görselleri PyMuPDF ile çıkarır */
export async function extractPDFImages(file: File): Promise<{
  pages: Array<{
    pageNum: number;
    images: Array<{
      xref: number;
      x: number; y: number; w: number; h: number;
      widthPx: number; heightPx: number;
      format: string;
      dataBase64: string;
    }>;
  }>;
  totalImages: number;
} | null> {
  if (!SERVICE_URL) return null;
  const formData = new FormData();
  formData.append('file', file);
  try {
    const res = await fetch(`${SERVICE_URL}/extract-images`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Görseldeki metni Pillow ile değiştirir */
export async function replaceImageText(
  imageBase64: string,
  imageFormat: string,
  regions: Array<{
    x: number; y: number; w: number; h: number;
    fontSize: number;
    original: string;
    translated: string;
    textColor?: [number, number, number];
    bgColor?: [number, number, number] | null;
  }>,
): Promise<{ imageBase64: string; format: string } | null> {
  if (!SERVICE_URL) return null;
  const formData = new FormData();
  formData.append('image_base64', imageBase64);
  formData.append('image_format', imageFormat);
  formData.append('regions_json', JSON.stringify(regions));
  try {
    const res = await fetch(`${SERVICE_URL}/replace-image-text`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** PDF'deki metin bloklarını paragraf olarak gruplar */
export async function groupParagraphs(file: File): Promise<Array<{
  pageNum: number;
  paragraphs: Array<{
    mergedText: string;
    x: number; y: number; w: number; h: number;
    fontSize: number;
    bold: boolean;
    color: [number, number, number] | null;
    alignment: number;
    blockIndices: number[];
  }>;
  originalBlockCount: number;
}> | null> {
  if (!SERVICE_URL) return null;
  const formData = new FormData();
  formData.append('file', file);
  try {
    const res = await fetch(`${SERVICE_URL}/group-paragraphs`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.pages;
  } catch {
    return null;
  }
}

/** PDF'de çevrilebilir görseller olup olmadığını kontrol eder */
export async function checkForTranslatableImages(file: File): Promise<boolean> {
  if (!SERVICE_URL) return false;
  const formData = new FormData();
  formData.append('file', file);
  try {
    const res = await fetch(`${SERVICE_URL}/extract`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.hasTranslatableImages === true;
  } catch {
    return false;
  }
}

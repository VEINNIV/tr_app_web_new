/**
 * Çeviri PDF indirme yardımcıları (tekli + toplu).
 *
 * Bir belgenin Türkçe çeviri PDF'ini üretir:
 *  • Overlay verisi varsa → buildTranslatedPDF (orijinal düzeni koruyan GERÇEK PDF)
 *  • Yoksa (eski belge)   → buildTextPDF (temiz, Unicode-güvenli metin PDF'i)
 *
 * Bu sayede toplu indirme artık ".txt" değil gerçek ".pdf" üretir.
 */
import { supabase } from './supabase';
import type { OverlayData } from '../types';

export interface TranslatedDocLike {
  original_name: string;
  original_storage_path: string;
  translation?: {
    translated_text?: { pages?: string[]; overlay?: OverlayData } | null;
  } | null;
}

/** Storage'daki orijinal PDF'i imzalı URL ile çek. */
async function fetchOriginalBytes(storagePath: string): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage
    .from('originals')
    .createSignedUrl(storagePath, 3600);
  if (error || !data?.signedUrl) throw new Error('Orijinal PDF URL alınamadı');
  const res = await fetch(data.signedUrl);
  if (!res.ok) throw new Error('Orijinal PDF indirilemedi');
  return res.arrayBuffer();
}

/** Belgenin indirilebilir bir çevirisi (overlay veya metin) var mı? */
export function hasDownloadableTranslation(doc: TranslatedDocLike): boolean {
  const tt = doc.translation?.translated_text;
  if (!tt) return false;
  return !!tt.overlay?.pages?.length || !!(tt.pages && tt.pages.join('').trim());
}

/** Tek belgenin Türkçe çeviri PDF byte'larını üretir. */
export async function buildDocTranslatedPDF(doc: TranslatedDocLike): Promise<Uint8Array> {
  const tt = doc.translation?.translated_text;
  const overlay = tt?.overlay;
  const { buildTranslatedPDF, buildTextPDF } = await import('./pdfWriter');

  if (overlay?.pages?.length && doc.original_storage_path) {
    try {
      const bytes = await fetchOriginalBytes(doc.original_storage_path);
      return await buildTranslatedPDF({ originalPDF: bytes, pages: overlay.pages, renderMode: 'auto' });
    } catch {
      // Orijinal çekilemedi / derleme hatası → metin PDF'ine düş
    }
  }

  const text = (tt?.pages ?? []).join('\n\n');
  if (!text.trim()) throw new Error('Çeviri metni bulunamadı');
  return buildTextPDF(text, doc.original_name.replace(/\.pdf$/i, ''));
}

/** Dosya adı güvenli hale getir: "Rapor.pdf" → "Rapor_TR.pdf" */
export function translatedPdfName(originalName: string): string {
  const base = originalName.replace(/\.pdf$/i, '').replace(/[^\w\d\-_ ]+/g, '_').trim() || 'belge';
  return `${base}_TR.pdf`;
}

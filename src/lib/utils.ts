const TR_DATE_OPTS: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
};

/** Tarihi Türkçe uzun formata çevirir: "22 Mayıs 2026" */
export function formatTrDate(date?: string | Date | number): string {
  return new Date(date ?? Date.now()).toLocaleDateString('tr-TR', TR_DATE_OPTS);
}

/** Byte'ı okunabilir boyuta çevirir: "1.4 MB" */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(1))} ${units[i]}`;
}

export interface QualityScore {
  score: number;   // 0–100
  label: string;   // e.g. "Mükemmel"
  color: string;   // CSS color token value
}

/**
 * Deterministic quality score based on document metadata.
 * Factors: page density (bytes/page), page count range, and a doc-id seed for variety.
 * Only meaningful for completed translations.
 */
export function getQualityScore(
  pageCount: number,
  fileSizeBytes: number,
  docId: string,
): QualityScore {
  // Seed from last 4 chars of doc id for consistent per-doc variation
  const seed = docId.slice(-4).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const variation = (seed % 11) - 5; // -5..+5

  // Bytes per page: very low (<5KB) or very high (>200KB) pages hurt quality
  const bpp = pageCount > 0 ? fileSizeBytes / pageCount : fileSizeBytes;
  let base = 85;
  if (bpp < 5_000) base -= 12;          // sparse / image-heavy pages
  else if (bpp > 200_000) base -= 8;    // very dense, risk of layout issues
  if (pageCount > 100) base -= 5;       // longer docs have more edge cases
  if (pageCount === 1) base += 5;       // single-page documents translate cleanly

  const score = Math.min(100, Math.max(60, base + variation));

  let label: string;
  let color: string;
  if (score >= 90) { label = 'Mükemmel'; color = '#10b981'; }
  else if (score >= 80) { label = 'İyi';   color = '#3b82f6'; }
  else if (score >= 70) { label = 'Orta';  color = '#f59e0b'; }
  else                  { label = 'Düşük'; color = '#ef4444'; }

  return { score, label, color };
}

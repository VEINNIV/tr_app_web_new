/**
 * TransWordly — Yorum (review) servis katmanı.
 *
 * Tüm yorum sorguları tek yerde. Tablo/RPC henüz prod'a uygulanmamışsa (DB drift),
 * okuma fonksiyonları sessizce boş döner → anasayfa yorum bölümü gizlenir, çökme olmaz.
 *
 * Kural: yalnızca gerçek ödeme yapmış kullanıcı yorum yazabilir (server-side `submit_review`).
 * Yorumlar admin onayından geçmeden yayınlanmaz.
 */
import { supabase } from './supabase';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface Review {
  id: string;
  user_id: string;
  rating: number;
  body: string;
  display_name: string | null;
  status: ReviewStatus;
  created_at: string;
}

export interface ReviewStats {
  count: number;
  average: number;
}

const COLS = 'id,user_id,rating,body,display_name,status,created_at';

/** Anasayfa: onaylı + 5 yıldız yorumlar, rastgele sırada, en çok `limit` adet. */
export async function getFeaturedReviews(limit = 9): Promise<Review[]> {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select(COLS)
      .eq('status', 'approved')
      .eq('rating', 5)
      .order('created_at', { ascending: false })
      .limit(40);
    if (error || !data) return [];
    const arr = [...(data as Review[])];
    // Fisher–Yates karıştırma → her ziyarette farklı yorumlar öne çıkar.
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, limit);
  } catch {
    return [];
  }
}

/** Tüm onaylı yorumların sayısı + ortalaması (dürüst AggregateRating için). */
export async function getReviewStats(): Promise<ReviewStats> {
  try {
    const { data, error } = await supabase.rpc('review_stats');
    const row = (data as Array<{ count: number; average: number }> | null)?.[0];
    if (error || !row) return { count: 0, average: 0 };
    return { count: Number(row.count), average: Number(row.average) };
  } catch {
    return { count: 0, average: 0 };
  }
}

/** Kullanıcının kendi yorumu (varsa) — durumu dâhil. */
export async function getMyReview(userId: string): Promise<Review | null> {
  try {
    const { data } = await supabase
      .from('reviews')
      .select(COLS)
      .eq('user_id', userId)
      .maybeSingle();
    return (data as Review) ?? null;
  } catch {
    return null;
  }
}

/** Kullanıcı yorum yapmaya uygun mu? (en az bir gerçek satın alım). */
export async function canReview(userId: string): Promise<boolean> {
  try {
    const { count } = await supabase
      .from('credit_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('action', 'purchase');
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Yorum gönder/güncelle — server eligibility kontrolü yapar, durumu 'pending'e çeker. */
export async function submitReview(rating: number, body: string, displayName?: string): Promise<void> {
  const { error } = await supabase.rpc('submit_review', {
    p_rating: rating,
    p_body: body,
    p_display_name: displayName ?? null,
  });
  if (error) throw new Error(error.message || 'Yorum gönderilemedi');
}

// ── Admin ────────────────────────────────────────────────────────────────────
export async function adminListReviews(status: ReviewStatus = 'pending'): Promise<Review[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select(COLS)
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error || !data) return [];
  return data as Review[];
}

export async function adminSetReviewStatus(id: string, status: ReviewStatus): Promise<void> {
  const { error } = await supabase.rpc('admin_set_review_status', { p_id: id, p_status: status });
  if (error) throw new Error(error.message || 'İşlem başarısız');
}

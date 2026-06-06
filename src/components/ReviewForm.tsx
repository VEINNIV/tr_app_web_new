/**
 * ReviewForm — Ayarlar sayfasındaki "Deneyimini paylaş" kartı.
 *
 * Sadece gerçek ödeme yapmış kullanıcıya form gösterir (canReview). Gönderilen yorum
 * admin onayına düşer; kullanıcı mevcut yorumunu ve durumunu (bekliyor/onaylı/reddedildi)
 * görür ve düzenleyebilir (yeniden gönderim onayı sıfırlar).
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Star, Send, CheckCircle2, Clock, ShoppingCart, MessageSquareHeart, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/auth';
import { canReview, getMyReview, submitReview, type Review } from '../lib/reviews';

const card: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 18,
  padding: 'clamp(18px, 3vw, 26px)',
  boxShadow: 'var(--shadow-sm)',
};
const titleRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9, fontSize: '1rem', fontWeight: 700,
  color: 'var(--color-text-primary)', marginBottom: 4,
};

const STATUS_META: Record<Review['status'], { label: string; color: string; icon: React.ReactNode }> = {
  pending:  { label: 'Onay bekliyor', color: '#b45309', icon: <Clock size={13} /> },
  approved: { label: 'Yayında',       color: 'var(--color-success)', icon: <CheckCircle2 size={13} /> },
  rejected: { label: 'Onaylanmadı',   color: '#dc2626', icon: <XCircle size={13} /> },
};

export default function ReviewForm() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [eligible, setEligible] = useState(false);
  const [existing, setExisting] = useState<Review | null>(null);

  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    let alive = true;
    (async () => {
      const [ok, mine] = await Promise.all([canReview(profile.id), getMyReview(profile.id)]);
      if (!alive) return;
      setEligible(ok);
      setExisting(mine);
      if (mine) {
        setRating(mine.rating);
        setBody(mine.body);
        setName(mine.display_name ?? '');
      } else {
        setName(profile.nickname || profile.full_name || '');
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [profile]);

  if (loading) return null;

  // Ödeme yapmamış kullanıcı — yorum yerine nazik bilgilendirme.
  if (!eligible) {
    return (
      <motion.div style={card} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div style={titleRow}><MessageSquareHeart size={17} style={{ color: 'var(--color-accent)' }} /> Deneyimini paylaş</div>
        <p style={{ fontSize: '0.86rem', color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: '6px 0 14px' }}>
          Yorum yapabilmek için en az bir kredi/abonelik satın almış olman gerekiyor. Böylece yorumların gerçek
          kullanıcılardan geldiğinden emin oluyoruz.
        </p>
        <Link
          to="/pricing"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 999, textDecoration: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: '0.84rem', fontWeight: 700 }}
        >
          <ShoppingCart size={15} /> Planları gör
        </Link>
      </motion.div>
    );
  }

  const submit = async () => {
    if (body.trim().length < 4) { toast.error('Lütfen birkaç kelime yazın.'); return; }
    setSaving(true);
    try {
      await submitReview(rating, body.trim(), name.trim() || undefined);
      toast.success('Yorumun alındı — onaylandıktan sonra yayınlanacak.');
      setExisting({
        id: existing?.id ?? 'temp',
        user_id: profile!.id,
        rating,
        body: body.trim(),
        display_name: name.trim() || (profile!.nickname || profile!.full_name || 'Kullanıcı'),
        status: 'pending',
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gönderilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const active = hover || rating;

  return (
    <motion.div style={card} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <div style={titleRow}><MessageSquareHeart size={17} style={{ color: 'var(--color-accent)' }} /> Deneyimini paylaş</div>

      {existing && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, fontSize: '0.74rem', fontWeight: 700, color: STATUS_META[existing.status].color, background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)', marginBottom: 12 }}>
          {STATUS_META[existing.status].icon} {STATUS_META[existing.status].label}
        </div>
      )}

      <p style={{ fontSize: '0.84rem', color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: '2px 0 14px' }}>
        {existing
          ? 'Yorumunu güncelleyebilirsin. Her değişiklik yeniden onaya düşer.'
          : 'TransWordly senin için nasıldı? Yorumun onaylandıktan sonra anasayfada yer alabilir.'}
      </p>

      {/* Yıldız seçici */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }} role="radiogroup" aria-label="Puan">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setRating(n)}
            aria-label={`${n} yıldız`}
            aria-checked={rating === n}
            role="radio"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0, color: n <= active ? '#f59e0b' : 'var(--color-border-strong)' }}
          >
            <Star size={26} fill={n <= active ? 'currentColor' : 'none'} />
          </button>
        ))}
      </div>

      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        maxLength={1000}
        rows={4}
        placeholder="Örn. İngilizce makalelerimi dakikalar içinde çevirdim, format bozulmadı…"
        style={{ width: '100%', resize: 'vertical', padding: '11px 13px', borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)', font: 'inherit', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: 12 }}
      />

      <input
        value={name}
        onChange={e => setName(e.target.value)}
        maxLength={60}
        placeholder="Görünecek isim (örn. Zeynep A.)"
        style={{ width: '100%', padding: '10px 13px', borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)', font: 'inherit', fontSize: '0.88rem', marginBottom: 14 }}
      />

      <button
        type="button"
        onClick={submit}
        disabled={saving}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 999, border: 'none', background: 'var(--color-accent)', color: '#fff', font: 'inherit', fontWeight: 700, fontSize: '0.88rem', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}
      >
        <Send size={15} /> {saving ? 'Gönderiliyor…' : existing ? 'Yorumu güncelle' : 'Yorumu gönder'}
      </button>
    </motion.div>
  );
}

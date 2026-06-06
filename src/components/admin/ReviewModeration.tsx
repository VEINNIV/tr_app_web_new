/**
 * ReviewModeration — Admin → Moderasyon sekmesindeki yorum onay modülü.
 *
 * Bekleyen/onaylı/reddedilen yorumları listeler; onayla/reddet aksiyonları
 * admin_set_review_status RPC'sini çağırır. Self-contained — App/Admin state'ine dokunmaz.
 */
import { useEffect, useState } from 'react';
import { Star, Check, X, RotateCcw, MessageSquareText } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminListReviews, adminSetReviewStatus, type Review, type ReviewStatus } from '../../lib/reviews';

const TABS: { id: ReviewStatus; label: string }[] = [
  { id: 'pending', label: 'Bekleyen' },
  { id: 'approved', label: 'Onaylı' },
  { id: 'rejected', label: 'Reddedilen' },
];

export default function ReviewModeration() {
  const [tab, setTab] = useState<ReviewStatus>('pending');
  const [items, setItems] = useState<Review[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async (status: ReviewStatus) => {
    setItems(null);
    setItems(await adminListReviews(status));
  };

  useEffect(() => { load(tab); }, [tab]);

  const act = async (id: string, status: ReviewStatus) => {
    setBusy(id);
    try {
      await adminSetReviewStatus(id, status);
      setItems(prev => (prev ? prev.filter(r => r.id !== id) : prev));
      toast.success(status === 'approved' ? 'Yorum onaylandı' : status === 'rejected' ? 'Yorum reddedildi' : 'Geri alındı');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 16, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '1.02rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
          <MessageSquareText size={18} style={{ color: 'var(--color-accent)' }} /> Yorum Moderasyonu
        </h2>
        <div style={{ display: 'inline-flex', gap: 6, padding: 3, borderRadius: 10, background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{ padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', font: 'inherit', fontSize: '0.78rem', fontWeight: 700, background: tab === t.id ? 'var(--color-accent)' : 'transparent', color: tab === t.id ? '#fff' : 'var(--color-text-secondary)' }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {items === null ? (
        <p style={{ fontSize: '0.82rem', color: 'var(--color-text-tertiary)' }}>Yükleniyor…</p>
      ) : items.length === 0 ? (
        <p style={{ fontSize: '0.82rem', color: 'var(--color-text-tertiary)' }}>
          {tab === 'pending' ? 'Bekleyen yorum yok.' : 'Bu listede yorum yok.'}
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map(r => (
            <div key={r.id} style={{ padding: '13px 15px', borderRadius: 12, background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', gap: 1, color: '#f59e0b' }}>
                  {Array.from({ length: r.rating }).map((_, i) => <Star key={i} size={13} fill="currentColor" />)}
                </span>
                <strong style={{ fontSize: '0.86rem', color: 'var(--color-text-primary)' }}>{r.display_name || 'Kullanıcı'}</strong>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)' }}>
                  {new Date(r.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: '2-digit' })}
                </span>
              </div>
              <p style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)', lineHeight: 1.55, margin: '0 0 11px' }}>{r.body}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {tab !== 'approved' && (
                  <button type="button" disabled={busy === r.id} onClick={() => act(r.id, 'approved')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 8, border: '1px solid', borderColor: 'color-mix(in srgb, var(--color-success) 30%, transparent)', background: 'var(--color-success-bg)', color: 'var(--color-success)', cursor: 'pointer', font: 'inherit', fontSize: '0.78rem', fontWeight: 700 }}>
                    <Check size={14} /> Onayla
                  </button>
                )}
                {tab !== 'rejected' && (
                  <button type="button" disabled={busy === r.id} onClick={() => act(r.id, 'rejected')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 8, border: '1px solid rgba(220,38,38,0.28)', background: 'rgba(220,38,38,0.1)', color: '#dc2626', cursor: 'pointer', font: 'inherit', fontSize: '0.78rem', fontWeight: 700 }}>
                    <X size={14} /> Reddet
                  </button>
                )}
                {tab !== 'pending' && (
                  <button type="button" disabled={busy === r.id} onClick={() => act(r.id, 'pending')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-secondary)', cursor: 'pointer', font: 'inherit', fontSize: '0.78rem', fontWeight: 700 }}>
                    <RotateCcw size={14} /> Beklemeye al
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

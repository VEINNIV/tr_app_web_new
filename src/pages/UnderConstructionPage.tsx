/**
 * TransWordly — UnderConstructionPage
 *
 * Henüz tamamlanmamış (status: 'building' | 'soon') özellikler için tek, şık
 * placeholder. Slug ile özellik kaydından (upcomingFeatures.ts) beslenir.
 * Özellik gerçek implementasyona geçince App.tsx'te route gerçek sayfaya bağlanır.
 */
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Bell, Hammer, Sparkles, Check } from 'lucide-react';
import { getFeatureBySlug, STATUS_META } from '../lib/upcomingFeatures';
import BackToTools from '../components/ui/BackToTools';
import Seo from '../components/Seo';

export default function UnderConstructionPage({ slug }: { slug: string }) {
  const reduced = useReducedMotion();
  const feature = getFeatureBySlug(slug);

  // Bilinmeyen slug — güvenli fallback (route yanlış bağlanmışsa)
  const f = feature ?? {
    title: 'Yeni Özellik', desc: 'Bu özellik yakında burada olacak.',
    detail: undefined as string | undefined, Icon: Sparkles, accent: '#6366f1',
    status: 'soon' as const, eta: 'Yakında', to: '#', slug,
  };

  const Icon = f.Icon;
  const meta = STATUS_META[f.status];

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 'calc(var(--navbar-height) + 24px) 20px 80px' }}>
      {/* Henüz hazır olmayan özellik — indeksleme yok (thin/placeholder içerik). */}
      <Seo title={`${f.title} — Yakında · TransWordly`} noindex />
      <BackToTools style={{ marginBottom: 28 }} />


      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'relative', overflow: 'hidden',
          borderRadius: 24, padding: 'clamp(28px, 5vw, 44px)',
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Arka plan parıltısı */}
        <div
          aria-hidden
          style={{
            position: 'absolute', top: -120, right: -120, width: 320, height: 320,
            borderRadius: '50%', filter: 'blur(60px)', opacity: 0.18,
            background: f.accent, pointerEvents: 'none',
          }}
        />

        {/* İkon */}
        <motion.div
          animate={reduced ? undefined : { y: [0, -6, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'relative', width: 72, height: 72, borderRadius: 20,
            display: 'grid', placeItems: 'center', marginBottom: 22,
            background: `${f.accent}1f`, color: f.accent,
          }}
        >
          <Icon size={34} strokeWidth={2} />
        </motion.div>

        {/* Durum rozeti */}
        <div
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14,
            padding: '5px 12px', borderRadius: 999, fontSize: '0.74rem', fontWeight: 700,
            color: meta.color, background: meta.bg,
          }}
        >
          <Hammer size={12} /> {meta.label}
        </div>

        <h1 style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 800, color: 'var(--color-text-primary)', margin: '0 0 10px', lineHeight: 1.15 }}>
          {f.title}
        </h1>
        <p style={{ fontSize: '1rem', color: 'var(--color-text-secondary)', margin: '0 0 18px', lineHeight: 1.55 }}>
          {f.detail ?? f.desc}
        </p>

        {/* "Üzerinde çalışıyoruz" satırı */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
            borderRadius: 14, background: 'var(--color-bg, rgba(0,0,0,0.02))',
            border: '1px solid var(--color-border)', marginBottom: 24,
          }}
        >
          <motion.span
            animate={reduced ? undefined : { rotate: [0, 14, -10, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ display: 'inline-flex', color: f.accent }}
          >
            <Hammer size={18} />
          </motion.span>
          <span style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)' }}>
            Bu özellik üzerinde aktif olarak çalışıyoruz — <strong style={{ color: 'var(--color-text-primary)' }}>{f.eta ?? 'çok yakında'}</strong> kullanımda olacak.
          </span>
        </div>

        {/* Aksiyonlar */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <motion.div whileHover={reduced ? undefined : { y: -2 }} whileTap={reduced ? undefined : { scale: 0.97 }}>
            <Link
              to="/tools"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 22px',
                borderRadius: 12, background: f.accent, color: '#fff',
                fontSize: '0.9rem', fontWeight: 700, textDecoration: 'none',
              }}
            >
              <Sparkles size={16} /> Hazır olan araçları keşfet
            </Link>
          </motion.div>
          <button
            type="button"
            disabled
            title="Bildirim hatırlatıcısı yakında"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 22px',
              borderRadius: 12, background: 'transparent', color: 'var(--color-text-tertiary)',
              border: '1px solid var(--color-border)', fontSize: '0.9rem', fontWeight: 600,
              cursor: 'not-allowed', opacity: 0.75,
            }}
          >
            <Bell size={16} /> Hazır olunca haber ver
          </button>
        </div>
      </motion.div>

      {/* Küçük güven satırı */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 22, fontSize: '0.8rem', color: 'var(--color-text-tertiary)' }}>
        <Check size={14} style={{ color: '#10b981' }} />
        Mevcut krediler ve verilerinle tam uyumlu olacak
      </div>
    </div>
  );
}

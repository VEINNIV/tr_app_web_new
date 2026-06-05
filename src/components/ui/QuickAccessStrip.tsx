/**
 * TransWordly — QuickAccessStrip (Hızlı Erişim / favori şeridi)
 *
 * Kullanıcının sabitlediği (pin) araçları tek satır çip şeridinde gösterir.
 * Dashboard üstünde ve ToolsPage başında paylaşılır. Çok basit: tek-tık pin,
 * sürükle yok, max 4. Boşken zarif ipucu + (varsa) "şunu sabitle?" önerisi.
 *
 * Çip tıklaması → aracı aç + recordUse. ⭐ tıklaması → unpin (navigasyonu engeller).
 */
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Star, Plus, Compass } from 'lucide-react';
import { useToolPrefs, MAX_PINNED } from '../../hooks/useToolPrefs';
import { getFeatureBySlug } from '../../lib/upcomingFeatures';

export default function QuickAccessStrip({ title, hideWhenEmpty = false }: { title?: string; hideWhenEmpty?: boolean }) {
  const reduced = useReducedMotion();
  const { pinned, togglePin, recordUse, topUsed } = useToolPrefs();

  const pinnedFeatures = pinned.map(getFeatureBySlug).filter(Boolean) as NonNullable<ReturnType<typeof getFeatureBySlug>>[];
  const hasPins = pinnedFeatures.length > 0;
  const suggestion = !hasPins ? topUsed(1).map(getFeatureBySlug).filter(Boolean)[0] : undefined;

  if (hideWhenEmpty && !hasPins) return null;

  return (
    <div style={{ marginBottom: 'var(--space-5, 20px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-tertiary)' }}>
          <Star size={13} style={{ color: '#f59e0b' }} fill="#f59e0b" /> {title || 'Hızlı Erişim'}
        </span>
        {hasPins && (
          <span style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)' }}>{pinnedFeatures.length}/{MAX_PINNED}</span>
        )}
      </div>

      {hasPins ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {pinnedFeatures.map(f => {
            const Icon = f.Icon;
            return (
              <motion.div key={f.slug} whileHover={reduced ? undefined : { y: -2 }} whileTap={reduced ? undefined : { scale: 0.97 }}>
                <Link
                  to={f.to}
                  onClick={() => recordUse(f.slug)}
                  style={{
                    position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 9,
                    padding: '9px 13px 9px 11px', borderRadius: 13, textDecoration: 'none',
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <span style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', background: `${f.accent}1f`, color: f.accent, flexShrink: 0 }}>
                    <Icon size={16} strokeWidth={2.2} />
                  </span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{f.title}</span>
                  <button
                    type="button"
                    aria-label={`${f.title} sabitlemesini kaldır`}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePin(f.slug); }}
                    style={{ display: 'inline-flex', padding: 2, marginLeft: 1, background: 'transparent', border: 'none', cursor: 'pointer', color: '#f59e0b' }}
                  >
                    <Star size={14} fill="#f59e0b" />
                  </button>
                </Link>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            padding: '13px 16px', borderRadius: 14,
            background: 'var(--color-surface)', border: '1px dashed var(--color-border)',
          }}
        >
          <Star size={17} style={{ color: '#f59e0b', flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 180, fontSize: '0.84rem', color: 'var(--color-text-secondary)' }}>
            Sık kullandığın araçları sabitle — Araçlar’da <strong style={{ color: 'var(--color-text-primary)' }}>yıldıza dokun</strong>.
          </span>
          {suggestion && (
            <button
              type="button"
              onClick={() => togglePin(suggestion.slug)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 999, background: `${suggestion.accent}1a`, color: suggestion.accent, border: 'none', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
            >
              <Plus size={13} /> “{suggestion.title}”i sabitle
            </button>
          )}
          <Link
            to="/tools"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 999, background: 'var(--color-accent)', color: '#fff', fontSize: '0.78rem', fontWeight: 700, textDecoration: 'none' }}
          >
            <Compass size={13} /> Araçlar
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * TransWordly — BackToTools
 *
 * Araç sayfalarında belirgin "geri" butonu. Eski soluk metin-link yerine
 * accent ikon dairesi + hairline pill (kolayca görülür, dokunması rahat).
 */
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

export default function BackToTools({
  label = 'Araçlar',
  to = '/tools',
  style,
}: { label?: string; to?: string; style?: React.CSSProperties }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      whileHover={reduced ? undefined : { x: -3 }}
      whileTap={reduced ? undefined : { scale: 0.96 }}
      style={{ display: 'inline-block', marginBottom: 22, ...style }}
    >
      <Link
        to={to}
        aria-label={`Geri: ${label}`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 16px 8px 9px', borderRadius: 999, textDecoration: 'none',
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-sm)', color: 'var(--color-text-primary)',
          fontSize: '0.85rem', fontWeight: 700,
        }}
      >
        <span style={{
          display: 'inline-grid', placeItems: 'center', width: 26, height: 26, borderRadius: 999,
          background: 'var(--color-accent)', color: '#fff', flexShrink: 0,
          boxShadow: '0 2px 6px -1px var(--color-accent-medium)',
        }}>
          <ArrowLeft size={15} strokeWidth={2.4} />
        </span>
        {label}
      </Link>
    </motion.div>
  );
}

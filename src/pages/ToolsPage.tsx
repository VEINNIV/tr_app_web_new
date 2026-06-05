/**
 * TransWordly — ToolsPage (Araçlar / Keşfet merkezi)
 *
 * Tüm sistemleri tek ekranda gösterir: flagship hero + favoriler + hazır + yolda.
 * Kaynak: upcomingFeatures.ts (tek kayıt). Yeni özellik eklemek = oraya satır eklemek.
 * Favori (pin) + sık-kullanılan rozeti: useToolPrefs (cihaz-başı localStorage).
 *
 * Tasarım dili: Apple-rafine-renkli. Editöryel tipografi hiyerarşisi, flagship
 * "Belge Çevirisi" 2-kolon hero kartı (renkli gradient mesh + frosted katman),
 * her araca kendi accent app-icon tile'ı, hairline border + yumuşak gölge,
 * spring tabanlı mikro-etkileşimler. Dark mode token'larıyla uyumlu.
 * Inline-style sayfası (module CSS değil); :hover/spring stilleri tek <style> bloğunda.
 */
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Hammer, Star, Sparkles, Clock, ArrowUpRight } from 'lucide-react';
import { READY_FEATURES, UPCOMING_FEATURES, type FeatureDef } from '../lib/upcomingFeatures';
import { useToolPrefs } from '../hooks/useToolPrefs';
import QuickAccessStrip from '../components/ui/QuickAccessStrip';

/** Hero'da öne çıkacak amiral araç. */
const FLAGSHIP_SLUG = 'translate';

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } } };
const item = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const } },
};

/** Sayfa-içi hover/spring stilleri — inline ile yapılamayan :hover geçişleri için. */
const styleSheet = `
.twtool {
  transition: transform .34s cubic-bezier(.22,1,.36,1), box-shadow .34s cubic-bezier(.22,1,.36,1), border-color .34s ease;
  will-change: transform;
}
.twtool:hover {
  transform: translateY(-6px);
  box-shadow: var(--shadow-lg), 0 0 0 1px color-mix(in srgb, var(--tw-accent) 30%, transparent), 0 18px 40px -16px color-mix(in srgb, var(--tw-accent) 55%, transparent);
  border-color: color-mix(in srgb, var(--tw-accent) 40%, var(--color-border-strong));
}
.twtool:hover .twtool-tile {
  transform: scale(1.07) rotate(-3deg);
}
.twtool:hover .twtool-tile::after { opacity: 1; }
.twtool-tile { transition: transform .4s cubic-bezier(.34,1.56,.5,1); position: relative; }
.twtool-tile::after {
  content: ''; position: absolute; inset: 0; border-radius: inherit;
  box-shadow: 0 8px 22px -4px var(--tw-accent); opacity: 0; transition: opacity .34s ease; pointer-events: none;
}
.twtool-arrow { transition: transform .26s cubic-bezier(.22,1,.36,1); }
.twtool:hover .twtool-arrow { transform: translateX(5px); }
.twtool-pin { transition: background .15s ease, border-color .15s ease, color .15s ease, opacity .18s ease, transform .18s ease; }
.twtool:hover .twtool-pin { opacity: 1; }
.twtool-pin:hover { transform: scale(1.12); }

/* Flagship hero */
.twhero {
  transition: transform .4s cubic-bezier(.22,1,.36,1), box-shadow .4s cubic-bezier(.22,1,.36,1);
  will-change: transform;
}
.twhero:hover { transform: translateY(-4px); box-shadow: var(--shadow-xl), 0 28px 60px -24px color-mix(in srgb, var(--tw-accent) 60%, transparent); }
.twhero:hover .twhero-cta { gap: 12px; }
.twhero:hover .twhero-tile { transform: scale(1.05) rotate(-2deg); }
.twhero-tile { transition: transform .45s cubic-bezier(.34,1.5,.5,1); }
.twhero-cta { transition: gap .26s cubic-bezier(.22,1,.36,1); }

/* Yolda (recessed) kartları */
.twtool-up {
  transition: transform .3s cubic-bezier(.22,1,.36,1), box-shadow .3s ease, border-color .3s ease, background .3s ease;
}
.twtool-up:hover {
  transform: translateY(-3px);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
  border-color: var(--color-border-strong);
}
.twtool-up:hover .twtool-arrow { transform: translateX(4px); }
.twtool-up:hover .twtool-tile { transform: scale(1.05); }
`;

/** Araç-başı app-icon görünümlü ikon karesi (accent gradyanı + iç parlama). */
function IconTile({ f, size = 48, muted }: { f: FeatureDef; size?: number; muted?: boolean }) {
  const Icon = f.Icon;
  const radius = Math.round(size * 0.3);
  const iconSize = Math.round(size * 0.46);
  if (muted) {
    return (
      <span
        className="twtool-tile"
        style={{
          width: size, height: size, borderRadius: radius, display: 'grid', placeItems: 'center', flexShrink: 0,
          background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)',
          color: 'var(--color-text-tertiary)',
        }}
      >
        <Icon size={iconSize} strokeWidth={2} />
      </span>
    );
  }
  return (
    <span
      className="twtool-tile"
      style={{
        width: size, height: size, borderRadius: radius, display: 'grid', placeItems: 'center', flexShrink: 0,
        background: `linear-gradient(150deg, color-mix(in srgb, ${f.accent} 78%, #fff) 0%, ${f.accent} 55%, color-mix(in srgb, ${f.accent} 80%, #000) 100%)`,
        color: '#fff',
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 6px rgba(0,0,0,0.12)`,
      }}
    >
      <Icon size={iconSize} strokeWidth={2.1} />
    </span>
  );
}

/** Küçük rozet (Yeni / Sık). */
function Chip({ icon, label, color, bg }: { icon: React.ReactNode; label: string; color: string; bg: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, fontSize: '0.66rem', fontWeight: 800, letterSpacing: '0.01em', color, background: bg }}>
      {icon} {label}
    </span>
  );
}

/** Pin (yıldız) düğmesi — Ready kart ve hero ortak. */
function PinButton({ f }: { f: FeatureDef }) {
  const { isPinned, togglePin } = useToolPrefs();
  const pinned = isPinned(f.slug);
  return (
    <button
      type="button"
      className="twtool-pin"
      aria-label={pinned ? `${f.title} sabitlemesini kaldır` : `${f.title} aracını sabitle`}
      aria-pressed={pinned}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePin(f.slug); }}
      style={{
        display: 'inline-flex', padding: 6, borderRadius: 9, cursor: 'pointer',
        background: pinned ? 'rgba(245,158,11,0.13)' : 'transparent',
        border: '1px solid', borderColor: pinned ? 'rgba(245,158,11,0.32)' : 'var(--color-border)',
        color: pinned ? '#f59e0b' : 'var(--color-text-tertiary)',
        opacity: pinned ? 1 : 0.5,
      }}
    >
      <Star size={15} fill={pinned ? '#f59e0b' : 'none'} />
    </button>
  );
}

/** Flagship hero — 2 kolon kaplayan zengin amiral kart. */
function FlagshipCard({ f }: { f: FeatureDef }) {
  const { recordUse, isFrequent } = useToolPrefs();
  const Icon = f.Icon;
  const frequent = isFrequent(f.slug);
  return (
    <motion.div variants={item} style={{ gridColumn: '1 / -1' }}>
      <Link
        to={f.to}
        className="twhero"
        onClick={() => recordUse(f.slug)}
        style={{
          ['--tw-accent' as string]: f.accent,
          position: 'relative', overflow: 'hidden', display: 'flex', flexWrap: 'wrap',
          alignItems: 'center', gap: 'clamp(20px, 4vw, 44px)',
          padding: 'clamp(24px, 4vw, 38px)', borderRadius: 26, textDecoration: 'none',
          background: `linear-gradient(135deg, color-mix(in srgb, ${f.accent} 14%, var(--color-surface)) 0%, var(--color-surface) 52%)`,
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        {/* gradient mesh blob'ları */}
        <div aria-hidden style={{ position: 'absolute', top: -120, right: -60, width: 360, height: 360, borderRadius: '50%', background: `radial-gradient(circle, color-mix(in srgb, ${f.accent} 26%, transparent), transparent 68%)`, pointerEvents: 'none' }} />
        <div aria-hidden style={{ position: 'absolute', bottom: -140, left: '32%', width: 300, height: 300, borderRadius: '50%', background: `radial-gradient(circle, color-mix(in srgb, ${f.accent} 14%, transparent), transparent 70%)`, pointerEvents: 'none' }} />

        {/* büyük ikon tile */}
        <span
          className="twhero-tile"
          style={{
            position: 'relative', zIndex: 1, width: 'clamp(72px, 12vw, 100px)', height: 'clamp(72px, 12vw, 100px)',
            borderRadius: 26, display: 'grid', placeItems: 'center', flexShrink: 0,
            background: `linear-gradient(150deg, color-mix(in srgb, ${f.accent} 78%, #fff) 0%, ${f.accent} 55%, color-mix(in srgb, ${f.accent} 78%, #000) 100%)`,
            color: '#fff',
            boxShadow: `0 18px 40px -10px color-mix(in srgb, ${f.accent} 65%, transparent), inset 0 2px 0 rgba(255,255,255,0.5), inset 0 -3px 8px rgba(0,0,0,0.14)`,
          }}
        >
          <Icon size={44} strokeWidth={2} />
        </span>

        {/* metin + CTA */}
        <div style={{ position: 'relative', zIndex: 1, flex: 1, minWidth: 240 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: f.accent, background: `color-mix(in srgb, ${f.accent} 13%, transparent)`, marginBottom: 12 }}>
            <Sparkles size={12} /> Amiral araç
            {frequent && <><span aria-hidden style={{ opacity: 0.4 }}>·</span> En çok kullandığın</>}
          </span>
          <h2 style={{ fontSize: 'clamp(1.5rem, 3.4vw, 2.1rem)', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.05, color: 'var(--color-text-primary)', margin: 0 }}>
            {f.title}
          </h2>
          <p style={{ fontSize: 'clamp(0.95rem, 1.6vw, 1.08rem)', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: '8px 0 0', maxWidth: 460 }}>
            {f.desc}. Akademik ve teknik belgelerde anlam korunarak, alanına uygun terimlerle.
          </p>
          <span
            className="twhero-cta"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 20,
              padding: '11px 20px', borderRadius: 999, fontSize: '0.92rem', fontWeight: 700,
              color: '#fff', background: `linear-gradient(135deg, ${f.accent}, color-mix(in srgb, ${f.accent} 78%, #000))`,
              boxShadow: `0 10px 24px -8px color-mix(in srgb, ${f.accent} 70%, transparent)`,
            }}
          >
            Hemen çevir <ArrowRight size={17} />
          </span>
        </div>

        {/* pin (sağ üst) */}
        <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 2 }}>
          <PinButton f={f} />
        </div>
      </Link>
    </motion.div>
  );
}

function ReadyCard({ f }: { f: FeatureDef }) {
  const { recordUse, isFrequent } = useToolPrefs();
  const frequent = isFrequent(f.slug);
  const isNew = f.slug === 'write';

  return (
    <motion.div variants={item}>
      <Link
        to={f.to}
        className="twtool"
        onClick={() => recordUse(f.slug)}
        style={{
          ['--tw-accent' as string]: f.accent,
          position: 'relative', display: 'flex', flexDirection: 'column', gap: 16,
          height: '100%', padding: '20px 20px 18px', borderRadius: 20, textDecoration: 'none',
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <IconTile f={f} />
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {frequent && <Chip icon={<Star size={9} fill="#f59e0b" />} label="Sık" color="#b45309" bg="rgba(245,158,11,0.14)" />}
            {isNew && <Chip icon={<Sparkles size={9} />} label="Yeni" color={f.accent} bg={`color-mix(in srgb, ${f.accent} 13%, transparent)`} />}
            <PinButton f={f} />
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '1.06rem', fontWeight: 800, letterSpacing: '-0.015em', color: 'var(--color-text-primary)', marginBottom: 5 }}>{f.title}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{f.desc}</div>
        </div>

        <div className="twtool-arrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 700, color: f.accent }}>
          Aç <ArrowRight size={15} />
        </div>
      </Link>
    </motion.div>
  );
}

function UpcomingCard({ f }: { f: FeatureDef }) {
  const building = f.status === 'building';
  return (
    <motion.div variants={item}>
      <Link
        to={f.to}
        className="twtool-up"
        style={{
          ['--tw-accent' as string]: f.accent,
          position: 'relative', display: 'flex', flexDirection: 'column', gap: 16,
          height: '100%', padding: '20px 20px 18px', borderRadius: 20, textDecoration: 'none',
          background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <IconTile f={f} muted />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, color: building ? '#be185d' : 'var(--color-text-tertiary)', background: building ? 'rgba(236,72,153,0.12)' : 'var(--color-surface)', border: '1px solid', borderColor: building ? 'rgba(236,72,153,0.22)' : 'var(--color-border)' }}>
            {building ? <Hammer size={10} /> : <Clock size={10} />} {building ? 'Yapımda' : 'Yakında'}
          </span>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '1.06rem', fontWeight: 800, letterSpacing: '-0.015em', color: 'var(--color-text-secondary)', marginBottom: 5 }}>{f.title}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>{f.desc}</div>
        </div>

        <div className="twtool-arrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text-tertiary)' }}>
          Önizle <ArrowUpRight size={15} />
        </div>
      </Link>
    </motion.div>
  );
}

/** Editöryel bölüm başlığı — etiket + sayaç + ince ayraç çizgisi. */
function SectionHeader({ label, count, hint }: { label: string; count: number; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: '0 0 18px' }}>
      <h2 style={{ fontSize: '1.18rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--color-text-primary)', margin: 0, whiteSpace: 'nowrap' }}>
        {label}
      </h2>
      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-tertiary)', padding: '1px 8px', borderRadius: 999, background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)' }}>
        {count}
      </span>
      {hint && <span style={{ fontSize: '0.8rem', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>{hint}</span>}
      <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--color-divider)' }} />
    </div>
  );
}

export default function ToolsPage() {
  const reduced = useReducedMotion();

  const flagship = READY_FEATURES.find(f => f.slug === FLAGSHIP_SLUG) ?? READY_FEATURES[0];
  const restReady = READY_FEATURES.filter(f => f.slug !== flagship.slug);

  const gridStyle: React.CSSProperties = {
    display: 'grid', gap: 18,
    gridTemplateColumns: 'repeat(auto-fill, minmax(236px, 1fr))',
  };

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: 'calc(var(--navbar-height) + 36px) 20px 104px' }}>
      <style>{styleSheet}</style>

      {/* ── Editöryel başlık ──────────────────────────────────── */}
      <motion.header
        initial={reduced ? false : { opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        style={{ marginBottom: 26 }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-accent)' }}>
          <Sparkles size={14} /> Araçlar
        </span>
        <h1 style={{ fontSize: 'clamp(2rem, 5.2vw, 2.85rem)', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.04, color: 'var(--color-text-primary)', margin: '10px 0 0' }}>
          Tüm sistemler, tek yerde.
        </h1>
        <p style={{ fontSize: 'clamp(0.98rem, 1.8vw, 1.14rem)', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: '10px 0 0', maxWidth: 540 }}>
          Çevir, çalış, öğren — {READY_FEATURES.length} hazır araç, {UPCOMING_FEATURES.length} tanesi yolda.
        </p>
      </motion.header>

      {/* Sık Kullandıkların (favoriler) — yalnızca pin varsa */}
      <QuickAccessStrip title="Sık Kullandıkların" hideWhenEmpty />

      {/* ── Hazır: flagship hero + grid ───────────────────────── */}
      <div style={{ marginTop: 24 }}>
        <SectionHeader label="Hazır" count={READY_FEATURES.length} hint="çalışan sistemler" />
        <motion.div variants={stagger} initial="hidden" animate="visible" style={gridStyle}>
          <FlagshipCard f={flagship} />
          {restReady.map(f => <ReadyCard key={f.slug} f={f} />)}
        </motion.div>
      </div>

      {/* ── Yolda ─────────────────────────────────────────────── */}
      <div style={{ marginTop: 48 }}>
        <SectionHeader label="Yolda" count={UPCOMING_FEATURES.length} hint="yakında geliyor" />
        <motion.div variants={stagger} initial="hidden" animate="visible" style={gridStyle}>
          {UPCOMING_FEATURES.map(f => <UpcomingCard key={f.slug} f={f} />)}
        </motion.div>
      </div>
    </div>
  );
}

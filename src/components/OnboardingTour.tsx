import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';

// ── Step definitions ────────────────────────────────────────────────────────

interface TourStep {
  target: string; // CSS selector (e.g. '#tour-header')
  title: string;
  content: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

const STEPS: TourStep[] = [
  {
    target: '#tour-header',
    title: "TransWordly'ye Hoş Geldiniz 👋",
    content: 'Buradan günlük kredinizi görüp hızlıca çeviri başlatabilirsiniz.',
    placement: 'bottom',
  },
  {
    target: '#tour-stats',
    title: 'Hızlı İstatistikler',
    content: 'Belge sayınız, tamamlanan çevirileriniz ve kalan krediniz burada özetlenir.',
    placement: 'bottom',
  },
  {
    target: '#tour-credits',
    title: 'Aylık Kredi Takibi',
    content: 'Aylık kredinizi buradan takip edin. Kredi bittiğinde planınızı yükseltebilirsiniz.',
    placement: 'top',
  },
  {
    target: '#tour-actions',
    title: 'Hızlı Erişim',
    content: 'PDF yüklemek, çevirilerinizi görmek veya AI Chat\'i başlatmak için bu kısayolları kullanın.',
    placement: 'right',
  },
];

// ── Tooltip positioning ──────────────────────────────────────────────────────

interface Rect { top: number; left: number; width: number; height: number }

function getTooltipStyle(
  targetRect: Rect,
  placement: TourStep['placement'] = 'bottom',
  tooltipWidth = 300,
  tooltipHeight = 160,
): React.CSSProperties {
  const gap = 14;
  const { top, left, width, height } = targetRect;

  switch (placement) {
    case 'bottom':
      return {
        top: top + height + gap,
        left: Math.max(8, Math.min(left + width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - 8)),
      };
    case 'top':
      return {
        top: top - tooltipHeight - gap,
        left: Math.max(8, Math.min(left + width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - 8)),
      };
    case 'left':
      return {
        top: Math.max(8, top + height / 2 - tooltipHeight / 2),
        left: Math.max(8, left - tooltipWidth - gap),
      };
    case 'right':
      return {
        top: Math.max(8, top + height / 2 - tooltipHeight / 2),
        left: Math.min(left + width + gap, window.innerWidth - tooltipWidth - 8),
      };
  }
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  run: boolean;
  onFinish: () => void;
}

export default function OnboardingTour({ run, onFinish }: Props) {
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const rafRef = useRef<number>(0);

  const current = STEPS[step];

  // Measure target element, re-measure on resize
  const measure = useCallback(() => {
    if (!run) return;
    const el = document.querySelector(current.target);
    if (!el) return;
    const r = el.getBoundingClientRect();
    setTargetRect({ top: r.top + window.scrollY, left: r.left + window.scrollX, width: r.width, height: r.height });
  }, [run, current.target]);

  useEffect(() => {
    if (!run) { setStep(0); return; }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [run, measure]);

  // Scroll target into view when step changes
  useEffect(() => {
    if (!run) return;
    const el = document.querySelector(current.target);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Re-measure after scroll settles
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => setTimeout(measure, 350));
    return () => cancelAnimationFrame(rafRef.current);
  }, [run, step, current.target, measure]);

  const next = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else onFinish();
  };
  const prev = () => setStep(s => Math.max(0, s - 1));
  const skip = () => onFinish();

  if (!run || !targetRect) return null;

  const tooltipStyle = getTooltipStyle(targetRect, current.placement);
  const PAD = 6;
  const spotStyle: React.CSSProperties = {
    position: 'absolute',
    top: targetRect.top - PAD,
    left: targetRect.left - PAD,
    width: targetRect.width + PAD * 2,
    height: targetRect.height + PAD * 2,
    borderRadius: 12,
    boxShadow: '0 0 0 9999px rgba(0,0,0,0.52)',
    border: '2px solid var(--color-accent, #0057ff)',
    pointerEvents: 'none',
    zIndex: 9998,
  };

  return (
    <AnimatePresence>
      {/* Spotlight overlay */}
      <motion.div
        key={`spot-${step}`}
        style={{ position: 'fixed', inset: 0, zIndex: 9997, pointerEvents: 'none' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <motion.div
            style={spotStyle}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </motion.div>

      {/* Click-catcher for overlay (allows skip on backdrop click) */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9997, cursor: 'default' }}
        onClick={skip}
      />

      {/* Tooltip */}
      <motion.div
        key={`tip-${step}`}
        style={{
          position: 'absolute',
          zIndex: 9999,
          width: 300,
          background: 'var(--color-surface, #1C1C1F)',
          border: '1px solid var(--color-border, rgba(255,255,255,0.08))',
          borderRadius: 14,
          boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
          padding: '18px 20px 16px',
          ...tooltipStyle,
        }}
        initial={{ opacity: 0, y: 8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: 'var(--color-text-primary)', lineHeight: 1.3 }}>
            {current.title}
          </p>
          <button
            onClick={skip}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', padding: 2, marginLeft: 8, flexShrink: 0, lineHeight: 1 }}
            title="Atla"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
          {current.content}
        </p>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Progress dots */}
          <div style={{ display: 'flex', gap: 5 }}>
            {STEPS.map((_, i) => (
              <div key={i} style={{
                width: i === step ? 16 : 6, height: 6,
                borderRadius: 3,
                background: i === step ? 'var(--color-accent, #0057ff)' : 'var(--color-border)',
                transition: 'all 0.25s ease',
              }} />
            ))}
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 6 }}>
            {step > 0 && (
              <button
                onClick={prev}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '6px 12px', borderRadius: 8,
                  background: 'transparent', border: '1px solid var(--color-border)',
                  color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                }}
              >
                <ChevronLeft size={13} /> Geri
              </button>
            )}
            <button
              onClick={next}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '6px 14px', borderRadius: 8,
                background: 'var(--color-accent, #0057ff)', border: 'none',
                color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              }}
            >
              {step === STEPS.length - 1 ? 'Bitir' : 'İleri'} <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

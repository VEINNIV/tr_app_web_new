/**
 * CardGenDialog — kart üretmeden önce tip + adet seçtiren modal (F1.1).
 *
 * Hem Ders Notları hem Belgeler hem de "ek sorular üret" akışı bunu kullanır.
 * Sunum bileşeni: kredi/AI işini çağıran sayfa onConfirm ile yürütür.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Layers, ListChecks, ToggleRight, Shuffle, Sparkles, Loader } from 'lucide-react';
import type { FlashcardGenType } from '../../lib/ai';

interface Props {
  open: boolean;
  title?: string;
  /** Üretim başına kredi maliyeti (gösterim). */
  cost: number;
  busy?: boolean;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (opts: { cardType: FlashcardGenType; count: number }) => void;
}

const TYPES: { value: FlashcardGenType; label: string; desc: string; Icon: typeof Layers }[] = [
  { value: 'classic',   label: 'Klasik',          desc: 'Çevir-kart: soru → cevap',     Icon: Layers },
  { value: 'mcq',       label: 'Çoktan Seçmeli',  desc: '4 şıktan doğruyu seç',         Icon: ListChecks },
  { value: 'truefalse', label: 'Doğru / Yanlış',  desc: 'Önerme doğru mu yanlış mı?',   Icon: ToggleRight },
  { value: 'mixed',     label: 'Karma',           desc: 'Üç tipten dengeli karışım',    Icon: Shuffle },
];

const COUNTS = [10, 15, 25];

export default function CardGenDialog({ open, title, cost, busy = false, confirmLabel = 'Kart Üret', onClose, onConfirm }: Props) {
  const [cardType, setCardType] = useState<FlashcardGenType>('classic');
  const [count, setCount] = useState(15);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={() => !busy && onClose()}
          style={{
            position: 'fixed', inset: 0, zIndex: 1100, display: 'grid', placeItems: 'center',
            background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', padding: 16,
          }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 460, background: 'var(--color-surface)',
              border: '1px solid var(--color-border)', borderRadius: 20, boxShadow: 'var(--shadow-lg)',
              padding: 22, boxSizing: 'border-box',
            }}
          >
            {/* Başlık */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
              <div style={{ width: 40, height: 40, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 12, background: 'var(--color-accent-light)' }}>
                <Sparkles size={19} color="var(--color-accent)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>Kart Üret</h2>
                {title && (
                  <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {title}
                  </p>
                )}
              </div>
              <button onClick={() => !busy && onClose()} style={iconBtn} title="Kapat"><X size={18} /></button>
            </div>

            {/* Tip seçimi */}
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Kart tipi</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              {TYPES.map(({ value, label, desc, Icon }) => {
                const active = cardType === value;
                return (
                  <button
                    key={value}
                    onClick={() => setCardType(value)}
                    disabled={busy}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 13px', textAlign: 'left',
                      borderRadius: 14, cursor: busy ? 'default' : 'pointer', font: 'inherit',
                      border: `1.5px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                      background: active ? 'var(--color-accent-light)' : 'var(--color-surface)',
                      transition: 'all 0.15s',
                    }}
                  >
                    <Icon size={18} color={active ? 'var(--color-accent)' : 'var(--color-text-tertiary)'} />
                    <span style={{ fontSize: '0.86rem', fontWeight: 700, color: active ? 'var(--color-accent)' : 'var(--color-text-primary)' }}>{label}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)', lineHeight: 1.3 }}>{desc}</span>
                  </button>
                );
              })}
            </div>

            {/* Adet */}
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Kart sayısı (yaklaşık)</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
              {COUNTS.map(c => {
                const active = count === c;
                return (
                  <button
                    key={c}
                    onClick={() => setCount(c)}
                    disabled={busy}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 11, font: 'inherit', fontSize: '0.9rem', fontWeight: 700,
                      cursor: busy ? 'default' : 'pointer',
                      border: `1.5px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                      background: active ? 'var(--color-accent)' : 'var(--color-surface)',
                      color: active ? '#fff' : 'var(--color-text-secondary)', transition: 'all 0.15s',
                    }}
                  >
                    {c}
                  </button>
                );
              })}
            </div>

            {/* Üret */}
            <button
              onClick={() => onConfirm({ cardType, count })}
              disabled={busy}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
                padding: '13px', borderRadius: 13, border: 'none', font: 'inherit', fontSize: '0.92rem', fontWeight: 700,
                background: 'var(--color-accent)', color: '#fff', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.75 : 1,
              }}
            >
              {busy
                ? <><Loader size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Üretiliyor…</>
                : <><Sparkles size={16} /> {confirmLabel} · {cost} kredi</>}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const iconBtn: React.CSSProperties = {
  width: 32, height: 32, flexShrink: 0, display: 'grid', placeItems: 'center',
  background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 9,
  cursor: 'pointer', color: 'var(--color-text-tertiary)',
};

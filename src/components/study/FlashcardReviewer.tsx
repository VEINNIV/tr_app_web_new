/**
 * FlashcardReviewer — tam ekran aralıklı tekrar (SRS) çalışma modu (F1 / F1.1).
 *
 * Kart tipine göre farklı çalışır:
 *  • classic    → çevir-kart + Again/Hard/Good/Easy öz-değerlendirme.
 *  • mcq        → 4 şık, tıkla, anında doğru/yanlış geri bildirim → otomatik derece.
 *  • truefalse  → Doğru/Yanlış butonu, anında geri bildirim → otomatik derece.
 *
 * Otomatik derece (mcq/tf): doğru → 'good', yanlış → 'again' (oturumda yeniden sorulur).
 * Klavye: Esc kapatır. classic: Boşluk/Enter çevir, 1-4 derece. mcq: 1-4 şık. tf: 1=Doğru 2=Yanlış.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw, Lightbulb, PartyPopper, Check, XCircle, Plus } from 'lucide-react';
import type { Flashcard } from '../../lib/decks';
import type { Grade } from '../../lib/srs';

interface Props {
  cards: Flashcard[];
  deckTitle: string;
  onReview: (card: Flashcard, grade: Grade) => Promise<void>;
  onExit: () => void;
  /** Verilirse bitiş ekranında "Ek sorular üret" butonu çıkar. */
  onGenerateMore?: () => void;
}

const GRADES: { grade: Grade; label: string; key: string; color: string }[] = [
  { grade: 'again', label: 'Tekrar', key: '1', color: '#ef4444' },
  { grade: 'hard',  label: 'Zor',    key: '2', color: '#f59e0b' },
  { grade: 'good',  label: 'İyi',    key: '3', color: '#10b981' },
  { grade: 'easy',  label: 'Kolay',  key: '4', color: '#0ea5e9' },
];

const OK = '#10b981';
const NO = '#ef4444';

interface Answered { selected: string; correct: boolean; }

export default function FlashcardReviewer({ cards, deckTitle, onReview, onExit, onGenerateMore }: Props) {
  const [queue, setQueue] = useState<Flashcard[]>(cards);
  const [flipped, setFlipped] = useState(false);
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(0);

  const total = useMemo(() => cards.length, [cards.length]);
  const current = queue[0];
  const done = !current;

  const isMcq = !!current && current.card_type === 'mcq' && (current.options?.length ?? 0) >= 2;
  const isTF = !!current && current.card_type === 'truefalse' && !!current.answer;

  const advance = useCallback((grade: Grade) => {
    setQueue(q => {
      const [head, ...rest] = q;
      return grade === 'again' ? [...rest, head] : rest; // "Tekrar" → oturum sonunda yeniden sor
    });
    setFlipped(false);
    setAnswered(null);
  }, []);

  const handleGrade = useCallback(async (grade: Grade) => {
    if (busy || !current) return;
    setBusy(true);
    try {
      await onReview(current, grade);
      setReviewed(r => r + 1);
      advance(grade);
    } catch {
      // onReview kendi toast'ını gösterir; kartı kuyrukta tut.
    } finally {
      setBusy(false);
    }
  }, [busy, current, onReview, advance]);

  // mcq/tf: bir seçim yap → doğru/yanlış kilitle (henüz DB'ye yazma).
  const choose = useCallback((selected: string) => {
    if (busy || answered || !current) return;
    setAnswered({ selected, correct: selected === current.answer });
  }, [busy, answered, current]);

  // mcq/tf: geri bildirimden sonra "Sonraki" → otomatik derece.
  const next = useCallback(() => {
    if (!answered) return;
    void handleGrade(answered.correct ? 'good' : 'again');
  }, [answered, handleGrade]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onExit(); return; }
      if (done) return;

      if (isMcq) {
        if (answered) {
          if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); next(); }
          return;
        }
        const idx = Number(e.key) - 1;
        if (idx >= 0 && idx < (current.options?.length ?? 0)) { e.preventDefault(); choose(current.options![idx]); }
        return;
      }
      if (isTF) {
        if (answered) {
          if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); next(); }
          return;
        }
        if (e.key === '1') { e.preventDefault(); choose('true'); }
        else if (e.key === '2') { e.preventDefault(); choose('false'); }
        return;
      }
      // classic
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (!flipped) setFlipped(true);
        return;
      }
      if (flipped) {
        const g = GRADES.find(x => x.key === e.key);
        if (g) { e.preventDefault(); void handleGrade(g.grade); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped, done, isMcq, isTF, answered, current, choose, next, handleGrade, onExit]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--color-bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Üst bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
        <button onClick={onExit} style={iconBtn} title="Kapat (Esc)"><X size={18} /></button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{deckTitle}</div>
          <div style={{ height: 5, marginTop: 6, background: 'var(--color-bg-alt)', borderRadius: 999, overflow: 'hidden' }}>
            <motion.div
              animate={{ width: `${total ? (reviewed / total) * 100 : 0}%` }}
              transition={{ duration: 0.3 }}
              style={{ height: '100%', background: 'linear-gradient(90deg,#6366f1,#0ea5e9)' }}
            />
          </div>
        </div>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-tertiary)', minWidth: 54, textAlign: 'right' }}>
          {Math.min(reviewed, total)}/{total}
        </span>
      </div>

      {/* Gövde */}
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 20, overflowY: 'auto' }}>
        {done ? (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center', color: 'var(--color-text-primary)' }}>
            <PartyPopper size={48} color="var(--color-accent)" style={{ marginBottom: 16 }} />
            <h2 style={{ margin: '0 0 8px', fontSize: '1.4rem', fontWeight: 800 }}>Tebrikler! 🎉</h2>
            <p style={{ margin: '0 0 24px', color: 'var(--color-text-tertiary)' }}>{total} kartı tamamladın.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {onGenerateMore && (
                <button onClick={onGenerateMore} style={ghostBtn}><Plus size={16} /> Ek sorular üret</button>
              )}
              <button onClick={onExit} style={primaryBtn}>Bitir</button>
            </div>
          </motion.div>
        ) : isMcq ? (
          /* ─── ÇOKTAN SEÇMELİ ─── */
          <div style={cardWrap}>
            <QuestionCard tag={current.tag} text={current.front} hint={!answered ? current.hint : undefined} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
              {current.options!.map((opt, i) => {
                const isCorrect = opt === current.answer;
                const isPicked = answered?.selected === opt;
                let border = 'var(--color-border)', bg = 'var(--color-surface)', color = 'var(--color-text-primary)';
                if (answered) {
                  if (isCorrect) { border = OK; bg = `${OK}14`; color = OK; }
                  else if (isPicked) { border = NO; bg = `${NO}14`; color = NO; }
                }
                return (
                  <button
                    key={i}
                    onClick={() => choose(opt)}
                    disabled={!!answered || busy}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', textAlign: 'left',
                      borderRadius: 13, border: `1.5px solid ${border}`, background: bg, color, font: 'inherit',
                      fontSize: '0.95rem', fontWeight: 600, cursor: answered ? 'default' : 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    <span style={{
                      width: 24, height: 24, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 7,
                      fontSize: '0.78rem', fontWeight: 800,
                      background: answered && (isCorrect || isPicked) ? 'transparent' : 'var(--color-bg-alt)',
                      color: answered && isCorrect ? OK : answered && isPicked ? NO : 'var(--color-text-tertiary)',
                    }}>
                      {answered && isCorrect ? <Check size={16} /> : answered && isPicked ? <XCircle size={16} /> : String.fromCharCode(65 + i)}
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>
            {answered && <Feedback correct={answered.correct} explanation={current.back} onNext={next} busy={busy} />}
          </div>
        ) : isTF ? (
          /* ─── DOĞRU / YANLIŞ ─── */
          <div style={cardWrap}>
            <QuestionCard tag={current.tag} text={current.front} hint={!answered ? current.hint : undefined} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, width: '100%' }}>
              {([['true', 'Doğru'], ['false', 'Yanlış']] as const).map(([val, label]) => {
                const isCorrect = val === current.answer;
                const isPicked = answered?.selected === val;
                let border = 'var(--color-border)', bg = 'var(--color-surface)', color = 'var(--color-text-primary)';
                if (answered) {
                  if (isCorrect) { border = OK; bg = `${OK}14`; color = OK; }
                  else if (isPicked) { border = NO; bg = `${NO}14`; color = NO; }
                } else {
                  color = val === 'true' ? OK : NO; border = `${color}55`;
                }
                return (
                  <button
                    key={val}
                    onClick={() => choose(val)}
                    disabled={!!answered || busy}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '18px 12px',
                      borderRadius: 14, border: `1.5px solid ${border}`, background: bg, color, font: 'inherit',
                      fontSize: '1rem', fontWeight: 800, cursor: answered ? 'default' : 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {answered && isCorrect ? <Check size={18} /> : answered && isPicked ? <XCircle size={18} /> : null}
                    {label}
                  </button>
                );
              })}
            </div>
            {answered && <Feedback correct={answered.correct} explanation={current.back} onNext={next} busy={busy} />}
          </div>
        ) : (
          /* ─── KLASİK ─── */
          <div style={cardWrap}>
            <div onClick={() => !flipped && setFlipped(true)} style={{ width: '100%', minHeight: 280, cursor: flipped ? 'default' : 'pointer', perspective: 1200 }}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={current.id + (flipped ? '-b' : '-f')}
                  initial={{ rotateY: flipped ? -90 : 0, opacity: flipped ? 0 : 1 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  style={{
                    width: '100%', minHeight: 280, display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', textAlign: 'center', gap: 14, padding: '36px 28px', boxSizing: 'border-box',
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 20, boxShadow: 'var(--shadow-lg)',
                  }}
                >
                  {current.tag && <Tag text={current.tag} />}
                  <div style={{ fontSize: flipped ? '1.05rem' : '1.25rem', fontWeight: flipped ? 600 : 700, color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
                    {flipped ? current.back : current.front}
                  </div>
                  {!flipped && current.hint && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--color-text-tertiary)' }}>
                      <Lightbulb size={13} /> {current.hint}
                    </div>
                  )}
                  {flipped && (
                    <div style={{ marginTop: 6, paddingTop: 14, borderTop: '1px solid var(--color-border)', fontSize: '0.8rem', color: 'var(--color-text-tertiary)' }}>
                      Soru: {current.front}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
            {!flipped ? (
              <button onClick={() => setFlipped(true)} style={primaryBtn}>
                <RotateCcw size={16} /> Cevabı Göster <kbd style={kbd}>Boşluk</kbd>
              </button>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, width: '100%' }}>
                {GRADES.map(g => (
                  <button
                    key={g.grade}
                    onClick={() => handleGrade(g.grade)}
                    disabled={busy}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '12px 6px',
                      borderRadius: 14, border: `1px solid ${g.color}55`, background: `${g.color}14`, color: g.color,
                      font: 'inherit', fontSize: '0.85rem', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
                    }}
                  >
                    {g.label}
                    <kbd style={{ ...kbd, color: g.color, borderColor: `${g.color}55` }}>{g.key}</kbd>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Tag({ text }: { text: string }) {
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700,
      background: 'var(--color-accent-light)', color: 'var(--color-accent)', border: '1px solid var(--color-accent-medium)',
    }}>{text}</span>
  );
}

function QuestionCard({ tag, text, hint }: { tag: string | null; text: string; hint?: string | null }) {
  return (
    <div style={{
      width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12,
      padding: '28px 24px', boxSizing: 'border-box', background: 'var(--color-surface)',
      border: '1px solid var(--color-border)', borderRadius: 20, boxShadow: 'var(--shadow-lg)',
    }}>
      {tag && <Tag text={tag} />}
      <div style={{ fontSize: '1.18rem', fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1.5 }}>{text}</div>
      {hint && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--color-text-tertiary)' }}>
          <Lightbulb size={13} /> {hint}
        </div>
      )}
    </div>
  );
}

function Feedback({ correct, explanation, onNext, busy }: { correct: boolean; explanation: string; onNext: () => void; busy: boolean }) {
  const color = correct ? OK : NO;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        display: 'flex', gap: 10, padding: '14px 16px', borderRadius: 14,
        border: `1px solid ${color}44`, background: `${color}10`,
      }}>
        <span style={{ flexShrink: 0, color }}>{correct ? <Check size={18} /> : <XCircle size={18} />}</span>
        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color, marginBottom: explanation ? 4 : 0 }}>
            {correct ? 'Doğru!' : 'Yanlış'}
          </div>
          {explanation && <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{explanation}</div>}
        </div>
      </div>
      <button onClick={onNext} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
        Sonraki <kbd style={kbd}>Boşluk</kbd>
      </button>
    </motion.div>
  );
}

const cardWrap: React.CSSProperties = {
  width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, margin: 'auto',
};

const iconBtn: React.CSSProperties = {
  width: 36, height: 36, display: 'grid', placeItems: 'center',
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  borderRadius: 10, cursor: 'pointer', color: 'var(--color-text-secondary)',
};

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '12px 24px', background: 'var(--color-accent)', color: 'white',
  border: 'none', borderRadius: 14, font: 'inherit', fontSize: '0.92rem', fontWeight: 700, cursor: 'pointer',
};

const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '12px 22px', background: 'var(--color-surface)', color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border)', borderRadius: 14, font: 'inherit', fontSize: '0.92rem', fontWeight: 700, cursor: 'pointer',
};

const kbd: React.CSSProperties = {
  fontSize: '0.62rem', fontWeight: 700, padding: '1px 6px',
  border: '1px solid var(--color-border)', borderRadius: 5,
  background: 'var(--color-bg-alt)', color: 'var(--color-text-tertiary)',
};

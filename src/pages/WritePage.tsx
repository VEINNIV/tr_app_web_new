/**
 * TransWordly — WritePage (F7 Akademik Yazım Asistanı)
 *
 * Metin yapıştır → mod seç (akademikleştir / parafraz / dil bilgisi / kısalt / uzat)
 * → streaming sonuç. Kredi akışı useAiOperation ile sarılır (action='write').
 */
import { useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  PenLine, Sparkles, Copy, Check, Square,
  GraduationCap, Repeat, SpellCheck, Minimize2, Maximize2, Coins,
} from 'lucide-react';
import toast from 'react-hot-toast';
import BackToTools from '../components/ui/BackToTools';
import { rewriteText, type WriteMode } from '../lib/ai';
import { useAiOperation } from '../hooks/useAiOperation';
import { getCreditCosts } from '../lib/creditConfig';
import { fmtCredit } from '../lib/constants';

const MODES: { key: WriteMode; label: string; desc: string; Icon: typeof PenLine; accent: string }[] = [
  { key: 'academic',   label: 'Akademikleştir', desc: 'Resmî akademik ton',     Icon: GraduationCap, accent: '#f97316' },
  { key: 'paraphrase', label: 'Parafraz',        desc: 'Anlamı koru, yeniden yaz', Icon: Repeat,        accent: '#6366f1' },
  { key: 'grammar',    label: 'Dil Bilgisi',     desc: 'Yazım & noktalama düzelt', Icon: SpellCheck,    accent: '#10b981' },
  { key: 'shorten',    label: 'Kısalt',          desc: 'Özünü koru, sadeleştir',  Icon: Minimize2,     accent: '#0ea5e9' },
  { key: 'expand',     label: 'Uzat',            desc: 'Geliştir & derinleştir',  Icon: Maximize2,     accent: '#a855f7' },
];

export default function WritePage() {
  const reduced = useReducedMotion();
  const { run } = useAiOperation();
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<WriteMode>('academic');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const words = input.trim() ? input.trim().split(/\s+/).length : 0;
  const tooShort = input.trim().length < 12;

  async function handleRun() {
    if (busy || tooShort) return;
    setBusy(true);
    setOutput('');
    const controller = new AbortController();
    abortRef.current = controller;

    const amount = (await getCreditCosts().catch(() => null))?.write ?? 1;

    const res = await run<string>({
      action: 'write',
      amount,
      calls: 1,
      run: (operationId) =>
        rewriteText(input, mode, {
          operationId,
          signal: controller.signal,
          onChunk: (_d, full) => setOutput(full),
        }),
      toastId: 'ai-write',
    });

    if (!res.ok && res.reason !== 'aborted' && !output) {
      // hata toast'ı hook tarafından gösterildi
    }
    setBusy(false);
    abortRef.current = null;
  }

  function handleStop() {
    abortRef.current?.abort();
    setBusy(false);
  }

  async function handleCopy() {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    toast.success('Kopyalandı');
    setTimeout(() => setCopied(false), 1600);
  }

  const activeMode = MODES.find(m => m.key === mode)!;

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: 'calc(var(--navbar-height) + 18px) 20px 90px' }}>
      <BackToTools />


      {/* Başlık */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 22 }}>
        <div style={{ width: 46, height: 46, borderRadius: 13, display: 'grid', placeItems: 'center', background: 'rgba(249,115,22,0.14)', color: '#f97316' }}>
          <PenLine size={23} />
        </div>
        <div>
          <h1 style={{ fontSize: 'clamp(1.35rem, 4vw, 1.8rem)', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>Yazım Asistanı</h1>
          <p style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)', margin: '2px 0 0' }}>Akademikleştir · parafraz · dil bilgisi · kısalt-uzat</p>
        </div>
      </div>

      {/* Mod seçici */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        {MODES.map(({ key, label, desc, Icon, accent }) => {
          const active = key === mode;
          return (
            <motion.button
              key={key}
              onClick={() => setMode(key)}
              whileTap={reduced ? undefined : { scale: 0.97 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '10px 15px',
                borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                background: active ? `${accent}1a` : 'var(--color-surface)',
                border: `1.5px solid ${active ? accent : 'var(--color-border)'}`,
                transition: 'background .15s, border-color .15s',
              }}
            >
              <Icon size={17} style={{ color: accent, flexShrink: 0 }} />
              <span>
                <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{label}</span>
                <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--color-text-tertiary)' }}>{desc}</span>
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* İki panel */}
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        {/* Giriş */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-tertiary)' }}>Metnin</span>
            <span style={{ fontSize: '0.74rem', color: 'var(--color-text-tertiary)' }}>{words} kelime</span>
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Düzenlemek istediğin metni buraya yapıştır..."
            rows={14}
            style={{
              width: '100%', resize: 'vertical', minHeight: 260, padding: 14, borderRadius: 14,
              border: '1px solid var(--color-border)', background: 'var(--color-surface)',
              color: 'var(--color-text-primary)', fontSize: '0.92rem', lineHeight: 1.55,
              fontFamily: 'inherit', outline: 'none',
            }}
          />
        </div>

        {/* Çıkış */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-tertiary)' }}>Sonuç</span>
            {output && (
              <button onClick={handleCopy} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                {copied ? <Check size={13} style={{ color: '#10b981' }} /> : <Copy size={13} />} {copied ? 'Kopyalandı' : 'Kopyala'}
              </button>
            )}
          </div>
          <div
            style={{
              width: '100%', minHeight: 260, flex: 1, padding: 14, borderRadius: 14,
              border: '1px solid var(--color-border)', background: 'var(--color-surface)',
              color: output ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
              fontSize: '0.92rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowY: 'auto',
            }}
          >
            {output || (busy ? 'Yazılıyor…' : 'Sonuç burada görünecek.')}
            {busy && output && <span style={{ display: 'inline-block', width: 8, height: 15, marginLeft: 2, background: activeMode.accent, verticalAlign: 'text-bottom', animation: 'blink 1s steps(2) infinite' }} />}
          </div>
        </div>
      </div>

      {/* Aksiyon çubuğu */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
        {busy ? (
          <button
            onClick={handleStop}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-primary)', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer' }}
          >
            <Square size={15} /> Durdur
          </button>
        ) : (
          <motion.button
            onClick={handleRun}
            disabled={tooShort}
            whileTap={reduced || tooShort ? undefined : { scale: 0.97 }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 26px', borderRadius: 12,
              border: 'none', background: tooShort ? 'var(--color-border)' : activeMode.accent,
              color: '#fff', fontSize: '0.9rem', fontWeight: 700,
              cursor: tooShort ? 'not-allowed' : 'pointer', opacity: tooShort ? 0.7 : 1,
            }}
          >
            <Sparkles size={16} /> {activeMode.label}
          </motion.button>
        )}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: 'var(--color-text-tertiary)' }}>
          <Coins size={13} style={{ color: '#f59e0b' }} /> İşlem başına {fmtCredit(1)} kredi
        </span>
      </div>
    </div>
  );
}

/**
 * SharedDocumentPage — Paylaşılmış çeviriyi auth olmadan gösterir.
 * URL: /shared/:token
 *
 * Anonim ziyaretçi yalnızca GÖRÜNTÜLER + İNDİRİR (düzenleme yok).
 * İçerik 'shared-access' edge function üzerinden gelir:
 *   • Şifreli paylaşımda 4 haneli kod istenir.
 *   • 5 yanlış denemeden sonra o link o IP'ye engellenir.
 */
import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader, AlertCircle, Lock, ShieldX, ExternalLink, FileText, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AnimatePresence, motion } from 'framer-motion';
import PDFOverlayViewer from '../components/PDFOverlayViewer';
import type { OverlayData } from '../types';

interface SharedData {
  id: string;
  translated_text: { overlay?: OverlayData } | null;
  shared_pdf_url: string;
  target_language: string;
  original_name: string | null;
  original_language: string | null;
}

type Phase = 'loading' | 'needsCode' | 'blocked' | 'notFound' | 'error' | 'ready';

const CODE_LEN = 4;

export default function SharedDocumentPage() {
  const { token } = useParams<{ token: string }>();
  const [phase, setPhase] = useState<Phase>('loading');
  const [data, setData] = useState<SharedData | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  // Kod giriş durumu
  const [code, setCode] = useState<string[]>(Array(CODE_LEN).fill(''));
  const [submitting, setSubmitting] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const request = async (codeStr?: string) => {
    const { data: res, error } = await supabase.functions.invoke('shared-access', {
      body: { token, code: codeStr },
    });
    // functions.invoke non-2xx'te error döndürür ama body'yi de taşır
    const payload = (res ?? (error as { context?: { body?: unknown } })?.context?.body ?? null) as
      | Record<string, unknown>
      | null;
    return payload;
  };

  useEffect(() => {
    if (!token) { setPhase('notFound'); return; }
    let active = true;
    (async () => {
      try {
        const p = await request();
        if (!active) return;
        if (p?.ok) { setData(p.data as SharedData); setPhase('ready'); setViewerOpen(true); }
        else if (p?.needsCode) setPhase('needsCode');
        else if (p?.blocked) setPhase('blocked');
        else if (p?.notFound) setPhase('notFound');
        else setPhase('error');
      } catch {
        if (active) setPhase('error');
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const submitCode = async (full: string) => {
    setSubmitting(true);
    setWrong(false);
    try {
      const p = await request(full);
      if (p?.ok) { setData(p.data as SharedData); setPhase('ready'); setViewerOpen(true); }
      else if (p?.blocked) setPhase('blocked');
      else if (p?.wrongCode) {
        setWrong(true);
        setRemaining(typeof p.remaining === 'number' ? p.remaining : null);
        setCode(Array(CODE_LEN).fill(''));
        setTimeout(() => inputs.current[0]?.focus(), 10);
      } else setPhase('error');
    } catch {
      setPhase('error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCodeChange = (idx: number, raw: string) => {
    const ch = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(-1);
    const next = [...code];
    next[idx] = ch;
    setCode(next);
    setWrong(false);
    if (ch && idx < CODE_LEN - 1) inputs.current[idx + 1]?.focus();
    if (next.every((c) => c) && next.join('').length === CODE_LEN) {
      submitCode(next.join(''));
    }
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[idx] && idx > 0) inputs.current[idx - 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const txt = e.clipboardData.getData('text').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, CODE_LEN);
    if (!txt) return;
    e.preventDefault();
    const next = Array(CODE_LEN).fill('').map((_, i) => txt[i] ?? '');
    setCode(next);
    if (txt.length === CODE_LEN) submitCode(txt);
    else inputs.current[txt.length]?.focus();
  };

  // ── Yükleniyor ──────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <CenterWrap>
        <motion.img src="/apple-touch-icon.png" alt="" width={56} height={56}
          animate={{ scale: [1, 1.06, 1], opacity: [0.8, 1, 0.8] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          style={{ filter: 'drop-shadow(0 6px 18px rgba(0,87,255,0.18))' }} />
        <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Belge yükleniyor…</p>
        <Loader size={18} style={{ animation: 'spin 0.9s linear infinite', color: 'var(--color-accent)' }} />
      </CenterWrap>
    );
  }

  // ── Engellendi ──────────────────────────────────────────────────────────
  if (phase === 'blocked') {
    return (
      <CenterWrap>
        <IconBadge bg="var(--color-error-bg)"><ShieldX size={32} color="var(--color-error)" /></IconBadge>
        <Title>Erişim engellendi</Title>
        <Sub>Çok fazla hatalı kod denemesi yapıldı. Bu bağlantıya erişiminiz güvenlik nedeniyle kapatıldı. Belge sahibinden yeni bir bağlantı isteyin.</Sub>
        <HomeLink />
      </CenterWrap>
    );
  }

  // ── Bulunamadı / hata ───────────────────────────────────────────────────
  if (phase === 'notFound' || phase === 'error') {
    return (
      <CenterWrap>
        <IconBadge bg="var(--color-error-bg)"><AlertCircle size={32} color="var(--color-error)" /></IconBadge>
        <Title>Belge bulunamadı</Title>
        <Sub>Bu bağlantı bulunamadı veya süresi dolmuş.</Sub>
        <HomeLink />
      </CenterWrap>
    );
  }

  // ── Şifre giriş ekranı ──────────────────────────────────────────────────
  if (phase === 'needsCode') {
    return (
      <CenterWrap>
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, maxWidth: 380, padding: '0 24px' }}
        >
          <div style={{ width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(140deg, var(--color-accent) 0%, #0042c4 100%)', display: 'grid', placeItems: 'center', boxShadow: '0 14px 34px rgba(0,87,255,0.32)' }}>
            <Lock size={30} color="#fff" strokeWidth={2} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <Title>Korumalı belge</Title>
            <Sub>Bu çeviriyi görüntülemek için 4 haneli erişim kodunu girin.</Sub>
          </div>

          <motion.div
            animate={wrong ? { x: [0, -9, 9, -7, 7, 0] } : {}}
            transition={{ duration: 0.4 }}
            style={{ display: 'flex', gap: 12 }}
            onPaste={handlePaste}
          >
            {code.map((c, i) => (
              <input
                key={i}
                ref={(el) => { inputs.current[i] = el; }}
                value={c}
                onChange={(e) => handleCodeChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                disabled={submitting}
                autoFocus={i === 0}
                inputMode="text"
                maxLength={1}
                aria-label={`Kod hanesi ${i + 1}`}
                style={{
                  width: 56, height: 64, textAlign: 'center',
                  fontSize: '1.6rem', fontWeight: 700,
                  color: 'var(--color-text-primary)',
                  background: 'var(--color-surface)',
                  border: `2px solid ${wrong ? 'var(--color-error)' : c ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  borderRadius: 14, outline: 'none',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                  boxShadow: c ? '0 4px 14px rgba(0,87,255,0.14)' : 'none',
                  textTransform: 'uppercase',
                }}
              />
            ))}
          </motion.div>

          <div style={{ height: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
            {submitting && <Loader size={15} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--color-accent)' }} />}
            {wrong && !submitting && (
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-error)', fontWeight: 600 }}>
                Hatalı kod{remaining !== null ? ` — ${remaining} deneme hakkınız kaldı` : ''}
              </span>
            )}
          </div>

          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-tertiary)', textAlign: 'center', lineHeight: 1.5 }}>
            Kodu belgeyi paylaşan kişiden alın. 5 hatalı denemeden sonra erişim kapanır.
          </p>
        </motion.div>
      </CenterWrap>
    );
  }

  // ── Hazır: içerik ───────────────────────────────────────────────────────
  if (!data) return null;
  const overlay = data.translated_text?.overlay;
  const docName = data.original_name ?? 'Belge';
  const sourceLang = data.original_language ?? 'en';

  return (
    <>
      <motion.div
        initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200, padding: '10px 20px',
          background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)', borderTop: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: '0.8125rem', color: 'var(--color-text-secondary)',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <img src="/trans_wordly.png" alt="" width={20} height={20} />
          Paylaşılan çeviri — <strong style={{ color: 'var(--color-text-primary)' }}>{docName}</strong>
        </span>
        <Link to="/" style={{ color: 'var(--color-accent)', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          TransWordly ile çevir <ExternalLink size={12} />
        </Link>
      </motion.div>

      <AnimatePresence>
        {viewerOpen && (
          <PDFOverlayViewer
            pdfUrl={data.shared_pdf_url}
            documentName={docName}
            sourceLang={sourceLang}
            overlayData={overlay}
            onClose={() => setViewerOpen(false)}
          />
        )}
      </AnimatePresence>

      {!viewerOpen && (
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}
        >
          <div style={{ width: 80, height: 80, borderRadius: 20, background: 'linear-gradient(140deg, #ffffff 0%, #f3f6ff 100%)', display: 'grid', placeItems: 'center', boxShadow: '0 12px 32px rgba(0,87,255,0.18)' }}>
            <FileText size={36} color="var(--color-accent)" strokeWidth={1.5} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{docName}</p>
            <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: 'var(--color-text-tertiary)' }}>Paylaşılan çeviri</p>
          </div>
          <motion.button
            onClick={() => setViewerOpen(true)}
            whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 460, damping: 24 }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 999,
              background: 'var(--color-accent)', color: '#fff', fontSize: '0.9rem', fontWeight: 700,
              border: 'none', cursor: 'pointer', boxShadow: '0 10px 26px rgba(0,87,255,0.28)',
            }}
          >
            Belgeyi aç <ArrowRight size={16} />
          </motion.button>
        </motion.div>
      )}
    </>
  );
}

// ── Küçük yardımcı bileşenler ────────────────────────────────────────────────
function CenterWrap({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
      {children}
    </div>
  );
}
function IconBadge({ children, bg }: { children: React.ReactNode; bg: string }) {
  return <div style={{ width: 72, height: 72, borderRadius: '50%', background: bg, display: 'grid', placeItems: 'center' }}>{children}</div>;
}
function Title({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, fontSize: '1.125rem', color: 'var(--color-text-primary)', fontWeight: 700, letterSpacing: '-0.01em' }}>{children}</p>;
}
function Sub({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: '8px 0 0', fontSize: '0.9rem', maxWidth: 360, lineHeight: 1.6, color: 'var(--color-text-tertiary)' }}>{children}</p>;
}
function HomeLink() {
  return (
    <Link to="/" style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 999, background: 'var(--color-accent)', color: 'white', fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none' }}>
      Ana sayfaya dön
    </Link>
  );
}

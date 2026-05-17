/**
 * SharedDocumentPage — Paylaşılmış çeviriyi auth olmadan gösterir.
 * URL: /shared/:token
 */
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader, AlertCircle, Lock, ExternalLink, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AnimatePresence, motion } from 'framer-motion';
import PDFOverlayViewer from '../components/PDFOverlayViewer';
import type { OverlayData } from '../types';

interface SharedTranslation {
  id: string;
  translated_text: { overlay?: OverlayData } | null;
  shared_pdf_url: string | null;
  target_language: string;
  document: {
    original_name: string;
    original_language: string | null;
  } | null;
}

export default function SharedDocumentPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [translation, setTranslation] = useState<SharedTranslation | null>(null);
  const [error, setError] = useState('');
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    if (!token) { setError('Geçersiz bağlantı.'); setLoading(false); return; }
    load(token);
  }, [token]);

  const load = async (t: string) => {
    const { data, error: err } = await supabase
      .from('translations')
      .select('id, translated_text, shared_pdf_url, target_language, document:documents(original_name, original_language)')
      .eq('share_token', t)
      .single();

    if (err || !data) {
      setError('Bu bağlantı bulunamadı veya süresi dolmuş.');
    } else {
      setTranslation(data as unknown as SharedTranslation);
      setViewerOpen(true);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, color: 'var(--color-text-tertiary)' }}>
        <motion.img
          src="/apple-touch-icon.png"
          alt=""
          width={56}
          height={56}
          animate={{ scale: [1, 1.06, 1], opacity: [0.8, 1, 0.8] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          style={{ filter: 'drop-shadow(0 6px 18px rgba(0,87,255,0.18))' }}
        />
        <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Belge yükleniyor…</p>
        <Loader size={18} style={{ animation: 'spin 0.9s linear infinite', color: 'var(--color-accent)' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: '0 24px' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--color-error-bg)', display: 'grid', placeItems: 'center' }}>
          <AlertCircle size={32} color="var(--color-error)" />
        </div>
        <p style={{ margin: 0, fontSize: '1.125rem', color: 'var(--color-text-primary)', fontWeight: 700, letterSpacing: '-0.01em' }}>Belge bulunamadı</p>
        <p style={{ margin: 0, fontSize: '0.9rem', maxWidth: 360, lineHeight: 1.6 }}>{error}</p>
        <Link to="/" style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 999, background: 'var(--color-accent)', color: 'white', fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none' }}>
          Ana sayfaya dön
        </Link>
      </div>
    );
  }

  if (!translation?.shared_pdf_url) {
    return (
      <div style={{ minHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: '0 24px' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--color-bg-alt)', display: 'grid', placeItems: 'center' }}>
          <Lock size={28} color="var(--color-text-tertiary)" />
        </div>
        <p style={{ margin: 0, fontSize: '1rem', color: 'var(--color-text-primary)', fontWeight: 700 }}>Bağlantı süresi doldu</p>
        <p style={{ margin: 0, fontSize: '0.9rem', maxWidth: 360, lineHeight: 1.6 }}>Bu paylaşım bağlantısı artık geçerli değil. Belge sahibinden paylaşımı yenilemesini isteyin.</p>
      </div>
    );
  }

  const overlay = translation.translated_text?.overlay;
  const docName = translation.document?.original_name ?? 'Belge';
  const sourceLang = translation.document?.original_language ?? 'en';

  return (
    <>
      {/* Branding bar */}
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200,
          padding: '10px 20px',
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderTop: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: '0.8125rem', color: 'var(--color-text-secondary)',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <img src="/apple-touch-icon.png" alt="" width={20} height={20} />
          Paylaşılan çeviri — <strong style={{ color: 'var(--color-text-primary)' }}>{docName}</strong>
        </span>
        <Link to="/" style={{ color: 'var(--color-accent)', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          TransLingua ile çevir <ExternalLink size={12} />
        </Link>
      </motion.div>

      <AnimatePresence>
        {viewerOpen && (
          <PDFOverlayViewer
            pdfUrl={translation.shared_pdf_url}
            documentName={docName}
            sourceLang={sourceLang}
            overlayData={overlay}
            onClose={() => setViewerOpen(false)}
          />
        )}
      </AnimatePresence>

      {!viewerOpen && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
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
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 460, damping: 24 }}
            style={{
              padding: '14px 32px', background: 'var(--color-accent)', color: 'white',
              border: 'none', borderRadius: 14, font: 'inherit', fontSize: '0.9375rem',
              fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(0,87,255,0.32)',
            }}
          >
            Belgeyi Görüntüle
          </motion.button>
        </motion.div>
      )}
    </>
  );
}

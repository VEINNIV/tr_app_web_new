/**
 * TransWordly — CookieConsent
 *
 * Sol-altta tatlı bir çerez bildirimi. İlk seçime kadar görünür, seçim
 * localStorage'a yazılır. Zorunlu (auth/güvenlik) çerezler her hâlükârda açıktır;
 * "Tercihler" yalnızca isteğe bağlı/analitik çerezleri kontrol eder.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Cookie, X, Check, SlidersHorizontal } from 'lucide-react';

const STORAGE_KEY = 'tw_cookie_consent';

interface Consent {
  necessary: true;
  analytics: boolean;
  ts: string;
}

function readConsent(): Consent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && typeof v === 'object' && 'analytics' in v) return v as Consent;
    return null;
  } catch {
    return null;
  }
}

export default function CookieConsent() {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  // İlk yüklemede daha önce seçim yapılmış mı bak (mount sonrası → SSR/hydrate sorunu yok)
  useEffect(() => {
    if (!readConsent()) {
      const t = setTimeout(() => setVisible(true), 700); // sayfa otursun, sonra nazikçe gir
      return () => clearTimeout(t);
    }
  }, []);

  const persist = (analyticsValue: boolean) => {
    const consent: Consent = { necessary: true, analytics: analyticsValue, ts: new Date().toISOString() };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(consent)); } catch { /* yoksay */ }
    setVisible(false);
  };

  const acceptAll = () => persist(true);
  const rejectAll = () => persist(false);
  const savePrefs = () => persist(analytics);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="dialog"
          aria-label="Çerez tercihleri"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          style={{
            position: 'fixed', left: 16, bottom: 16, zIndex: 1000,
            width: 'min(360px, calc(100vw - 32px))',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 20,
            boxShadow: 'var(--shadow-lg)',
            padding: 18,
            color: 'var(--color-text-primary)',
          }}
        >
          {/* Başlık */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 10 }}>
            <motion.span
              initial={reduced ? undefined : { rotate: -12, scale: 0.8 }}
              animate={reduced ? undefined : { rotate: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.1 }}
              style={{ width: 40, height: 40, borderRadius: 13, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'rgba(217,119,6,0.12)', color: '#d97706', fontSize: 20 }}
            >
              <Cookie size={21} />
            </motion.span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.96rem', fontWeight: 800, letterSpacing: '-0.01em' }}>Çerez kullanıyoruz 🍪</div>
              <div style={{ fontSize: '0.74rem', color: 'var(--color-text-tertiary)' }}>Deneyimini geliştirmek için</div>
            </div>
            <button
              onClick={rejectAll}
              aria-label="Kapat ve isteğe bağlı çerezleri reddet"
              style={{ display: 'inline-flex', padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', flexShrink: 0, borderRadius: 8 }}
            >
              <X size={17} />
            </button>
          </div>

          <p style={{ margin: '0 0 14px', fontSize: '0.83rem', lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
            Oturumunu açık tutmak ve siteyi güvenli sunmak için zorunlu çerezleri kullanıyoruz.
            İstersen isteğe bağlı çerezleri de açabilirsin. Ayrıntı:{' '}
            <Link to="/legal/cerez-politikasi" style={{ color: 'var(--color-accent)', fontWeight: 600 }}>Çerez Politikası</Link>.
          </p>

          {/* Tercihler paneli */}
          <AnimatePresence initial={false}>
            {showPrefs && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                style={{ overflow: 'hidden', marginBottom: 14 }}
              >
                <div style={{ display: 'grid', gap: 8 }}>
                  <PrefRow
                    title="Zorunlu çerezler"
                    desc="Oturum ve güvenlik. Her zaman açık."
                    checked
                    disabled
                  />
                  <PrefRow
                    title="İsteğe bağlı / analitik"
                    desc="Hizmeti iyileştirmek için anonim kullanım."
                    checked={analytics}
                    onChange={() => setAnalytics(a => !a)}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Aksiyonlar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {showPrefs ? (
              <button onClick={savePrefs} style={primaryBtn}>
                <Check size={15} /> Seçimi kaydet
              </button>
            ) : (
              <button onClick={acceptAll} style={primaryBtn}>
                <Check size={15} /> Kabul et
              </button>
            )}
            <button onClick={rejectAll} style={ghostBtn}>Reddet</button>
            <button
              onClick={() => setShowPrefs(s => !s)}
              style={{ ...ghostBtn, marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <SlidersHorizontal size={13} /> {showPrefs ? 'Gizle' : 'Tercihler'}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 11,
  background: 'var(--color-accent)', color: '#fff', border: 'none', cursor: 'pointer',
  font: 'inherit', fontWeight: 700, fontSize: '0.82rem',
};
const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', padding: '9px 14px', borderRadius: 11,
  background: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)',
  cursor: 'pointer', font: 'inherit', fontWeight: 600, fontSize: '0.82rem',
};

function PrefRow({ title, desc, checked, disabled, onChange }: {
  title: string; desc: string; checked: boolean; disabled?: boolean; onChange?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onChange}
      aria-pressed={checked}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 12, textAlign: 'left',
        background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)',
        cursor: disabled ? 'default' : 'pointer', width: '100%', font: 'inherit',
      }}
    >
      <span
        style={{
          width: 34, height: 20, borderRadius: 999, flexShrink: 0, position: 'relative', transition: 'background .2s',
          background: checked ? 'var(--color-accent)' : 'var(--color-border)', opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{ position: 'absolute', top: 2, left: checked ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
      </span>
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{title}</span>
        <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--color-text-tertiary)', marginTop: 1 }}>{desc}</span>
      </span>
    </button>
  );
}

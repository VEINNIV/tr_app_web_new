/**
 * TransWordly — CookieConsent · "Yapışkan Not"
 *
 * Sol-altta, masaya iliştirilmiş yapışkan not kağıdı gibi bir çerez bildirimi:
 * krem kağıt, üstte washi bant, hafif eğik duruş, el yazısı başlık. İlk seçime
 * kadar görünür, seçim localStorage'a yazılır. Zorunlu (auth/güvenlik) çerezler
 * her hâlükârda açıktır; "Tercihler" yalnızca isteğe bağlı/analitik çerezleri
 * kontrol eder. Renkler kasıtlı olarak temadan bağımsız sabittir — kağıt her
 * zaman kağıt gibi görünsün (açık/koyu temada da).
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Cookie, X, Check, SlidersHorizontal } from 'lucide-react';

const STORAGE_KEY = 'tw_cookie_consent';

/* ── Kağıt paleti (temadan bağımsız) ── */
const PAPER = '#FCF4DC';
const PAPER_2 = '#F7EAC2';
const INK = '#43381F';
const INK_2 = '#6B5C3A';
const INK_3 = '#9A8A63';
const LINE = 'rgba(67, 56, 31, 0.14)';
const ACCENT = '#0057FF';

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
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 28, rotate: -6, scale: 0.94 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, rotate: -1.8, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 24, rotate: -5, scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          whileHover={reduced ? undefined : { rotate: 0, y: -3 }}
          style={{
            position: 'fixed', left: 18, bottom: 20, zIndex: 1000,
            width: 'min(354px, calc(100vw - 32px))',
            background: `linear-gradient(160deg, ${PAPER} 0%, ${PAPER_2} 100%)`,
            // Kağıt köşeleri: keskin üst, hafif kıvrık alt-sağ (kalkık köşe hissi)
            borderRadius: '3px 3px 3px 14px',
            boxShadow: '0 1px 1px rgba(67,56,31,0.18), 0 14px 28px -8px rgba(40,30,5,0.35), 0 28px 60px -20px rgba(40,30,5,0.30)',
            padding: '22px 18px 18px',
            color: INK,
            fontFamily: 'var(--font-family)',
          }}
        >
          {/* Washi bant — kağıdı masaya iliştiren şerit */}
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%) rotate(-2.5deg)',
              width: 116, height: 26,
              background: 'repeating-linear-gradient(45deg, rgba(0,87,255,0.20) 0 7px, rgba(0,87,255,0.30) 7px 14px)',
              borderLeft: '1px solid rgba(0,87,255,0.12)', borderRight: '1px solid rgba(0,87,255,0.12)',
              boxShadow: '0 2px 4px rgba(40,30,5,0.12)',
            }}
          />

          {/* İnce kenar dokusu — kağıdın sararmış kenarı */}
          <span aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: '3px 3px 3px 14px', boxShadow: 'inset 0 0 0 1px rgba(67,56,31,0.07), inset 0 -16px 24px -18px rgba(67,56,31,0.25)', pointerEvents: 'none' }} />

          {/* Başlık */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 4 }}>
            <motion.span
              initial={reduced ? undefined : { rotate: -14, scale: 0.8 }}
              animate={reduced ? undefined : { rotate: -6, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.12 }}
              style={{ fontSize: 26, flexShrink: 0, lineHeight: 1, filter: 'drop-shadow(0 1px 1px rgba(40,30,5,0.2))' }}
            >
              <Cookie size={24} color="#B45309" strokeWidth={2.1} />
            </motion.span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-hand)', fontSize: '1.7rem', fontWeight: 700, lineHeight: 1, color: INK, letterSpacing: '0.4px' }}>
                Çerez molası 🍪
              </div>
            </div>
            <button
              onClick={rejectAll}
              aria-label="Kapat ve isteğe bağlı çerezleri reddet"
              style={{ display: 'inline-flex', padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: INK_3, flexShrink: 0, borderRadius: 8, marginTop: -8 }}
            >
              <X size={17} />
            </button>
          </div>

          {/* El yazısı altı çizili ayraç */}
          <div aria-hidden="true" style={{ height: 1, background: `repeating-linear-gradient(90deg, ${LINE} 0 6px, transparent 6px 11px)`, margin: '0 0 12px' }} />

          <p style={{ margin: '0 0 14px', fontSize: '0.83rem', lineHeight: 1.6, color: INK_2 }}>
            Oturumunu açık tutmak ve siteyi güvenli sunmak için zorunlu çerezler şart.
            İstersen analitik çerezleri de açabilirsin — kararı sana bırakıyoruz.{' '}
            <Link to="/legal/cerez-politikasi" style={{ color: ACCENT, fontWeight: 700, textDecoration: 'underline', textDecorationStyle: 'wavy', textUnderlineOffset: 3 }}>Çerez Politikası</Link>.
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
  background: ACCENT, color: '#fff', border: 'none', cursor: 'pointer',
  font: 'inherit', fontWeight: 700, fontSize: '0.82rem',
  boxShadow: '0 2px 6px rgba(0,87,255,0.28)',
};
const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', padding: '9px 14px', borderRadius: 11,
  background: 'rgba(67,56,31,0.05)', color: INK_2, border: '1px solid rgba(67,56,31,0.16)',
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
        display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 10, textAlign: 'left',
        background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(67,56,31,0.14)',
        cursor: disabled ? 'default' : 'pointer', width: '100%', font: 'inherit',
      }}
    >
      <span
        style={{
          width: 34, height: 20, borderRadius: 999, flexShrink: 0, position: 'relative', transition: 'background .2s',
          background: checked ? ACCENT : 'rgba(67,56,31,0.22)', opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{ position: 'absolute', top: 2, left: checked ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
      </span>
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: INK }}>{title}</span>
        <span style={{ display: 'block', fontSize: '0.72rem', color: INK_3, marginTop: 1 }}>{desc}</span>
      </span>
    </button>
  );
}

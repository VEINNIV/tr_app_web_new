import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Mail, Lock, User, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import styles from '../styles/components/auth.module.css';

const FEATURES = [
  '12 dilden Türkçeye otomatik çeviri',
  '150+ sayfa kapasiteli AI motoru',
  'Belge üzerinde soru-cevap asistanı',
  'Supabase altyapısında güvenli depolama',
];

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const [isRegister, setIsRegister] = useState(searchParams.get('mode') === 'register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, signInWithGoogle, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) {
        await signUp(email, password, fullName);
        navigate('/dashboard');
      } else {
        await signIn(email, password);
        navigate('/dashboard');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bir hata oluştu';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => { setIsRegister(!isRegister); setError(''); };

  return (
    <div className={styles.authPage}>

      {/* ── Left Panel ─── */}
      <div className={styles.authLeft}>
        <div className={styles.authLeftBg} />
        <div className={styles.floatingOrb1} />
        <div className={styles.floatingOrb2} />

        <div className={styles.authLeftLogo}>
          <div className={styles.authLeftLogoMark}>TL</div>
          <span className={styles.authLeftLogoText}>TransLingua</span>
        </div>

        <div className={styles.authLeftContent}>
          <h2 className={styles.authLeftQuote}>
            Belgeleriniz artık{' '}
            <span className={styles.authLeftQuoteAccent}>dil bariyerini</span>
            {' '}aşıyor.
          </h2>
          <div className={styles.authLeftFeatures}>
            {FEATURES.map((f, i) => (
              <div key={i} className={styles.authLeftFeature}>
                <div className={styles.authLeftFeatureDot} />
                <span className={styles.authLeftFeatureText}>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right Panel ─── */}
      <div className={styles.authRight}>
        <form className={styles.authForm} onSubmit={handleSubmit}>

          {/* Back link */}
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', color: 'var(--color-text-tertiary)', marginBottom: '2rem', textDecoration: 'none' }}>
            <ArrowLeft size={14} /> Ana Sayfaya Dön
          </Link>

          <h1 className={styles.authFormTitle}>
            {isRegister ? 'Hesap oluşturun' : 'Tekrar hoş geldiniz'}
          </h1>
          <p className={styles.authFormSubtitle}>
            {isRegister
              ? 'Ücretsiz hesabınızla 5 sayfa çeviri hakkı kazanın.'
              : 'Hesabınıza giriş yapın ve kaldığınız yerden devam edin.'}
          </p>

          {error && <div className={styles.authError}>{error}</div>}

          {isRegister && (
            <div className={styles.inputGroup}>
              <label className={styles.inputLabel} htmlFor="fullName">Ad Soyad</label>
              <div className={styles.inputWrapper}>
                <User size={16} className={styles.inputIcon} />
                <input
                  id="fullName"
                  className={styles.input}
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Adınız Soyadınız"
                  required
                />
              </div>
            </div>
          )}

          <div className={styles.inputGroup}>
            <label className={styles.inputLabel} htmlFor="email">E-posta</label>
            <div className={styles.inputWrapper}>
              <Mail size={16} className={styles.inputIcon} />
              <input
                id="email"
                className={styles.input}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="ornek@email.com"
                required
              />
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.inputLabel} htmlFor="password">Şifre</label>
            <div className={styles.inputWrapper}>
              <Lock size={16} className={styles.inputIcon} />
              <input
                id="password"
                className={styles.input}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="En az 6 karakter"
                required
                minLength={6}
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? 'İşleniyor...' : isRegister ? 'Hesap Oluştur' : 'Giriş Yap'}
          </button>

          <div className={styles.divider}>veya</div>

          <button type="button" className={styles.googleBtn} onClick={signInWithGoogle}>
            <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google ile {isRegister ? 'Kayıt Ol' : 'Giriş Yap'}
          </button>

          <div className={styles.authToggle}>
            {isRegister ? 'Zaten hesabınız var mı? ' : 'Hesabınız yok mu? '}
            <button type="button" className={styles.authToggleBtn} onClick={toggle}>
              {isRegister ? 'Giriş Yap' : 'Ücretsiz Kayıt Ol'}
            </button>
          </div>
        </form>
      </div>

    </div>
  );
}

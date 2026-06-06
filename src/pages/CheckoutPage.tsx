/**
 * TransWordly — CheckoutPage
 * Sepetten veya plan kartından gelinir.  ?plan=starter|pro  &student=1
 *
 * Ödeme akışı: kullanıcı iletişim bilgilerini girer → "Güvenli Öde" →
 * PayTR'nin kendi güvenli ödeme sayfasına yönlendirilir (kart bilgisi orada
 * istenir, bizde saklanmaz). Tutar istemciden DEĞİL, app_config.plan_price'tan
 * okunur (paytr-init edge function). Başarılı ödemede webhook krediyi yükler.
 */
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ShieldCheck, CreditCard, Lock, Check, ChevronLeft,
  Zap, AlertCircle, User, Mail, Phone, ArrowUpRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/auth';
import { useCart } from '../context/CartContext';
import { PRICING_PLANS, CREDIT_COSTS, pdfPerCredits } from '../lib/constants';
import styles from '../styles/components/checkout.module.css';

/* ── Yardımcı ── */
function planLabel(id: string) {
  return { free: 'Ücretsiz', starter: 'Öğrenci', pro: 'Profesyonel', enterprise: 'Kurumsal' }[id] ?? id;
}

export default function CheckoutPage() {
  const [params] = useSearchParams();
  const navigate  = useNavigate();
  const { user, profile } = useAuth();
  const { item: cartItem, clear: clearCart } = useCart();

  // Plan/öğrenci bilgisi öncelik sırası: URL parametresi → sepet → varsayılan
  const planId    = params.get('plan') ?? cartItem?.planId ?? 'starter';
  const isStudent = params.get('student') === '1' || (!params.get('plan') && !!cartItem?.student);

  const staticPlan = PRICING_PLANS.find(p => p.id === planId) ?? PRICING_PLANS[1];

  /* ── app_config'den güncel fiyat/indirim ── */
  const [cfg, setCfg] = useState<Record<string, number>>({});
  useEffect(() => {
    supabase.from('app_config').select('key, value').then(({ data }) => {
      if (!data) return;
      const m: Record<string, number> = {};
      for (const r of data) m[r.key] = Number(r.value);
      setCfg(m);
    });
  }, []);

  const planCredits    = cfg[`plan_limit.${planId}`]  ?? staticPlan.credits;
  const perPage        = cfg['credit_cost.translation_per_page'] ?? CREDIT_COSTS.TRANSLATION_PER_PAGE;
  const basePrice      = cfg[`plan_price.${planId}`]  ?? staticPlan.price;
  const discountPct    = cfg[`discount.${planId}`]     ?? 0;
  const studentOff     = cfg['discount.student_amount']?? 0;
  const afterPct       = discountPct > 0 ? Math.round(basePrice * (1 - discountPct / 100)) : basePrice;
  const finalPrice     = isStudent && studentOff > 0 ? Math.max(0, afterPct - studentOff) : afterPct;
  const savings        = basePrice - finalPrice;

  /* ── Form state ── */
  const [name,  setName]  = useState(profile?.full_name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState('');
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Profil yüklenince doldur
  useEffect(() => {
    if (profile?.full_name) setName(profile.full_name);
    if (user?.email)        setEmail(user.email);
  }, [profile, user]);

  const [payError, setPayError] = useState<string | null>(null);

  // PayTR ok/fail dönüşü: ?status=success|fail
  const payStatus = params.get('status');

  // Ödeme başarılıysa sepeti boşalt (kullanıcı geri gelince eski sepetle karşılaşmasın)
  useEffect(() => {
    if (payStatus === 'success') clearCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agree) return;
    if (!user) { setPayError('Ödeme için giriş yapmalısınız.'); return; }
    setPayError(null);
    setSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const supaUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
      if (!token || !supaUrl) throw new Error('Oturum bulunamadı, tekrar giriş yapın.');

      const res = await fetch(`${supaUrl}/functions/v1/paytr-init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...(anonKey ? { apikey: anonKey } : {}),
        },
        body: JSON.stringify({ plan: planId, student: isStudent, name, phone }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.iframeUrl) {
        throw new Error(data?.error ?? 'Ödeme başlatılamadı.');
      }
      // PayTR güvenli ödeme sayfasına yönlendir
      window.location.href = data.iframeUrl as string;
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Ödeme başlatılamadı.');
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      {/* Geri butonu */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          <ChevronLeft size={16} /> Geri
        </button>
        <div className={styles.secureLabel}>
          <Lock size={13} /> Güvenli Ödeme
        </div>
      </div>

      <div className={styles.layout}>
        {/* ── Sol: Plan özeti ── */}
        <motion.aside
          className={styles.summary}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className={styles.summaryHeader}>
            <div className={styles.summaryIcon}><Zap size={20} /></div>
            <div>
              <div className={styles.summaryPlanName}>{planLabel(planId)} Planı</div>
              <div className={styles.summaryBill}>Aylık abonelik</div>
            </div>
          </div>

          {/* Fiyat gösterimi */}
          <div className={styles.priceBlock}>
            {savings > 0 && (
              <div className={styles.originalPrice}>₺{basePrice}<span>/ay</span></div>
            )}
            <div className={styles.finalPrice}>
              ₺{finalPrice}<span>/ay</span>
            </div>
            {savings > 0 && (
              <div className={styles.savingsBadge}>
                <Check size={11} /> ₺{savings} tasarruf
                {isStudent && studentOff > 0 && ' (öğrenci)'}
                {discountPct > 0 && ` (-%${discountPct})`}
              </div>
            )}
          </div>

          {/* Özellikler */}
          <ul className={styles.featureList}>
            {planCredits > 0 && (
              <li><Check size={13} />{planCredits} kredi/ay · ≈{pdfPerCredits(planCredits, perPage)} sayfa çeviri</li>
            )}
            {staticPlan.features.map((f, i) => (
              <li key={i}><Check size={13} />{f}</li>
            ))}
          </ul>

          {/* Güvenlik notları */}
          <div className={styles.trustItems}>
            <div className={styles.trustItem}><ShieldCheck size={14} /> 256-bit SSL şifreleme</div>
            <div className={styles.trustItem}><CreditCard size={14} /> Kart bilgisi saklanmaz</div>
            <div className={styles.trustItem}><AlertCircle size={14} /> İstediğin zaman iptal</div>
          </div>

          {/* Ödeme sağlayıcı logoları (placeholder) */}
          <div className={styles.providerLogos}>
            <div className={styles.providerChip}>PayTR</div>
            <div className={styles.providerChip}>iyzico</div>
            <div className={styles.providerChip}>Visa</div>
            <div className={styles.providerChip}>Mastercard</div>
          </div>
        </motion.aside>

        {/* ── Sağ: Ödeme formu ── */}
        <motion.section
          className={styles.formSection}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className={styles.formTitle}>Ödeme Bilgileri</h1>

          {payStatus === 'success' && (
            <div className={styles.loginHint} style={{ borderColor: '#10b981', color: '#10b981' }}>
              <Check size={14} /> Ödemeniz alındı. Krediniz birkaç saniye içinde hesabınıza yansır.
            </div>
          )}
          {payStatus === 'fail' && (
            <div className={styles.loginHint} style={{ borderColor: '#ef4444', color: '#ef4444' }}>
              <AlertCircle size={14} /> Ödeme tamamlanamadı veya iptal edildi. Tekrar deneyebilirsiniz.
            </div>
          )}
          {payError && (
            <div className={styles.loginHint} style={{ borderColor: '#ef4444', color: '#ef4444' }}>
              <AlertCircle size={14} /> {payError}
            </div>
          )}

          {!user && (
            <div className={styles.loginHint}>
              <AlertCircle size={14} />
              Hesabın varsa <Link to={`/auth?redirect=/checkout?plan=${planId}${isStudent ? '&student=1' : ''}`}>giriş yap</Link> — bilgilerin otomatik dolar.
            </div>
          )}

          <form onSubmit={handleSubmit} className={styles.form}>
            {/* Kişisel bilgiler */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Ad Soyad</label>
              <div className={styles.inputWrap}>
                <User size={15} className={styles.inputIcon} />
                <input
                  className={styles.input}
                  type="text"
                  required
                  placeholder="Ad Soyad"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>E-posta</label>
                <div className={styles.inputWrap}>
                  <Mail size={15} className={styles.inputIcon} />
                  <input
                    className={styles.input}
                    type="email"
                    required
                    placeholder="ornek@mail.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Telefon <span className={styles.optional}>(isteğe bağlı)</span></label>
                <div className={styles.inputWrap}>
                  <Phone size={15} className={styles.inputIcon} />
                  <input
                    className={styles.input}
                    type="tel"
                    placeholder="+90 5xx xxx xx xx"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Ödeme yöntemi — kart bilgisi PayTR'nin güvenli sayfasında istenir */}
            <div className={styles.cardPlaceholder}>
              <div className={styles.cardPlaceholderInner}>
                <ShieldCheck size={24} className={styles.cardIcon} />
                <div className={styles.cardPlaceholderText}>
                  <strong>Güvenli ödeme — PayTR</strong>
                  <span>“Güvenli Öde”ye bastığınızda PayTR’nin 3D Secure ödeme sayfasına yönlendirilirsiniz. Kart bilgileriniz PayTR tarafında işlenir, sitemizde saklanmaz.</span>
                </div>
                <ArrowUpRight size={18} style={{ marginLeft: 'auto', color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
              </div>
            </div>

            {/* Sözleşme onayı */}
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={agree}
                onChange={e => setAgree(e.target.checked)}
                required
              />
              <span>
                <Link to="/legal/mesafeli-satis" target="_blank">Mesafeli Satış Sözleşmesi</Link>’ni ve{' '}
                <Link to="/legal/gizlilik-kvkk" target="_blank">Gizlilik Politikası</Link>’nı okudum, onaylıyorum.
              </span>
            </label>

            {/* Özet + Ödeme butonu */}
            <div className={styles.submitRow}>
              <div className={styles.totalPreview}>
                Toplam: <strong>₺{finalPrice}/ay</strong>
              </div>
              <motion.button
                type="submit"
                className={styles.submitBtn}
                disabled={!agree || submitting}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              >
                {submitting ? (
                  <span className={styles.spinner} />
                ) : (
                  <><Lock size={15} /> Güvenli Öde — ₺{finalPrice}</>
                )}
              </motion.button>
            </div>
          </form>
        </motion.section>
      </div>
    </div>
  );
}

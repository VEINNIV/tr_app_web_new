/**
 * TransWordly — CheckoutPage
 * Kullanıcı "Plan Seç" butonuna bastığında gelir.
 * ?plan=starter|pro  &student=1 (öğrenci indirimi)
 *
 * Ödeme altyapısı (PayTR / iyzico) henüz entegre edilmemiş;
 * bu sayfa ödeme akışının UI + entegrasyon iskeletidir.
 */
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ShieldCheck, CreditCard, Lock, Check, ChevronLeft,
  Zap, AlertCircle, User, Mail, Phone,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/auth';
import { PRICING_PLANS } from '../lib/constants';
import styles from '../styles/components/checkout.module.css';

/* ── Yardımcı ── */
function planLabel(id: string) {
  return { free: 'Ücretsiz', starter: 'Öğrenci', pro: 'Profesyonel', enterprise: 'Kurumsal' }[id] ?? id;
}

export default function CheckoutPage() {
  const [params] = useSearchParams();
  const navigate  = useNavigate();
  const { user, profile } = useAuth();

  const planId    = params.get('plan') ?? 'starter';
  const isStudent = params.get('student') === '1';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agree) return;
    setSubmitting(true);

    /**
     * TODO: Burada PayTR veya iyzico ödeme başlatma isteği atılacak.
     *
     * PayTR örneği:
     *   const res = await fetch('/api/paytr/init', {
     *     method: 'POST',
     *     body: JSON.stringify({ planId, price: finalPrice, email, name, phone }),
     *   });
     *   const { token } = await res.json();
     *   window.location.href = `https://www.paytr.com/odeme/guvenli/${token}`;
     *
     * iyzico örneği:
     *   const res = await fetch('/api/iyzico/init', { ... });
     *   const { checkoutFormContent } = await res.json();
     *   // iyzico form HTML'ini sayfaya enjekte et
     */

    // Şimdilik simülasyon
    await new Promise(r => setTimeout(r, 1200));
    setSubmitting(false);
    alert('Ödeme altyapısı henüz entegre edilmedi. Bu ekran hazır — PayTR veya iyzico eklenecek.');
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

            {/* Kart bilgisi — ödeme sağlayıcı iframi buraya gelecek */}
            <div className={styles.cardPlaceholder}>
              <div className={styles.cardPlaceholderInner}>
                <CreditCard size={24} className={styles.cardIcon} />
                <div className={styles.cardPlaceholderText}>
                  <strong>Kart bilgisi alanı</strong>
                  <span>PayTR veya iyzico entegrasyonu yapıldığında burada ödeme formu görünecek.</span>
                </div>
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
                <Link to="/terms" target="_blank">Kullanım koşullarını</Link> ve{' '}
                <Link to="/privacy" target="_blank">gizlilik politikasını</Link> okudum, kabul ediyorum.
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

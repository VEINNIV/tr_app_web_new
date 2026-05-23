/**
 * TransLingua — SettingsPage (Ayarlar)
 *
 * Kullanıcının profil bilgilerini düzenlediği, abonelik durumunu
 * görüntülediği ve oturumunu kapattığı sayfa.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { User, CreditCard, LogOut, Shield, HelpCircle, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { SPRING_TIGHT } from '../components/ui/motion';
import { useOnboardingTour } from '../hooks/useOnboardingTour';
import styles from '../styles/components/settings.module.css';

export default function SettingsPage() {
  const { profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { resetTour } = useOnboardingTour();

  const restartOnboarding = async () => {
    if (!profile) return;
    await supabase.from('profiles').update({ onboarding_completed: false }).eq('id', profile.id);
    await refreshProfile();
    navigate('/dashboard');
  };
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [saving, setSaving] = useState(false);

  if (!profile) {
    return (
      <div className={styles.page} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }} />
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>Yükleniyor...</p>
        </div>
      </div>
    );
  }

  /** Çıkış yap ve ana sayfaya yönlendir */
  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  /** Profil adını Supabase'e kaydeder */
  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', profile.id);

    if (error) toast.error('Kayıt başarısız. Lütfen tekrar deneyin.');
    else { toast.success('Profil başarıyla güncellendi ✓'); await refreshProfile(); }

    setSaving(false);
  };

  const cardVariants: Variants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } },
  };

  return (
    <motion.div
      className={styles.page}
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } } }}
    >
      <motion.h1 className={styles.title} variants={cardVariants}>Ayarlar</motion.h1>

      {/* ── Profil Kartı ─────────────────────────────────────── */}
      <motion.div className={styles.card} variants={cardVariants}>
        <div className={styles.cardTitle}>
          <User size={16} /> Profil Bilgileri
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="fullName">Ad Soyad</label>
          <input
            id="fullName"
            className={styles.input}
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="Adınız Soyadınız"
          />
        </div>

        <div className={styles.row}>
          <span className={styles.rowLabel}>E-posta</span>
          <span className={styles.rowValue}>{profile.email}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Üye Tarihi</span>
          <span className={styles.rowValue}>
            {new Date(profile.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>

        <motion.button
          className={styles.btnPrimary}
          onClick={handleSave}
          disabled={saving}
          whileHover={reduced || saving ? undefined : { y: -2 }}
          whileTap={reduced || saving ? undefined : { scale: 0.97 }}
          transition={SPRING_TIGHT}
        >
          {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
        </motion.button>
      </motion.div>

      {/* ── Abonelik Kartı ───────────────────────────────────── */}
      <motion.div className={styles.card} variants={cardVariants}>
        <div className={styles.cardTitle}>
          <CreditCard size={16} /> Abonelik ve Kredi
        </div>

        <div className={styles.row}>
          <span className={styles.rowLabel}>Mevcut Plan</span>
          <span className={styles.planBadge}>{profile.plan.toUpperCase()}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Kalan Kredi</span>
          <span className={styles.rowValue}>{profile.credits_remaining} / {profile.credits_monthly_limit}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Kredi Yenileme</span>
          <span className={styles.rowValue}>
            {profile.credits_reset_at
              ? new Date(profile.credits_reset_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
              : '—'}
          </span>
        </div>

        {/* Kredi kullanım çubuğu */}
        <div className={styles.creditBarWrapper}>
          <div className={styles.creditBarTrack}>
            <motion.div
              className={styles.creditBarFill}
              initial={{ width: 0 }}
              animate={{
                width: `${profile.credits_monthly_limit > 0
                  ? Math.round((profile.credits_remaining / profile.credits_monthly_limit) * 100)
                  : 0}%`
              }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
            />
          </div>
          <span className={styles.creditBarLabel}>
            {profile.credits_monthly_limit > 0
              ? Math.round((profile.credits_remaining / profile.credits_monthly_limit) * 100)
              : 0}% kalan
          </span>
        </div>
      </motion.div>

      {/* ── Güvenlik Kartı ───────────────────────────────────── */}
      <motion.div className={styles.card} variants={cardVariants}>
        <div className={styles.cardTitle}>
          <Shield size={16} /> Güvenlik
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Şifre</span>
          <span className={styles.rowValue}>••••••••</span>
        </div>
        <p className={styles.securityNote}>
          Şifrenizi değiştirmek için kayıtlı e-posta adresinize sıfırlama bağlantısı gönderilir.
        </p>
      </motion.div>

      {/* ── Profil Tercihleri ────────────────────────────────── */}
      <motion.div className={styles.card} variants={cardVariants}>
        <div className={styles.cardTitle}>
          <Sparkles size={16} /> Kişiselleştirme
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Meslek</span>
          <span className={styles.rowValue} style={{ textTransform: 'capitalize' }}>
            {profile.profession
              ? { student: 'Öğrenci', researcher: 'Araştırmacı', medical: 'Sağlık Prof.', legal: 'Hukuk Prof.', engineer: 'Mühendis', business: 'İş/Finans', teacher: 'Öğretmen', other: 'Diğer' }[profile.profession] ?? profile.profession
              : '—'}
          </span>
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Kullanım Amacı</span>
          <span className={styles.rowValue} style={{ textTransform: 'capitalize' }}>
            {profile.primary_use_case
              ? { academic: 'Akademik', medical: 'Tıbbi', legal: 'Hukuki', engineering: 'Teknik', business: 'İş/Finans', general: 'Genel' }[profile.primary_use_case] ?? profile.primary_use_case
              : '—'}
          </span>
        </div>
        <p className={styles.securityNote} style={{ marginBottom: '1rem' }}>
          Bu bilgileri değiştirmek için yeniden kurulum sihirbazını başlatabilirsiniz.
        </p>
        <motion.button
          className={styles.btnPrimary}
          onClick={restartOnboarding}
          whileHover={reduced ? undefined : { y: -2 }}
          whileTap={reduced ? undefined : { scale: 0.97 }}
          transition={SPRING_TIGHT}
        >
          Kurulum Sihirbazını Yeniden Çalıştır
        </motion.button>
      </motion.div>

      {/* ── Tur Kartı ───────────────────────────────────────── */}
      <motion.div className={styles.card} variants={cardVariants}>
        <div className={styles.cardTitle}>
          <HelpCircle size={16} /> Rehber Tur
        </div>
        <p className={styles.rowLabel} style={{ marginBottom: '1rem' }}>
          Uygulamayı keşfetmek için adım adım rehber turu tekrar başlatabilirsiniz.
        </p>
        <motion.button
          className={styles.btnPrimary}
          onClick={() => { resetTour(); navigate('/dashboard'); }}
          whileHover={reduced ? undefined : { y: -2 }}
          whileTap={reduced ? undefined : { scale: 0.97 }}
          transition={SPRING_TIGHT}
        >
          Turu Tekrar Göster
        </motion.button>
      </motion.div>

      {/* ── Hesap Çıkış Kartı ────────────────────────────────── */}
      <motion.div className={styles.card} variants={cardVariants}>
        <div className={styles.cardTitle}>
          <LogOut size={16} /> Hesap İşlemleri
        </div>
        <p className={styles.rowLabel} style={{ marginBottom: '1rem' }}>
          Oturumunuzu kapattığınızda verileriniz güvende kalır.
        </p>
        <motion.button
          className={styles.btnDanger}
          onClick={handleSignOut}
          whileHover={reduced ? undefined : { y: -2 }}
          whileTap={reduced ? undefined : { scale: 0.97 }}
          transition={SPRING_TIGHT}
        >
          Çıkış Yap
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

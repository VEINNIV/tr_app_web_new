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
import { User, CreditCard, LogOut, HelpCircle, Sparkles, AtSign, KeyRound, Mail } from 'lucide-react';
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
  const [nickname, setNickname] = useState(profile?.nickname || '');
  const [saving, setSaving] = useState(false);

  // Şifre değiştirme
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  // E-posta değiştirme
  const [newEmail, setNewEmail] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);

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

  /** Profil adı + takma adı Supabase'e kaydeder */
  const handleSave = async () => {
    setSaving(true);
    const cleanNick = nickname.trim();
    if (cleanNick.length > 30) {
      toast.error('Takma ad en fazla 30 karakter olabilir.');
      setSaving(false);
      return;
    }
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName, nickname: cleanNick || null })
      .eq('id', profile.id);

    if (error) toast.error('Kayıt başarısız. Lütfen tekrar deneyin.');
    else { toast.success('Profil başarıyla güncellendi ✓'); await refreshProfile(); }

    setSaving(false);
  };

  /** Şifre değiştir — aktif oturum üzerinden (Supabase auth) */
  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast.error('Şifre en az 8 karakter olmalı.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Şifreler eşleşmiyor.');
      return;
    }
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwSaving(false);
    if (error) {
      toast.error(/same/i.test(error.message) ? 'Yeni şifre eskisiyle aynı olamaz.' : 'Şifre güncellenemedi: ' + error.message);
      return;
    }
    setNewPassword('');
    setConfirmPassword('');
    toast.success('Şifreniz güncellendi ✓');
  };

  /** E-posta değiştir — Supabase yeni adrese doğrulama bağlantısı gönderir */
  const handleChangeEmail = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      toast.error('Geçerli bir e-posta girin.');
      return;
    }
    if (email === profile.email.toLowerCase()) {
      toast.error('Bu zaten mevcut e-posta adresiniz.');
      return;
    }
    setEmailSaving(true);
    const { error } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: window.location.origin + '/settings' },
    );
    setEmailSaving(false);
    if (error) { toast.error('E-posta güncellenemedi: ' + error.message); return; }
    setNewEmail('');
    toast.success('Doğrulama bağlantısı yeni e-posta adresinize gönderildi. Onayladıktan sonra değişir.', { duration: 7000 });
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

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="nickname">
            <AtSign size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
            Takma Ad (anonim)
          </label>
          <input
            id="nickname"
            className={styles.input}
            type="text"
            value={nickname}
            maxLength={30}
            onChange={e => setNickname(e.target.value)}
            placeholder="Örn: gezgin_42 — uygulamada bu isim görünür"
          />
          <p className={styles.securityNote} style={{ marginTop: 6, marginBottom: 0 }}>
            Belirlerseniz uygulama genelinde adınız yerine bu takma ad gösterilir. Boş bırakabilirsiniz.
          </p>
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

      {/* ── Güvenlik Kartı: Şifre değiştir ───────────────────── */}
      <motion.div className={styles.card} variants={cardVariants}>
        <div className={styles.cardTitle}>
          <KeyRound size={16} /> Şifre Değiştir
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="newPassword">Yeni Şifre</label>
          <input
            id="newPassword"
            className={styles.input}
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="En az 8 karakter"
          />
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="confirmPassword">Yeni Şifre (Tekrar)</label>
          <input
            id="confirmPassword"
            className={styles.input}
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Yeni şifreyi tekrar girin"
          />
        </div>
        <motion.button
          className={styles.btnPrimary}
          onClick={handleChangePassword}
          disabled={pwSaving || !newPassword}
          whileHover={reduced || pwSaving ? undefined : { y: -2 }}
          whileTap={reduced || pwSaving ? undefined : { scale: 0.97 }}
          transition={SPRING_TIGHT}
        >
          {pwSaving ? 'Güncelleniyor...' : 'Şifreyi Güncelle'}
        </motion.button>
      </motion.div>

      {/* ── E-posta değiştir ─────────────────────────────────── */}
      <motion.div className={styles.card} variants={cardVariants}>
        <div className={styles.cardTitle}>
          <Mail size={16} /> E-posta Değiştir
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Mevcut E-posta</span>
          <span className={styles.rowValue}>{profile.email}</span>
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="newEmail">Yeni E-posta</label>
          <input
            id="newEmail"
            className={styles.input}
            type="email"
            autoComplete="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            placeholder="yeni@eposta.com"
          />
        </div>
        <p className={styles.securityNote} style={{ marginBottom: '1rem' }}>
          Yeni adresinize bir doğrulama bağlantısı göndeririz. Bağlantıyı onayladıktan sonra e-postanız değişir.
        </p>
        <motion.button
          className={styles.btnPrimary}
          onClick={handleChangeEmail}
          disabled={emailSaving || !newEmail}
          whileHover={reduced || emailSaving ? undefined : { y: -2 }}
          whileTap={reduced || emailSaving ? undefined : { scale: 0.97 }}
          transition={SPRING_TIGHT}
        >
          {emailSaving ? 'Gönderiliyor...' : 'Doğrulama Bağlantısı Gönder'}
        </motion.button>
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

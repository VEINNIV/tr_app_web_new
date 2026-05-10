/**
 * TransLingua — SettingsPage (Ayarlar)
 *
 * Kullanıcının profil bilgilerini düzenlediği, abonelik durumunu
 * görüntülediği ve oturumunu kapattığı sayfa.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth';
import { supabase } from '../lib/supabase';
import { User, CreditCard, LogOut, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import styles from '../styles/components/settings.module.css';

export default function SettingsPage() {
  const { profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
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

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Ayarlar</h1>

      {/* ── Profil Kartı ─────────────────────────────────────── */}
      <div className={styles.card}>
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

        <button
          className={styles.btnPrimary}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
        </button>
      </div>

      {/* ── Abonelik Kartı ───────────────────────────────────── */}
      <div className={styles.card}>
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
            <div
              className={styles.creditBarFill}
              style={{
                width: `${profile.credits_monthly_limit > 0
                  ? Math.round((profile.credits_remaining / profile.credits_monthly_limit) * 100)
                  : 0}%`
              }}
            />
          </div>
          <span className={styles.creditBarLabel}>
            {profile.credits_monthly_limit > 0
              ? Math.round((profile.credits_remaining / profile.credits_monthly_limit) * 100)
              : 0}% kalan
          </span>
        </div>
      </div>

      {/* ── Güvenlik Kartı ───────────────────────────────────── */}
      <div className={styles.card}>
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
      </div>

      {/* ── Hesap Çıkış Kartı ────────────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>
          <LogOut size={16} /> Hesap İşlemleri
        </div>
        <p className={styles.rowLabel} style={{ marginBottom: '1rem' }}>
          Oturumunuzu kapattığınızda verileriniz güvende kalır.
        </p>
        <button className={styles.btnDanger} onClick={handleSignOut}>
          Çıkış Yap
        </button>
      </div>
    </div>
  );
}

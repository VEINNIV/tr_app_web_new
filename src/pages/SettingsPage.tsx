import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { User, CreditCard, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';

const s: Record<string, React.CSSProperties> = {
  page: { padding: 'calc(64px + 2rem) 1.5rem 3rem', maxWidth: '680px', margin: '0 auto' },
  title: { fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '2rem' },
  card: { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '20px', padding: '2rem', marginBottom: '1.25rem' },
  cardTitle: { fontSize: '0.875rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0', borderBottom: '1px solid var(--color-divider)' },
  label: { fontSize: '0.8125rem', color: 'var(--color-text-secondary)' },
  value: { fontSize: '0.8125rem', fontWeight: 600 },
  input: { padding: '0.625rem 0.875rem', border: '1px solid var(--color-border-strong)', borderRadius: '10px', fontSize: '0.9375rem', fontFamily: 'var(--font-family)', width: '100%', outline: 'none', marginBottom: '0.75rem', background: 'var(--color-bg)' },
  btn: { padding: '0.625rem 1.5rem', borderRadius: '10px', border: 'none', fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-family)', cursor: 'pointer', transition: 'all 0.15s ease' },
  btnPrimary: { background: 'var(--color-gradient)', color: 'white' },
  btnDanger: { background: 'var(--color-error-bg)', color: 'var(--color-error)', border: '1px solid rgba(255,59,48,0.2)' },
  planBadge: { display: 'inline-flex', padding: '4px 12px', borderRadius: '999px', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', background: 'var(--color-accent-light)', color: 'var(--color-accent)' },
};

export default function SettingsPage() {
  const { profile, signOut, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [saving, setSaving] = useState(false);

  if (!profile) return null;

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', profile.id);
    if (error) toast.error('Kayıt başarısız');
    else { toast.success('Profil güncellendi'); await refreshProfile(); }
    setSaving(false);
  };

  return (
    <div style={s.page}>
      <h1 style={s.title}>Ayarlar</h1>

      <div style={s.card}>
        <div style={s.cardTitle}><User size={16} /> Profil</div>
        <label style={{ fontSize: '0.8125rem', fontWeight: 500, display: 'block', marginBottom: '0.25rem' }}>Ad Soyad</label>
        <input style={s.input} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Adınız Soyadınız" />
        <div style={s.row}><span style={s.label}>E-posta</span><span style={s.value}>{profile.email}</span></div>
        <button style={{ ...s.btn, ...s.btnPrimary, marginTop: '1rem' }} onClick={handleSave} disabled={saving}>
          {saving ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </div>

      <div style={s.card}>
        <div style={s.cardTitle}><CreditCard size={16} /> Abonelik</div>
        <div style={s.row}><span style={s.label}>Mevcut Plan</span><span style={s.planBadge}>{profile.plan}</span></div>
        <div style={s.row}><span style={s.label}>Kalan Kredi</span><span style={s.value}>{profile.credits_remaining} / {profile.credits_monthly_limit}</span></div>
        <div style={s.row}><span style={s.label}>Sonraki Yenileme</span><span style={s.value}>{profile.credits_reset_at ? new Date(profile.credits_reset_at).toLocaleDateString('tr-TR') : '-'}</span></div>
      </div>

      <div style={s.card}>
        <div style={s.cardTitle}><LogOut size={16} /> Hesap</div>
        <button style={{ ...s.btn, ...s.btnDanger }} onClick={signOut}>Çıkış Yap</button>
      </div>
    </div>
  );
}

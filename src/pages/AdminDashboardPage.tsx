/**
 * TransLingua — AdminDashboardPage (Admin Paneli)
 *
 * Sadece admin rolündeki kullanıcılar erişebilir.
 * Kullanıcı yönetimi, kredi verme, platform istatistikleri.
 */
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, Users, FileText, Languages, CreditCard,
  Search, ChevronDown, ChevronUp, Plus, Minus, BookOpen,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import type { User, Plan, UserRole } from '../types';
import styles from '../styles/components/admin.module.css';

interface PlatformStats {
  totalUsers: number;
  totalDocuments: number;
  totalTranslations: number;
  totalStudySessions: number;
}

export default function AdminDashboardPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<PlatformStats>({ totalUsers: 0, totalDocuments: 0, totalTranslations: 0, totalStudySessions: 0 });
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState(5);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    // Tüm kullanıcıları çek
    const { data: usersData } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    // Platform istatistikleri
    const { count: docCount } = await supabase.from('documents').select('*', { count: 'exact', head: true });
    const { count: transCount } = await supabase.from('translations').select('*', { count: 'exact', head: true });
    const { count: studyCount } = await supabase.from('study_sessions').select('*', { count: 'exact', head: true });

    if (usersData) setUsers(usersData as User[]);
    setStats({
      totalUsers: usersData?.length ?? 0,
      totalDocuments: docCount ?? 0,
      totalTranslations: transCount ?? 0,
      totalStudySessions: studyCount ?? 0,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      fetchData();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [fetchData]);

  /** Kullanıcının planını güncelle */
  const updateUserPlan = async (userId: string, newPlan: Plan) => {
    const planCredits: Record<Plan, number> = { free: 5, starter: 50, pro: 500, enterprise: 9999 };
    const { error } = await supabase
      .from('profiles')
      .update({ plan: newPlan, credits_monthly_limit: planCredits[newPlan] })
      .eq('id', userId);

    if (error) { toast.error('Plan güncellenemedi'); return; }
    toast.success(`Plan güncellendi: ${newPlan.toUpperCase()}`);
    fetchData();
  };

  /** Kullanıcının rolünü güncelle */
  const updateUserRole = async (userId: string, newRole: UserRole) => {
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId);

    if (error) { toast.error('Rol güncellenemedi'); return; }
    toast.success(`Rol güncellendi: ${newRole}`);
    fetchData();
  };

  /** Kullanıcıya kredi ver */
  const giveCredits = async (userId: string, amount: number) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    const { error } = await supabase
      .from('profiles')
      .update({ credits_remaining: user.credits_remaining + amount })
      .eq('id', userId);

    if (error) { toast.error('Kredi verilemedi'); return; }

    // Kredi işlem kaydı oluştur
    await supabase.from('credit_transactions').insert({
      user_id: userId,
      amount: amount,
      action: 'admin_grant',
    });

    toast.success(`${amount} kredi verildi`);
    fetchData();
  };

  const filteredUsers = users.filter(u =>
    u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className={styles.page}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
          <div className="animate-spin" style={{ width: 32, height: 32, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%' }} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerIcon}><Shield size={24} /></div>
        <div>
          <h1 className={styles.title}>Admin Paneli</h1>
          <p className={styles.subtitle}>Platform yönetimi ve kullanıcı kontrolü</p>
        </div>
      </div>

      {/* ── Platform İstatistikleri ─────────────────────────── */}
      <div className={styles.statsGrid}>
        {[
          { icon: <Users size={20} />, value: stats.totalUsers, label: 'Toplam Kullanıcı', color: '#6366f1' },
          { icon: <FileText size={20} />, value: stats.totalDocuments, label: 'Toplam Doküman', color: 'var(--color-accent)' },
          { icon: <Languages size={20} />, value: stats.totalTranslations, label: 'Toplam Çeviri', color: 'var(--color-success)' },
          { icon: <BookOpen size={20} />, value: stats.totalStudySessions, label: 'Ders Notu', color: '#8b5cf6' },
        ].map((s, i) => (
          <motion.div
            key={i}
            className={styles.statCard}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <div className={styles.statIcon} style={{ color: s.color, background: `${s.color}12` }}>{s.icon}</div>
            <div className={styles.statValue}>{s.value}</div>
            <div className={styles.statLabel}>{s.label}</div>
          </motion.div>
        ))}
      </div>

      {/* ── Kullanıcı Listesi ────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}><Users size={18} /> Kullanıcılar</h2>
          <div className={styles.searchWrapper}>
            <Search size={15} className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              type="text"
              placeholder="İsim veya e-posta ara..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.userList}>
          {filteredUsers.map(user => (
            <div key={user.id} className={styles.userCard}>
              <div className={styles.userRow} onClick={() => setExpandedUserId(expandedUserId === user.id ? null : user.id)}>
                <div className={styles.userAvatar}>
                  {user.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'}
                </div>
                <div className={styles.userInfo}>
                  <div className={styles.userName}>{user.full_name || 'İsimsiz'}</div>
                  <div className={styles.userEmail}>{user.email}</div>
                </div>
                <div className={styles.userBadges}>
                  <span className={`${styles.badge} ${styles[`badge${user.role}`]}`}>{user.role.toUpperCase()}</span>
                  <span className={`${styles.badge} ${styles.badgePlan}`}>{user.plan.toUpperCase()}</span>
                </div>
                <div className={styles.userCredits}>
                  <CreditCard size={14} />
                  <span>{user.credits_remaining}/{user.credits_monthly_limit}</span>
                </div>
                {expandedUserId === user.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>

              {expandedUserId === user.id && (
                <motion.div
                  className={styles.userExpanded}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className={styles.expandedGrid}>
                    {/* Plan Değiştir */}
                    <div className={styles.expandedField}>
                      <label className={styles.expandedLabel}>Plan Değiştir</label>
                      <div className={styles.expandedBtnGroup}>
                        {(['free', 'starter', 'pro', 'enterprise'] as Plan[]).map(plan => (
                          <button
                            key={plan}
                            className={`${styles.expandedBtn} ${user.plan === plan ? styles.expandedBtnActive : ''}`}
                            onClick={() => updateUserPlan(user.id, plan)}
                          >
                            {plan.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Rol Değiştir */}
                    <div className={styles.expandedField}>
                      <label className={styles.expandedLabel}>Rol Değiştir</label>
                      <div className={styles.expandedBtnGroup}>
                        {(['user', 'subscriber', 'admin'] as UserRole[]).map(role => (
                          <button
                            key={role}
                            className={`${styles.expandedBtn} ${user.role === role ? styles.expandedBtnActive : ''}`}
                            onClick={() => updateUserRole(user.id, role)}
                          >
                            {role.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Kredi Ver */}
                    <div className={styles.expandedField}>
                      <label className={styles.expandedLabel}>Kredi Ver</label>
                      <div className={styles.creditControl}>
                        <button className={styles.creditBtn} onClick={() => setCreditAmount(Math.max(1, creditAmount - 5))}><Minus size={14} /></button>
                        <span className={styles.creditAmountDisplay}>{creditAmount}</span>
                        <button className={styles.creditBtn} onClick={() => setCreditAmount(creditAmount + 5)}><Plus size={14} /></button>
                        <button className={styles.giveBtn} onClick={() => giveCredits(user.id, creditAmount)}>
                          Kredi Ver
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className={styles.expandedMeta}>
                    Kayıt: {new Date(user.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                </motion.div>
              )}
            </div>
          ))}

          {filteredUsers.length === 0 && (
            <div className={styles.emptyState}>Kullanıcı bulunamadı.</div>
          )}
        </div>
      </div>
    </div>
  );
}

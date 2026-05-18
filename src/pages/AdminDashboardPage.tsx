/**
 * TransLingua — AdminDashboardPage (Admin Paneli)
 *
 * Sadece admin rolündeki kullanıcılar erişebilir.
 * Kullanıcı yönetimi, kredi verme, platform istatistikleri.
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Shield, Users, FileText, Languages, CreditCard,
  Search, ChevronDown, Plus, Minus, BookOpen,
} from 'lucide-react';
import { SPRING_TIGHT } from '../components/ui/motion';
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
  const reduced = useReducedMotion();
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<PlatformStats>({ totalUsers: 0, totalDocuments: 0, totalTranslations: 0, totalStudySessions: 0 });
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState(5);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Aramada her tuş basışında DB'ye gitmesin diye 300ms debounce
  useEffect(() => {
    const t = setTimeout(() => { fetchData(); }, searchTerm ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchTerm]);

  const fetchData = async () => {
    setLoading(true);

    // Sayfalama + arama — search query varsa filtre uygula
    let q = supabase
      .from('profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (searchTerm.trim()) {
      const s = searchTerm.trim().replace(/[%_]/g, '');
      q = q.or(`email.ilike.%${s}%,full_name.ilike.%${s}%`);
    }

    const { data: usersData, count: userCount } = await q;

    // Platform istatistikleri (sadece ilk sayfada çek — tekrar etmeye gerek yok)
    let nextStats = stats;
    if (page === 0 && !searchTerm) {
      const [docs, trans, study] = await Promise.all([
        supabase.from('documents').select('*', { count: 'exact', head: true }),
        supabase.from('translations').select('*', { count: 'exact', head: true }),
        supabase.from('study_sessions').select('*', { count: 'exact', head: true }),
      ]);
      nextStats = {
        totalUsers: userCount ?? 0,
        totalDocuments: docs.count ?? 0,
        totalTranslations: trans.count ?? 0,
        totalStudySessions: study.count ?? 0,
      };
    } else {
      nextStats = { ...stats, totalUsers: userCount ?? stats.totalUsers };
    }

    if (usersData) setUsers(usersData as User[]);
    setStats(nextStats);
    setLoading(false);
  };

  const totalPages = Math.max(1, Math.ceil(stats.totalUsers / PAGE_SIZE));

  /** Kullanıcının planını güncelle (admin RPC) */
  const updateUserPlan = async (userId: string, newPlan: Plan) => {
    const { error } = await supabase.rpc('update_user_plan', {
      p_user_id: userId,
      p_plan: newPlan,
    });
    if (error) { toast.error('Plan güncellenemedi: ' + error.message); return; }
    toast.success(`Plan güncellendi: ${newPlan.toUpperCase()}`);
    fetchData();
  };

  /** Kullanıcının rolünü güncelle (admin RPC) */
  const updateUserRole = async (userId: string, newRole: UserRole) => {
    const { error } = await supabase.rpc('update_user_role', {
      p_user_id: userId,
      p_role: newRole,
    });
    if (error) { toast.error('Rol güncellenemedi: ' + error.message); return; }
    toast.success(`Rol güncellendi: ${newRole}`);
    fetchData();
  };

  /** Kullanıcıya kredi ver (admin RPC) */
  const giveCredits = async (userId: string, amount: number) => {
    const { error } = await supabase.rpc('grant_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_reason: 'admin_grant',
    });
    if (error) { toast.error('Kredi verilemedi: ' + error.message); return; }
    toast.success(`${amount} kredi verildi`);
    fetchData();
  };

  // Server-side filtreleme yapılıyor; users zaten filtreli geliyor
  const filteredUsers = users;

  // Aramada page'i sıfırla
  const onSearch = (v: string) => {
    setSearchTerm(v);
    setPage(0);
  };

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
            transition={{ delay: i * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            whileHover={reduced ? undefined : { y: -3 }}
          >
            <motion.div
              className={styles.statIcon}
              style={{ color: s.color, background: `${s.color}12` }}
              whileHover={reduced ? undefined : { rotate: -8, scale: 1.08 }}
              transition={SPRING_TIGHT}
            >
              {s.icon}
            </motion.div>
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
              onChange={e => onSearch(e.target.value)}
            />
          </div>
        </div>

        <motion.div
          className={styles.userList}
          layout
        >
          <AnimatePresence mode="popLayout">
            {filteredUsers.map((user, i) => (
              <motion.div
                key={user.id}
                layout
                className={styles.userCard}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ delay: Math.min(i * 0.03, 0.4), duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              >
              <motion.div
                className={styles.userRow}
                onClick={() => setExpandedUserId(expandedUserId === user.id ? null : user.id)}
                whileHover={reduced ? undefined : { x: 2 }}
                transition={SPRING_TIGHT}
              >
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
                <motion.span
                  style={{ display: 'inline-flex' }}
                  animate={{ rotate: expandedUserId === user.id ? 180 : 0 }}
                  transition={SPRING_TIGHT}
                >
                  <ChevronDown size={16} />
                </motion.span>
              </motion.div>

              <AnimatePresence>
              {expandedUserId === user.id && (
                <motion.div
                  className={styles.userExpanded}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  style={{ overflow: 'hidden' }}
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
              </AnimatePresence>
            </motion.div>
          ))}
          </AnimatePresence>

          {filteredUsers.length === 0 && (
            <motion.div
              className={styles.emptyState}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              Kullanıcı bulunamadı.
            </motion.div>
          )}
        </motion.div>

        {/* ── Pagination ──────────────────────────────────────── */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 24, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)', cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.5 : 1, font: 'inherit', fontWeight: 500 }}
            >
              ← Önceki
            </button>
            <span style={{ padding: '6px 12px' }}>
              Sayfa <strong style={{ color: 'var(--color-text-primary)' }}>{page + 1}</strong> / {totalPages}
              <span style={{ marginLeft: 8, color: 'var(--color-text-tertiary)' }}>({stats.totalUsers} kullanıcı)</span>
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', opacity: page >= totalPages - 1 ? 0.5 : 1, font: 'inherit', fontWeight: 500 }}
            >
              Sonraki →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

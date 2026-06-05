/**
 * TransWordly — AdminDashboardPage (Admin Paneli)
 *
 * Sadece admin rolündeki kullanıcılar erişebilir.
 * Sekmeli yapı (10.000+ kullanıcı için ölçeklenir):
 *   • Genel Bakış  — platform istatistikleri
 *   • Kredi & Maliyet — işlem maliyetleri, plan limitleri, Gemini maliyet hesaplayıcı (öner/uygula)
 *   • Kullanıcılar — arama + sayfalama + plan/rol/kredi yönetimi
 *   • Güvenlik     — güvenlik duruşu ve canlı AI kullanım metriği
 */
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Shield, Users, FileText, Languages, CreditCard,
  Search, ChevronDown, Plus, Minus, BookOpen, SlidersHorizontal, Save,
  LayoutGrid, Calculator, ShieldCheck, TrendingUp, Check, Lock, Zap,
  ShoppingCart, Gift, RefreshCw, AlertTriangle, X, Layers, Wallet, Receipt,
  Trash2, Ban, ShieldOff, CheckSquare, Square, UserX, Clock3,
} from 'lucide-react';
import { SPRING_TIGHT } from '../components/ui/motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/auth';
import { invalidateCreditCosts } from '../lib/creditConfig';
import toast from 'react-hot-toast';
import { isBanActive, type User, type Plan, type UserRole } from '../types';
import styles from '../styles/components/admin.module.css';

interface PlatformStats {
  totalUsers: number;
  totalDocuments: number;
  totalTranslations: number;
  totalStudySessions: number;
}

interface ConfigRow {
  key: string;
  value: number;
  label: string | null;
  category: string | null;
}

type Tab = 'overview' | 'credits' | 'users' | 'security';

/** Yasak süresi seçenekleri. */
type BanDuration = 'day' | 'week' | 'month' | 'perm';
const BAN_OPTIONS: { id: BanDuration; label: string }[] = [
  { id: 'day', label: '1 gün' },
  { id: 'week', label: '7 gün' },
  { id: 'month', label: '30 gün' },
  { id: 'perm', label: 'Kalıcı' },
];
/** Seçili süreyi admin_set_ban için timestamptz değerine çevir. */
function banUntilValue(d: BanDuration): string {
  if (d === 'perm') return 'infinity';
  const days = d === 'day' ? 1 : d === 'week' ? 7 : 30;
  return new Date(Date.now() + days * 86400_000).toISOString();
}

/** Per-user kredi defteri (admin_user_ledger RPC çıktısı). */
interface Ledger {
  purchased: number;
  admin_granted: number;
  monthly_reset: number;
  spent_total: number;
  spent_by_action: Record<string, number>;
  recent: { amount: number; action: string; created_at: string }[];
}

/** Gelir/maliyet/kâr özeti (admin_revenue_summary RPC çıktısı). */
interface RevenueSummary {
  days: number;
  revenue_try: number;
  paid_orders: number;
  spent_total: number;
  spent_by_action: Record<string, number>;
}

// ── Maliyet ortak yardımcıları (CostCalculator + gelir paneli paylaşır) ────────
// Girdi/çıktı dağılımı: çıktı (üretilen metin) genelde daha uzun ve ~6× pahalı.
const IN_SHARE = 0.45;

/** Bir token sayısı için Gemini Flash-Lite girdi/çıktı maliyetini (₺) hesaplar. */
function splitCost(tokens: number, cfg: Record<string, number>) {
  const usdTry = cfg['pricing.usd_try'] || 0;
  const flashIn = cfg['pricing.flash_input_usd_per_1m'] || 0;
  const flashOut = cfg['pricing.flash_output_usd_per_1m'] || 0;
  const inT = Math.round(tokens * IN_SHARE);
  const outT = Math.max(0, tokens - inT);
  const costIn = (inT / 1e6) * flashIn * usdTry;
  const costOut = (outT / 1e6) * flashOut * usdTry;
  return { inT, outT, costIn, costOut, cost: costIn + costOut };
}

// İşlem türü → ortalama token / kredi maliyeti config anahtarları.
const ACTION_TOKENS: Record<string, string> = {
  translation: 'pricing.avg_tokens_per_page',
  chat: 'pricing.avg_tokens_per_chat',
  glossary: 'pricing.avg_tokens_per_chat',
  study_notes: 'pricing.avg_tokens_per_note',
  flashcards: 'pricing.avg_tokens_per_flashcards',
};
const ACTION_COST: Record<string, string> = {
  translation: 'credit_cost.translation_per_page',
  chat: 'credit_cost.chat',
  glossary: 'credit_cost.glossary',
  study_notes: 'credit_cost.study_notes',
  flashcards: 'credit_cost.flashcards',
};

/** Harcanan kredilerin tahmini ₺ Gemini maliyetini hesaplar (tür bazında). */
function estimateAiCost(spentByAction: Record<string, number>, cfg: Record<string, number>) {
  return Object.entries(spentByAction).reduce((sum, [action, credits]) => {
    const tokKey = ACTION_TOKENS[action];
    const costKey = ACTION_COST[action];
    if (!tokKey || !costKey) return sum;
    const tokens = cfg[tokKey] || 0;
    const cc = cfg[costKey] || 0;
    if (cc <= 0 || tokens <= 0) return sum;
    const perCredit = splitCost(tokens, cfg).cost / cc;
    return sum + Number(credits) * perCredit;
  }, 0);
}

// İşlem türü → görsel rozet (etiket + ikon). Pozitif = giriş, negatif = harcama.
const ACTION_META: Record<string, { label: string; icon: React.ReactNode }> = {
  purchase:      { label: 'Satın alma',  icon: <ShoppingCart size={13} /> },
  admin_grant:   { label: 'Admin verdi', icon: <Gift size={13} /> },
  monthly_reset: { label: 'Aylık reset', icon: <RefreshCw size={13} /> },
  translation:   { label: 'Çeviri',      icon: <Languages size={13} /> },
  chat:          { label: 'Sohbet',      icon: <FileText size={13} /> },
  glossary:      { label: 'Sözlük',      icon: <Zap size={13} /> },
  study_notes:   { label: 'Ders notu',   icon: <BookOpen size={13} /> },
  flashcards:    { label: 'Flashcard',   icon: <Layers size={13} /> },
};
const actionMeta = (action: string) => ACTION_META[action] ?? { label: action, icon: <Zap size={13} /> };

export default function AdminDashboardPage() {
  const reduced = useReducedMotion();
  const [tab, setTab] = useState<Tab>('overview');
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<PlatformStats>({ totalUsers: 0, totalDocuments: 0, totalTranslations: 0, totalStudySessions: 0 });
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState(5);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Kredi sistemi ayarları (app_config)
  const [config, setConfig] = useState<ConfigRow[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Güvenlik sekmesi: bugünkü AI işlem metriği
  const [todaySpend, setTodaySpend] = useState<{ count: number; credits: number } | null>(null);

  // Maliyet hesaplayıcı: hedef kâr marjı (%)
  const [targetMargin, setTargetMargin] = useState(75);

  // Per-user kredi defteri (kullanıcı id → ledger | 'loading' | 'error')
  const [ledgers, setLedgers] = useState<Record<string, Ledger | 'loading' | 'error'>>({});

  // Gelir/maliyet/kâr özeti (Kredi sekmesi açılınca çekilir)
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);

  // Rol değişimi onay modalı (kaza koruması)
  const [roleModal, setRoleModal] = useState<{ user: User; newRole: UserRole } | null>(null);
  const [roleConfirmText, setRoleConfirmText] = useState('');

  // ── Moderasyon: toplu seçim + ban/sil ──────────────────────────────────────
  const { profile: me } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [banModal, setBanModal] = useState<{ user: User } | null>(null);
  const [banDuration, setBanDuration] = useState<BanDuration>('week');
  const [banReason, setBanReason] = useState('');
  const [deleteModal, setDeleteModal] = useState<{ users: User[] } | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  /** Bu kullanıcı korunuyor mu? (kendisi veya admin → silinemez/yasaklanamaz) */
  const isProtected = (u: User) => u.id === me?.id || u.role === 'admin';

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  useEffect(() => {
    supabase
      .from('app_config')
      .select('key, value, label, category')
      .order('category', { ascending: true })
      .order('key', { ascending: true })
      .then(({ data }) => { if (data) setConfig(data as ConfigRow[]); });
  }, []);

  /** Bir ayarı admin RPC'siyle güvenli güncelle */
  const saveConfig = async (key: string, overrideValue?: number) => {
    const value = overrideValue !== undefined ? overrideValue : Number(edits[key]);
    if (!Number.isFinite(value) || value < 0) {
      toast.error('Geçersiz değer');
      return;
    }
    setSavingKey(key);
    const { error } = await supabase.rpc('update_app_config', { p_key: key, p_value: value });
    setSavingKey(null);
    if (error) { toast.error('Güncellenemedi: ' + error.message); return; }
    setConfig(prev => prev.map(c => (c.key === key ? { ...c, value } : c)));
    setEdits(prev => { const n = { ...prev }; delete n[key]; return n; });
    invalidateCreditCosts(); // canlı maliyet cache'ini tazele
    toast.success('Ayar güncellendi');
  };

  // Aramada her tuş basışında DB'ye gitmesin diye 300ms debounce
  useEffect(() => {
    const t = setTimeout(() => { fetchData(); }, searchTerm ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchTerm]);

  const fetchData = async () => {
    setLoading(true);

    let q = supabase
      .from('profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (searchTerm.trim()) {
      const s = searchTerm.trim().replace(/[%_]/g, '');
      q = q.or(`email.ilike.%${s}%,full_name.ilike.%${s}%,nickname.ilike.%${s}%`);
    }

    const { data: usersData, count: userCount } = await q;

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

  // Güvenlik sekmesi açıldığında bugünkü AI harcamasını çek (credit_transactions admin'e açık)
  useEffect(() => {
    if (tab !== 'security' || todaySpend) return;
    const since = new Date(); since.setHours(0, 0, 0, 0);
    supabase
      .from('credit_transactions')
      .select('amount')
      .lt('amount', 0)
      .gte('created_at', since.toISOString())
      .then(({ data }) => {
        if (!data) { setTodaySpend({ count: 0, credits: 0 }); return; }
        const credits = data.reduce((s, r) => s + Math.abs(Number(r.amount)), 0);
        setTodaySpend({ count: data.length, credits: Math.round(credits * 100) / 100 });
      });
  }, [tab, todaySpend]);

  // Kredi sekmesi açıldığında son 30 günün gelir/maliyet özetini çek
  useEffect(() => {
    if (tab !== 'credits' || revenue) return;
    supabase.rpc('admin_revenue_summary', { p_days: 30 }).then(({ data, error }) => {
      if (!error && data) setRevenue(data as RevenueSummary);
    });
  }, [tab, revenue]);

  // Kullanıcı kartını aç/kapa; ilk açılışta kredi defterini çek (admin RPC)
  const toggleUser = (user: User) => {
    const opening = expandedUserId !== user.id;
    setExpandedUserId(opening ? user.id : null);
    if (opening && !ledgers[user.id]) {
      setLedgers(prev => ({ ...prev, [user.id]: 'loading' }));
      supabase.rpc('admin_user_ledger', { p_user_id: user.id }).then(({ data, error }) => {
        setLedgers(prev => ({ ...prev, [user.id]: error || !data ? 'error' : (data as Ledger) }));
      });
    }
  };

  // Rol değişikliğini doğrudan uygulama — önce onay modalını aç (kaza koruması)
  const requestRoleChange = (user: User, newRole: UserRole) => {
    if (user.role === newRole) return;
    setRoleConfirmText('');
    setRoleModal({ user, newRole });
  };

  const confirmRoleChange = async () => {
    if (!roleModal) return;
    await updateUserRole(roleModal.user.id, roleModal.newRole);
    setRoleModal(null);
    setRoleConfirmText('');
  };

  const totalPages = Math.max(1, Math.ceil(stats.totalUsers / PAGE_SIZE));

  const updateUserPlan = async (userId: string, newPlan: Plan) => {
    const { error } = await supabase.rpc('update_user_plan', { p_user_id: userId, p_plan: newPlan });
    if (error) { toast.error('Plan güncellenemedi: ' + error.message); return; }
    toast.success(`Plan güncellendi: ${newPlan.toUpperCase()}`);
    fetchData();
  };

  const updateUserRole = async (userId: string, newRole: UserRole) => {
    const { error } = await supabase.rpc('update_user_role', { p_user_id: userId, p_role: newRole });
    if (error) { toast.error('Rol güncellenemedi: ' + error.message); return; }
    toast.success(`Rol güncellendi: ${newRole}`);
    fetchData();
  };

  const giveCredits = async (userId: string, amount: number) => {
    const { error } = await supabase.rpc('grant_credits', { p_user_id: userId, p_amount: amount, p_reason: 'admin_grant' });
    if (error) { toast.error('Kredi verilemedi: ' + error.message); return; }
    toast.success(`${amount} kredi verildi`);
    fetchData();
  };

  // ── Moderasyon aksiyonları (admin RPC) ─────────────────────────────────────
  const confirmBan = async () => {
    if (!banModal) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_set_ban', {
      p_user_id: banModal.user.id,
      p_until: banUntilValue(banDuration),
      p_reason: banReason.trim() || null,
    });
    setBusy(false);
    if (error) { toast.error('Yasaklanamadı: ' + error.message); return; }
    const label = BAN_OPTIONS.find(o => o.id === banDuration)?.label ?? '';
    toast.success(`Kullanıcı yasaklandı (${label})`);
    setBanModal(null); setBanReason(''); setBanDuration('week');
    fetchData();
  };

  const unbanUser = async (user: User) => {
    const { error } = await supabase.rpc('admin_set_ban', { p_user_id: user.id, p_until: null, p_reason: null });
    if (error) { toast.error('Yasak kaldırılamadı: ' + error.message); return; }
    toast.success('Yasak kaldırıldı');
    fetchData();
  };

  const confirmDelete = async () => {
    if (!deleteModal) return;
    const ids = deleteModal.users.map(u => u.id);
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_delete_users', { p_user_ids: ids });
    setBusy(false);
    if (error) { toast.error('Silinemedi: ' + error.message); return; }
    toast.success(`${data ?? ids.length} kullanıcı kalıcı olarak silindi`);
    setDeleteModal(null); setDeleteConfirmText('');
    clearSelection();
    setExpandedUserId(null);
    fetchData();
  };

  const filteredUsers = users;
  // Sayfadaki seçilebilir (korumasız) kullanıcılar — toplu seçim için
  const selectableOnPage = filteredUsers.filter(u => !isProtected(u));
  const allSelectableSelected = selectableOnPage.length > 0 && selectableOnPage.every(u => selected.has(u.id));
  const selectedUsers = filteredUsers.filter(u => selected.has(u.id));
  const toggleSelectAll = () => {
    if (allSelectableSelected) clearSelection();
    else setSelected(new Set(selectableOnPage.map(u => u.id)));
  };
  const onSearch = (v: string) => { setSearchTerm(v); setPage(0); clearSelection(); };
  const goToPage = (p: number) => { setPage(p); clearSelection(); };

  // ── Config yardımcıları ───────────────────────────────────────────────────
  const cfg = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of config) m[c.key] = Number(c.value);
    return m;
  }, [config]);

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Genel Bakış', icon: <LayoutGrid size={15} /> },
    { id: 'credits', label: 'Kredi & Maliyet', icon: <Calculator size={15} /> },
    { id: 'users', label: 'Kullanıcılar', icon: <Users size={15} /> },
    { id: 'security', label: 'Güvenlik', icon: <ShieldCheck size={15} /> },
  ];

  if (loading && tab !== 'security') {
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

      {/* ── Sekmeler ──────────────────────────────────────────── */}
      <div className={styles.tabs} role="tablist">
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ══ GENEL BAKIŞ ══════════════════════════════════════════ */}
      {tab === 'overview' && (
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
      )}

      {/* ══ KREDİ & MALİYET ══════════════════════════════════════ */}
      {tab === 'credits' && (
        <div style={{ display: 'grid', gap: 24 }}>
          {/* Gerçek gelir vs tahmini AI maliyeti = kâr */}
          <RevenuePanel revenue={revenue} cfg={cfg} />

          {/* Maliyet hesaplayıcı */}
          <CostCalculator cfg={cfg} targetMargin={targetMargin} setTargetMargin={setTargetMargin} onApply={(key, val) => saveConfig(key, val)} savingKey={savingKey} />

          {/* Düzenlenebilir ayar grupları */}
          {([
            { cat: 'plan_price', title: 'Plan Fiyatları (₺/ay)', hint: 'Anasayfada görünen ücretli plan aylık fiyatları. Değiştirince anasayfa otomatik güncellenir.', step: '1' },
            { cat: 'discount', title: 'Plan İndirimleri', hint: 'Anasayfada fiyat kartlarında gösterilecek indirim oranları (%). 0 = indirim yok. "discount.student_amount" = öğrenci toggle indirimi (₺).', step: '1' },
            { cat: 'credit_cost', title: 'İşlem Maliyetleri (kredi)', hint: 'Kullanıcıların her işlemde harcadığı kredi miktarı.', step: '0.5' },
            { cat: 'plan_limit', title: 'Plan Aylık Kredi Limitleri', hint: 'Bir plana geçirildiğinde verilecek aylık kredi. Anasayfaya da yansır.', step: '1' },
            { cat: 'pricing', title: 'Maliyet Parametreleri', hint: 'Gemini token fiyatları, kur ve kredi başına gelir — hesaplayıcı bunları kullanır.', step: '0.01' },
          ] as const).map(group => {
            const rows = config.filter(c => c.category === group.cat);
            if (rows.length === 0) return null;
            return (
              <div key={group.cat} className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}><SlidersHorizontal size={18} /> {group.title}</h2>
                </div>
                <div className={styles.sectionBody}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', marginBottom: 12 }}>{group.hint}</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {rows.map(row => {
                      const dirty = edits[row.key] !== undefined && Number(edits[row.key]) !== row.value;
                      return (
                        <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)' }}>
                          <span style={{ flex: 1, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>{row.label ?? row.key}</span>
                          <input
                            type="number"
                            min={0}
                            step={group.step}
                            value={edits[row.key] ?? String(row.value)}
                            onChange={e => setEdits(prev => ({ ...prev, [row.key]: e.target.value }))}
                            style={{ width: 110, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)', font: 'inherit', fontWeight: 600, textAlign: 'right' }}
                          />
                          <button
                            onClick={() => saveConfig(row.key)}
                            disabled={!dirty || savingKey === row.key}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: 'none', background: dirty ? 'var(--color-accent)' : 'var(--color-border)', color: dirty ? '#fff' : 'var(--color-text-tertiary)', cursor: dirty && savingKey !== row.key ? 'pointer' : 'not-allowed', font: 'inherit', fontWeight: 600, fontSize: '0.8125rem' }}
                          >
                            <Save size={14} /> {savingKey === row.key ? '...' : 'Kaydet'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══ KULLANICILAR ═════════════════════════════════════════ */}
      {tab === 'users' && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}><Users size={18} /> Kullanıcılar</h2>
            <div className={styles.searchWrapper}>
              <Search size={15} className={styles.searchIcon} />
              <input
                className={styles.searchInput}
                type="text"
                placeholder="İsim, takma ad veya e-posta ara..."
                value={searchTerm}
                onChange={e => onSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Toplu seçim satırı + (seçim varsa) toplu aksiyon çubuğu */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 4px 12px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={toggleSelectAll}
              disabled={selectableOnPage.length === 0}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 10px', borderRadius: 8, background: 'transparent', border: '1px solid var(--color-border)', cursor: selectableOnPage.length ? 'pointer' : 'not-allowed', color: 'var(--color-text-secondary)', font: 'inherit', fontSize: '0.78rem', fontWeight: 600, opacity: selectableOnPage.length ? 1 : 0.5 }}
            >
              {allSelectableSelected ? <CheckSquare size={15} style={{ color: 'var(--color-accent)' }} /> : <Square size={15} />}
              {allSelectableSelected ? 'Seçimi temizle' : 'Tümünü seç'}
              <span style={{ color: 'var(--color-text-tertiary)' }}>({selectableOnPage.length})</span>
            </button>
            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)' }}>
              Admin ve kendi hesabın seçilemez.
            </span>
          </div>

          <AnimatePresence>
            {selected.size > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                style={{ overflow: 'hidden', marginBottom: 14 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '12px 16px', borderRadius: 12, background: 'var(--color-accent-light)', border: '1px solid var(--color-accent-medium)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    <CheckSquare size={16} style={{ color: 'var(--color-accent)' }} />
                    {selected.size} kullanıcı seçildi
                  </span>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      onClick={clearSelection}
                      style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--color-surface)', border: '1px solid var(--color-border)', cursor: 'pointer', color: 'var(--color-text-secondary)', font: 'inherit', fontSize: '0.8rem', fontWeight: 600 }}
                    >
                      Vazgeç
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDeleteConfirmText(''); setDeleteModal({ users: selectedUsers }); }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: '#dc2626', border: 'none', cursor: 'pointer', color: '#fff', font: 'inherit', fontSize: '0.8rem', fontWeight: 700 }}
                    >
                      <Trash2 size={14} /> Seçilenleri sil
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div className={styles.userList} layout>
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
                    onClick={() => toggleUser(user)}
                    whileHover={reduced ? undefined : { x: 2 }}
                    transition={SPRING_TIGHT}
                  >
                    {/* Toplu seçim kutusu (korunan kullanıcılarda gizli) */}
                    {isProtected(user) ? (
                      <span aria-hidden style={{ width: 18, flexShrink: 0 }} />
                    ) : (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); toggleSelect(user.id); }}
                        aria-label={selected.has(user.id) ? 'Seçimi kaldır' : 'Seç'}
                        aria-pressed={selected.has(user.id)}
                        style={{ display: 'inline-flex', padding: 0, background: 'transparent', border: 'none', cursor: 'pointer', color: selected.has(user.id) ? 'var(--color-accent)' : 'var(--color-text-tertiary)', flexShrink: 0 }}
                      >
                        {selected.has(user.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                      </button>
                    )}
                    <div className={styles.userAvatar}>
                      {(user.nickname || user.full_name)?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'}
                    </div>
                    <div className={styles.userInfo}>
                      <div className={styles.userName}>{user.nickname || user.full_name || 'İsimsiz'}</div>
                      <div className={styles.userEmail}>{user.email}</div>
                    </div>
                    <div className={styles.userBadges}>
                      {isBanActive(user.banned_until) && (
                        <span className={styles.badge} style={{ background: 'rgba(220,38,38,0.12)', color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Ban size={11} /> YASAKLI
                        </span>
                      )}
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

                          <div className={styles.expandedField}>
                            <label className={styles.expandedLabel}>Rol Değiştir</label>
                            <div className={styles.expandedBtnGroup}>
                              {(['user', 'subscriber', 'admin'] as UserRole[]).map(role => (
                                <button
                                  key={role}
                                  className={`${styles.expandedBtn} ${user.role === role ? styles.expandedBtnActive : ''}`}
                                  onClick={() => requestRoleChange(user, role)}
                                >
                                  {role.toUpperCase()}
                                </button>
                              ))}
                            </div>
                          </div>

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

                        {/* ── Moderasyon (yasakla / yasağı kaldır / sil) ── */}
                        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
                          <label className={styles.expandedLabel} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#dc2626' }}>
                            <ShieldOff size={13} /> Moderasyon
                          </label>
                          {isProtected(user) ? (
                            <p style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)', margin: '8px 0 0' }}>
                              {user.id === me?.id ? 'Kendi hesabını buradan yönetemezsin.' : 'Admin hesapları yasaklanamaz veya silinemez.'}
                            </p>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 8 }}>
                              {isBanActive(user.banned_until) ? (
                                <>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#dc2626', fontWeight: 600 }}>
                                    <Ban size={13} /> Yasaklı
                                    {user.banned_until !== 'infinity' && (
                                      <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 500 }}>
                                        · {new Date(user.banned_until as string).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: '2-digit' })}'e kadar
                                      </span>
                                    )}
                                    {user.banned_until === 'infinity' && <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 500 }}>· kalıcı</span>}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => unbanUser(user)}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: 'var(--color-success-bg)', color: 'var(--color-success)', border: '1px solid', borderColor: 'color-mix(in srgb, var(--color-success) 30%, transparent)', cursor: 'pointer', font: 'inherit', fontSize: '0.8rem', fontWeight: 600 }}
                                  >
                                    <Check size={14} /> Yasağı kaldır
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => { setBanReason(''); setBanDuration('week'); setBanModal({ user }); }}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.12)', color: '#b45309', border: '1px solid rgba(245,158,11,0.3)', cursor: 'pointer', font: 'inherit', fontSize: '0.8rem', fontWeight: 600 }}
                                >
                                  <Ban size={14} /> Yasakla
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => { setDeleteConfirmText(''); setDeleteModal({ users: [user] }); }}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: 'rgba(220,38,38,0.1)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.28)', cursor: 'pointer', font: 'inherit', fontSize: '0.8rem', fontWeight: 600 }}
                              >
                                <Trash2 size={14} /> Hesabı sil
                              </button>
                            </div>
                          )}
                        </div>

                        {/* ── Kredi defteri (admin_user_ledger) ── */}
                        {(() => {
                          const led = ledgers[user.id];
                          if (!led) return null;
                          if (led === 'loading') return <div className={styles.ledgerNote}>Kredi defteri yükleniyor…</div>;
                          if (led === 'error') return <div className={styles.ledgerNote}>Kredi defteri okunamadı (admin yetkisi gerekli).</div>;
                          const round = (n: number) => Math.round(Number(n) * 100) / 100;
                          return (
                            <div className={styles.ledger}>
                              <div className={styles.ledgerTitle}><Receipt size={14} /> Kredi Defteri</div>
                              <div className={styles.ledgerSummary}>
                                <span className={styles.ledgerStat}><ShoppingCart size={13} /> Satın aldı <strong>{round(led.purchased)}</strong></span>
                                <span className={styles.ledgerStat}><Gift size={13} /> Admin verdi <strong>{round(led.admin_granted)}</strong></span>
                                <span className={styles.ledgerStat}><RefreshCw size={13} /> Aylık <strong>{round(led.monthly_reset)}</strong></span>
                                <span className={styles.ledgerStat}><Zap size={13} /> Harcadı <strong>{round(led.spent_total)}</strong></span>
                              </div>
                              {Object.keys(led.spent_by_action).length > 0 && (
                                <div className={styles.ledgerBreakdown}>
                                  {Object.entries(led.spent_by_action).map(([a, v]) => (
                                    <span key={a} className={styles.ledgerChip}>{actionMeta(a).icon} {actionMeta(a).label}: {round(v)}</span>
                                  ))}
                                </div>
                              )}
                              {led.recent.length > 0 ? (
                                <div className={styles.ledgerList}>
                                  {led.recent.map((t, idx) => {
                                    const pos = Number(t.amount) >= 0;
                                    return (
                                      <div key={idx} className={styles.ledgerRow}>
                                        <span className={styles.ledgerRowIcon}>{actionMeta(t.action).icon}</span>
                                        <span className={styles.ledgerRowLabel}>{actionMeta(t.action).label}</span>
                                        <span className={styles.ledgerRowDate}>
                                          {new Date(t.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: '2-digit' })}
                                        </span>
                                        <span className={pos ? styles.ledgerPos : styles.ledgerNeg}>
                                          {pos ? '+' : ''}{round(t.amount)}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className={styles.ledgerNote}>Henüz işlem yok.</div>
                              )}
                            </div>
                          );
                        })()}

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
              <motion.div className={styles.emptyState} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                Kullanıcı bulunamadı.
              </motion.div>
            )}
          </motion.div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, margin: '24px 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
              <button
                onClick={() => goToPage(Math.max(0, page - 1))}
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
                onClick={() => goToPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', opacity: page >= totalPages - 1 ? 0.5 : 1, font: 'inherit', fontWeight: 500 }}
              >
                Sonraki →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══ GÜVENLİK ═════════════════════════════════════════════ */}
      {tab === 'security' && (
        <div style={{ display: 'grid', gap: 24 }}>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}><Zap size={18} /> Bugünkü AI Kullanımı</h2>
            </div>
            <div className={styles.sectionBody}>
              <div className={styles.calcGrid}>
                <div className={styles.calcCard}>
                  <div className={styles.calcCardTitle}>İşlem sayısı (bugün)</div>
                  <div className={styles.statValue}>{todaySpend ? todaySpend.count : '…'}</div>
                </div>
                <div className={styles.calcCard}>
                  <div className={styles.calcCardTitle}>Harcanan kredi (bugün)</div>
                  <div className={styles.statValue}>{todaySpend ? todaySpend.credits : '…'}</div>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}><Lock size={18} /> Güvenlik Duruşu</h2>
            </div>
            <div className={styles.sectionBody} style={{ display: 'grid', gap: 10 }}>
              {[
                { ok: true, t: 'Server-side kredi zorlaması', d: 'AI proxy yalnızca geçerli operasyon jetonuyla çağrılır — kredi harcamadan AI kullanımı imkânsız.' },
                { ok: true, t: 'Atomik kredi düşümü', d: 'Krediler satır kilidiyle (FOR UPDATE) düşülür; eşzamanlı çağrı yarışı önlenir.' },
                { ok: true, t: 'Kullanıcı başına rate limit', d: 'Dakikada en fazla 40 AI operasyonu — kötüye kullanım sınırlanır.' },
                { ok: true, t: 'API anahtarı korunuyor', d: 'Gemini anahtarı yalnızca edge function içinde; istemciye asla gönderilmez.' },
                { ok: true, t: 'Admin RPC koruması', d: 'Plan/rol/kredi/config işlemleri yalnızca admin rolüne açık (RLS + SECURITY DEFINER kontrolü).' },
                { ok: true, t: 'Erken hata kredi iadesi', d: 'AI çağrısı yapılmadan iptal/hata olursa kredi otomatik iade edilir (suistimale kapalı).' },
              ].map((row, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 10, background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)' }}>
                  <div style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
                    <Check size={15} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{row.t}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>{row.d}</div>
                  </div>
                </div>
              ))}
              <p style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                Not: Supabase panelinde "Leaked Password Protection" (sızdırılmış şifre koruması) özelliğini etkinleştirmeniz önerilir.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Rol değişimi onay modalı (kaza koruması) ── */}
      <AnimatePresence>
        {roleModal && (() => {
          const target = roleModal.user;
          const expected = (target.email || '').trim().toLowerCase();
          const matches = expected.length > 0 && roleConfirmText.trim().toLowerCase() === expected;
          const toAdmin = roleModal.newRole === 'admin';
          return (
            <motion.div
              className={styles.modalOverlay}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setRoleModal(null)}
            >
              <motion.div
                className={styles.modalCard}
                initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
                transition={SPRING_TIGHT}
                onClick={e => e.stopPropagation()}
              >
                <div className={styles.modalHeader}>
                  <h3 className={styles.modalTitle}>Rol Değişimi Onayı</h3>
                  <button className={styles.modalClose} onClick={() => setRoleModal(null)} aria-label="Kapat"><X size={18} /></button>
                </div>
                <p className={styles.modalText}>
                  <strong>{target.nickname || target.full_name || target.email}</strong> kullanıcısının rolünü{' '}
                  <span className={styles.modalRole}>{roleModal.newRole.toUpperCase()}</span> yapmak üzeresin.
                </p>
                {toAdmin && (
                  <div className={styles.modalWarn}>
                    <AlertTriangle size={15} /> Admin <strong>tüm kullanıcıları ve kredileri</strong> yönetebilir. Dikkatli ol.
                  </div>
                )}
                <label className={styles.modalLabel}>
                  Onaylamak için kullanıcının e-postasını birebir yaz:
                  <code className={styles.modalEmail}>{target.email}</code>
                </label>
                <input
                  autoFocus
                  className={styles.modalInput}
                  value={roleConfirmText}
                  onChange={e => setRoleConfirmText(e.target.value)}
                  placeholder={target.email || ''}
                  onKeyDown={e => { if (e.key === 'Enter' && matches) confirmRoleChange(); }}
                />
                <div className={styles.modalActions}>
                  <button className={styles.modalCancel} onClick={() => setRoleModal(null)}>Vazgeç</button>
                  <button className={styles.modalConfirm} disabled={!matches} onClick={confirmRoleChange}>
                    {matches ? <><Check size={15} /> Rolü Değiştir</> : <><Lock size={15} /> E-postayı yaz</>}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ── Yasaklama modalı (süre + sebep) ── */}
      <AnimatePresence>
        {banModal && (() => {
          const target = banModal.user;
          return (
            <motion.div
              className={styles.modalOverlay}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setBanModal(null)}
            >
              <motion.div
                className={styles.modalCard}
                initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
                transition={SPRING_TIGHT}
                onClick={e => e.stopPropagation()}
              >
                <div className={styles.modalHeader}>
                  <h3 className={styles.modalTitle}>Kullanıcıyı Yasakla</h3>
                  <button className={styles.modalClose} onClick={() => setBanModal(null)} aria-label="Kapat"><X size={18} /></button>
                </div>
                <p className={styles.modalText}>
                  <strong>{target.nickname || target.full_name || target.email}</strong> yasaklanırken giriş yapamaz ve hiçbir AI işlemi yapamaz. İstediğin zaman geri alabilirsin.
                </p>

                <label className={styles.modalLabel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock3 size={14} /> Süre
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '4px 0 14px' }}>
                  {BAN_OPTIONS.map(o => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setBanDuration(o.id)}
                      style={{
                        padding: '7px 14px', borderRadius: 8, cursor: 'pointer', font: 'inherit', fontSize: '0.82rem', fontWeight: 600,
                        background: banDuration === o.id ? 'var(--color-accent)' : 'var(--color-bg-alt)',
                        color: banDuration === o.id ? '#fff' : 'var(--color-text-secondary)',
                        border: '1px solid', borderColor: banDuration === o.id ? 'var(--color-accent)' : 'var(--color-border)',
                      }}
                    >
                      {o.id === 'perm' && <Ban size={12} style={{ marginRight: 5, verticalAlign: '-1px' }} />}{o.label}
                    </button>
                  ))}
                </div>

                <label className={styles.modalLabel}>Sebep (opsiyonel — kullanıcıya gösterilmez)</label>
                <input
                  autoFocus
                  className={styles.modalInput}
                  value={banReason}
                  onChange={e => setBanReason(e.target.value)}
                  placeholder="örn. spam / kötüye kullanım"
                  onKeyDown={e => { if (e.key === 'Enter' && !busy) confirmBan(); }}
                />
                <div className={styles.modalActions}>
                  <button className={styles.modalCancel} onClick={() => setBanModal(null)}>Vazgeç</button>
                  <button className={styles.modalConfirm} disabled={busy} onClick={confirmBan} style={{ background: '#d97706' }}>
                    <Ban size={15} /> {busy ? 'Yasaklanıyor…' : 'Yasakla'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ── Silme modalı (geri alınamaz — onay metni) ── */}
      <AnimatePresence>
        {deleteModal && (() => {
          const list = deleteModal.users;
          const single = list.length === 1 ? list[0] : null;
          const expected = single ? (single.email || '').trim().toLowerCase() : `SİL ${list.length}`;
          const matches = single
            ? expected.length > 0 && deleteConfirmText.trim().toLowerCase() === expected
            : deleteConfirmText.trim().toLocaleUpperCase('tr-TR') === expected;
          return (
            <motion.div
              className={styles.modalOverlay}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDeleteModal(null)}
            >
              <motion.div
                className={styles.modalCard}
                initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
                transition={SPRING_TIGHT}
                onClick={e => e.stopPropagation()}
              >
                <div className={styles.modalHeader}>
                  <h3 className={styles.modalTitle} style={{ color: '#dc2626' }}>
                    {single ? 'Hesabı Kalıcı Sil' : `${list.length} Hesabı Kalıcı Sil`}
                  </h3>
                  <button className={styles.modalClose} onClick={() => setDeleteModal(null)} aria-label="Kapat"><X size={18} /></button>
                </div>

                <div className={styles.modalWarn} style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626' }}>
                  <AlertTriangle size={15} /> Bu işlem <strong>geri alınamaz</strong>. Kullanıcı{single ? 'nın' : 'ların'} tüm belgeleri, çevirileri, notları, kredileri ve oturumları kalıcı olarak silinir.
                </div>

                {single ? (
                  <p className={styles.modalText}>
                    <strong>{single.nickname || single.full_name || single.email}</strong> hesabını silmek üzeresin.
                  </p>
                ) : (
                  <div style={{ maxHeight: 132, overflowY: 'auto', margin: '4px 0 12px', display: 'grid', gap: 4 }}>
                    {list.map(u => (
                      <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--color-text-secondary)', padding: '4px 0' }}>
                        <UserX size={13} style={{ color: '#dc2626', flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{u.nickname || u.full_name || 'İsimsiz'}</span>
                        <span style={{ color: 'var(--color-text-tertiary)' }}>{u.email}</span>
                      </div>
                    ))}
                  </div>
                )}

                <label className={styles.modalLabel}>
                  Onaylamak için {single ? 'kullanıcının e-postasını' : <>büyük harfle <code className={styles.modalEmail}>{expected}</code></>} yaz:
                  {single && <code className={styles.modalEmail}>{single.email}</code>}
                </label>
                <input
                  autoFocus
                  className={styles.modalInput}
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  placeholder={single ? (single.email || '') : expected}
                  onKeyDown={e => { if (e.key === 'Enter' && matches && !busy) confirmDelete(); }}
                />
                <div className={styles.modalActions}>
                  <button className={styles.modalCancel} onClick={() => setDeleteModal(null)}>Vazgeç</button>
                  <button className={styles.modalConfirm} disabled={!matches || busy} onClick={confirmDelete} style={{ background: matches ? '#dc2626' : undefined }}>
                    {matches ? <><Trash2 size={15} /> {busy ? 'Siliniyor…' : 'Kalıcı Sil'}</> : <><Lock size={15} /> Onay metnini yaz</>}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}

// ── Gelir / Maliyet / Kâr Paneli ──────────────────────────────────────────────
function RevenuePanel({ revenue, cfg }: { revenue: RevenueSummary | null; cfg: Record<string, number> }) {
  const fmt = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const cost = revenue ? estimateAiCost(revenue.spent_by_action, cfg) : 0;
  const profit = revenue ? revenue.revenue_try - cost : 0;
  const margin = revenue && revenue.revenue_try > 0 ? (profit / revenue.revenue_try) * 100 : 0;
  const marginCls = margin >= 60 ? styles.marginGood : margin >= 25 ? styles.marginWarn : styles.marginBad;

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}><Wallet size={18} /> Gelir & Kâr (son 30 gün)</h2>
      </div>
      <div className={styles.sectionBody}>
        {!revenue ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-tertiary)' }}>Yükleniyor…</p>
        ) : (
          <>
            <div className={styles.calcGrid}>
              <div className={styles.calcCard}>
                <div className={styles.calcCardTitle}><Receipt size={14} /> Gerçek gelir</div>
                <div className={styles.statValue}>₺{fmt(revenue.revenue_try)}</div>
                <div className={styles.calcRow}><span>Ödenen sipariş</span><strong>{revenue.paid_orders}</strong></div>
                <div className={styles.calcRow}><span>Kaynak</span><strong>PayTR</strong></div>
              </div>
              <div className={styles.calcCard}>
                <div className={styles.calcCardTitle}><Zap size={14} /> Tahmini AI maliyeti</div>
                <div className={styles.statValue}>₺{fmt(cost)}</div>
                <div className={styles.calcRow}><span>Harcanan kredi</span><strong>{fmt(revenue.spent_total)}</strong></div>
                <div className={styles.calcRow}><span>Model</span><strong>Gemini Flash-Lite</strong></div>
              </div>
              <div className={styles.calcCard}>
                <div className={styles.calcCardTitle}><TrendingUp size={14} /> Tahmini kâr</div>
                <div className={styles.statValue} style={{ color: profit >= 0 ? 'var(--color-success)' : '#dc2626' }}>₺{fmt(profit)}</div>
                <div className={styles.calcRow}>
                  <span>Marj</span>
                  <span className={`${styles.marginBadge} ${marginCls}`}>%{Math.round(margin)}</span>
                </div>
                <div className={styles.calcRow}><span>Gelir − maliyet</span><strong>tahmini</strong></div>
              </div>
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)', marginTop: 12 }}>
              Gelir gerçek PayTR ödemelerinden; maliyet, harcanan kredilerin tür bazında ortalama token varsayımıyla tahminidir.
              Gerçek token ölçümü için ileride <strong>ai_operations.input/output_tokens</strong> eklenebilir.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Maliyet Hesaplayıcı ───────────────────────────────────────────────────────
interface CalcProps {
  cfg: Record<string, number>;
  targetMargin: number;
  setTargetMargin: (n: number) => void;
  onApply: (key: string, value: number) => void;
  savingKey: string | null;
}

function CostCalculator({ cfg, targetMargin, setTargetMargin, onApply, savingKey }: CalcProps) {
  const usdTry = cfg['pricing.usd_try'] || 0;
  const flashIn = cfg['pricing.flash_input_usd_per_1m'] || 0;
  const flashOut = cfg['pricing.flash_output_usd_per_1m'] || 0;
  const setRevenue = cfg['pricing.credit_revenue_try'] || 0;

  // Girdi/çıktı maliyet hesabı modül seviyesindeki splitCost(tokens, cfg) ile paylaşılır.

  // Gerçek plan başına ₺/kredi. Marjı EN DÜŞÜK gelirli ücretli plana göre hesaplarız
  // (kâr garantisi — en kötü durumda bile zarar etmeyelim). Plan yoksa elle girilen değere düşeriz.
  const planRev = (id: string) => {
    const price = cfg[`plan_price.${id}`] || 0;
    const credits = cfg[`plan_limit.${id}`] || 0;
    return credits > 0 ? price / credits : 0;
  };
  const starterRev = planRev('starter');
  const proRev = planRev('pro');
  const paidRevs = [starterRev, proRev].filter(r => r > 0);
  const revPerCredit = paidRevs.length ? Math.min(...paidRevs) : setRevenue;

  const ops = [
    { key: 'credit_cost.translation_per_page', label: 'Çeviri (sayfa başına)', tokens: cfg['pricing.avg_tokens_per_page'] || 0, icon: <Languages size={14} /> },
    { key: 'credit_cost.chat', label: 'AI Sohbet (mesaj)', tokens: cfg['pricing.avg_tokens_per_chat'] || 0, icon: <FileText size={14} /> },
    { key: 'credit_cost.study_notes', label: 'Ders Notu (kaynak)', tokens: cfg['pricing.avg_tokens_per_note'] || 0, icon: <BookOpen size={14} /> },
    { key: 'credit_cost.glossary', label: 'Sözlük AI Öner', tokens: cfg['pricing.avg_tokens_per_chat'] || 0, icon: <Zap size={14} /> },
    { key: 'credit_cost.flashcards', label: 'Flashcard (üretim)', tokens: cfg['pricing.avg_tokens_per_flashcards'] || 0, icon: <Layers size={14} /> },
  ];

  const fmt = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const fmtT = (n: number) => n.toLocaleString('tr-TR');
  const tm = Math.min(95, Math.max(0, targetMargin)) / 100;

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}><Calculator size={18} /> Maliyet & Kâr Hesaplayıcı</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
          Hedef marj
          <input
            type="number" min={0} max={95} value={targetMargin}
            onChange={e => setTargetMargin(Number(e.target.value))}
            style={{ width: 64, padding: '5px 8px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)', font: 'inherit', fontWeight: 600, textAlign: 'right' }}
          />%
        </div>
      </div>
      <div className={styles.sectionBody}>
        {(usdTry === 0 || revPerCredit === 0) && (
          <p style={{ fontSize: '0.78rem', color: '#b45309', marginBottom: 12 }}>
            Doğru hesap için "Maliyet Parametreleri"nden USD/TRY kurunu ve "Plan Fiyatları / Kredi Limitleri"ni girin.
          </p>
        )}

        {/* Hesap mantığı — girdi/çıktı ve gelir varsayımları */}
        <div style={{ fontSize: '0.75rem', lineHeight: 1.7, color: 'var(--color-text-secondary)', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '11px 13px', marginBottom: 14 }}>
          <strong style={{ color: 'var(--color-text-primary)' }}>Hesap nasıl yapılıyor?</strong><br />
          • Model: <strong>Gemini 3.1 Flash-Lite</strong> — girdi ${fmt(flashIn)}/1M tok, çıktı ${fmt(flashOut)}/1M tok · kur ₺{fmtT(usdTry)}/$<br />
          • Girdi/çıktı dağılımı ≈ <strong>%{Math.round(IN_SHARE * 100)} girdi / %{Math.round((1 - IN_SHARE) * 100)} çıktı</strong> varsayılır (çıktı token'ı ~{flashIn > 0 ? Math.round(flashOut / flashIn) : 6}× daha pahalı).<br />
          • Kâr marjı <strong>en düşük gelirli ücretli plana göre</strong> (en kötü durum): <strong>₺{fmt(revPerCredit)}/kredi</strong>
          {paidRevs.length > 0 && <> — Öğrenci ₺{fmt(starterRev)}/kr · Pro ₺{fmt(proRev)}/kr</>}.<br />
          • Gerçek token sayıları çeviri sonrası ölçülmeli; yoğun sayfalarda maliyet artabilir.
        </div>
        <div className={styles.calcGrid}>
          {ops.map(op => {
            const creditCost = cfg[op.key] || 0;
            const s = splitCost(op.tokens, cfg);
            const cost = s.cost;
            const revenue = creditCost * revPerCredit;
            const marginPct = revenue > 0 ? (1 - cost / revenue) * 100 : (cost > 0 ? -100 : 0);
            const cls = marginPct >= 60 ? styles.marginGood : marginPct >= 25 ? styles.marginWarn : styles.marginBad;
            // Önerilen kredi: hedef marjı EN DÜŞÜK gelirli planda bile tutturacak kredi (0.5'e yukarı yuvarla)
            const recommended = revPerCredit > 0
              ? Math.max(0.5, Math.ceil((cost / (revPerCredit * (1 - tm))) * 2) / 2)
              : creditCost;
            const needsApply = Math.abs(recommended - creditCost) > 0.001;
            return (
              <div key={op.key} className={styles.calcCard}>
                <div className={styles.calcCardTitle}>{op.icon} {op.label}</div>
                <div className={styles.calcRow}><span>Ort. token</span><strong>{fmtT(op.tokens)}</strong></div>
                <div className={styles.calcRow}><span>↳ Girdi ~{fmtT(s.inT)} tok</span><strong>₺{fmt(s.costIn)}</strong></div>
                <div className={styles.calcRow}><span>↳ Çıktı ~{fmtT(s.outT)} tok</span><strong>₺{fmt(s.costOut)}</strong></div>
                <div className={styles.calcRow}><span>Toplam Gemini maliyeti</span><strong>₺{fmt(cost)}</strong></div>
                <div className={styles.calcRow}><span>Gelir ({creditCost} kr · ₺{fmt(revPerCredit)}/kr)</span><strong>₺{fmt(revenue)}</strong></div>
                <div className={styles.calcRow}>
                  <span>Kâr marjı</span>
                  <span className={`${styles.marginBadge} ${cls}`}>%{Math.round(marginPct)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>
                    Önerilen: <strong style={{ color: 'var(--color-text-primary)' }}>{recommended} kr</strong>
                  </span>
                  <button
                    onClick={() => onApply(op.key, recommended)}
                    disabled={!needsApply || savingKey === op.key}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, border: 'none',
                      background: needsApply ? 'var(--color-accent)' : 'var(--color-border)',
                      color: needsApply ? '#fff' : 'var(--color-text-tertiary)',
                      cursor: needsApply && savingKey !== op.key ? 'pointer' : 'not-allowed',
                      font: 'inherit', fontWeight: 600, fontSize: '0.75rem',
                    }}
                  >
                    <TrendingUp size={13} /> Uygula
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

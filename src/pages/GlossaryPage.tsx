/**
 * GlossaryPage — Kullanıcı terim sözlüğü yönetimi
 *
 * Kullanıcılar kaynak→hedef terim çiftleri ekler; çeviri sırasında AI bu
 * karşılıkları prompt'a enjekte eder ve tutarlı çeviri sağlar.
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, ScrollText, Search, X, Check, Loader, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/auth';
import { generateGlossarySuggestions } from '../lib/ai';
import { getCreditCosts } from '../lib/creditConfig';
import toast from 'react-hot-toast';
import type { GlossaryEntry } from '../types';

const DOMAINS = [
  { value: 'general',     label: 'Genel' },
  { value: 'medical',     label: 'Tıp' },
  { value: 'legal',       label: 'Hukuk' },
  { value: 'math',        label: 'Matematik' },
  { value: 'engineering', label: 'Mühendislik' },
  { value: 'cs',          label: 'Bilgisayar' },
  { value: 'economics',   label: 'İktisat' },
];

interface NewEntry {
  source_term: string;
  target_term: string;
  domain: string;
}

const EMPTY: NewEntry = { source_term: '', target_term: '', domain: 'general' };

export default function GlossaryPage() {
  const { profile, refreshProfile } = useAuth();
  const [entries, setEntries] = useState<GlossaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [newEntry, setNewEntry] = useState<NewEntry>(EMPTY);
  const [aiGenerating, setAiGenerating] = useState(false);

  useEffect(() => {
    fetchEntries();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchEntries = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('glossaries')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setEntries(data as GlossaryEntry[]);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!newEntry.source_term.trim() || !newEntry.target_term.trim()) {
      toast.error('Kaynak ve hedef terim boş bırakılamaz.');
      return;
    }
    if (!profile?.id) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('glossaries')
      .insert({
        user_id: profile.id,
        source_term: newEntry.source_term.trim(),
        target_term: newEntry.target_term.trim(),
        domain: newEntry.domain,
      })
      .select()
      .single();
    setSaving(false);
    if (error) { toast.error('Eklenemedi: ' + error.message); return; }
    setEntries(prev => [data as GlossaryEntry, ...prev]);
    setNewEntry(EMPTY);
    setShowForm(false);
    toast.success('Terim eklendi.');
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('glossaries').delete().eq('id', id);
    if (error) { toast.error('Silinemedi.'); return; }
    setEntries(prev => prev.filter(e => e.id !== id));
    toast('Terim silindi.', { icon: '🗑' });
  };

  const handleAIGenerate = async () => {
    if (!profile?.id) return;
    const prof = profile.profession ?? 'other';
    const uc   = profile.primary_use_case ?? 'general';
    const lang = profile.native_language ?? 'tr';
    setAiGenerating(true);
    toast.loading('AI sözlük önerileri oluşturuluyor...', { id: 'ai-gloss' });
    // Operasyon jetonu — küçük kredi maliyeti + proxy çağrı hakkı (bypass'ı önler)
    const cost = (await getCreditCosts()).glossary;
    const { data: opData, error: opErr } = await supabase.rpc('begin_ai_operation', {
      p_action: 'glossary',
      p_amount: cost,
      p_calls: 2,
      p_reference: null,
    });
    const operationId = (opData as Array<{ operation_id: string }> | null)?.[0]?.operation_id;
    if (opErr || !operationId) {
      const m = opErr?.message ?? '';
      toast.error(
        /Yetersiz/.test(m) ? `Yetersiz kredi — AI öneri için ${cost} kredi gerekiyor.`
          : /fazla istek/.test(m) ? 'Çok fazla istek — biraz bekleyin.'
          : 'İşlem başlatılamadı.',
        { id: 'ai-gloss' },
      );
      setAiGenerating(false);
      return;
    }
    void refreshProfile?.();
    try {
      const suggestions = await generateGlossarySuggestions(prof, uc, lang, operationId);
      if (suggestions.length === 0) { toast.error('Öneri üretilemedi.', { id: 'ai-gloss' }); return; }
      const { data, error } = await supabase.from('glossaries')
        .insert(suggestions.map(s => ({ ...s, user_id: profile.id })))
        .select();
      if (error) { toast.error('Kayıt hatası: ' + error.message, { id: 'ai-gloss' }); return; }
      setEntries(prev => [...(data as GlossaryEntry[]), ...prev]);
      await supabase.from('profiles').update({ glossary_generated: true }).eq('id', profile.id);
      toast.success(`${suggestions.length} terim eklendi! 🎉`, { id: 'ai-gloss' });
    } catch {
      toast.error('AI hatası, tekrar deneyin.', { id: 'ai-gloss' });
    } finally {
      setAiGenerating(false);
    }
  };

  const domainLabel = (d: string) => DOMAINS.find(x => x.value === d)?.label ?? d;

  const filtered = entries.filter(e => {
    const matchDomain = domainFilter === 'all' || e.domain === domainFilter;
    const q = search.toLowerCase();
    const matchSearch = !q || e.source_term.toLowerCase().includes(q) || e.target_term.toLowerCase().includes(q);
    return matchDomain && matchSearch;
  });

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: 'calc(var(--navbar-height, 72px) + 32px) 24px 80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <ScrollText size={22} color="var(--color-accent)" />
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
              Terim Sözlüğü
            </h1>
          </div>
          <p style={{ margin: 0, color: 'var(--color-text-tertiary)', fontSize: '0.875rem' }}>
            Tanımladığınız terimler çeviri sırasında AI'a iletilir — her zaman tutarlı çevrilir.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={handleAIGenerate}
            disabled={aiGenerating}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '9px 18px',
              background: 'linear-gradient(135deg, #6366f1, #0ea5e9)',
              color: 'white', border: 'none', borderRadius: 12,
              font: 'inherit', fontSize: '0.875rem', fontWeight: 700,
              cursor: aiGenerating ? 'not-allowed' : 'pointer', opacity: aiGenerating ? 0.7 : 1,
            }}
          >
            {aiGenerating ? <Loader size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Sparkles size={14} />}
            AI Öner
          </button>
          <button
            onClick={() => setShowForm(v => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', background: 'var(--color-accent)', color: 'white',
              border: 'none', borderRadius: 12, font: 'inherit', fontSize: '0.875rem',
              fontWeight: 700, cursor: 'pointer',
            }}
          >
            {showForm ? <X size={15} /> : <Plus size={15} />}
            {showForm ? 'İptal' : 'Yeni Terim'}
          </button>
        </div>
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 16, padding: 20, marginBottom: 20,
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-tertiary)' }}>
                  Kaynak Terim
                </span>
                <input
                  value={newEntry.source_term}
                  onChange={e => setNewEntry(p => ({ ...p, source_term: e.target.value }))}
                  placeholder="ör: machine learning"
                  style={inputStyle}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-tertiary)' }}>
                  Türkçe Karşılık
                </span>
                <input
                  value={newEntry.target_term}
                  onChange={e => setNewEntry(p => ({ ...p, target_term: e.target.value }))}
                  placeholder="ör: makine öğrenimi"
                  style={inputStyle}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
              </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Alan:</span>
              {DOMAINS.map(d => (
                <button
                  key={d.value}
                  onClick={() => setNewEntry(p => ({ ...p, domain: d.value }))}
                  style={{
                    padding: '4px 11px', borderRadius: 999, fontSize: '0.76rem', fontWeight: 600,
                    border: '1px solid',
                    borderColor: newEntry.domain === d.value ? 'var(--color-accent-medium)' : 'var(--color-border)',
                    background: newEntry.domain === d.value ? 'var(--color-accent-light)' : 'var(--color-bg-alt)',
                    color: newEntry.domain === d.value ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  {d.label}
                </button>
              ))}
              <button
                onClick={handleAdd}
                disabled={saving}
                style={{
                  marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '7px 16px', background: 'var(--color-accent)', color: 'white',
                  border: 'none', borderRadius: 10, font: 'inherit', fontSize: '0.82rem',
                  fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? <Loader size={13} style={{ animation: 'spin 0.9s linear infinite' }} /> : <Check size={13} />}
                Ekle
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Terim ara…"
            style={{ ...inputStyle, paddingLeft: 32, width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[{ value: 'all', label: 'Tümü' }, ...DOMAINS].map(d => (
            <button
              key={d.value}
              onClick={() => setDomainFilter(d.value)}
              style={{
                padding: '5px 12px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600,
                border: '1px solid',
                borderColor: domainFilter === d.value ? 'var(--color-accent-medium)' : 'var(--color-border)',
                background: domainFilter === d.value ? 'var(--color-accent-light)' : 'var(--color-bg-alt)',
                color: domainFilter === d.value ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                cursor: 'pointer',
              }}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Entry list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-tertiary)' }}>
          <Loader size={28} style={{ animation: 'spin 0.9s linear infinite', marginBottom: 8 }} />
          <p>Yükleniyor…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-tertiary)' }}>
          <ScrollText size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
          <p style={{ margin: 0, fontSize: '0.9rem' }}>
            {entries.length === 0 ? 'Henüz terim eklemediniz. "Yeni Terim" butonuyla başlayın.' : 'Arama kriterlerine uyan terim bulunamadı.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 12, padding: '6px 16px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-tertiary)' }}>
            <span>Kaynak</span><span>Türkçe</span><span>Alan</span><span />
          </div>
          <AnimatePresence initial={false}>
            {filtered.map(entry => (
              <motion.div
                key={entry.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.18 }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr auto auto',
                  gap: 12,
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 12,
                }}
              >
                <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontSize: '0.88rem' }}>
                  {entry.source_term}
                </span>
                <span style={{ color: 'var(--color-accent)', fontWeight: 600, fontSize: '0.88rem' }}>
                  {entry.target_term}
                </span>
                <span style={{
                  padding: '3px 10px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700,
                  background: 'var(--color-accent-light)', color: 'var(--color-accent)',
                  border: '1px solid var(--color-accent-medium)', whiteSpace: 'nowrap',
                }}>
                  {domainLabel(entry.domain)}
                </span>
                <button
                  onClick={() => handleDelete(entry.id)}
                  style={{
                    width: 28, height: 28, display: 'grid', placeItems: 'center',
                    background: 'transparent', border: '1px solid var(--color-border)',
                    borderRadius: 7, cursor: 'pointer', color: 'var(--color-text-tertiary)',
                  }}
                  title="Sil"
                >
                  <Trash2 size={13} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <p style={{ marginTop: 24, fontSize: '0.78rem', color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
        {entries.length} terim • Çeviri sırasında seçili domain'e ait terimler otomatik uygulanır
      </p>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: 'var(--color-bg-alt)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  font: 'inherit',
  fontSize: '0.875rem',
  color: 'var(--color-text-primary)',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
};

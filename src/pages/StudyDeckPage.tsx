/**
 * StudyDeckPage (/study) — Aralıklı tekrar destelerinin listesi ve çalışma girişi (F1).
 *
 * Kullanıcı destelerini (kart sayısı + bugün due sayısı) görür, "Bugün çalış" ile
 * tüm due kartları ya da bir desteyi tek tek çalışır. Kartlar Belgeler / Ders
 * Notları sayfasından "Kart üret" ile oluşturulur.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Play, Trash2, Loader, Layers, FileText, BookOpen, Sparkles, Plus, ListChecks, ToggleRight, Shuffle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/auth';
import {
  listDecks, getDueCards, applyReview, deleteDeck, getDeckSourceText, appendCardsToDeck,
  type DeckWithStats, type Flashcard, type DeckCardType,
} from '../lib/decks';
import type { Grade } from '../lib/srs';
import { generateFlashcards, type FlashcardGenType } from '../lib/ai';
import { getCreditCosts, getCachedCreditCosts } from '../lib/creditConfig';
import { useAiOperation } from '../hooks/useAiOperation';
import FlashcardReviewer from '../components/study/FlashcardReviewer';
import CardGenDialog from '../components/study/CardGenDialog';

/** Deste kart tipini kısa rozet olarak etiketle. */
const TYPE_BADGE: Record<DeckCardType, { label: string; Icon: typeof Layers }> = {
  classic:   { label: 'Klasik',         Icon: Layers },
  mcq:       { label: 'Çoktan seçmeli', Icon: ListChecks },
  truefalse: { label: 'Doğru/Yanlış',   Icon: ToggleRight },
  mixed:     { label: 'Karma',          Icon: Shuffle },
};

export default function StudyDeckPage() {
  const { profile } = useAuth();
  const { run: runAiOp } = useAiOperation();
  const [decks, setDecks] = useState<DeckWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<{ title: string; cards: Flashcard[]; deck?: DeckWithStats } | null>(null);
  const [starting, setStarting] = useState(false);
  const [cardGenDeck, setCardGenDeck] = useState<DeckWithStats | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [cardCost] = useState<number>(getCachedCreditCosts().flashcards);

  const fetchDecks = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      setDecks(await listDecks(profile.id));
    } catch {
      toast.error('Desteler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => { void fetchDecks(); }, [fetchDecks]);

  const totalDue = decks.reduce((n, d) => n + d.dueCount, 0);
  const totalCards = decks.reduce((n, d) => n + d.cardCount, 0);

  const startSession = async (deck?: DeckWithStats) => {
    if (!profile?.id || starting) return;
    setStarting(true);
    try {
      const cards = await getDueCards(profile.id, deck?.id);
      if (!cards.length) { toast('Şu an tekrar edilecek kart yok. 🎉'); return; }
      setSession({ title: deck?.title ?? 'Tüm desteler', cards, deck });
    } catch {
      toast.error('Kartlar yüklenemedi.');
    } finally {
      setStarting(false);
    }
  };

  const handleReview = useCallback(async (card: Flashcard, grade: Grade) => {
    await applyReview(card, grade);
  }, []);

  const handleExit = useCallback(() => {
    setSession(null);
    void fetchDecks();
  }, [fetchDecks]);

  const handleDelete = async (deck: DeckWithStats) => {
    if (!confirm(`"${deck.title}" destesi ve içindeki ${deck.cardCount} kart silinsin mi?`)) return;
    try {
      await deleteDeck(deck.id);
      setDecks(prev => prev.filter(d => d.id !== deck.id));
      toast('Deste silindi.', { icon: '🗑' });
    } catch {
      toast.error('Silinemedi.');
    }
  };

  /** Mevcut desteye kaynağından ek kart üret. */
  const runGenerateMore = async (opts: { cardType: FlashcardGenType; count: number }) => {
    const deck = cardGenDeck;
    if (!deck || !profile?.id) return;
    const cost = (await getCreditCosts()).flashcards;
    setGenBusy(true);
    toast.loading('Ek sorular üretiliyor…', { id: 'gen-more' });
    try {
      await runAiOp({
        action: 'flashcards',
        amount: cost,
        calls: 1,
        reference: deck.source_ref,
        toastId: 'gen-more',
        messages: {
          insufficient: `Yetersiz kredi — kart üretimi için ${cost} kredi gerekiyor.`,
          rate_limit: 'Çok fazla istek — biraz bekleyin.',
          error: 'Kart üretimi başlatılamadı.',
        },
        run: async (operationId) => {
          const text = await getDeckSourceText(deck);
          if (!text) throw new Error('Kaynak metin bulunamadı — belge veya not silinmiş olabilir.');
          const cards = await generateFlashcards(text, { operationId, cardType: opts.cardType, count: opts.count });
          if (!cards.length) throw new Error('Karta dönüştürülecek içerik bulunamadı.');
          await appendCardsToDeck(deck.id, profile.id, cards);
          setCardGenDeck(null);
          toast.success(`${cards.length} yeni kart eklendi! 🎉`, { id: 'gen-more' });
          await fetchDecks();
        },
      });
    } finally {
      setGenBusy(false);
    }
  };

  if (session) {
    const reviewDeck = session.deck;
    return (
      <FlashcardReviewer
        cards={session.cards}
        deckTitle={session.title}
        onReview={handleReview}
        onExit={handleExit}
        onGenerateMore={reviewDeck?.source_ref ? () => { setSession(null); void fetchDecks(); setCardGenDeck(reviewDeck); } : undefined}
      />
    );
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: 'calc(var(--navbar-height, 72px) + 32px) 24px 80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Brain size={22} color="var(--color-accent)" />
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
          Çalış
        </h1>
      </div>
      <p style={{ margin: '0 0 24px', color: 'var(--color-text-tertiary)', fontSize: '0.875rem' }}>
        Aralıklı tekrar (SRS) ile kalıcı öğrenme. Belge ve ders notlarından kart üret, her gün dön.
      </p>

      {/* Bugün çalış CTA */}
      {totalCards > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          style={{
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
            padding: '20px 22px', marginBottom: 24, borderRadius: 18,
            background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(14,165,233,0.12))',
            border: '1px solid var(--color-accent-medium)',
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
              {totalDue > 0 ? `Bugün ${totalDue} kart tekrar edilecek` : 'Bugünlük her şey tamam! 🎉'}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--color-text-tertiary)', marginTop: 2 }}>
              Toplam {totalCards} kart • {decks.length} deste
            </div>
          </div>
          <button
            onClick={() => startSession()}
            disabled={totalDue === 0 || starting}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 22px',
              background: totalDue > 0 ? 'var(--color-accent)' : 'var(--color-bg-alt)',
              color: totalDue > 0 ? 'white' : 'var(--color-text-tertiary)',
              border: 'none', borderRadius: 13, font: 'inherit', fontSize: '0.9rem', fontWeight: 700,
              cursor: totalDue > 0 && !starting ? 'pointer' : 'not-allowed',
            }}
          >
            {starting ? <Loader size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Play size={16} />}
            Bugün Çalış
          </button>
        </motion.div>
      )}

      {/* Deste listesi */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-tertiary)' }}>
          <Loader size={28} style={{ animation: 'spin 0.9s linear infinite', marginBottom: 8 }} />
          <p>Yükleniyor…</p>
        </div>
      ) : decks.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px 24px', borderRadius: 18,
          border: '1px dashed var(--color-border)', background: 'var(--color-surface)',
        }}>
          <Sparkles size={36} style={{ marginBottom: 12, color: 'var(--color-accent)', opacity: 0.7 }} />
          <p style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Henüz deste yok
          </p>
          <p style={{ margin: '0 0 20px', fontSize: '0.86rem', color: 'var(--color-text-tertiary)' }}>
            Bir belge veya ders notundan "Kart üret" ile başla.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/documents" style={linkBtn}><FileText size={15} /> Belgeler</Link>
            <Link to="/study-notes" style={linkBtn}><BookOpen size={15} /> Ders Notları</Link>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <AnimatePresence initial={false}>
            {decks.map(deck => (
              <motion.div
                key={deck.id}
                layout
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.18 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px',
                  background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14,
                }}
              >
                <div style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', borderRadius: 11, background: 'var(--color-accent-light)', flexShrink: 0 }}>
                  <Layers size={18} color="var(--color-accent)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {deck.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: 'var(--color-text-tertiary)', marginTop: 3 }}>
                    {(() => {
                      const b = TYPE_BADGE[deck.card_type] ?? TYPE_BADGE.classic;
                      return (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: 'var(--color-bg-alt)', fontWeight: 700, fontSize: '0.7rem' }}>
                          <b.Icon size={11} /> {b.label}
                        </span>
                      );
                    })()}
                    <span>
                      {deck.cardCount} kart
                      {deck.dueCount > 0 && (
                        <span style={{ color: 'var(--color-accent)', fontWeight: 700 }}> • {deck.dueCount} tekrar</span>
                      )}
                    </span>
                  </div>
                </div>
                {deck.source_ref && (
                  <button
                    onClick={() => setCardGenDeck(deck)}
                    title="Ek sorular üret"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px',
                      background: 'var(--color-surface)', color: 'var(--color-text-secondary)',
                      border: '1px solid var(--color-border)', borderRadius: 10, font: 'inherit',
                      fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    <Plus size={14} /> Ek
                  </button>
                )}
                <button
                  onClick={() => startSession(deck)}
                  disabled={deck.dueCount === 0 || starting}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                    background: deck.dueCount > 0 ? 'var(--color-accent)' : 'var(--color-bg-alt)',
                    color: deck.dueCount > 0 ? 'white' : 'var(--color-text-tertiary)',
                    border: 'none', borderRadius: 10, font: 'inherit', fontSize: '0.82rem', fontWeight: 700,
                    cursor: deck.dueCount > 0 && !starting ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap',
                  }}
                >
                  <Play size={14} /> Çalış
                </button>
                <button onClick={() => handleDelete(deck)} title="Sil" style={{
                  width: 32, height: 32, display: 'grid', placeItems: 'center', flexShrink: 0,
                  background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 8,
                  cursor: 'pointer', color: 'var(--color-text-tertiary)',
                }}>
                  <Trash2 size={14} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── Ek sorular diyaloğu (tip + adet) ── */}
      <CardGenDialog
        open={!!cardGenDeck}
        title={cardGenDeck?.title}
        cost={cardCost}
        busy={genBusy}
        confirmLabel="Ek Sorular Üret"
        onClose={() => setCardGenDeck(null)}
        onConfirm={runGenerateMore}
      />
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px',
  background: 'var(--color-accent)', color: 'white', borderRadius: 12,
  fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none',
};

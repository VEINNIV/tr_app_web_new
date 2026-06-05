/**
 * decks.ts — Flashcard deck/kart veri erişim katmanı (F1).
 *
 * UI ile Supabase arasındaki tek köprü: sayfalar/bileşenler doğrudan `supabase.from('flashcards')`
 * çağırmaz, bu modülü kullanır. SM-2 hesabı için `srs.ts` saf motorunu sarar.
 * RLS user_id = auth.uid() zorlar; insert'lerde user_id açıkça verilir (profile.id).
 */
import { supabase } from './supabase';
import { review, type Grade } from './srs';
import type { GeneratedCard, FlashcardType, FlashcardGenType } from './ai';

export type DeckSourceType = 'document' | 'study_note' | 'manual';
/** Deste düzeyi kart tipi — 'mixed' karma deste; "ek sorular" üretiminde varsayılan. */
export type DeckCardType = FlashcardGenType;

export interface Deck {
  id: string;
  user_id: string;
  title: string;
  source_type: DeckSourceType;
  source_ref: string | null;
  card_type: DeckCardType;
  created_at: string;
}

export interface Flashcard {
  id: string;
  deck_id: string;
  user_id: string;
  card_type: FlashcardType;
  front: string;
  back: string;
  hint: string | null;
  tag: string | null;
  options: string[] | null;
  answer: string | null;
  ease: number;
  interval: number;
  repetitions: number;
  due_at: string;
  created_at: string;
}

/** GeneratedCard listesini DB satırlarına çevirir (deck_id + user_id ile). */
function cardRows(deckId: string, userId: string, cards: GeneratedCard[]) {
  return cards.map(c => ({
    deck_id: deckId,
    user_id: userId,
    card_type: c.type,
    front: c.front,
    back: c.back,
    hint: c.hint ?? null,
    tag: c.tag ?? null,
    options: c.options ?? null,
    answer: c.answer ?? null,
  }));
}

export interface DeckWithStats extends Deck {
  cardCount: number;
  dueCount: number;
}

/** Yeni deck + kartlarını tek akışta oluşturur, deck id döndürür. */
export async function createDeckWithCards(
  userId: string,
  title: string,
  source: { type: DeckSourceType; ref?: string | null; cardType?: DeckCardType },
  cards: GeneratedCard[],
): Promise<string> {
  const { data: deck, error: deckErr } = await supabase
    .from('study_decks')
    .insert({
      user_id: userId,
      title: title.slice(0, 200),
      source_type: source.type,
      source_ref: source.ref ?? null,
      card_type: source.cardType ?? 'classic',
    })
    .select('id')
    .single();
  if (deckErr || !deck) throw new Error(deckErr?.message ?? 'Deste oluşturulamadı.');

  if (cards.length) {
    const { error: cardErr } = await supabase.from('flashcards').insert(cardRows(deck.id as string, userId, cards));
    if (cardErr) throw new Error(cardErr.message);
  }
  return deck.id as string;
}

/** Mevcut desteye yeni kartlar ekler ("ek sorular üret"). */
export async function appendCardsToDeck(deckId: string, userId: string, cards: GeneratedCard[]): Promise<void> {
  if (!cards.length) return;
  const { error } = await supabase.from('flashcards').insert(cardRows(deckId, userId, cards));
  if (error) throw new Error(error.message);
}

/**
 * Bir destenin kaynak metnini (ders notu / belge çevirisi) yeniden getirir — "ek sorular"
 * üretmek için. Kaynağı yoksa (manual) null döner.
 */
export async function getDeckSourceText(deck: Pick<Deck, 'source_type' | 'source_ref'>): Promise<string | null> {
  if (!deck.source_ref) return null;
  if (deck.source_type === 'study_note') {
    const { data } = await supabase
      .from('study_sessions')
      .select('generated_notes')
      .eq('id', deck.source_ref)
      .single();
    const notes = (data as { generated_notes?: string | null } | null)?.generated_notes;
    return notes && notes.trim() ? notes : null;
  }
  if (deck.source_type === 'document') {
    const { data } = await supabase
      .from('translations')
      .select('translated_text')
      .eq('document_id', deck.source_ref)
      .eq('status', 'completed')
      .limit(1)
      .maybeSingle();
    const pages = (data as { translated_text?: { pages?: string[] } | null } | null)?.translated_text?.pages;
    return Array.isArray(pages) && pages.length ? pages.join('\n\n') : null;
  }
  return null;
}

/** Kullanıcının destelerini, her biri için kart sayısı + due sayısıyla listeler. */
export async function listDecks(userId: string): Promise<DeckWithStats[]> {
  const nowIso = new Date().toISOString();
  const { data: decks, error } = await supabase
    .from('study_decks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  if (!decks?.length) return [];

  // Kart istatistiklerini tek sorguda çek, deck'lere dağıt.
  const { data: cards } = await supabase
    .from('flashcards')
    .select('deck_id, due_at')
    .eq('user_id', userId);

  const stats = new Map<string, { cardCount: number; dueCount: number }>();
  for (const c of cards ?? []) {
    const s = stats.get(c.deck_id) ?? { cardCount: 0, dueCount: 0 };
    s.cardCount += 1;
    if ((c.due_at as string) <= nowIso) s.dueCount += 1;
    stats.set(c.deck_id, s);
  }

  return (decks as Deck[]).map(d => ({
    ...d,
    cardCount: stats.get(d.id)?.cardCount ?? 0,
    dueCount: stats.get(d.id)?.dueCount ?? 0,
  }));
}

/** Çalışılacak (due) kartları getirir. deckId verilmezse tüm desteler. */
export async function getDueCards(userId: string, deckId?: string, limit = 60): Promise<Flashcard[]> {
  const nowIso = new Date().toISOString();
  let q = supabase
    .from('flashcards')
    .select('*')
    .eq('user_id', userId)
    .lte('due_at', nowIso)
    .order('due_at', { ascending: true })
    .limit(limit);
  if (deckId) q = q.eq('deck_id', deckId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as Flashcard[]) ?? [];
}

/** Bir kartı derecelendirir: SM-2 ile yeni durumu hesaplayıp DB'ye yazar. */
export async function applyReview(card: Flashcard, grade: Grade): Promise<void> {
  const next = review(
    { ease: card.ease, interval: card.interval, repetitions: card.repetitions },
    grade,
  );
  const { error } = await supabase
    .from('flashcards')
    .update({
      ease: next.ease,
      interval: next.interval,
      repetitions: next.repetitions,
      due_at: next.dueAt.toISOString(),
    })
    .eq('id', card.id);
  if (error) throw new Error(error.message);
}

/** Toplam due kart sayısı (dashboard widget'ı için). */
export async function countDueTotal(userId: string): Promise<number> {
  const nowIso = new Date().toISOString();
  const { count, error } = await supabase
    .from('flashcards')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .lte('due_at', nowIso);
  if (error) return 0;
  return count ?? 0;
}

export async function deleteDeck(deckId: string): Promise<void> {
  const { error } = await supabase.from('study_decks').delete().eq('id', deckId);
  if (error) throw new Error(error.message);
}

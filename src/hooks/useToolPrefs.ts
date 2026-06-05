/**
 * TransWordly — useToolPrefs
 *
 * Araç favorileri (pin) + kullanım sayacı. Cihaz-başı localStorage; backend yok,
 * kredisiz, anında. (İleride cihazlar-arası senkron için profiles.tool_prefs jsonb'a
 * taşınabilir.) Tek kaynak: upcomingFeatures.ts'teki slug'lar.
 *
 * - pinned: sıralı, en fazla MAX_PINNED (4) araç.
 * - usage: slug → açılış sayısı; usage[slug] >= FREQUENT_THRESHOLD ise otomatik "Sık".
 *
 * Modül-seviyesi paylaşımlı store (useSyncExternalStore): aynı sekmedeki tüm
 * bileşenler (ToolsPage kartları + Dashboard şeridi) tek state'i paylaşır, bir
 * yerde pin/unpin → her yerde anında günceller. Provider gerekmez.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/auth';

export const MAX_PINNED = 8;
/** Navbar'da (header bar) gösterilecek favori sayısı; geri kalanı yalnızca şerit + drawer. */
export const NAV_PINNED_COUNT = 4;
export const FREQUENT_THRESHOLD = 5;

interface ToolPrefs {
  pinned: string[];
  usage: Record<string, number>;
}

const EMPTY: ToolPrefs = { pinned: [], usage: {} };

function storageKey(userId: string | undefined): string {
  return `tw:toolprefs:${userId || 'guest'}`;
}

function load(key: string): ToolPrefs {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<ToolPrefs>;
    return {
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned.slice(0, MAX_PINNED) : [],
      usage: parsed.usage && typeof parsed.usage === 'object' ? parsed.usage : {},
    };
  } catch {
    return EMPTY;
  }
}

// ── Paylaşımlı store ──────────────────────────────────────────────
const listeners = new Set<() => void>();
let currentKey = '';
let snapshot: ToolPrefs = EMPTY;

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit() {
  listeners.forEach(l => l());
}

function syncKey(key: string) {
  if (key === currentKey) return;
  currentKey = key;
  snapshot = load(key);
}

function update(updater: (prev: ToolPrefs) => ToolPrefs) {
  const next = updater(snapshot);
  if (next === snapshot) return;
  snapshot = next;
  try {
    localStorage.setItem(currentKey, JSON.stringify(snapshot));
  } catch {
    /* kota dolu / private mode — sessiz geç */
  }
  emit();
}

export function useToolPrefs() {
  const { profile } = useAuth();
  const key = storageKey(profile?.id);

  // İlk render'da doğru anahtarın verisini görmek için senkron yükle.
  syncKey(key);

  // Kullanıcı değişince (giriş/çıkış) diğer mount'lu bileşenleri de bilgilendir.
  useEffect(() => {
    if (key !== currentKey) {
      currentKey = key;
      snapshot = load(key);
      emit();
    }
  }, [key]);

  const prefs = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);

  const isPinned = useCallback((slug: string) => prefs.pinned.includes(slug), [prefs.pinned]);

  const togglePin = useCallback((slug: string) => {
    update(prev => {
      if (prev.pinned.includes(slug)) {
        return { ...prev, pinned: prev.pinned.filter(s => s !== slug) };
      }
      if (prev.pinned.length >= MAX_PINNED) {
        toast(`En fazla ${MAX_PINNED} araç sabitleyebilirsin`, { icon: '⭐' });
        return prev;
      }
      return { ...prev, pinned: [...prev.pinned, slug] };
    });
  }, []);

  const recordUse = useCallback((slug: string) => {
    update(prev => ({
      ...prev,
      usage: { ...prev.usage, [slug]: (prev.usage[slug] || 0) + 1 },
    }));
  }, []);

  const isFrequent = useCallback(
    (slug: string) => (prefs.usage[slug] || 0) >= FREQUENT_THRESHOLD,
    [prefs.usage],
  );

  /** En çok kullanılan n slug (usage>0), pinli olmayanları öneri için. */
  const topUsed = useCallback(
    (n: number) =>
      Object.entries(prefs.usage)
        .filter(([slug, count]) => count > 0 && !prefs.pinned.includes(slug))
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([slug]) => slug),
    [prefs.usage, prefs.pinned],
  );

  return {
    pinned: prefs.pinned,
    usage: prefs.usage,
    isPinned,
    togglePin,
    recordUse,
    isFrequent,
    topUsed,
    canPinMore: prefs.pinned.length < MAX_PINNED,
  };
}

/**
 * CartContext — Hafif abonelik "sepeti".
 *
 * Abonelik tek planlık olduğundan sepet tek bir öğe tutar; yeni plan eklenince
 * öncekinin yerini alır. localStorage'da saklanır → sayfa yenilense de korunur.
 * Anasayfada "Sepete Ekle" → navbar'da sepet ikonu belirir → kullanıcı dilerse
 * gezinmeye devam eder, dilerse ödemeye geçer.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface CartItem {
  planId: string;     // 'starter' | 'pro'
  planName: string;   // görünen ad ("Öğrenci", "Profesyonel")
  student: boolean;   // öğrenci indirimi seçili mi
  price: number;      // sepete eklendiği andaki indirimli aylık fiyat (₺)
}

interface CartContextValue {
  item: CartItem | null;
  /** Sepete ekle/değiştir (tek öğe). */
  add: (item: CartItem) => void;
  /** Sepeti boşalt. */
  clear: () => void;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);
const STORAGE_KEY = 'tw_cart_v1';

export function CartProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<CartItem | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CartItem) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (item) localStorage.setItem(STORAGE_KEY, JSON.stringify(item));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // storage erişilemezse sessizce yoksay
    }
  }, [item]);

  return (
    <CartContext.Provider value={{ item, add: setItem, clear: () => setItem(null) }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart, CartProvider içinde kullanılmalı');
  return ctx;
}

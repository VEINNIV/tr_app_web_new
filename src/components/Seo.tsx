/**
 * TransWordly — Seo bileşeni (per-route meta yönetimi)
 *
 * Neden imperatif (React 19 native metadata yerine)?
 *   index.html zaten statik <title>/<meta>/<link rel=canonical>/OG/Twitter
 *   etiketleri taşıyor (JS çalıştırmayan sosyal crawler'lar için varsayılan).
 *   React 19'un metadata hoisting'i bu etiketleri DEDUPE etmeden head'e EKLER
 *   → çift title/canonical oluşur ve Googlebot yanlışını seçebilir.
 *
 *   Bunun yerine bu bileşen mevcut etiketleri YERİNDE günceller, yoksa oluşturur
 *   ve route değişiminde (cleanup) önceki/varsayılan değerlere geri yükler.
 *   Sonuç: her zaman TEK title/description/canonical; Googlebot (JS render eder)
 *   doğru per-page değeri görür; statik index.html varsayılanları korunur.
 *
 * Effect-only bileşen — DOM'a hiçbir şey render etmez (null döner).
 */
import { useEffect } from 'react';

export const SITE_URL = 'https://transwordly.com';
export const DEFAULT_OG_IMAGE = `${SITE_URL}/trans_wordly.png`;

export interface SeoProps {
  /** Tam <title> metni. ~50-60 karakter ideal. */
  title?: string;
  /** Meta açıklama. ~120-160 karakter ideal. */
  description?: string;
  /** Canonical — path ("/legal") veya tam URL. Verilmezse mevcut path kullanılır. */
  canonical?: string;
  /** og:type (varsayılan değiştirilmez; ör. "article"). */
  ogType?: string;
  /** Paylaşım görseli — path veya tam URL. */
  image?: string;
  /** true → noindex,nofollow (giriş/checkout/404/yapım aşaması sayfaları). */
  noindex?: boolean;
  /** Sayfaya özel JSON-LD (BreadcrumbList, ContactPage vb.). */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

const toAbs = (u: string): string =>
  /^https?:\/\//.test(u) ? u : `${SITE_URL}${u.startsWith('/') ? u : `/${u}`}`;

export default function Seo({
  title,
  description,
  canonical,
  ogType,
  image,
  noindex,
  jsonLd,
}: SeoProps) {
  const jsonLdStr = jsonLd ? JSON.stringify(jsonLd) : '';

  useEffect(() => {
    const head = document.head;
    const restores: Array<() => void> = [];

    /** Bir meta/link etiketini günceller; yoksa oluşturur. İkisinde de geri-yükleme kaydeder. */
    const apply = (
      selector: string,
      create: () => HTMLElement,
      attr: string,
      value: string,
    ) => {
      let el = head.querySelector(selector) as HTMLElement | null;
      if (el) {
        const prev = el.getAttribute(attr);
        const target = el;
        restores.push(() => {
          if (prev === null) target.removeAttribute(attr);
          else target.setAttribute(attr, prev);
        });
      } else {
        el = create();
        head.appendChild(el);
        const target = el;
        restores.push(() => target.remove());
      }
      el.setAttribute(attr, value);
    };

    const meta = (key: string, kind: 'name' | 'property') => () => {
      const m = document.createElement('meta');
      m.setAttribute(kind, key);
      return m;
    };

    // <title>
    if (title) {
      const prev = document.title;
      document.title = title;
      restores.push(() => {
        document.title = prev;
      });
    }

    // Canonical + og:url (her zaman mutlak)
    const canon = canonical
      ? toAbs(canonical)
      : `${SITE_URL}${typeof window !== 'undefined' ? window.location.pathname : '/'}`;
    apply('link[rel="canonical"]', () => {
      const l = document.createElement('link');
      l.setAttribute('rel', 'canonical');
      return l;
    }, 'href', canon);
    apply('meta[property="og:url"]', meta('og:url', 'property'), 'content', canon);

    if (description) {
      apply('meta[name="description"]', meta('description', 'name'), 'content', description);
      apply('meta[property="og:description"]', meta('og:description', 'property'), 'content', description);
      apply('meta[name="twitter:description"]', meta('twitter:description', 'name'), 'content', description);
    }
    if (title) {
      apply('meta[property="og:title"]', meta('og:title', 'property'), 'content', title);
      apply('meta[name="twitter:title"]', meta('twitter:title', 'name'), 'content', title);
    }
    if (ogType) {
      apply('meta[property="og:type"]', meta('og:type', 'property'), 'content', ogType);
    }
    if (image) {
      const img = toAbs(image);
      apply('meta[property="og:image"]', meta('og:image', 'property'), 'content', img);
      apply('meta[name="twitter:image"]', meta('twitter:image', 'name'), 'content', img);
    }
    if (noindex) {
      apply('meta[name="robots"]', meta('robots', 'name'), 'content', 'noindex, nofollow');
    }

    // Sayfaya özel JSON-LD — eklenir, cleanup'ta kaldırılır.
    let script: HTMLScriptElement | null = null;
    if (jsonLdStr) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-seo-jsonld', '');
      script.textContent = jsonLdStr;
      head.appendChild(script);
    }

    return () => {
      // Ters sırada geri yükle (önce eklenenler en son geri alınır).
      for (let i = restores.length - 1; i >= 0; i--) restores[i]();
      script?.remove();
    };
  }, [title, description, canonical, ogType, image, noindex, jsonLdStr]);

  return null;
}

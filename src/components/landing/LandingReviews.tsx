/**
 * LandingReviews — anasayfa "Kullanıcı Yorumları" bölümü (DB tabanlı, gerçek).
 *
 * Yalnızca admin tarafından ONAYLANMIŞ ve 5 yıldız olan yorumları rastgele gösterir.
 * Hiç onaylı yorum yoksa bölüm tamamen GİZLENİR (sahte yorum yok → ban riski yok).
 *
 * Schema: görünen yorumlar için Review + TÜM onaylı yorumlardan hesaplanan dürüst
 * AggregateRating (yalnızca count > 0 ise) Organization #org'a bağlanır.
 */
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Star } from 'lucide-react';
import { getFeaturedReviews, getReviewStats, type Review } from '../../lib/reviews';
import { SITE_URL } from '../Seo';
import styles from '../../styles/components/landing.module.css';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export default function LandingReviews() {
  const reduced = useReducedMotion();
  const [reviews, setReviews] = useState<Review[] | null>(null);

  useEffect(() => {
    let alive = true;
    let script: HTMLScriptElement | null = null;
    (async () => {
      const [list, stats] = await Promise.all([getFeaturedReviews(9), getReviewStats()]);
      if (!alive) return;
      setReviews(list);

      // Görünen yorumlar yoksa schema da ekleme.
      if (list.length === 0) return;
      const node: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        '@id': `${SITE_URL}/#org`,
        name: 'TransWordly',
        review: list.map(r => ({
          '@type': 'Review',
          reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
          author: { '@type': 'Person', name: r.display_name || 'Kullanıcı' },
          reviewBody: r.body,
        })),
      };
      if (stats.count > 0 && stats.average > 0) {
        node.aggregateRating = {
          '@type': 'AggregateRating',
          ratingValue: stats.average,
          reviewCount: stats.count,
          bestRating: 5,
          worstRating: 1,
        };
      }
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-seo-jsonld', 'reviews');
      script.textContent = JSON.stringify(node);
      document.head.appendChild(script);
    })();
    // Cleanup: route değişince hem fetch'i iptal et hem schema script'ini kaldır.
    return () => { alive = false; script?.remove(); };
  }, []);

  // Yüklenirken veya hiç onaylı yorum yokken bölümü gösterme.
  if (!reviews || reviews.length === 0) return null;

  return (
    <section className={styles.testimonialsSection}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>Kullanıcı Yorumları</span>
        <h2 className={styles.sectionTitle}>Öğrenciler ne diyor?</h2>
      </div>
      <div className={styles.testimonialsGrid}>
        {reviews.map((t, i) => (
          <motion.div
            key={t.id}
            className={styles.testimonialCard}
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            custom={i}
            whileHover={reduced ? undefined : { y: -3 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          >
            <div className={styles.testimonialStars}>
              {Array.from({ length: t.rating }).map((_, si) => (
                <Star key={si} size={13} fill="currentColor" />
              ))}
            </div>
            <p className={styles.testimonialText}>"{t.body}"</p>
            <div className={styles.testimonialAuthor}>
              <div className={styles.testimonialAvatar}>{(t.display_name || 'K')[0]}</div>
              <div>
                <div className={styles.testimonialName}>{t.display_name || 'Kullanıcı'}</div>
                <div className={styles.testimonialRole}>Doğrulanmış kullanıcı</div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/**
 * TransWordly — LegalPage (/legal ve /legal/:slug)
 *
 * Tek bileşen iki görünümü yönetir:
 *   • slug yoksa  → Hub: tüm yasal belgeleri kart olarak listeler.
 *   • slug varsa  → Belge: ilgili sözleşme metnini "prose" olarak render eder.
 * İçerik tek kaynaktan: src/content/legal.tsx
 */
import { Link, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, ScrollText, Clock, Mail } from 'lucide-react';
import { LEGAL_DOCS, getLegalDoc, COMPANY, LEGAL_UPDATED, type Block } from '../content/legal';
import Seo, { SITE_URL } from '../components/Seo';

const fade = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } }),
};

const wrap: React.CSSProperties = {
  maxWidth: 880, margin: '0 auto',
  padding: 'calc(var(--navbar-height, 72px) + 24px) 22px 110px',
};

export default function LegalPage() {
  const { slug } = useParams();
  return slug ? <LegalDocView slug={slug} /> : <LegalHubView />;
}

// ── Hub ───────────────────────────────────────────────────────────────────────
function LegalHubView() {
  const reduced = useReducedMotion();
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
      <div style={wrap}>
        <Seo
          title="Yasal Bilgiler & Sözleşmeler — TransWordly"
          description="TransWordly kullanım şartları, üyelik ve mesafeli satış sözleşmesi, teslimat, iptal-iade, gizlilik (KVKK) ve çerez politikası. Tüm yasal metinler tek sayfada."
          canonical="/legal"
        />
        <motion.header variants={fade} custom={0} initial="hidden" animate="visible" style={{ marginBottom: 28 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 13px', borderRadius: 999, fontSize: '0.74rem', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-accent)', background: 'var(--color-accent-light)', border: '1px solid var(--color-accent-medium)' }}>
            <ScrollText size={13} /> Yasal
          </span>
          <h1 style={{ fontSize: 'clamp(1.9rem, 5vw, 2.7rem)', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.05, margin: '15px 0 0' }}>
            Yasal Bilgiler & Sözleşmeler
          </h1>
          <p style={{ fontSize: 'clamp(0.98rem, 2vw, 1.1rem)', color: 'var(--color-text-secondary)', lineHeight: 1.55, margin: '12px 0 0', maxWidth: 580 }}>
            {COMPANY.brand} hizmetlerini kullanırken geçerli olan tüm sözleşme, politika ve bilgilendirme metinleri.
            Son güncelleme: <strong style={{ color: 'var(--color-text-primary)' }}>{LEGAL_UPDATED}</strong>.
          </p>
        </motion.header>

        <div style={{ display: 'grid', gap: 12 }}>
          {LEGAL_DOCS.map((doc, i) => (
            <motion.div key={doc.slug} variants={fade} custom={i + 1} initial="hidden" animate="visible">
              <Link
                to={`/legal/${doc.slug}`}
                style={{ textDecoration: 'none', display: 'block' }}
              >
                <motion.div
                  whileHover={reduced ? undefined : { y: -3, x: 2 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 16, padding: '18px 20px', borderRadius: 18,
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <span style={{ width: 46, height: 46, borderRadius: 14, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--color-accent-light)', color: 'var(--color-accent)' }}>
                    {doc.icon}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '1.02rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{doc.title}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>{doc.summary}</div>
                  </div>
                  <ChevronRight size={18} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                </motion.div>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Künye şeridi */}
        <motion.div
          variants={fade} custom={LEGAL_DOCS.length + 1} initial="hidden" animate="visible"
          style={{ marginTop: 28, padding: '18px 22px', borderRadius: 18, background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)', fontSize: '0.85rem', color: 'var(--color-text-secondary)', lineHeight: 1.7 }}
        >
          <strong style={{ color: 'var(--color-text-primary)' }}>{COMPANY.seller}</strong><br />
          {COMPANY.address}<br />
          <a href={`tel:${COMPANY.phoneHref}`} style={{ color: 'var(--color-accent)', textDecoration: 'none' }}>{COMPANY.phone}</a>
          {' · '}
          <a href={`mailto:${COMPANY.email}`} style={{ color: 'var(--color-accent)', textDecoration: 'none' }}>{COMPANY.email}</a>
        </motion.div>
      </div>
    </div>
  );
}

// ── Belge ─────────────────────────────────────────────────────────────────────
function LegalDocView({ slug }: { slug: string }) {
  const doc = getLegalDoc(slug);

  if (!doc) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
        <div style={wrap}>
          <Seo title="Belge Bulunamadı — TransWordly" noindex />
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Belge bulunamadı</h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 8 }}>Aradığınız yasal belge mevcut değil.</p>
          <Link to="/legal" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 16, color: 'var(--color-accent)', textDecoration: 'none', fontWeight: 600 }}>
            <ChevronLeft size={16} /> Tüm yasal belgeler
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
      <div style={wrap}>
        <Seo
          title={`${doc.title} — TransWordly`}
          description={doc.summary}
          canonical={`/legal/${doc.slug}`}
          ogType="article"
          jsonLd={{
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: `${SITE_URL}/` },
              { '@type': 'ListItem', position: 2, name: 'Yasal', item: `${SITE_URL}/legal` },
              { '@type': 'ListItem', position: 3, name: doc.title, item: `${SITE_URL}/legal/${doc.slug}` },
            ],
          }}
        />
        <motion.div variants={fade} custom={0} initial="hidden" animate="visible">
          <Link to="/legal" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-accent)', textDecoration: 'none', fontWeight: 600, fontSize: '0.86rem' }}>
            <ChevronLeft size={16} /> Tüm yasal belgeler
          </Link>
        </motion.div>

        <motion.header variants={fade} custom={1} initial="hidden" animate="visible" style={{ margin: '18px 0 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ width: 48, height: 48, borderRadius: 14, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--color-accent-light)', color: 'var(--color-accent)' }}>
              {doc.icon}
            </span>
            <h1 style={{ fontSize: 'clamp(1.6rem, 4.5vw, 2.2rem)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, margin: 0 }}>
              {doc.title}
            </h1>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: '0.8rem', color: 'var(--color-text-tertiary)' }}>
            <Clock size={13} /> Son güncelleme: {doc.updated}
          </div>
        </motion.header>

        <motion.article
          variants={fade} custom={2} initial="hidden" animate="visible"
          style={{ marginTop: 18, display: 'grid', gap: 26 }}
        >
          {doc.sections.map((sec, i) => (
            <section key={i}>
              <h2 style={{ fontSize: '1.12rem', fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 10px', color: 'var(--color-text-primary)' }}>
                {sec.heading}
              </h2>
              <div style={{ display: 'grid', gap: 12 }}>
                {sec.blocks.map((b, j) => <BlockView key={j} block={b} />)}
              </div>
            </section>
          ))}
        </motion.article>

        {/* Alt iletişim CTA */}
        <motion.div
          variants={fade} custom={3} initial="hidden" animate="visible"
          style={{ marginTop: 34, padding: '18px 22px', borderRadius: 18, background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}
        >
          <Mail size={20} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>Sorularınız mı var?</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
              Bu metinle ilgili her konuda bize yazabilirsiniz.
            </div>
          </div>
          <a href={`mailto:${COMPANY.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 999, textDecoration: 'none', background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontSize: '0.84rem', fontWeight: 700 }}>
            <Mail size={14} /> {COMPANY.email}
          </a>
        </motion.div>
      </div>
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.t === 'sub') {
    return (
      <div style={{ fontSize: '0.74rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginTop: 2 }}>
        {block.text}
      </div>
    );
  }
  if (block.t === 'list') {
    return (
      <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 7 }}>
        {block.items.map((it, i) => (
          <li key={i} style={{ fontSize: '0.93rem', lineHeight: 1.65, color: 'var(--color-text-secondary)' }}>{it}</li>
        ))}
      </ul>
    );
  }
  return (
    <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.7, color: 'var(--color-text-secondary)' }}>
      {block.text}
    </p>
  );
}

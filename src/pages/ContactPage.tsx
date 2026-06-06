/**
 * TransWordly — ContactPage (/contact)
 *
 * Halka açık iletişim sayfası. Anasayfa footer'ından ve kurumsal (Enterprise)
 * planın "İletişime Geçin" butonundan buraya gelinir.
 * Sade ama markalı: gradient hero + iletişim kartları (e-posta, adres) + mailto CTA.
 */
import { motion, useReducedMotion } from 'framer-motion';
import { Mail, MapPin, Send, Clock, Building2, Phone } from 'lucide-react';
import { COMPANY } from '../content/legal';

const EMAIL = COMPANY.email;
const fade = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } }),
};

export default function ContactPage() {
  const reduced = useReducedMotion();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
      <div style={{ maxWidth: 920, margin: '0 auto', padding: 'calc(var(--navbar-height, 72px) + 24px) 22px 100px' }}>
        {/* ── Hero ─────────────────────────────────────────────── */}
        <motion.header
          variants={fade} custom={0} initial="hidden" animate="visible"
          style={{
            position: 'relative', overflow: 'hidden', borderRadius: 28, padding: 'clamp(32px, 6vw, 56px)',
            background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 12%, var(--color-surface)) 0%, var(--color-surface) 58%)',
            border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-md)', marginBottom: 24,
          }}
        >
          <div aria-hidden style={{ position: 'absolute', top: -120, right: -60, width: 340, height: 340, borderRadius: '50%', background: 'radial-gradient(circle, color-mix(in srgb, var(--color-accent) 24%, transparent), transparent 68%)', pointerEvents: 'none' }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 13px', borderRadius: 999, fontSize: '0.74rem', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-accent)', background: 'var(--color-accent-light)', border: '1px solid var(--color-accent-medium)', position: 'relative' }}>
            <Mail size={13} /> İletişim
          </span>
          <h1 style={{ fontSize: 'clamp(2rem, 5.5vw, 3rem)', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.04, margin: '16px 0 0', position: 'relative' }}>
            Size yardımcı olmaktan<br />mutluluk duyarız.
          </h1>
          <p style={{ fontSize: 'clamp(1rem, 2vw, 1.15rem)', color: 'var(--color-text-secondary)', lineHeight: 1.55, margin: '14px 0 0', maxWidth: 520, position: 'relative' }}>
            Soruların, kurumsal teklif talepleri ve geri bildirimlerin için bize ulaş. Genellikle <strong style={{ color: 'var(--color-text-primary)' }}>1 iş günü</strong> içinde yanıt veriyoruz.
          </p>
          <motion.a
            href={`mailto:${EMAIL}`}
            whileHover={reduced ? undefined : { y: -2 }}
            whileTap={reduced ? undefined : { scale: 0.97 }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 9, marginTop: 26, position: 'relative',
              padding: '13px 24px', borderRadius: 999, textDecoration: 'none',
              background: 'linear-gradient(135deg, var(--color-accent), color-mix(in srgb, var(--color-accent) 78%, #000))',
              color: '#fff', fontSize: '0.95rem', fontWeight: 700,
              boxShadow: '0 12px 28px -10px var(--color-accent)',
            }}
          >
            <Send size={17} /> E-posta gönder
          </motion.a>
        </motion.header>

        {/* ── İletişim kartları ────────────────────────────────── */}
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {/* E-posta */}
          <motion.a
            href={`mailto:${EMAIL}`}
            variants={fade} custom={1} initial="hidden" animate="visible"
            whileHover={reduced ? undefined : { y: -4 }}
            style={{
              display: 'flex', flexDirection: 'column', gap: 12, padding: 24, borderRadius: 20, textDecoration: 'none',
              background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)',
            }}
          >
            <span style={{ width: 46, height: 46, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'var(--color-accent-light)', color: 'var(--color-accent)' }}>
              <Mail size={22} />
            </span>
            <div>
              <div style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-tertiary)' }}>E-posta</div>
              <div style={{ fontSize: '1.02rem', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 3, wordBreak: 'break-all' }}>{EMAIL}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: 4 }}>Tıkla, doğrudan yaz →</div>
            </div>
          </motion.a>

          {/* Adres */}
          <motion.div
            variants={fade} custom={2} initial="hidden" animate="visible"
            style={{
              display: 'flex', flexDirection: 'column', gap: 12, padding: 24, borderRadius: 20,
              background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)',
            }}
          >
            <span style={{ width: 46, height: 46, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
              <MapPin size={22} />
            </span>
            <div>
              <div style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-tertiary)' }}>Adres</div>
              <div style={{ fontSize: '1.02rem', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 3 }}>Saimekadın Mah. Görgülü Cad. No:45</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: 4 }}>Mamak / Ankara · Türkiye 🇹🇷</div>
            </div>
          </motion.div>

          {/* Telefon */}
          <motion.a
            href={`tel:${COMPANY.phoneHref}`}
            variants={fade} custom={3} initial="hidden" animate="visible"
            whileHover={reduced ? undefined : { y: -4 }}
            style={{
              display: 'flex', flexDirection: 'column', gap: 12, padding: 24, borderRadius: 20, textDecoration: 'none',
              background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)',
            }}
          >
            <span style={{ width: 46, height: 46, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'rgba(99,102,241,0.12)', color: '#6366f1' }}>
              <Phone size={22} />
            </span>
            <div>
              <div style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-tertiary)' }}>Telefon</div>
              <div style={{ fontSize: '1.02rem', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 3 }}>{COMPANY.phone}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: 4 }}>Tıkla, hemen ara →</div>
            </div>
          </motion.a>

          {/* Yanıt süresi */}
          <motion.div
            variants={fade} custom={4} initial="hidden" animate="visible"
            style={{
              display: 'flex', flexDirection: 'column', gap: 12, padding: 24, borderRadius: 20,
              background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)',
            }}
          >
            <span style={{ width: 46, height: 46, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'rgba(245,158,11,0.13)', color: '#d97706' }}>
              <Clock size={22} />
            </span>
            <div>
              <div style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-tertiary)' }}>Yanıt süresi</div>
              <div style={{ fontSize: '1.02rem', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 3 }}>~1 iş günü</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: 4 }}>Hafta içi 09:00–18:00</div>
            </div>
          </motion.div>
        </div>

        {/* ── Kurumsal şeridi ──────────────────────────────────── */}
        <motion.div
          variants={fade} custom={5} initial="hidden" animate="visible"
          style={{
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 24,
            padding: '20px 24px', borderRadius: 20,
            background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)',
          }}
        >
          <span style={{ width: 44, height: 44, borderRadius: 13, display: 'grid', placeItems: 'center', background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-accent)', flexShrink: 0 }}>
            <Building2 size={21} />
          </span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>Kurumlar & üniversiteler için</div>
            <div style={{ fontSize: '0.86rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>Ekip lisansları, hacimsel kredi ve özel entegrasyonlar için bize yaz.</div>
          </div>
          <a
            href={`mailto:${EMAIL}?subject=Kurumsal%20teklif%20talebi`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 999, textDecoration: 'none', background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontSize: '0.85rem', fontWeight: 700 }}
          >
            <Mail size={15} /> Teklif iste
          </a>
        </motion.div>
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Home, ArrowLeft, Compass } from 'lucide-react';

export default function NotFoundPage() {
  const reduced = useReducedMotion();

  return (
    <div
      style={{
        minHeight: 'calc(100vh - var(--navbar-height))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 'calc(var(--navbar-height) + 2rem) 2rem 2rem',
        position: 'relative',
        overflow: 'hidden',
        background:
          'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(0,87,255,0.10) 0%, transparent 70%), var(--color-bg)',
      }}
    >
      {/* Floating orbs */}
      <motion.div
        aria-hidden
        style={{
          position: 'absolute',
          width: 360,
          height: 360,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,87,255,0.16) 0%, transparent 70%)',
          top: -100,
          left: -80,
          filter: 'blur(48px)',
          pointerEvents: 'none',
        }}
        animate={reduced ? undefined : { y: [0, 18, 0], x: [0, 12, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        style={{
          position: 'absolute',
          width: 320,
          height: 320,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(90,200,250,0.18) 0%, transparent 70%)',
          bottom: -80,
          right: -60,
          filter: 'blur(48px)',
          pointerEvents: 'none',
        }}
        animate={reduced ? undefined : { y: [0, -16, 0], x: [0, -10, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: 'relative', zIndex: 1, maxWidth: 480 }}
      >
        <motion.div
          animate={reduced ? undefined : { rotate: [0, 360] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          style={{ display: 'inline-flex', marginBottom: '1.5rem', color: 'var(--color-accent)' }}
        >
          <Compass size={48} strokeWidth={1.5} />
        </motion.div>

        <div
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 'clamp(5rem, 14vw, 9rem)',
            fontWeight: 900,
            letterSpacing: '-0.06em',
            lineHeight: 1,
            background: 'linear-gradient(135deg, #0057FF 0%, #5AC8FA 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            color: 'transparent',
            marginBottom: '0.5rem',
          }}
        >
          404
        </div>
        <h1
          style={{
            fontSize: 'clamp(1.25rem, 3vw, 1.75rem)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            marginBottom: '0.75rem',
            color: 'var(--color-text-primary)',
          }}
        >
          Sayfa bulunamadı
        </h1>
        <p
          style={{
            color: 'var(--color-text-secondary)',
            marginBottom: '2rem',
            fontSize: '0.9375rem',
            lineHeight: 1.7,
          }}
        >
          Aradığınız sayfa kaybolmuş, taşınmış ya da hiç var olmamış olabilir.
          <br />
          Endişelenmeyin — sizi geri götürebiliriz.
        </p>
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <motion.div
            whileHover={reduced ? undefined : { y: -2 }}
            whileTap={reduced ? undefined : { scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 460, damping: 24 }}
          >
            <Link
              to="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                borderRadius: 'var(--radius-full)',
                background: 'var(--color-accent)',
                color: 'white',
                fontWeight: 600,
                fontSize: '0.875rem',
                textDecoration: 'none',
                boxShadow: '0 4px 14px rgba(0, 87, 255, 0.32)',
              }}
            >
              <Home size={16} /> Ana Sayfa
            </Link>
          </motion.div>
          <motion.button
            onClick={() => window.history.back()}
            whileHover={reduced ? undefined : { y: -2 }}
            whileTap={reduced ? undefined : { scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 460, damping: 24 }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--color-border-strong)',
              background: 'var(--color-surface)',
              color: 'var(--color-text-primary)',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              fontFamily: 'var(--font-family)',
            }}
          >
            <ArrowLeft size={16} /> Geri Dön
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

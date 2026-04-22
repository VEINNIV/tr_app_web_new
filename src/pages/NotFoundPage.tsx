import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '2rem' }}>
      <div>
        <div style={{ fontSize: '6rem', fontWeight: 900, letterSpacing: '-0.05em', background: 'var(--color-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>404</div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Sayfa Bulunamadı</h1>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '2rem', fontSize: '0.9375rem' }}>Aradığınız sayfa mevcut değil veya taşınmış olabilir.</p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 1.5rem', borderRadius: '999px', background: 'var(--color-gradient)', color: 'white', fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none' }}>
            <Home size={16} /> Ana Sayfa
          </Link>
          <button onClick={() => window.history.back()} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 1.5rem', borderRadius: '999px', border: '1px solid var(--color-border-strong)', background: 'var(--color-surface)', color: 'var(--color-text-primary)', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'var(--font-family)' }}>
            <ArrowLeft size={16} /> Geri Dön
          </button>
        </div>
      </div>
    </div>
  );
}

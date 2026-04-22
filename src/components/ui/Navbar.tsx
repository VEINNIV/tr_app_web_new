import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import styles from '../../styles/components/navbar.module.css';

// Smooth scroll to anchor
const handleAnchorClick = (id: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    // If on a different page, navigate to landing then scroll
    window.location.href = `/#${id}`;
  }
};

export default function Navbar() {
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('');

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 10);

      // Track active section for landing page
      const sections = ['features', 'how-it-works', 'pricing'];
      for (const id of sections.reverse()) {
        const el = document.getElementById(id);
        if (el && window.scrollY >= el.offsetTop - 100) {
          setActiveSection(id); return;
        }
      }
      setActiveSection('');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setMobileOpen(false), [location]);

  const isActive = (path: string) => location.pathname === path;

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || '?';

  const isLanding = location.pathname === '/';

  return (
    <nav className={`${styles.navbar} ${scrolled ? styles.navbarScrolled : ''}`}>
      <Link to="/" className={styles.navBrand}>
        <div className={styles.navLogo}>TL</div>
        <span className={styles.navTitle}>TransLingua</span>
      </Link>

      <div className={`${styles.navLinks} ${mobileOpen ? styles.navLinksOpen : ''}`}>
        {user ? (
          <>
            <Link to="/dashboard" className={`${styles.navLink} ${isActive('/dashboard') ? styles.navLinkActive : ''}`}>Dashboard</Link>
            <Link to="/translate" className={`${styles.navLink} ${isActive('/translate') ? styles.navLinkActive : ''}`}>Çeviri</Link>
            <Link to="/documents" className={`${styles.navLink} ${isActive('/documents') ? styles.navLinkActive : ''}`}>Dokümanlar</Link>
            <Link to="/chat" className={`${styles.navLink} ${isActive('/chat') ? styles.navLinkActive : ''}`}>AI Chat</Link>
          </>
        ) : (
          <>
            <a
              href="#features"
              className={`${styles.navLink} ${isLanding && activeSection === 'features' ? styles.navLinkActive : ''}`}
              onClick={handleAnchorClick('features')}
            >
              Özellikler
            </a>
            <a
              href="#how-it-works"
              className={`${styles.navLink} ${isLanding && activeSection === 'how-it-works' ? styles.navLinkActive : ''}`}
              onClick={handleAnchorClick('how-it-works')}
            >
              Nasıl Çalışır
            </a>
            <a
              href="#pricing"
              className={`${styles.navLink} ${isLanding && activeSection === 'pricing' ? styles.navLinkActive : ''}`}
              onClick={handleAnchorClick('pricing')}
            >
              Fiyatlandırma
            </a>
          </>
        )}
      </div>

      <div className={styles.navMenu}>
        {user ? (
          <>
            <button onClick={handleSignOut} className={styles.navIconBtn} title="Çıkış Yap">
              <LogOut size={18} />
            </button>
            <Link to="/settings" className={styles.navAvatar} title={profile?.full_name || user.email || ''}>
              {initials}
            </Link>
          </>
        ) : (
          <>
            <Link to="/auth" className={styles.navLink}>Giriş Yap</Link>
            <Link to="/auth?mode=register" className={styles.navCta}>Ücretsiz Başla</Link>
          </>
        )}
        <button className={styles.mobileToggle} onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menü">
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
    </nav>
  );
}

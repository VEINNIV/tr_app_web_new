import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu, X, LogOut, Settings, LayoutDashboard, Languages, FolderOpen,
  MessageSquare, BookOpen, Shield, ChevronDown, User, ScrollText, Sun, Moon,
} from 'lucide-react';
import { useAuth } from '../../context/auth';
import { useThemeContext } from '../../context/ThemeContext';
import styles from '../../styles/components/navbar.module.css';

// Smooth scroll to anchor
const handleAnchorClick = (id: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    window.location.href = `/#${id}`;
  }
};

export default function Navbar() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const { theme, toggle: toggleTheme } = useThemeContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(() => typeof window !== 'undefined' ? window.scrollY > 20 : false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoHovered, setLogoHovered] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('');
  const profileRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const currentScrollY = window.scrollY;

      lastScrollY.current = currentScrollY;
      setScrolled(currentScrollY > 20);

      // Track active section for landing page
      const sections = ['features', 'how-it-works', 'pricing'];
      for (const id of sections.reverse()) {
        const el = document.getElementById(id);
        if (el && currentScrollY >= el.offsetTop - 100) {
          setActiveSection(id); return;
        }
      }
      setActiveSection('');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close profile dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isActive = (path: string) => location.pathname === path;

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || '?';

  const isLanding = location.pathname === '/';

  const authLinks = [
    { to: '/dashboard',   label: 'Dashboard',   icon: <LayoutDashboard size={16} /> },
    { to: '/translate',   label: 'Çeviri',       icon: <Languages size={16} /> },
    { to: '/documents',   label: 'Dokümanlar',   icon: <FolderOpen size={16} /> },
    { to: '/glossary',    label: 'Sözlük',        icon: <ScrollText size={16} /> },
    { to: '/study-notes', label: 'Ders Notu',    icon: <BookOpen size={16} /> },
    { to: '/chat',        label: 'AI Chat',       icon: <MessageSquare size={16} /> },
  ];

  const guestLinks = [
    { id: 'features', label: 'Özellikler' },
    { id: 'how-it-works', label: 'Nasıl Çalışır' },
    { id: 'pricing', label: 'Fiyatlandırma' },
  ];

  return (
    <>
      <nav 
        className={`${styles.navbarWrapper} ${scrolled ? styles.navbarScrolled : ''}`}
      >
        <motion.div 
          className={styles.navbarInner}
          layout
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        >
          {/* Logo */}
          <Link
            to="/"
            className={styles.navBrand}
            aria-label="TransWordly ana sayfa"
            onMouseEnter={() => setLogoHovered(true)}
            onMouseLeave={() => setLogoHovered(false)}
          >
            <motion.div
              className={styles.navLogo}
              whileHover={{ scale: 1.06, rotate: -3 }}
              whileTap={{ scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 420, damping: 17 }}
            >
              <img src="/trans_wordly.png" alt="" width={28} height={28} draggable={false} />
            </motion.div>
            <div className={styles.navTitleWrapper}>
              <motion.span
                className={styles.navTitleTrans}
                initial={{ maxWidth: 0, opacity: 0, x: -8 }}
                animate={{
                  maxWidth: logoHovered ? 64 : 0,
                  opacity: logoHovered ? 1 : 0,
                  x: logoHovered ? 0 : -8,
                }}
                transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              >
                Trans
              </motion.span>
              <span className={styles.navTitleWordly}>Wordly</span>
            </div>
          </Link>

          {/* Desktop Links */}
          <div className={styles.navLinks}>
            {isLanding ? (
              guestLinks.map(link => {
                const active = activeSection === link.id;
                return (
                  <a
                    key={link.id}
                    href={`#${link.id}`}
                    className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`}
                    onClick={handleAnchorClick(link.id)}
                  >
                    {active && (
                      <motion.div
                        className={styles.navLinkIndicator}
                        layoutId="nav-indicator"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span className={styles.navLinkContent}>
                      {link.label}
                    </span>
                  </a>
                );
              })
            ) : (
              user && authLinks.map(link => {
                const active = isActive(link.to);
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`}
                  >
                    {active && (
                      <motion.div
                        className={styles.navLinkIndicator}
                        layoutId="nav-indicator"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span className={styles.navLinkContent}>
                      {link.icon}
                      <span>{link.label}</span>
                    </span>
                  </Link>
                );
              })
            )}
          </div>

          {/* Right Menu */}
          <div className={styles.navMenu}>
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {isLanding && (
                  <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 520, damping: 28 }}>
                    <Link to="/dashboard" className={styles.navLinkAuth} style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', fontSize: '0.8125rem' }}>
                      Dashboard'a Dön
                    </Link>
                  </motion.div>
                )}
                <div className={styles.profileWrapper} ref={profileRef}>
                <motion.button
                  className={styles.profileBtn}
                  onClick={() => setProfileOpen(!profileOpen)}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 28 }}
                >
                  <div className={styles.navAvatar}>{initials}</div>
                  <div className={styles.profileInfo}>
                    <span className={styles.profileName}>
                      {profile?.full_name || user.email?.split('@')[0]}
                    </span>
                    <span className={styles.profilePlan}>
                      {profile?.plan?.toUpperCase()} Plan
                    </span>
                  </div>
                  <ChevronDown
                    size={14}
                    className={`${styles.profileChevron} ${profileOpen ? styles.profileChevronOpen : ''}`}
                  />
                </motion.button>

                <AnimatePresence>
                  {profileOpen && (
                    <motion.div
                      className={styles.profileDropdown}
                      initial={{ opacity: 0, y: 15, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                    >
                    <div className={styles.dropdownHeader}>
                      <div className={styles.dropdownAvatar}>{initials}</div>
                      <div>
                        <div className={styles.dropdownName}>{profile?.full_name || 'Kullanıcı'}</div>
                        <div className={styles.dropdownEmail}>{user.email}</div>
                      </div>
                    </div>

                    <div className={styles.dropdownDivider} />

                    <Link to="/settings" className={styles.dropdownItem} onClick={() => setProfileOpen(false)}>
                      <Settings size={15} />
                      <span>Ayarlar</span>
                    </Link>

                    {isAdmin && (
                      <Link to="/admin" className={`${styles.dropdownItem} ${styles.dropdownItemAdmin}`} onClick={() => setProfileOpen(false)}>
                        <Shield size={15} />
                        <span>Admin Panel</span>
                      </Link>
                    )}

                    <div className={styles.dropdownDivider} />

                    <button className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`} onClick={handleSignOut}>
                      <LogOut size={15} />
                      <span>Çıkış Yap</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            </div>
          ) : (
            <>
              <Link to="/auth" className={styles.navLinkAuth}>Giriş Yap</Link>
              <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} transition={{ type: 'spring', stiffness: 520, damping: 28 }}>
                <Link to="/auth?mode=register" className={styles.navCta}>
                  Ücretsiz Başla
                </Link>
              </motion.div>
            </>
          )}

            {/* Theme Toggle */}
            <motion.button
              className={styles.themeToggle}
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Açık moda geç' : 'Koyu moda geç'}
              whileHover={{ scale: 1.1, rotate: 15 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </motion.button>

            {/* Mobile Toggle */}
            <button
              className={styles.mobileToggle}
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Menü"
            >
              <motion.div
                animate={{ rotate: mobileOpen ? 90 : 0 }}
                transition={{ type: 'spring', stiffness: 300 }}
              >
                {mobileOpen ? <X size={22} /> : <Menu size={22} />}
              </motion.div>
            </button>
          </div>
        </motion.div>
      </nav>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className={styles.mobileOverlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              className={styles.mobileDrawer}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <div className={styles.mobileDrawerHeader}>
                <span className={styles.mobileDrawerTitle}>Menü</span>
                <button className={styles.mobileDrawerClose} onClick={() => setMobileOpen(false)}>
                  <X size={20} />
                </button>
              </div>

              {user && profile && (
                <div className={styles.mobileProfile}>
                  <div className={styles.navAvatar}>{initials}</div>
                  <div>
                    <div className={styles.mobileProfileName}>{profile.full_name || 'Kullanıcı'}</div>
                    <div className={styles.mobileProfilePlan}>{profile.plan.toUpperCase()} Plan</div>
                  </div>
                </div>
              )}

              <div className={styles.mobileLinks}>
                {isLanding && (
                  <>
                    {guestLinks.map(link => (
                      <a
                        key={link.id}
                        href={`#${link.id}`}
                        className={styles.mobileLink}
                        onClick={(e) => { handleAnchorClick(link.id)(e); setMobileOpen(false); }}
                      >
                        <span>{link.label}</span>
                      </a>
                    ))}
                    <div className={styles.mobileDivider} />
                  </>
                )}

                {user ? (
                  <>
                    {authLinks.map(link => (
                      <Link
                        key={link.to}
                        to={link.to}
                        className={`${styles.mobileLink} ${isActive(link.to) ? styles.mobileLinkActive : ''}`}
                        onClick={() => setMobileOpen(false)}
                      >
                        {link.icon}
                        <span>{link.label}</span>
                      </Link>
                    ))}
                    <div className={styles.mobileDivider} />
                    <Link to="/settings" className={styles.mobileLink} onClick={() => setMobileOpen(false)}>
                      <Settings size={16} />
                      <span>Ayarlar</span>
                    </Link>
                    {isAdmin && (
                      <Link to="/admin" className={`${styles.mobileLink} ${styles.mobileLinkAdmin}`} onClick={() => setMobileOpen(false)}>
                        <Shield size={16} />
                        <span>Admin Panel</span>
                      </Link>
                    )}
                    <div className={styles.mobileDivider} />
                    <button className={`${styles.mobileLink} ${styles.mobileLinkDanger}`} onClick={() => { handleSignOut(); setMobileOpen(false); }}>
                      <LogOut size={16} />
                      <span>Çıkış Yap</span>
                    </button>
                  </>
                ) : (
                  <>
                    <Link to="/auth" className={styles.mobileLink} onClick={() => setMobileOpen(false)}>
                      <User size={16} />
                      <span>Giriş Yap</span>
                    </Link>
                    <Link to="/auth?mode=register" className={`${styles.mobileLink} ${styles.mobileLinkCta}`} onClick={() => setMobileOpen(false)}>
                      Ücretsiz Başla
                    </Link>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Languages, FolderOpen, MessageSquare, BookOpen, Brain } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from '../../styles/components/bottomnav.module.css';

const NAV_ITEMS = [
  { to: '/dashboard',   icon: <LayoutDashboard size={22} />, label: 'Ana Sayfa' },
  { to: '/translate',   icon: <Languages size={22} />,       label: 'Çeviri'    },
  { to: '/documents',   icon: <FolderOpen size={22} />,      label: 'Belgeler'  },
  { to: '/study-notes', icon: <BookOpen size={22} />,        label: 'Notlar'    },
  { to: '/study',       icon: <Brain size={22} />,           label: 'Çalış'     },
  { to: '/chat',        icon: <MessageSquare size={22} />,   label: 'AI Chat'   },
];

export default function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav className={styles.bar}>
      {NAV_ITEMS.map(({ to, icon, label }) => {
        const active = pathname === to;
        return (
          <Link key={to} to={to} className={`${styles.item} ${active ? styles.itemActive : ''}`}>
            <span className={styles.iconWrap}>
              {active && (
                <motion.span
                  layoutId="bottom-nav-pill"
                  className={styles.pill}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className={styles.icon}>{icon}</span>
            </span>
            <span className={styles.label}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

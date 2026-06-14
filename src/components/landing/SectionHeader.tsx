/**
 * SectionHeader — landing bölüm başlıkları için ortak, kademeli (staggered)
 * giriş animasyonlu başlık bloğu. Etiket → başlık → açıklama sırayla belirir.
 */
import { motion } from 'framer-motion';
import styles from '../../styles/components/landing.module.css';

const EASE = [0.22, 1, 0.36, 1] as const;

const wrap = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09 } },
};
const item = {
  hidden: { opacity: 0, y: 20, filter: 'blur(6px)' },
  visible: {
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.6, ease: EASE },
  },
};

interface Props {
  label: string;
  title: React.ReactNode;
  desc?: React.ReactNode;
  /** Başlığın üstüne tutturulan el yazısı kenar notu (opsiyonel) */
  note?: React.ReactNode;
}

export default function SectionHeader({ label, title, desc, note }: Props) {
  return (
    <motion.div
      className={styles.sectionHeader}
      variants={wrap}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.5 }}
    >
      {note && (
        <motion.span
          className={styles.sectionNote}
          initial={{ opacity: 0, rotate: -16, scale: 0.7 }}
          whileInView={{ opacity: 1, rotate: -6, scale: 1 }}
          viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.35 }}
        >
          {note}
          <svg viewBox="0 0 120 8" fill="none" preserveAspectRatio="none" aria-hidden="true">
            <path d="M2 5C20 2 38 6 56 4S94 1 118 4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </motion.span>
      )}
      <motion.span className={styles.sectionLabel} variants={item}>{label}</motion.span>
      <motion.h2 className={styles.sectionTitle} variants={item}>{title}</motion.h2>
      {desc && <motion.p className={styles.sectionDesc} variants={item}>{desc}</motion.p>}
    </motion.div>
  );
}

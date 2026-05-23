/**
 * OnboardingModal — Yeni kullanıcı kurulum sihirbazı
 * Meslek, kullanım amacı, dil tercihi + tema soruları.
 * Cevaplar profile kaydedilir; AI sözlük önerileri oluşturulur.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GraduationCap, Stethoscope, Scale, Wrench, Briefcase,
  BookOpen, User, CheckCircle2, Sparkles, Sun, Moon,
  Globe, ChevronRight, Loader,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { generateGlossarySuggestions } from '../lib/ai';
import { useThemeContext } from '../context/ThemeContext';
import type { Profession, UseCase } from '../types';
import styles from '../styles/components/onboarding.module.css';

// ── Data ──────────────────────────────────────────────────────────────────────

const PROFESSIONS: { value: Profession; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'student',    label: 'Öğrenci',             icon: GraduationCap, color: '#6366f1' },
  { value: 'researcher', label: 'Araştırmacı',          icon: BookOpen,      color: '#8b5cf6' },
  { value: 'medical',    label: 'Sağlık Profesyoneli',  icon: Stethoscope,   color: '#10b981' },
  { value: 'legal',      label: 'Hukuk Profesyoneli',   icon: Scale,         color: '#f59e0b' },
  { value: 'engineer',   label: 'Mühendis / Teknisyen', icon: Wrench,        color: '#0ea5e9' },
  { value: 'business',   label: 'İş / Finans',          icon: Briefcase,     color: '#ec4899' },
  { value: 'teacher',    label: 'Öğretmen / Akademisyen',icon: BookOpen,     color: '#14b8a6' },
  { value: 'other',      label: 'Diğer',                icon: User,          color: '#94a3b8' },
];

const USE_CASES: { value: UseCase; label: string; desc: string }[] = [
  { value: 'academic',    label: 'Akademik',     desc: 'Makale, tez, araştırma' },
  { value: 'medical',     label: 'Tıbbi',        desc: 'Klinik belgeler, raporlar' },
  { value: 'legal',       label: 'Hukuki',       desc: 'Sözleşme, mahkeme kararları' },
  { value: 'engineering', label: 'Teknik',       desc: 'Standartlar, teknik belgeler' },
  { value: 'business',    label: 'İş / Finans',  desc: 'Raporlar, sunum, yazışma' },
  { value: 'general',     label: 'Genel',        desc: 'Günlük belgeler, kişisel' },
];

const LANGUAGES = [
  { value: 'tr', label: '🇹🇷 Türkçe' },
  { value: 'en', label: '🇬🇧 İngilizce' },
  { value: 'ar', label: '🇸🇦 Arapça' },
  { value: 'de', label: '🇩🇪 Almanca' },
  { value: 'fr', label: '🇫🇷 Fransızca' },
  { value: 'ru', label: '🇷🇺 Rusça' },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  userId: string;
  onComplete: () => void;
}

export default function OnboardingModal({ userId, onComplete }: Props) {
  const { theme, toggle: toggleTheme } = useThemeContext();
  const [step, setStep] = useState(0);
  const [profession, setProfession] = useState<Profession | null>(null);
  const [useCase, setUseCase] = useState<UseCase | null>(null);
  const [nativeLang, setNativeLang] = useState('tr');
  const [saving, setSaving] = useState(false);

  const STEPS = ['Hoş Geldin', 'Tema', 'Meslek', 'Kullanım', 'Dil'];
  const canNext = [
    true,
    true,
    profession !== null,
    useCase !== null,
    true,
  ];

  const next = () => setStep(s => Math.min(s + 1, STEPS.length - 1));
  const prev = () => setStep(s => Math.max(s - 1, 0));

  const finish = async () => {
    if (!profession || !useCase) return;
    setSaving(true);
    try {
      // 1) Save profile
      await supabase.from('profiles').update({
        profession,
        primary_use_case: useCase,
        native_language: nativeLang,
        onboarding_completed: true,
      }).eq('id', userId);

      // 2) Generate AI glossary suggestions
      toast.loading('Sözlük önerileri hazırlanıyor...', { id: 'glossary-gen' });
      const suggestions = await generateGlossarySuggestions(profession, useCase, nativeLang);

      if (suggestions.length > 0) {
        await supabase.from('glossaries').insert(
          suggestions.map(s => ({ ...s, user_id: userId }))
        );
        await supabase.from('profiles').update({ glossary_generated: true }).eq('id', userId);
        toast.success(`${suggestions.length} sözlük terimi eklendi! 🎉`, { id: 'glossary-gen' });
      } else {
        toast.dismiss('glossary-gen');
      }

      onComplete();
    } catch {
      toast.error('Bir hata oluştu, lütfen tekrar deneyin.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.backdrop}>
      <motion.div
        className={styles.modal}
        initial={{ opacity: 0, scale: 0.95, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Progress bar */}
        <div className={styles.progressBar}>
          <motion.div
            className={styles.progressFill}
            animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>

        {/* Steps */}
        <div className={styles.stepDots}>
          {STEPS.map((label, i) => (
            <div key={label} className={`${styles.stepDot} ${i <= step ? styles.stepDotActive : ''}`} />
          ))}
        </div>

        {/* Content */}
        <div className={styles.body}>
          <AnimatePresence mode="wait">
            {/* Step 0: Welcome */}
            {step === 0 && (
              <motion.div key="step0" className={styles.stepContent} {...stepAnim}>
                <div className={styles.emoji}>👋</div>
                <h2 className={styles.stepTitle}>TransWordly'ye Hoş Geldiniz!</h2>
                <p className={styles.stepDesc}>
                  Sizi daha iyi tanımak için birkaç hızlı soru soracağız. Böylece
                  deneyiminizi kişiselleştirebilir ve sözlüğünüzü otomatik doldurabiliriz.
                </p>
                <p className={styles.stepHint}>Bu kurulum yalnızca bir kez yapılır, dilediğinizde Ayarlar'dan değiştirebilirsiniz.</p>
              </motion.div>
            )}

            {/* Step 1: Theme */}
            {step === 1 && (
              <motion.div key="step1" className={styles.stepContent} {...stepAnim}>
                <h2 className={styles.stepTitle}>Tema Tercihiniz</h2>
                <p className={styles.stepDesc}>Hangi görünümü tercih edersiniz?</p>
                <div className={styles.themeRow}>
                  <button
                    className={`${styles.themeCard} ${theme === 'light' ? styles.themeCardActive : ''}`}
                    onClick={() => theme !== 'light' && toggleTheme()}
                  >
                    <Sun size={28} strokeWidth={1.5} />
                    <span>Açık Mod</span>
                  </button>
                  <button
                    className={`${styles.themeCard} ${theme === 'dark' ? styles.themeCardActive : ''}`}
                    onClick={() => theme !== 'dark' && toggleTheme()}
                  >
                    <Moon size={28} strokeWidth={1.5} />
                    <span>Koyu Mod</span>
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 2: Profession */}
            {step === 2 && (
              <motion.div key="step2" className={styles.stepContent} {...stepAnim}>
                <h2 className={styles.stepTitle}>Siz kimsiniz?</h2>
                <p className={styles.stepDesc}>Mesleğinize göre sözlük önerilerimizi kişiselleştireceğiz.</p>
                <div className={styles.profGrid}>
                  {PROFESSIONS.map(({ value, label, icon: Icon, color }) => (
                    <button
                      key={value}
                      className={`${styles.profCard} ${profession === value ? styles.profCardActive : ''}`}
                      style={{ '--prof-color': color } as React.CSSProperties}
                      onClick={() => setProfession(value)}
                    >
                      <div className={styles.profIcon}><Icon size={20} strokeWidth={1.8} /></div>
                      <span className={styles.profLabel}>{label}</span>
                      {profession === value && <CheckCircle2 size={14} className={styles.profCheck} />}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 3: Use Case */}
            {step === 3 && (
              <motion.div key="step3" className={styles.stepContent} {...stepAnim}>
                <h2 className={styles.stepTitle}>Ne için kullanacaksınız?</h2>
                <p className={styles.stepDesc}>Çevireceğiniz belge türünü seçin.</p>
                <div className={styles.ucGrid}>
                  {USE_CASES.map(({ value, label, desc }) => (
                    <button
                      key={value}
                      className={`${styles.ucCard} ${useCase === value ? styles.ucCardActive : ''}`}
                      onClick={() => setUseCase(value)}
                    >
                      <div className={styles.ucLabel}>{label}</div>
                      <div className={styles.ucDesc}>{desc}</div>
                      {useCase === value && <CheckCircle2 size={13} className={styles.ucCheck} />}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 4: Language */}
            {step === 4 && (
              <motion.div key="step4" className={styles.stepContent} {...stepAnim}>
                <Globe size={36} strokeWidth={1.3} style={{ color: 'var(--color-accent)', marginBottom: 12 }} />
                <h2 className={styles.stepTitle}>Ana diliniz nedir?</h2>
                <p className={styles.stepDesc}>Çeviri yönünü belirlemek için kullanılır.</p>
                <div className={styles.langGrid}>
                  {LANGUAGES.map(({ value, label }) => (
                    <button
                      key={value}
                      className={`${styles.langBtn} ${nativeLang === value ? styles.langBtnActive : ''}`}
                      onClick={() => setNativeLang(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className={styles.aiHint}>
                  <Sparkles size={14} />
                  <span>Cevaplarınıza göre AI sözlüğünüzü otomatik dolduracağız.</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {step > 0 ? (
            <button className={styles.backBtn} onClick={prev}>Geri</button>
          ) : (
            <div />
          )}
          {step < STEPS.length - 1 ? (
            <button
              className={styles.nextBtn}
              onClick={next}
              disabled={!canNext[step]}
            >
              Devam Et <ChevronRight size={15} />
            </button>
          ) : (
            <button
              className={styles.finishBtn}
              onClick={finish}
              disabled={saving || !profession || !useCase}
            >
              {saving ? <><Loader size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Kaydediliyor...</> : <>Başlayalım! <Sparkles size={14} /></>}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

const stepAnim = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit:    { opacity: 0, x: -20 },
  transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] },
};

/**
 * TransLingua — Reusable motion primitives
 *
 * Tasarım felsefesi: Az ama doğru. Apple/Linear hissi —
 * tüm animasyonlar 150–280ms arası, spring stiffness ~400, damping ~24.
 * Her primitive `prefers-reduced-motion` saygısı ile gelir (framer-motion
 * `useReducedMotion` zaten bu kuralı uygular).
 */
import { forwardRef, useRef } from 'react';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
} from 'framer-motion';
import type { HTMLMotionProps, MotionProps, Transition } from 'framer-motion';

/* ────────────────────────────────────────────────────────────────────────
   Shared easing / springs
   ──────────────────────────────────────────────────────────────────────── */
export const SPRING_SOFT: Transition = { type: 'spring', stiffness: 380, damping: 28, mass: 0.6 };
export const SPRING_TIGHT: Transition = { type: 'spring', stiffness: 520, damping: 30, mass: 0.5 };
export const EASE_OUT: Transition = { duration: 0.28, ease: [0.22, 1, 0.36, 1] };

/* ────────────────────────────────────────────────────────────────────────
   <Pressable> — herhangi bir blok için tıklama hissi (ölçek + vurgu)
   ──────────────────────────────────────────────────────────────────────── */
type PressableProps = HTMLMotionProps<'div'> & {
  scale?: number;
  lift?: number;
  children: ReactNode;
};

export const Pressable = forwardRef<HTMLDivElement, PressableProps>(function Pressable(
  { scale = 0.97, lift = 0, children, style, ...rest }, ref,
) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      ref={ref}
      whileHover={reduced ? undefined : { y: -lift }}
      whileTap={reduced ? undefined : { scale }}
      transition={SPRING_TIGHT}
      style={style}
      {...rest}
    >
      {children}
    </motion.div>
  );
});

/* ────────────────────────────────────────────────────────────────────────
   <PressButton> — <button> elementi için tıklama hissi
   Anchor/link wraplemek için <Pressable> kullanın; bu native button'lar için.
   ──────────────────────────────────────────────────────────────────────── */
type PressButtonProps = HTMLMotionProps<'button'> & {
  scale?: number;
  lift?: number;
  children: ReactNode;
};

export const PressButton = forwardRef<HTMLButtonElement, PressButtonProps>(function PressButton(
  { scale = 0.96, lift = 1, children, style, disabled, ...rest }, ref,
) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      ref={ref}
      whileHover={reduced || disabled ? undefined : { y: -lift }}
      whileTap={reduced || disabled ? undefined : { scale }}
      transition={SPRING_TIGHT}
      style={style}
      disabled={disabled}
      {...rest}
    >
      {children}
    </motion.button>
  );
});

/* ────────────────────────────────────────────────────────────────────────
   <Magnetic> — mouse'u takip eden hafif çekim. Sadece büyük CTA'lar için.
   ──────────────────────────────────────────────────────────────────────── */
type MagneticProps = {
  children: ReactNode;
  strength?: number;
  className?: string;
  style?: CSSProperties;
};

export function Magnetic({ children, strength = 0.25, className, style }: MagneticProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 300, damping: 22, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 300, damping: 22, mass: 0.4 });

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    if (reduced || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    x.set(dx * strength);
    y.set(dy * strength);
  };

  const onLeave = () => { x.set(0); y.set(0); };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ x: sx, y: sy, display: 'inline-block', ...style }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   <Tilt> — kart için subtle 3D eğim. Premium hissini güçlendirir.
   ──────────────────────────────────────────────────────────────────────── */
type TiltProps = {
  children: ReactNode;
  max?: number;
  scale?: number;
  className?: string;
  style?: CSSProperties;
};

export function Tilt({ children, max = 6, scale = 1.02, className, style }: TiltProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 200, damping: 22 });
  const sy = useSpring(py, { stiffness: 200, damping: 22 });
  const rotateX = useTransform(sy, [0, 1], [max, -max]);
  const rotateY = useTransform(sx, [0, 1], [-max, max]);

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    if (reduced || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    px.set((e.clientX - rect.left) / rect.width);
    py.set((e.clientY - rect.top) / rect.height);
  };
  const onLeave = () => { px.set(0.5); py.set(0.5); };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      whileHover={reduced ? undefined : { scale }}
      transition={SPRING_SOFT}
      style={{
        rotateX: reduced ? 0 : rotateX,
        rotateY: reduced ? 0 : rotateY,
        transformStyle: 'preserve-3d',
        ...style,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   <Stagger> ve <StaggerItem> — listeler için topluca giriş animasyonu
   ──────────────────────────────────────────────────────────────────────── */
type StaggerProps = HTMLMotionProps<'div'> & {
  delay?: number;
  step?: number;
  children: ReactNode;
};

export function Stagger({ delay = 0, step = 0.06, children, ...rest }: StaggerProps) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { delayChildren: delay, staggerChildren: step } },
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export const STAGGER_ITEM: MotionProps['variants'] = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.36, ease: [0.22, 1, 0.36, 1] } },
};

type StaggerItemProps = HTMLMotionProps<'div'> & { children: ReactNode };

export function StaggerItem({ children, ...rest }: StaggerItemProps) {
  return (
    <motion.div variants={STAGGER_ITEM} {...rest}>
      {children}
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   useAnimatedNumber — sayı sayma animasyonu (ease-out cubic)
   ──────────────────────────────────────────────────────────────────────── */
import { useEffect, useState, useRef as useRefShim } from 'react';

export function useAnimatedNumber(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  const prev = useRefShim(0);
  useEffect(() => {
    if (target === prev.current) return;
    const start = prev.current;
    prev.current = target;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(start + (target - start) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

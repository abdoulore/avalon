"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Scroll-reveal wrapper. Lifts children in on first view; respects reduced motion
 * by rendering the final state immediately (no transition).
 */
export function Reveal({
  children,
  className = "",
  as = "div",
  delay = 0,
  y = 22,
  once = true,
  amount = 0.3,
}) {
  const reduce = useReducedMotion();
  const MotionTag = motion[as] ?? motion.div;

  return (
    <MotionTag
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once, amount }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </MotionTag>
  );
}

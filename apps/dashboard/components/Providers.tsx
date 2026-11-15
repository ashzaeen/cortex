"use client";
// App-wide motion settings. reducedMotion="user" makes every motion/react animation drop its
// transforms when the person has asked for reduced motion (design.md 12.7).
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

export default function Providers({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

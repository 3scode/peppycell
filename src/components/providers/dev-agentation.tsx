"use client";

import dynamic from "next/dynamic";

/**
 * Agentation adalah visual feedback toolbar untuk AI coding agent.
 * Dimuat lazy hanya saat development agar tidak masuk bundle production.
 */
const Agentation =
  process.env.NODE_ENV === "development"
    ? dynamic(() => import("agentation").then((mod) => mod.Agentation), {
        ssr: false,
      })
    : null;

export function DevAgentation() {
  if (!Agentation) return null;
  return <Agentation appName="PeppyCell" />;
}

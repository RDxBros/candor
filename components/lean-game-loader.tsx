"use client";

import dynamic from "next/dynamic";
import type { LeanGameCard } from "../lib/lean-game-pool";

const LeanGuessingGame = dynamic(
  () => import("./lean-guessing-game").then((module) => module.LeanGuessingGame),
  {
    ssr: false,
    loading: () => <section className="lean-game game-placeholder" aria-hidden="true">
      <div className="loading-line loading-label" />
      <div className="loading-line loading-copy" />
    </section>
  }
);

export function LeanGameLoader(props: {
  cards: LeanGameCard[];
  currentDay: string;
  preferredStoryId?: string;
  mode: "scored" | "practice";
}) {
  return <LeanGuessingGame {...props} />;
}

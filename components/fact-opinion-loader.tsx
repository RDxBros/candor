"use client";

import dynamic from "next/dynamic";
import type { FactOpinionRound, FactOpinionStoryOption } from "../lib/fact-opinion-content";

const FactOpinionGame = dynamic(
  () => import("./fact-opinion-game").then((module) => module.FactOpinionGame),
  { ssr: false, loading: () => <section className="fact-opinion-game"><p className="muted-copy">Opening the round…</p></section> }
);

export function FactOpinionLoader(props: {
  rounds: FactOpinionRound[];
  story: FactOpinionStoryOption;
  currentDay: string;
  mode: "scored" | "practice";
}) {
  return <FactOpinionGame {...props} />;
}

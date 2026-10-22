"use client";

import dynamic from "next/dynamic";
import type { GamePoolEntry } from "./game-hub-client";

const GameHubClient = dynamic(
  () => import("./game-hub-client").then((module) => module.GameHubClient),
  {
    ssr: false,
    loading: () => <div className="game-hub-placeholder" aria-hidden="true">
      <div className="loading-line loading-title" />
      <div className="loading-line loading-copy" />
      <div className="loading-divider" />
    </div>
  }
);

export function GameHubLoader({ entries }: { entries: GamePoolEntry[] }) {
  return <GameHubClient entries={entries} />;
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getOrCreateAnonymousId, readLocalGameAttempts } from "../lib/client-storage";
import { ArrowIcon } from "./app-icons";

export type GamePoolEntry = {
  day: string;
  storyId: string;
  headline: string;
  eligible: boolean;
};

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}

function shuffled<T>(items: T[], seed: number) {
  const copy = [...items];
  let state = seed || 1;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const target = state % (index + 1);
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

export function GameHubClient({ entries }: { entries: GamePoolEntry[] }) {
  const [ordered, setOrdered] = useState(entries);
  const [progress, setProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    const anonymousId = getOrCreateAnonymousId() ?? "visitor";
    setOrdered(shuffled(entries, hash(`${anonymousId}:game-pool`)));
    setProgress(Object.fromEntries(entries.map((entry) => [entry.storyId, readLocalGameAttempts(entry.storyId).length])));
  }, [entries]);

  if (!entries.length) return <section className="empty-state"><h2>No games yet</h2><p>Political stories with complete framing data will appear here.</p></section>;

  return <ul className="game-pool-list">
    {ordered.map((entry) => {
      const attempts = progress[entry.storyId] ?? 0;
      const status = attempts >= 3 ? "Completed" : attempts ? `${attempts}/3 answered` : "Ready to play";
      const content = <>
        <span className="story-topic">{entry.day.replace(/^day/i, "Day ")}</span>
        <h2>{entry.headline}</h2>
        <span className="game-entry-status">{entry.eligible ? status : "Unavailable: missing framing data"}</span>
        {entry.eligible ? <ArrowIcon className="game-entry-arrow" /> : null}
      </>;

      return <li key={`${entry.day}-${entry.storyId}`}>
        {entry.eligible ? (
          <Link className="game-pool-entry" href={`/game/spot-the-lean?story=${encodeURIComponent(entry.storyId)}&day=${encodeURIComponent(entry.day)}`}>
            {content}
          </Link>
        ) : <div className="game-pool-entry" aria-disabled="true">{content}</div>}
      </li>;
    })}
  </ul>;
}

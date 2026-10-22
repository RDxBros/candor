"use client";

import { useLayoutEffect, useState } from "react";
import { readReadingStats } from "../lib/client-storage";
import { FireIcon } from "./app-icons";

export function StreakBadge() {
  const [streak, setStreak] = useState(0);

  useLayoutEffect(() => {
    const refresh = () => setStreak(readReadingStats().streak);
    refresh();
    window.addEventListener("candor:reading-updated", refresh);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("candor:reading-updated", refresh);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  if (streak <= 1) return null;
  return <span className="streak-badge" aria-label={`${streak}-day streak`} title={`${streak}-day streak`}>
    <FireIcon />
    <span>{streak}</span>
  </span>;
}

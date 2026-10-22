"use client";

import { useEffect } from "react";
import { BADGE_DEFINITIONS, type BadgeId } from "../lib/badges";
import { LockIcon, UnlockIcon } from "./app-icons";

export function BadgeUnlockCelebration({ badgeId, onDismiss, autoDismissMs = 5_000 }: {
  badgeId: BadgeId;
  onDismiss: () => void;
  autoDismissMs?: number | null;
}) {
  const definition = BADGE_DEFINITIONS[badgeId];
  useEffect(() => {
    if (!autoDismissMs) return;
    const timer = window.setTimeout(onDismiss, autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [autoDismissMs, onDismiss]);

  return <div className="badge-unlock-backdrop" role="status" aria-live="polite" onClick={onDismiss}>
    <section className="badge-unlock-popup" aria-label={`${definition.name} badge earned`} onClick={(event) => event.stopPropagation()}>
      <div className="badge-unlock-visual" aria-hidden="true">
        <LockIcon className="badge-lock-closed" />
        <UnlockIcon className="badge-lock-open" />
        <span className="badge-earned-medallion">{badgeId === "explorer" ? "E" : "B"}</span>
      </div>
      <div className="badge-unlock-copy">
        <p className="eyebrow">Badge unlocked!</p>
        <h2>{definition.name}</h2>
        <p>{definition.shortDescription}</p>
      </div>
      <button type="button" className="text-action badge-unlock-dismiss" onClick={onDismiss}>Got it</button>
    </section>
  </div>;
}

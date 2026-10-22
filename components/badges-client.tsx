"use client";

import { useEffect, useState } from "react";
import { BADGE_DEFINITIONS, type BadgeId } from "../lib/badges";
import { getOrCreateAnonymousId } from "../lib/client-storage";
import { LockIcon } from "./app-icons";
import { InfoTooltip } from "./info-tooltip";

type Payload = {
  badges: Array<{ badge_id: BadgeId; earned_at: string }>;
  explorer: { completed: string[]; remaining: string[]; qualifies: boolean };
};

function title(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }

export function BadgesClient() {
  const [payload, setPayload] = useState<Payload | null>(null);
  useEffect(() => {
    const anonymousId = getOrCreateAnonymousId();
    if (!anonymousId) return;
    void fetch(`/api/badges?anonymous_id=${encodeURIComponent(anonymousId)}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Badges failed with ${response.status}`)))
      .then(setPayload)
      .catch((error) => console.error("Unable to load badges:", error));
  }, []);

  return <div className="badge-grid">
    {(Object.keys(BADGE_DEFINITIONS) as BadgeId[]).map((id) => {
      const definition = BADGE_DEFINITIONS[id];
      const earned = payload?.badges.find((badge) => badge.badge_id === id);
      let progress: string = definition.requirementText;
      if (id === "explorer" && payload) {
        const done = payload.explorer.completed.map(title);
        const remaining = payload.explorer.remaining.map(title);
        progress = done.length ? `${done.join(" and ")} done${remaining.length ? `, ${remaining.join(" and ")} to go` : ""}.` : definition.requirementText;
      }
      return <article className="badge-card" data-earned={Boolean(earned)} key={id}>
        <div className="badge-card-summary">
          <span className="badge-medallion" aria-hidden="true">{earned ? id === "explorer" ? "E" : "B" : <LockIcon />}</span>
          <span className="badge-card-copy">
            <span className="eyebrow">{earned ? "Earned" : "Locked"}</span>
            <span className="badge-title-row">
              <strong className="badge-card-title">{definition.name}</strong>
              <InfoTooltip label={`About the ${definition.name} badge`}>
                {earned ? definition.shortDescription : progress}
              </InfoTooltip>
            </span>
            {earned ? <time dateTime={earned.earned_at}>Earned {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(earned.earned_at))}</time> : null}
          </span>
        </div>
      </article>;
    })}
  </div>;
}

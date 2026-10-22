"use client";

import { useEffect, useState } from "react";
import { getOrCreateAnonymousId } from "../lib/client-storage";
import { ExternalIcon } from "./app-icons";
import { BadgeUnlockCelebration } from "./badge-unlock-celebration";
import { analyticsContext } from "../lib/analytics";

const BADGE_EVENT = "candor:badge-earned";

export function TrackedSourceLink({ href, outlet, storyId, sourceId, day, track }: {
  href: string;
  outlet: string;
  storyId: string;
  sourceId: string;
  day: string;
  track: boolean;
}) {
  function recordClick() {
    if (!track) return;
    const anonymousId = getOrCreateAnonymousId();
    if (!anonymousId) return;
    void fetch("/api/source-link-clicks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonymous_id: anonymousId, story_id: storyId, source_id: sourceId, day, analytics: analyticsContext() }),
      keepalive: true
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Source click failed with ${response.status}`);
      const payload = await response.json() as { newlyEarned?: { badge_id?: string } | null };
      if (payload.newlyEarned?.badge_id === "explorer") window.dispatchEvent(new Event(BADGE_EVENT));
    }).catch((error) => console.error("Unable to record source click:", error));
  }

  return <a className="source-link" href={href} target="_blank" rel="noopener noreferrer" onClick={recordClick} aria-label={`Visit ${outlet} article (opens in a new tab)`}>
    Visit article <ExternalIcon />
  </a>;
}

export function BadgeToastHost() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let pendingWhileHidden = false;
    const show = () => {
      if (document.hidden) {
        pendingWhileHidden = true;
        return;
      }
      setVisible(true);
    };
    const showWhenVisible = () => {
      if (!document.hidden && pendingWhileHidden) {
        pendingWhileHidden = false;
        setVisible(true);
      }
    };
    window.addEventListener(BADGE_EVENT, show);
    document.addEventListener("visibilitychange", showWhenVisible);
    return () => {
      window.removeEventListener(BADGE_EVENT, show);
      document.removeEventListener("visibilitychange", showWhenVisible);
    };
  }, []);
  return visible ? <BadgeUnlockCelebration badgeId="explorer" onDismiss={() => setVisible(false)} /> : null;
}

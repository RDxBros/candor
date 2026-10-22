"use client";

import { type ReactNode, useEffect, useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { STORAGE_KEYS } from "../lib/client-storage";
import { FIRST_LAUNCH_CONFIG } from "../lib/config";
import { track } from "../lib/analytics";

export function HomeGate({ day, editing, children }: { day: string; editing: boolean; children: ReactNode }) {
  const router = useRouter();
  const [showLanding, setShowLanding] = useState(false);

  useEffect(() => {
    if (!showLanding) return;
    track("landing_viewed");
    track("screen_viewed", { screen: "landing" });
  }, [showLanding]);

  useLayoutEffect(() => {
    if (editing) return;

    try {
      const topics = JSON.parse(localStorage.getItem(STORAGE_KEYS.topics) ?? "[]");
      if (Array.isArray(topics) && topics.length >= 2) {
        const params = new URLSearchParams({ topics: topics.join(",") });
        if (day !== "day1") params.set("day", day);
        router.replace(`/digest?${params.toString()}`);
        return;
      }
      const lastDigest = localStorage.getItem("candor:last-digest-url");
      if (lastDigest && /^\/digest(?:\?|$)/.test(lastDigest)) {
        router.replace(lastDigest);
        return;
      }
    } catch {
      // If storage is unavailable, keep onboarding usable for this visit.
    }

    setShowLanding(true);
  }, [day, editing, router]);

  function getStarted() {
    const params = new URLSearchParams({ edit: "1" });
    if (day !== "day1") params.set("day", day);
    router.push(`/?${params.toString()}`);
  }

  if (editing) return children;
  if (!showLanding) return <main id="main-content" className="screen home-checking" aria-busy="true" />;

  return (
    <main id="main-content" className="screen home-screen">
      <section className="home-hero" aria-labelledby="home-title">
        <h1 id="home-title">Candor</h1>
        <p className="home-tagline">{FIRST_LAUNCH_CONFIG.tagline}</p>
        <div className="home-preview-slot" aria-hidden="true" />
        <button className="primary-button home-start-button" type="button" onClick={getStarted}>
          Get started
        </button>
        <p className="home-supporting-line">{FIRST_LAUNCH_CONFIG.supportingLine}</p>
      </section>
    </main>
  );
}

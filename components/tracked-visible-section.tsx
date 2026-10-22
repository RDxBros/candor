"use client";

import { type ComponentPropsWithoutRef, useEffect, useRef } from "react";
import { track } from "../lib/analytics";
import { ForegroundSectionTimer } from "../lib/section-visibility";

type SectionName = "sources" | "whats_different";

export function TrackedVisibleSection({ storyId, sectionName, ...props }:
  ComponentPropsWithoutRef<"section"> & { storyId: string; sectionName: SectionName }) {
  const targetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const target = targetRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;

    const gate = new ForegroundSectionTimer(1000);
    let timer: number | null = null;
    let observer: IntersectionObserver | null = null;

    const clearTimer = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      clearTimer();
      const remaining = gate.remaining(performance.now());
      if (remaining === null) return;
      timer = window.setTimeout(() => {
        timer = null;
        if (gate.consume(performance.now())) {
          track("section_visible", { story_id: storyId, section: sectionName });
          observer?.disconnect();
          document.removeEventListener("visibilitychange", onVisibilityChange);
        } else schedule();
      }, Math.max(0, Math.ceil(remaining)));
    };
    const onVisibilityChange = () => {
      gate.setHidden(document.hidden, performance.now());
      schedule();
    };

    observer = new IntersectionObserver(([entry]) => {
      gate.setIntersection(Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.5), document.hidden, performance.now());
      schedule();
    }, { threshold: 0.5 });
    observer.observe(target);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearTimer();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [sectionName, storyId]);

  return <section ref={targetRef} {...props} />;
}

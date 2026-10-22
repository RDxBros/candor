"use client";

import type { DetailsHTMLAttributes } from "react";
import { useRef } from "react";
import { track } from "../lib/analytics";

export function TrackedDetails({ storyId, section, ...props }: DetailsHTMLAttributes<HTMLDetailsElement> & { storyId: string; section: "sources" | "whats_different" }) {
  const logged = useRef(false);
  return <details {...props} onToggle={(event) => {
    props.onToggle?.(event);
    if (event.currentTarget.open && !logged.current) {
      logged.current = true;
      track("section_opened", { story_id: storyId, section });
    }
  }} />;
}

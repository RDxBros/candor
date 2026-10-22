"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { MenuIcon } from "./app-icons";
import { track } from "../lib/analytics";

export function HeaderMenu({ interestsHref = "/?edit=1" }: { interestsHref?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="header-menu" ref={rootRef}>
      <button
        className="header-menu-trigger"
        ref={triggerRef}
        type="button"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((current) => { const next = !current; if (next) track("screen_viewed", { screen: "menu" }); return next; })}
      >
        <MenuIcon />
      </button>
      {open ? (
        <nav className="header-menu-panel" id={id} aria-label="Main navigation">
          <Link href="/game/badges" onClick={() => setOpen(false)}>Badges</Link>
          <Link href="/game" onClick={() => setOpen(false)}>Games</Link>
          <Link href={interestsHref} onClick={() => setOpen(false)}>Edit interests</Link>
        </nav>
      ) : null}
    </div>
  );
}

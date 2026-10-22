"use client";

import { type CSSProperties, useCallback, useEffect, useId, useRef, useState } from "react";

export function InfoTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mobileTop, setMobileTop] = useState<number | null>(null);
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const positionForMobile = useCallback(() => {
    if (!window.matchMedia("(max-width: 480px)").matches || !triggerRef.current) {
      setMobileTop(null);
      return;
    }
    setMobileTop(triggerRef.current.getBoundingClientRect().bottom + 9);
  }, []);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", positionForMobile);
    window.addEventListener("scroll", positionForMobile, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", positionForMobile);
      window.removeEventListener("scroll", positionForMobile, true);
    };
  }, [open, positionForMobile]);

  function toggle() {
    if (!open) positionForMobile();
    setOpen((value) => !value);
  }

  return (
    <span className="info-tooltip" ref={rootRef}>
      <button
        className="info-trigger"
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
      >
        <span className="info-glyph" aria-hidden="true">?</span>
      </button>
      {open ? (
        <span className="info-popover" id={id} role="tooltip" style={mobileTop === null ? undefined : {
          "--info-mobile-top": `${mobileTop}px`
        } as CSSProperties}>
          {children}
        </span>
      ) : null}
    </span>
  );
}

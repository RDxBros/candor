"use client";

import { useEffect, useRef } from "react";

export function Modal({ children, labelId, descriptionId, className = "", onDismiss }: {
  children: React.ReactNode;
  labelId: string;
  descriptionId?: string;
  className?: string;
  onDismiss?: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && onDismiss) { event.preventDefault(); onDismiss(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
      )];
      if (!focusable.length) { event.preventDefault(); panelRef.current.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, [onDismiss]);

  return (
    <div className="modal-backdrop t-modal-backdrop" role="presentation" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onDismiss?.();
    }}>
      <section className={`t-modal ${className}`} ref={panelRef} role="dialog" aria-modal="true"
        aria-labelledby={labelId} aria-describedby={descriptionId} tabIndex={-1}>
        {children}
      </section>
    </div>
  );
}

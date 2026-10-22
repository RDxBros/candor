"use client";

import { useEffect, useRef, useState } from "react";

export function usePreviewActivity() {
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    let intersecting = false;
    const update = () => setActive(intersecting && !document.hidden);
    const onVisibilityChange = () => update();
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting;
      update();
    }, { threshold: 0.2 });

    document.addEventListener("visibilitychange", onVisibilityChange);
    if (observer) observer.observe(node);
    else { intersecting = true; update(); }

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      observer?.disconnect();
    };
  }, []);

  return { ref, active };
}

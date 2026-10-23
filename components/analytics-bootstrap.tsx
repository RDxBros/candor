"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { analyticsContext, track } from "../lib/analytics";
import { isAnonymousUserReady, USER_READY_EVENT } from "./anonymous-user-bootstrap";

function displayMode() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone
    ? "standalone" : "browser";
}

function pathScreen(pathname: string) {
  if (pathname === "/digest") return "digest";
  if (pathname === "/complete") return "caught_up";
  if (pathname.startsWith("/story/")) return "story";
  if (pathname === "/game") return "games_hub";
  if (pathname === "/game/badges") return "badges";
  if (pathname.includes("/pick")) return "game_picker";
  return null;
}

export function AnalyticsBootstrap() {
  const pathname = usePathname();
  const foregroundStarted = useRef<number | null>(null);

  useEffect(() => {
    function start() {
      analyticsContext();
      const url = new URL(window.location.href);
      const reminderOpen = url.searchParams.get("src") === "reminder";
      const shouldLogOpen = reminderOpen || sessionStorage.getItem("candor:app-opened") !== "1";
      if (reminderOpen) {
        url.searchParams.delete("src");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      }
      if (shouldLogOpen) {
        sessionStorage.setItem("candor:app-opened", "1");
        const requestedDay = url.searchParams.get("day");
        const query = requestedDay ? `?day=${encodeURIComponent(requestedDay)}` : "";
        void fetch(`/api/content-day${query}`, { cache: "no-store" })
          .then((response) => response.ok ? response.json() as Promise<{ day: string }> : Promise.reject())
          .then(({ day }) => {
            track("app_opened", { content_day: day, display_mode: displayMode(), source: reminderOpen ? "reminder" : "direct" });
            if (reminderOpen) track("reminder_opened", { content_day: day });
          })
          .catch(() => undefined);
      }
      if (!document.hidden) foregroundStarted.current = performance.now();
    }
    if (isAnonymousUserReady()) start();
    else window.addEventListener(USER_READY_EVENT, start, { once: true });
    function visibility() {
      if (document.hidden) {
        if (foregroundStarted.current !== null) track("app_backgrounded", { active_ms: Math.max(0, Math.round(performance.now() - foregroundStarted.current)) });
        foregroundStarted.current = null;
      } else foregroundStarted.current = performance.now();
    }
    document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener(USER_READY_EVENT, start); document.removeEventListener("visibilitychange", visibility); };
  }, []);

  useEffect(() => {
    const screen = pathScreen(pathname);
    if (screen) track("screen_viewed", { screen });
  }, [pathname]);
  return null;
}

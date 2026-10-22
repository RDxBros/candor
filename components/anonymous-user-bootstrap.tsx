"use client";

import { useEffect } from "react";
import { getOrCreateAnonymousId, initializeUser } from "../lib/client-storage";

export const USER_READY_EVENT = "candor:user-ready";
let userReady = false;

export function isAnonymousUserReady() {
  return userReady;
}

export function AnonymousUserBootstrap() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("internal") === "1") {
      localStorage.setItem("candor_internal", "1");
      url.searchParams.delete("internal");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
    void initializeUser().then(async () => {
      if (localStorage.getItem("candor_internal") !== "1" || sessionStorage.getItem("candor:internal-synced") === "1") return;
      const anonymousId = getOrCreateAnonymousId();
      if (!anonymousId) return;
      const response = await fetch("/api/users/internal", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anonymous_id: anonymousId })
      });
      if (response.ok) sessionStorage.setItem("candor:internal-synced", "1");
    }).catch(() => undefined).finally(() => {
      userReady = true;
      sessionStorage.setItem("candor:user-ready", "1");
      window.dispatchEvent(new Event(USER_READY_EVENT));
    });
  }, []);

  return null;
}

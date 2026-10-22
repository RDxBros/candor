"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      const hadController = Boolean(navigator.serviceWorker.controller);
      void Promise.all([
        navigator.serviceWorker.getRegistrations().then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister()))
        ),
        "caches" in window ? caches.keys().then((keys) => Promise.all(
          keys.filter((key) => key.startsWith("candor-")).map((key) => caches.delete(key))
        )) : Promise.resolve([])
      ]).then(() => {
        if (hadController && !sessionStorage.getItem("candor:dev-cache-cleared")) {
          sessionStorage.setItem("candor:dev-cache-cleared", "true");
          window.location.reload();
        }
      });
      return;
    }
    const requestedDay = new URLSearchParams(window.location.search).get("day");
    const query = requestedDay ? `?day=${encodeURIComponent(requestedDay)}` : "";
    navigator.serviceWorker.register("/sw.js").then(() => {
      fetch(`/api/stories${query}`).catch(() => undefined);
    }).catch(() => undefined);
  }, []);
  return null;
}

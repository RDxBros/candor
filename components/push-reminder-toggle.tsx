"use client";

import { useEffect, useState } from "react";
import { getOrCreateAnonymousId, STORAGE_KEYS } from "../lib/client-storage";
import { track } from "../lib/analytics";

type ReminderState = "loading" | "off" | "subscribed" | "denied" | "unsupported" | "ios-install" | "busy" | "error";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function supported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && "showNotification" in ServiceWorkerRegistration.prototype;
}

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const key = Uint8Array.from(raw, (character) => character.charCodeAt(0));
  if (key.length !== 65 || key[0] !== 4) throw new Error("invalid_vapid_public_key");
  return key;
}

async function serviceWorkerRegistration() {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  const version = process.env.NEXT_PUBLIC_CANDOR_SW_VERSION || "development";
  return navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(version)}`, { updateViaCache: "none" });
}

export function PushReminderToggle() {
  const [state, setState] = useState<ReminderState>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function inspect() {
      if (isIos() && !isStandalone()) {
        if (!cancelled) setState("ios-install");
        return;
      }
      if (!supported() || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        if (!cancelled) setState("unsupported");
        return;
      }
      try {
        applicationServerKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
      } catch {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (!cancelled) setState(subscription ? "subscribed" : "off");
      } catch {
        if (!cancelled) setState("off");
      }
    }
    void inspect();
    return () => { cancelled = true; };
  }, []);

  async function enable() {
    if (state === "busy" || state === "subscribed") return;
    setState("busy");
    setMessage("");
    try {
      if (Notification.permission === "denied") {
        setState("denied");
        track("reminder_toggled", { enabled: true, result: "denied" });
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        track("reminder_toggled", { enabled: true, result: permission === "denied" ? "denied" : "error" });
        return;
      }
      const registration = await serviceWorkerRegistration();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!)
      });
      const anonymousId = getOrCreateAnonymousId();
      if (!anonymousId) throw new Error("anonymous_id_unavailable");
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonymous_id: anonymousId, subscription: subscription.toJSON() })
      });
      if (!response.ok) {
        await subscription.unsubscribe().catch(() => false);
        throw new Error("subscription_save_failed");
      }
      localStorage.setItem(STORAGE_KEYS.dailyDropEnabled, "1");
      setState("subscribed");
      track("reminder_toggled", { enabled: true, result: "subscribed" });
    } catch {
      setState("error");
      setMessage("We couldn’t enable reminders. Try again in a moment.");
      track("reminder_toggled", { enabled: true, result: "error" });
    }
  }

  async function disable() {
    if (state !== "subscribed") return;
    setState("busy");
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      const anonymousId = getOrCreateAnonymousId();
      if (subscription && anonymousId) {
        const snapshot = subscription.toJSON();
        await subscription.unsubscribe();
        const response = await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ anonymous_id: anonymousId, subscription: snapshot })
        });
        if (!response.ok) throw new Error("unsubscribe_save_failed");
      }
      localStorage.removeItem(STORAGE_KEYS.dailyDropEnabled);
      setState("off");
      track("reminder_toggled", { enabled: false, result: "unsubscribed" });
    } catch {
      localStorage.removeItem(STORAGE_KEYS.dailyDropEnabled);
      setState("error");
      setMessage("Reminders are off on this device. We’ll finish cleaning that up automatically.");
      track("reminder_toggled", { enabled: false, result: "error" });
    }
  }

  const checked = state === "subscribed";
  const unavailable = state === "loading" || state === "busy" || state === "denied" || state === "unsupported" || state === "ios-install";
  const helper = state === "subscribed" ? "On. Candor will remind you at 11:00 AM Eastern when a new drop is waiting."
    : state === "denied" ? "Notifications are blocked. Re-enable them in your browser or device settings."
    : state === "unsupported" ? "This browser doesn’t support web push reminders."
    : state === "ios-install" ? "Add Candor to your Home Screen first, then turn reminders on from the installed app."
    : message || "Get one reminder at 11:00 AM Eastern when a new drop is waiting.";

  return (
    <section className="reminder-setting" aria-labelledby="reminder-title">
      <div className="reminder-setting-copy">
        <h2 id="reminder-title">Daily reminder</h2>
        <p aria-live="polite">{helper}</p>
      </div>
      <button
        className="reminder-switch"
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label="Daily drop reminder"
        disabled={unavailable}
        onClick={checked ? disable : enable}
      >
        <span aria-hidden="true" />
      </button>
    </section>
  );
}

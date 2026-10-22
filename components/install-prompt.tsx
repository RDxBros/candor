"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { STORAGE_KEYS } from "../lib/client-storage";
import { Modal } from "./modal";
import { track } from "../lib/analytics";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }> };
type PromptMode = "ios" | "android-native" | "android-manual" | null;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function InstallPrompt() {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const platform = useRef<"ios" | "android" | null>(null);
  const [mode, setMode] = useState<PromptMode>(null);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEYS.installPromptSeen) || isStandalone()) return;
    const ua = navigator.userAgent;
    const iosDevice = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const ios = iosDevice && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    const android = /Android/.test(ua) && /Chrome\//.test(ua) && !/EdgA|OPR\/|SamsungBrowser/.test(ua);
    platform.current = ios ? "ios" : android ? "android" : null;
    if (!platform.current) return;
    let timer: number | undefined;
    const show = (next: PromptMode) => {
      if (localStorage.getItem(STORAGE_KEYS.installPromptSeen)) return;
      setMode(next);
      track("install_prompt_shown", { platform: next === "ios" ? "ios" : "android" });
    };
    const capture = (event: Event) => { event.preventDefault(); deferredPrompt.current = event as BeforeInstallPromptEvent; };
    const afterStory = () => {
      if (platform.current === "ios") show("ios");
      else if (deferredPrompt.current) show("android-native");
      else timer = window.setTimeout(() => show("android-manual"), 800);
    };
    const installed = () => {
      localStorage.setItem(STORAGE_KEYS.installPromptSeen, "true");
      setMode(null);
    };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("candor:story-completed", afterStory, { once: true });
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("candor:story-completed", afterStory);
      window.removeEventListener("appinstalled", installed);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEYS.installPromptSeen, "true");
    setMode(null);
  }, []);

  async function install() {
    if (!deferredPrompt.current) { setMode("android-manual"); return; }
    try {
      await deferredPrompt.current.prompt();
      await deferredPrompt.current.userChoice;
      deferredPrompt.current = null;
      dismiss();
    } catch { deferredPrompt.current = null; setMode("android-manual"); }
  }

  if (!mode) return null;
  const native = mode === "android-native";
  return <Modal className="install-modal" labelId="install-title" descriptionId="install-description" onDismiss={dismiss}>
      <div className="install-mark" aria-hidden="true">C</div>
      <h2 id="install-title">Keep Candor close</h2>
      <p id="install-description">{mode === "ios" ? "Tap the Share icon in Safari, then choose Add to Home Screen." : native ? "Install Candor for a focused, app-like daily read." : "Open Chrome’s menu, then tap Add to Home screen or Install app."}</p>
      {native ? <button className="primary-button" type="button" onClick={install}>Install Candor</button> : null}
      <button className="text-button install-dismiss" type="button" onClick={dismiss}>{native ? "Not now" : "Got it"}</button>
  </Modal>;
}

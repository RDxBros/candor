"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PLAY_TIME_ZONE_COOKIE, validPlayTimeZone } from "../../lib/play-release";

export function PlayTimeZoneGate({ serverTimeZone, children }: {
  serverTimeZone: string | null; children?: React.ReactNode;
}) {
  const router = useRouter();
  const [error, setError] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    function syncTimeZone() {
      const browserTimeZone = validPlayTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
      if (!browserTimeZone) { setError(true); return; }
      if (browserTimeZone === serverTimeZone) { setVerified(true); return; }
      setVerified(false);
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${PLAY_TIME_ZONE_COOKIE}=${encodeURIComponent(browserTimeZone)}; Path=/play; Max-Age=31536000; SameSite=Lax${secure}`;
      const stored = document.cookie.split("; ").find((part) => part.startsWith(`${PLAY_TIME_ZONE_COOKIE}=`))?.split("=")[1];
      if (validPlayTimeZone(stored) !== browserTimeZone) { setError(true); return; }
      router.refresh();
    }
    syncTimeZone();
    document.addEventListener("visibilitychange", syncTimeZone);
    return () => document.removeEventListener("visibilitychange", syncTimeZone);
  }, [router, serverTimeZone]);

  if (error) return <main id="main-content" style={{ maxWidth: 430, margin: "20vh auto", padding: 20 }}><h1>Unable to open this round</h1><p>Please allow this site to save its time zone and try again.</p></main>;
  if (!serverTimeZone || !verified) return <main id="main-content" aria-busy="true" style={{ maxWidth: 430, margin: "20vh auto", padding: 20 }}>Opening today’s round…</main>;
  return <>{children}</>;
}

"use client";

import { usePathname } from "next/navigation";
import { InstallPrompt } from "./install-prompt";

export function RouteInstallPrompt() {
  const pathname = usePathname();
  return pathname.startsWith("/play") ? null : <InstallPrompt />;
}

import type { Metadata, Viewport } from "next";
import { PwaRegister } from "../components/pwa-register";
import { AnonymousUserBootstrap } from "../components/anonymous-user-bootstrap";
import { InstallPrompt } from "../components/install-prompt";
import { AnalyticsBootstrap } from "../components/analytics-bootstrap";
import "./globals.css";

export const metadata: Metadata = {
  title: "Candor",
  description: "A focused daily news digest with clear source comparison.",
  manifest: "/manifest.webmanifest",
  applicationName: "Candor",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Candor"
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: "/icons/apple-touch-icon.png"
  },
  robots: process.env.NOINDEX === "0" ? { index: true, follow: true } : { index: false, follow: false, noarchive: true }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f7f4"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <AnonymousUserBootstrap />
        <AnalyticsBootstrap />
        <PwaRegister />
        <InstallPrompt />
        {children}
      </body>
    </html>
  );
}

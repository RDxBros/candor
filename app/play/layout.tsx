import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import styles from "./play.module.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz"],
  variable: "--font-play",
  fallback: ["Arial Rounded MT Bold", "Trebuchet MS", "Arial"],
  display: "swap"
});

export const metadata: Metadata = {
  title: "Spot the Lean | Candor",
  description: "One story. Three outlets."
};

export default function PlayLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={`${bricolage.variable} ${styles.playRoot}`}>{children}</div>;
}

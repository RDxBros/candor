import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import styles from "./play.module.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap"
});

export const metadata: Metadata = {
  title: "Spot the Lean | Candor",
  description: "One story. Three outlets. Can you spot the lean?"
};

export default function PlayLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={`${bricolage.className} ${styles.playRoot}`}>{children}</div>;
}

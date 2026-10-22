import Link from "next/link";
import { BadgesClient } from "../../../components/badges-client";
import { StreakBadge } from "../../../components/streak-badge";
import { HeaderMenu } from "../../../components/header-menu";

export default function BadgesPage() {
  return <main id="main-content" className="screen game-screen badge-screen">
    <header className="brand-header">
      <div className="brand-cluster"><Link className="wordmark" href="/">Candor</Link><StreakBadge /></div>
      <nav className="header-actions desktop-header-actions" aria-label="Game navigation">
        <Link className="text-action" href="/game/badges" aria-current="page">Badges</Link>
        <Link className="text-action" href="/game">Games</Link>
      </nav>
      <HeaderMenu />
    </header>
    <section className="game-page-intro">
      <p className="eyebrow">Your collection</p>
      <h1>Badges</h1>
      <p>Small milestones to prove the haters wrong</p>
    </section>
    <BadgesClient />
  </main>;
}

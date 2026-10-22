import Link from "next/link";
import { StreakBadge } from "../../components/streak-badge";
import { HeaderMenu } from "../../components/header-menu";
import { GameLogo } from "../../components/game-logo";
import { orderedGameCatalog } from "../../lib/game-catalog";

export default function GamesPage() {
  return (
    <main id="main-content" className="screen game-screen">
      <header className="brand-header">
        <div className="brand-cluster">
          <Link className="wordmark" href="/">Candor</Link>
          <StreakBadge />
        </div>
        <nav className="header-actions desktop-header-actions" aria-label="Game navigation">
          <Link className="text-action" href="/game/badges">Badges</Link>
        </nav>
        <HeaderMenu />
      </header>

      <section className="game-page-intro">
        <p className="eyebrow">Games</p>
        <h1>Side Quests</h1>
        <p>Put your media literacy to the test.</p>
      </section>
      <section className="game-portal" aria-labelledby="game-portal-heading">
        <h2 id="game-portal-heading" className="sr-only">Available games</h2>
        <div className="game-portal-grid">
          {orderedGameCatalog().map((game) => {
            const content = <>
              {game.accent === "lean" ? <span className="game-card-stripes" aria-hidden="true"><i /><i /><i /></span> : null}
              <span className="game-card-body">
                <span className="game-card-copy">
                  <span className="eyebrow">{game.statusLabel}</span>
                  <strong>{game.name}</strong>
                  <span className="game-card-description">{game.description}</span>
                </span>
                <span className="game-card-logo-wrap"><GameLogo gameId={game.id} /></span>
              </span>
            </>;
            return game.status === "available" && game.href
              ? <Link key={game.id} className="game-card game-card-live" href={game.href}>{content}</Link>
              : <div key={game.id} className="game-card game-card-soon" aria-disabled="true">{content}</div>;
          })}
        </div>
      </section>
    </main>
  );
}

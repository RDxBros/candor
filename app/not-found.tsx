import Link from "next/link";
import { HeaderMenu } from "../components/header-menu";

export default function NotFound() {
  return (
    <main className="screen">
      <header className="brand-header">
        <Link className="wordmark" href="/">Candor</Link>
        <nav className="header-actions desktop-header-actions" aria-label="Main navigation">
          <Link className="text-action" href="/game/badges">Badges</Link>
          <Link className="text-action" href="/game">Games</Link>
        </nav>
        <HeaderMenu />
      </header>
      <section className="centered-state">
        <h1>Story not found</h1>
        <p>The story may have moved or may not be part of this day’s digest.</p>
      </section>
    </main>
  );
}


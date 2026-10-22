import Link from "next/link";
import { OfflineDigestLink } from "../../components/offline-digest-link";
import { HeaderMenu } from "../../components/header-menu";

export default function OfflinePage() {
  return (
    <main id="main-content" className="screen">
      <header className="brand-header">
        <Link className="wordmark" href="/">Candor</Link>
        <nav className="header-actions desktop-header-actions" aria-label="Main navigation">
          <Link className="text-action" href="/game/badges">Badges</Link>
          <Link className="text-action" href="/game">Games</Link>
        </nav>
        <HeaderMenu />
      </header>
      <section className="centered-state">
        <h1>You’re offline</h1>
        <p>Stories you’ve already opened remain available. Reconnect to refresh today’s digest.</p>
        <OfflineDigestLink />
      </section>
    </main>
  );
}

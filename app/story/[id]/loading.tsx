import Link from "next/link";
import { HeaderMenu } from "../../../components/header-menu";

export default function StoryLoading() {
  return (
    <main id="main-content" className="screen story-screen" aria-busy="true" aria-label="Loading story">
      <header className="story-header">
        <span className="back-button">← <span>Digest</span></span>
        <nav className="header-actions desktop-header-actions" aria-label="Story navigation">
          <Link className="text-action" href="/game/badges">Badges</Link>
          <Link className="text-action" href="/game">Games</Link>
        </nav>
        <HeaderMenu />
      </header>
      <article className="story-article story-loading-shell">
        <div className="loading-line loading-label" />
        <div className="loading-line loading-title" />
        <div className="loading-line loading-title short" />
        <div className="loading-divider" />
        <div className="loading-line loading-copy" />
        <div className="loading-line loading-copy" />
        <div className="loading-line loading-copy short" />
      </article>
    </main>
  );
}

import Link from "next/link";
import { BackIcon } from "./app-icons";
import { StreakBadge } from "./streak-badge";
import { HeaderMenu } from "./header-menu";

export function StoryHeader({ digestHref, interestsHref }: { digestHref: string; interestsHref: string }) {
  return (
    <header className="story-header">
      <Link className="back-button" href={digestHref} aria-label="Back to daily digest">
        <BackIcon />
        <span>Digest</span>
      </Link>
      <div className="header-actions">
        <StreakBadge />
        <nav className="header-actions desktop-header-actions" aria-label="Story navigation">
          <Link className="text-action" href="/game/badges">Badges</Link>
          <Link className="text-action" href="/game">Games</Link>
        </nav>
        <HeaderMenu interestsHref={interestsHref} />
      </div>
    </header>
  );
}

import { InterestPicker } from "../components/interest-picker";
import Link from "next/link";
import { resolveContentDay } from "../lib/content-day";
import { HomeGate } from "../components/home-gate";
import { StreakBadge } from "../components/streak-badge";
import { HeaderMenu } from "../components/header-menu";

type SearchParams = Promise<{ day?: string | string[]; edit?: string | string[] }>;

export default async function InterestPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const requestedDay = Array.isArray(query.day) ? query.day[0] : query.day;
  const day = await resolveContentDay(requestedDay);
  const editing = (Array.isArray(query.edit) ? query.edit[0] : query.edit) === "1";
  const interestsHref = day === "day1" ? "/?edit=1" : `/?day=${day}&edit=1`;

  return (
    <HomeGate day={day} editing={editing}>
      <main id="main-content" className="screen interest-screen">
      <header className="brand-header">
        <div className="brand-cluster"><Link className="wordmark" href="/">Candor</Link><StreakBadge /></div>
        <nav className="header-actions desktop-header-actions" aria-label="Main navigation">
          <Link className="text-action" href="/game/badges">Badges</Link>
          <Link className="text-action" href="/game">Games</Link>
        </nav>
        <HeaderMenu interestsHref={interestsHref} />
      </header>
      <section className="intro-block">
        <h1>Build your feed</h1>
        <p>Choose at least two interests.</p>
      </section>
      <InterestPicker day={day} />
      </main>
    </HomeGate>
  );
}


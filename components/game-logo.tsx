type GameLogoProps = {
  gameId: string;
};

export function GameLogo({ gameId }: GameLogoProps) {
  if (gameId === "spot-the-lean") {
    return <svg className="game-logo" aria-hidden="true" focusable="false" viewBox="0 0 64 64">
      <rect x="14" y="13" width="36" height="38" rx="8" />
      <path d="M22 24h20M22 31h14M22 38h18" />
      <path className="game-logo-accent" d="m21 54-6-6m0 0h8M43 54l6-6m0 0h-8M32 7v8m0-8-4 4m4-4 4 4" />
    </svg>;
  }

  if (gameId === "fact-or-opinion") {
    return <svg className="game-logo" aria-hidden="true" focusable="false" viewBox="0 0 64 64">
      <path d="M18 43c-6 0-11-4.5-11-10s4-10 10-10c1-7 7-12 14-12 6 0 11 3 13 8 7 0 12 5 12 12 0 6-5 12-12 12H18Z" />
      <circle cx="18" cy="51" r="2.5" />
      <circle cx="11" cy="57" r="1.5" />
      <path className="game-logo-accent" d="M27 25a5 5 0 0 1 10 0c0 4-5 4-5 8" />
      <circle className="game-logo-question-dot" cx="32" cy="38.5" r="1.8" />
    </svg>;
  }

  return <svg className="game-logo" aria-hidden="true" focusable="false" viewBox="0 0 64 64">
    <circle cx="28" cy="28" r="16" />
    <path d="m40 40 13 13" />
    <path className="game-logo-accent" d="M22 22h12l-3 6 3 6H22l3-6-3-6Z" />
  </svg>;
}

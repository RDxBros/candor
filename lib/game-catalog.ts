export type GameCatalogItem = {
  id: string;
  name: string;
  description: string;
  href?: string;
  status: "available" | "coming_soon";
  statusLabel: string;
  level: number;
  accent?: "lean";
};

export const GAME_CATALOG: GameCatalogItem[] = [
  {
    id: "spot-the-lean",
    name: "Spot the Lean",
    description: "Can you identify the framing before the outlet is revealed?",
    href: "/game/spot-the-lean",
    status: "available",
    statusLabel: "Available now",
    level: 1,
    accent: "lean"
  },
  {
    id: "fact-or-opinion",
    name: "Fact or Opinion",
    description: "Sort sentences into facts and opinions.",
    href: "/game/fact-or-opinion",
    status: "available",
    statusLabel: "Available now",
    level: 2
  },
  {
    id: "clickbait-detector",
    name: "Clickbait Detector",
    description: "Prove your worth and call the bluff",
    status: "coming_soon",
    statusLabel: "Coming Soon!",
    level: 3
  }
];

export function orderedGameCatalog() {
  return [...GAME_CATALOG].sort((left, right) => left.level - right.level);
}

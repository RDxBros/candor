export type FlowCard = { storyId: string };

export function storySegment(cards: FlowCard[], index: number) {
  const current = cards[index];
  if (!current) return { start: index, end: index, position: 0, total: 0 };
  let start = index;
  let end = index;
  while (start > 0 && cards[start - 1].storyId === current.storyId) start -= 1;
  while (end + 1 < cards.length && cards[end + 1].storyId === current.storyId) end += 1;
  return { start, end, position: index - start, total: end - start + 1 };
}

export function automaticGuessTransition(cards: FlowCard[], index: number, reducedMotion: boolean) {
  const segment = storySegment(cards, index);
  const lastInStory = index === segment.end;
  return lastInStory
    ? { index: segment.start, phase: "reveal" as const, delay: reducedMotion ? 0 : 300 }
    : { index: index + 1, phase: "guess" as const, delay: 420 };
}

export function resumeLockedStory(cards: FlowCard[], index: number, isAnswered: (cardIndex: number) => boolean) {
  const segment = storySegment(cards, index);
  const allLocked = segment.total > 0 && Array.from({ length: segment.total }, (_, offset) => segment.start + offset).every(isAnswered);
  return allLocked ? { index: segment.start, phase: "reveal" as const } : { index, phase: "guess" as const };
}

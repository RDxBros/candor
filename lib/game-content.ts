type KeywordCandidate = {
  source_name: string;
  terms?: string[];
  explanation?: string;
};

export type GameContentIssue =
  | "missing-keyword-content"
  | "term-missing-from-source"
  | "term-missing-from-explanation"
  | "no-single-sentence-with-all-terms"
  | "snippet-is-not-verbatim"
  | "snippet-exceeds-40-words"
  | "snippet-leaks-outlet";

export type GameContentResult =
  | { ok: true; gameExcerpt: string; explanation: string; terms: string[] }
  | { ok: false; issue: GameContentIssue };

const MAX_SNIPPET_WORDS = 40;

function includesPhrase(text: string, phrase: string) {
  return text.toLocaleLowerCase().includes(phrase.toLocaleLowerCase());
}

function wordCount(text: string) {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

function sentences(text: string) {
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  return [...segmenter.segment(text)].map(({ segment }) => segment.trim()).filter(Boolean);
}

function leaksOutlet(text: string, outlet: string) {
  const normalizedOutlet = outlet.trim().toLocaleLowerCase();
  const leakPatterns = [
    normalizedOutlet,
    "told fox news digital",
    "(ap)",
    "associated press contributed",
    "reporting by ",
    "written by "
  ].filter(Boolean);
  return leakPatterns.some((pattern) => text.toLocaleLowerCase().includes(pattern));
}

export function resolveGameContent(input: {
  keyword: KeywordCandidate;
  outlet: string;
  sourceExcerpt: string;
  gameSnippet?: string;
}): GameContentResult {
  const explanation = input.keyword.explanation?.trim() ?? "";
  const terms = [...new Set((Array.isArray(input.keyword.terms) ? input.keyword.terms : [])
    .map((term) => term.trim()).filter(Boolean))];
  if (!explanation || !terms.length) return { ok: false, issue: "missing-keyword-content" };
  if (!terms.every((term) => includesPhrase(input.sourceExcerpt, term))) {
    return { ok: false, issue: "term-missing-from-source" };
  }
  if (!terms.every((term) => includesPhrase(explanation, term))) {
    return { ok: false, issue: "term-missing-from-explanation" };
  }

  let gameExcerpt = input.gameSnippet?.trim() ?? "";
  if (gameExcerpt) {
    if (!includesPhrase(input.sourceExcerpt, gameExcerpt)) {
      return { ok: false, issue: "snippet-is-not-verbatim" };
    }
    if (!terms.every((term) => includesPhrase(gameExcerpt, term))) {
      return { ok: false, issue: "no-single-sentence-with-all-terms" };
    }
  } else {
    gameExcerpt = sentences(input.sourceExcerpt).find((sentence) =>
      terms.every((term) => includesPhrase(sentence, term))) ?? "";
    if (!gameExcerpt) return { ok: false, issue: "no-single-sentence-with-all-terms" };
  }

  if (wordCount(gameExcerpt) > MAX_SNIPPET_WORDS) {
    return { ok: false, issue: "snippet-exceeds-40-words" };
  }
  if (leaksOutlet(gameExcerpt, input.outlet)) return { ok: false, issue: "snippet-leaks-outlet" };

  return { ok: true, gameExcerpt, explanation, terms };
}

export { MAX_SNIPPET_WORDS };

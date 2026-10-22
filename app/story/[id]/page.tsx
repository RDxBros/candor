import { notFound } from "next/navigation";
import { InfoTooltip } from "../../../components/info-tooltip";
import { CommentsSection } from "../../../components/comments-section";
import { StoryReadTracker } from "../../../components/story-read-tracker";
import { StoryHeader } from "../../../components/story-header";
import { BadgeToastHost, TrackedSourceLink } from "../../../components/tracked-source-link";
import { TrackedDetails } from "../../../components/tracked-details";
import { TrackedVisibleSection } from "../../../components/tracked-visible-section";
import { resolveGameContent } from "../../../lib/game-content";
import { minimumStoryTimeMs } from "../../../lib/reading-requirements";
import { getStory } from "../../../lib/stories";
import { parseSelectedTopics, topicLabel } from "../../../lib/topics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type StoryPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ day?: string | string[]; topics?: string | string[]; extra?: string | string[] }>;
};

const leanOrder: Record<string, number> = { left: 0, center: 1, right: 2 };

function leanLabel(value?: string) {
  const normalized = value?.toLowerCase();
  if (normalized === "left") return "Left";
  if (normalized === "center") return "Center";
  if (normalized === "right") return "Right";
  return "Source";
}

function sourceUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default async function StoryPage({ params, searchParams }: StoryPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const requestedDay = Array.isArray(query.day) ? query.day[0] : query.day;
  const selected = parseSelectedTopics(query.topics);
  const includeExtras = (Array.isArray(query.extra) ? query.extra[0] : query.extra) === "1";
  const { day, story } = await getStory(decodeURIComponent(id), requestedDay);
  if (!story) notFound();

  const digestParams = new URLSearchParams();
  if (selected.length) digestParams.set("topics", selected.join(","));
  if (day !== "day1") digestParams.set("day", day);
  if (includeExtras) digestParams.set("extra", "1");
  const digestHref = `/digest${digestParams.size ? `?${digestParams}` : ""}`;
  const interestsHref = day === "day1" ? "/?edit=1" : `/?day=${day}&edit=1`;
  const isNewsComparison = story.lean_comparison;
  const hasWhatsDifferentSection = isNewsComparison && Boolean(story.generated?.what_happened);
  const sources = [...story.sources].sort(
    (a, b) => (leanOrder[a.bias_label?.toLowerCase() ?? ""] ?? 3) - (leanOrder[b.bias_label?.toLowerCase() ?? ""] ?? 3)
  );
  const keywords = story.generated?.keywords ?? [];
  const gameSources = story.sources.flatMap((source) => {
    const normalizedBias = source.bias_label?.toLowerCase();
    const keyword = keywords.find((item) => item.source_name.trim().toLowerCase() === source.outlet.trim().toLowerCase());
    if ((normalizedBias !== "left" && normalizedBias !== "center" && normalizedBias !== "right") || !keyword?.terms.length) return [];
    const content = resolveGameContent({ keyword, outlet: source.outlet, sourceExcerpt: source.excerpt, gameSnippet: source.game_snippet });
    return content.ok ? [{ outlet: source.outlet }] : [];
  });
  const gameEnabled = isNewsComparison && story.game_eligible !== false && gameSources.length >= 2 &&
    new Set(gameSources.map((source) => source.outlet.toLowerCase())).size === gameSources.length;

  return (
    <main id="main-content" className="screen story-screen">
      <StoryHeader digestHref={digestHref} interestsHref={interestsHref} />

      <article className="story-article">
        <div className="story-heading">
          <span className="story-topic">{topicLabel(story.category)}</span>
          <h1>{story.headline}</h1>
        </div>

        <section className="summary-section" aria-labelledby="what-happened-heading">
          <h2 id="what-happened-heading">What happened</h2>
          {story.generated?.what_happened ? (
            <p>{story.generated.what_happened}</p>
          ) : (
            <div className="coming-soon" role="status">
              <strong>Content coming soon</strong>
              <span>This story is waiting for its generated summary.</span>
            </div>
          )}
        </section>

        {hasWhatsDifferentSection ? (
          <>
            <TrackedVisibleSection className="story-source-section" aria-labelledby="sources-heading" storyId={story.id} sectionName="sources">
              <div className="sources-heading-row">
                <h2 id="sources-heading">Sources</h2>
                <InfoTooltip label="About source lean labels">
                  Lean labels describe each outlet’s general editorial perspective. They do not judge whether an individual report is accurate.
                </InfoTooltip>
              </div>
              <div className="source-list">
                {sources.map((source) => {
                  const label = leanLabel(source.bias_label);
                  const url = sourceUrl(source.url);
                  return (
                    <div className="source-entry" key={source.source_id}>
                      <div className="source-meta">
                        <span className="lean-cluster">
                          <span className="lean-label" data-lean={label.toLowerCase()}>{label}</span>
                        </span>
                        <strong>{source.outlet}</strong>
                      </div>
                      {url ? (
                        <TrackedSourceLink href={url} outlet={source.outlet} storyId={story.id} sourceId={source.source_id} day={day} track />
                      ) : <span className="source-link-unavailable">Link not provided</span>}
                    </div>
                  );
                })}
              </div>
            </TrackedVisibleSection>

            <TrackedVisibleSection className="difference-section" aria-labelledby="difference-heading" storyId={story.id} sectionName="whats_different">
              <h2 id="difference-heading">What’s different</h2>
              {story.generated?.whats_different ? (
                <p>{story.generated.whats_different}</p>
              ) : (
                <p className="muted-copy">Comparison content is coming soon.</p>
              )}
            </TrackedVisibleSection>

          </>
        ) : story.generated?.what_happened ? (
          <TrackedDetails className="source-disclosure" storyId={story.id} section="sources">
            <summary>View Sources</summary>
            <div className="source-list">
              {sources.map((source) => {
                const url = sourceUrl(source.url);
                return (
                  <div className="source-entry" key={source.source_id}>
                    <div className="source-meta"><strong>{source.outlet}</strong></div>
                    {url ? (
                      <TrackedSourceLink href={url} outlet={source.outlet} storyId={story.id} sourceId={source.source_id} day={day} track={false} />
                    ) : <span className="source-link-unavailable">Link not provided</span>}
                  </div>
                );
              })}
            </div>
          </TrackedDetails>
        ) : null}

        <StoryReadTracker
          storyId={story.id}
          category={story.category}
          contentDay={day}
          digestHref={digestHref}
          minimumReadingTimeMs={minimumStoryTimeMs(hasWhatsDifferentSection)}
          gameHref={gameEnabled ? `/game/spot-the-lean?story=${encodeURIComponent(story.id)}&day=${encodeURIComponent(day)}` : undefined}
        >
          <CommentsSection storyId={story.id} />
        </StoryReadTracker>
      </article>
      <BadgeToastHost />
    </main>
  );
}


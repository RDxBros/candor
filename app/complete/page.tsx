import { CompletionClient } from "../../components/completion-client";
import { getStories } from "../../lib/stories";
import { parseSelectedTopics } from "../../lib/topics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SearchParams = Promise<{
  day?: string | string[];
  topics?: string | string[];
  extra?: string | string[];
}>;

export default async function CompletePage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const requestedDay = Array.isArray(query.day) ? query.day[0] : query.day;
  const selected = parseSelectedTopics(query.topics);
  const extrasAlreadyIncluded = (Array.isArray(query.extra) ? query.extra[0] : query.extra) === "1";
  const { day, stories } = await getStories(requestedDay);
  const selectedStories = stories.filter((story) => selected.includes(story.category));
  const extraStories = stories.filter((story) => !selected.includes(story.category)).slice(0, 5);
  const required = extrasAlreadyIncluded ? [...selectedStories, ...extraStories] : selectedStories;

  return (
    <CompletionClient
      day={day}
      topics={selected.join(",")}
      requiredStoryIds={required.map((story) => story.id)}
      extraCount={extraStories.length}
      extrasAlreadyIncluded={extrasAlreadyIncluded}
    />
  );
}

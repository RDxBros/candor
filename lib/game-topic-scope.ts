import { isTopicValue, type TopicValue } from "./topics.ts";

export type TopicScopedStory = { id: string; category: string };
export type TopicFallbackReason = "none" | "all_played" | null;

export function normalizeGameTopics(value: unknown): TopicValue[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((topic): topic is TopicValue => typeof topic === "string" && isTopicValue(topic)))];
}

export function filterStoriesForTopics<T extends TopicScopedStory>(stories: T[], selectedTopics: readonly TopicValue[], topicFallback = false) {
  if (!selectedTopics.length) return stories;
  const selected = new Set<string>(selectedTopics);
  return stories.filter((story) => topicFallback ? !selected.has(story.category) : selected.has(story.category));
}

export function scopeGameStories<T extends TopicScopedStory>(input: {
  stories: T[];
  selectedTopics: readonly TopicValue[];
  playedStoryIds: ReadonlySet<string>;
  mode: "scored" | "practice";
}) {
  const { stories, selectedTopics, playedStoryIds, mode } = input;
  if (!selectedTopics.length) return { stories, topicFallback: false, reason: null as TopicFallbackReason };
  const selected = new Set<string>(selectedTopics);
  const inTopics = stories.filter((story) => selected.has(story.category));
  const outsideTopics = stories.filter((story) => !selected.has(story.category));
  if (!inTopics.length) return { stories: outsideTopics, topicFallback: true, reason: "none" as const };
  if (mode === "scored" && !inTopics.some((story) => !playedStoryIds.has(story.id))) {
    return { stories: outsideTopics, topicFallback: true, reason: "all_played" as const };
  }
  return { stories: inTopics, topicFallback: false, reason: null as TopicFallbackReason };
}

export function topicFallbackNotice(reason: TopicFallbackReason) {
  if (reason === "none") return "None of your topics have a game yet. Here are some from other topics.";
  if (reason === "all_played") return "You've played every game story in your topics. Here are some from other topics.";
  return null;
}

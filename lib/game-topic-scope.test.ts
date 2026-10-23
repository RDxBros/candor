import assert from "node:assert/strict";
import test from "node:test";
import { filterStoriesForTopics, scopeGameStories, topicFallbackNotice } from "./game-topic-scope.ts";

const stories = [
  { id: "news-new", category: "news_&_society" },
  { id: "news-played", category: "news_&_society" },
  { id: "sports-new", category: "sports_&_gaming" }
];

test("topic scope includes only selected topics in scored and practice modes", () => {
  for (const mode of ["scored", "practice"] as const) {
    const result = scopeGameStories({ stories, selectedTopics: ["news_&_society"], playedStoryIds: new Set(["news-played"]), mode });
    assert.deepEqual(result.stories.map((story) => story.id), ["news-new", "news-played"]);
    assert.equal(result.topicFallback, false);
  }
});

test("no selected topics means all categories", () => {
  const result = scopeGameStories({ stories, selectedTopics: [], playedStoryIds: new Set(), mode: "scored" });
  assert.deepEqual(result.stories, stories);
  assert.equal(result.reason, null);
});

test("missing-topic and all-played fallbacks use other categories and exact notices", () => {
  const missing = scopeGameStories({ stories, selectedTopics: ["technology"], playedStoryIds: new Set(), mode: "scored" });
  assert.deepEqual(missing.stories, stories);
  assert.equal(topicFallbackNotice(missing.reason), "None of your topics have a game yet. Here are some from other topics.");
  const played = scopeGameStories({ stories, selectedTopics: ["news_&_society"], playedStoryIds: new Set(["news-new", "news-played"]), mode: "scored" });
  assert.deepEqual(played.stories.map((story) => story.id), ["sports-new"]);
  assert.equal(topicFallbackNotice(played.reason), "You've played every game story in your topics. Here are some from other topics.");
});

test("server topic filtering applies the selected or fallback side", () => {
  assert.deepEqual(filterStoriesForTopics(stories, ["news_&_society"]).map((story) => story.id), ["news-new", "news-played"]);
  assert.deepEqual(filterStoriesForTopics(stories, ["news_&_society"], true).map((story) => story.id), ["sports-new"]);
});

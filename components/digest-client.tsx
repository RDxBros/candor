"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { localDateKey, readReadingStats } from "../lib/client-storage";
import { topicLabel, type TopicValue } from "../lib/topics";
import { ArrowIcon } from "./app-icons";
import { track } from "../lib/analytics";

export type DigestStory = {
  id: string;
  headline: string;
  category: TopicValue;
};

type DigestClientProps = {
  day: string;
  selected: TopicValue[];
  stories: DigestStory[];
  extraStories: DigestStory[];
  includeExtras: boolean;
};

export function DigestClient({ day, selected, stories, extraStories, includeExtras }: DigestClientProps) {
  const router = useRouter();
  const [activeTopics, setActiveTopics] = useState<TopicValue[]>(selected);
  const [readIds, setReadIds] = useState<string[]>([]);
  const currentStories = includeExtras ? [...stories, ...extraStories] : stories;

  const digestParams = new URLSearchParams({ topics: selected.join(",") });
  if (day !== "day1") digestParams.set("day", day);
  if (includeExtras) digestParams.set("extra", "1");
  const digestHref = `/digest?${digestParams.toString()}`;
  const filterStorageKey = `candor:digest-filters:${digestHref}`;
  const scrollStorageKey = `candor:digest-scroll:${digestHref}`;

  function storyHref(storyId: string) {
    return `/story/${encodeURIComponent(storyId)}?${digestParams.toString()}`;
  }

  useLayoutEffect(() => {
    const refresh = () => setReadIds(readReadingStats().readByDate[localDateKey()] ?? []);
    refresh();
    try {
      const saved = JSON.parse(sessionStorage.getItem(filterStorageKey) ?? "null");
      if (Array.isArray(saved)) {
        setActiveTopics(saved.filter((topic): topic is TopicValue => selected.includes(topic)));
      }
    } catch { /* Ignore stale session data. */ }

    const savedScroll = Number(sessionStorage.getItem(scrollStorageKey));
    const frame = Number.isFinite(savedScroll) && savedScroll > 0
      ? window.requestAnimationFrame(() => window.scrollTo(0, savedScroll))
      : undefined;

    window.addEventListener("candor:reading-updated", refresh);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("candor:reading-updated", refresh);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [filterStorageKey, scrollStorageKey, selected]);

  useEffect(() => {
    currentStories.slice(0, 5).forEach((story) => router.prefetch(storyHref(story.id)));
    localStorage.setItem("candor:last-digest-url", digestHref);
  }, []); // Restore this visit and warm likely destinations once.

  const readCount = currentStories.filter((story) => readIds.includes(story.id)).length;

  const visible = useMemo(
    () => [
      ...stories.filter((story) => activeTopics.includes(story.category)),
      ...(includeExtras ? extraStories : [])
    ],
    [activeTopics, extraStories, includeExtras, stories]
  );

  function toggleTopic(topic: TopicValue) {
    track("filter_used", { category: topic });
    setActiveTopics((current) => {
      const next = current.includes(topic) ? current.filter((item) => item !== topic) : [...current, topic];
      sessionStorage.setItem(filterStorageKey, JSON.stringify(next));
      return next;
    });
  }

  function rememberDigest() {
    sessionStorage.setItem(scrollStorageKey, String(window.scrollY));
    sessionStorage.setItem("candor:digest-return", digestHref);
    sessionStorage.setItem("candor:digest-context", JSON.stringify({
      digestHref,
      stories: currentStories.map((story) => ({ id: story.id, headline: story.headline, href: storyHref(story.id) }))
    }));
  }

  return (
    <>
      <div className="digest-tools">
        <div className="filter-chips" aria-label="Filter stories by category">
          {selected.map((topic) => {
            const active = activeTopics.includes(topic);
            return (
              <button
                type="button"
                className="filter-chip"
                data-active={active}
                aria-pressed={active}
                onClick={() => toggleTopic(topic)}
                key={topic}
              >
                {topicLabel(topic)}
              </button>
            );
          })}
        </div>
        <div className="reading-progress" aria-label={`${readCount} of ${currentStories.length} stories read`}>
          <div className="progress-copy">
            <span>Today’s progress</span>
            <strong>{readCount}/{currentStories.length}</strong>
          </div>
          <div className="progress-track" aria-hidden="true">
            <span style={{ width: `${currentStories.length ? (readCount / currentStories.length) * 100 : 0}%` }} />
          </div>
        </div>
      </div>

      {includeExtras && extraStories.length ? <p className="extra-note">Your five optional stories are included below.</p> : null}

      {visible.length ? (
        <ul className="story-list">
          {visible.map((story) => {
            const read = readIds.includes(story.id);
            return (
              <li key={`${story.category}-${story.id}`}>
                <Link
                  className="story-row"
                  data-read={read}
                  href={storyHref(story.id)}
                  onClick={rememberDigest}
                >
                  <span className="story-topic">{topicLabel(story.category)}</span>
                  <h2>{story.headline}</h2>
                  <span className="story-status" aria-label={read ? "Read" : "Unread"}>{read ? "Read" : <ArrowIcon />}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <section className="empty-state compact-empty">
          <h2>No filters selected</h2>
          <p>Tap a category above to bring its stories back.</p>
        </section>
      )}
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TOPIC_OPTIONS, type TopicValue } from "../lib/topics";
import { STORAGE_KEYS } from "../lib/client-storage";
import { track } from "../lib/analytics";

export function InterestPicker({ day }: { day: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<TopicValue[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    track("screen_viewed", { screen: "onboarding" });
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.topics) ?? "[]") as string[];
      const valid = TOPIC_OPTIONS.filter((topic) => saved.includes(topic.value)).map(
        (topic) => topic.value
      );
      setSelected(valid);
    } catch {
      localStorage.removeItem(STORAGE_KEYS.topics);
    } finally {
      setHydrated(true);
    }
  }, []);

  function toggle(topic: TopicValue) {
    setSelected((current) =>
      current.includes(topic) ? current.filter((item) => item !== topic) : [...current, topic]
    );
  }

  function continueToDigest() {
    if (selected.length < 2) return;
    localStorage.setItem(STORAGE_KEYS.topics, JSON.stringify(selected));
    const query = new URLSearchParams({ topics: selected.join(",") });
    if (day !== "day1") query.set("day", day);
    router.push(`/digest?${query.toString()}`);
  }

  return (
    <div className="interest-picker">
      <div className="topic-options" role="group" aria-label="News interests">
        {TOPIC_OPTIONS.map((topic) => {
          const active = selected.includes(topic.value);
          return (
            <button
              className="topic-option"
              data-selected={active}
              type="button"
              key={topic.value}
              aria-pressed={active}
              onClick={() => toggle(topic.value)}
            >
              <span>{topic.label}</span>
              <span className="selection-mark" aria-hidden="true">
                {active ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg> : ""}
              </span>
            </button>
          );
        })}
      </div>

      <div className="selection-footer">
        <p aria-live="polite">
          {selected.length < 2
            ? `Choose ${2 - selected.length} more to continue`
            : `${selected.length} interests selected`}
        </p>
        <button
          className="primary-button"
          type="button"
          disabled={!hydrated || selected.length < 2}
          onClick={continueToDigest}
        >
          Get started
        </button>
      </div>
    </div>
  );
}


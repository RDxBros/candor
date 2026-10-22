export const TOPIC_OPTIONS = [
  { value: "culture_&_entertainment", label: "Culture & entertainment" },
  { value: "life_&_wellness", label: "Life & wellness" },
  { value: "money_&_career", label: "Money & career" },
  { value: "news_&_society", label: "News & society" },
  { value: "sports_&_gaming", label: "Sports & gaming" },
  { value: "technology", label: "Technology" }
] as const;

export type TopicValue = (typeof TOPIC_OPTIONS)[number]["value"];

const topicValues = new Set<string>(TOPIC_OPTIONS.map((topic) => topic.value));

export function isTopicValue(value: string): value is TopicValue {
  return topicValues.has(value);
}

export function topicLabel(value: string) {
  return TOPIC_OPTIONS.find((topic) => topic.value === value)?.label ?? humanize(value);
}

export function humanize(value: string) {
  const label = value.replaceAll("_", " ").replaceAll("&", "&").trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function parseSelectedTopics(value: string | string[] | undefined): TopicValue[] {
  const raw = Array.isArray(value) ? value.join(",") : value ?? "";
  return [...new Set(raw.split(",").map((topic) => topic.trim()).filter(isTopicValue))];
}


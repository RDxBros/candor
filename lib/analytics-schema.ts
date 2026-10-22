export const ANALYTICS_EVENT_NAMES = [
  "landing_viewed", "app_opened", "screen_viewed", "story_opened", "story_left",
  "story_completed", "section_opened", "section_visible", "filter_used", "extend_tapped", "round_selected",
  "game_started", "game_completed", "badge_earned", "comment_posted", "comment_flagged",
  "install_prompt_shown", "error_shown", "app_backgrounded"
] as const;

export type AnalyticsEventName = typeof ANALYTICS_EVENT_NAMES[number];
type Rule = { required?: boolean; validate: (value: unknown) => boolean };
type Schema = Record<string, Rule>;

const short = (max = 200): Rule => ({ validate: (v) => typeof v === "string" && v.length > 0 && v.length <= max });
const oneOf = (...values: string[]): Rule => ({ validate: (v) => typeof v === "string" && values.includes(v) });
const bool: Rule = { validate: (v) => typeof v === "boolean" };
const integer = (max = Number.MAX_SAFE_INTEGER): Rule => ({ validate: (v) => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= max });
const required = (rule: Rule): Rule => ({ ...rule, required: true });

export const ANALYTICS_SCHEMAS: Record<AnalyticsEventName, Schema> = {
  landing_viewed: {},
  app_opened: { content_day: required(short(20)), display_mode: required(oneOf("browser", "standalone")), source: required(oneOf("reminder", "direct")) },
  screen_viewed: { screen: required(oneOf("landing", "onboarding", "digest", "story", "caught_up", "games_hub", "game_home", "game_picker", "game_round", "game_result", "badges", "menu")), game_type: oneOf("lean_guess", "fact_opinion") },
  story_opened: { story_id: required(short()), category: required(short(80)), content_day: required(short(20)) },
  story_left: { story_id: required(short()), active_seconds: required(integer(86_400)), reached_bottom: required(bool), completed: required(bool), exit_to: required(oneOf("digest", "next", "other")) },
  story_completed: { story_id: required(short()), active_seconds: required(integer(86_400)), content_day: required(short(20)) },
  section_opened: { story_id: required(short()), section: required(oneOf("sources", "whats_different")) },
  section_visible: { story_id: required(short()), section: required(oneOf("sources", "whats_different")) },
  filter_used: { category: required(short(80)) },
  extend_tapped: { confirmed: required(bool) },
  round_selected: { game_type: required(oneOf("lean_guess", "fact_opinion")), story_id: required(short()), mode: required(oneOf("scored", "practice")) },
  game_started: { game_type: required(oneOf("lean_guess", "fact_opinion")), mode: required(oneOf("scored", "practice")) },
  game_completed: { game_type: required(oneOf("lean_guess", "fact_opinion")), mode: required(oneOf("scored", "practice")), answers_count: required(integer(100)), correct_count: required(integer(100)), duration_ms: required(integer(86_400_000)), moves: integer(10_000) },
  badge_earned: { badge_id: required(short(80)) },
  comment_posted: { story_id: required(short()) },
  comment_flagged: { story_id: required(short()) },
  install_prompt_shown: { platform: required(oneOf("ios", "android")) },
  error_shown: { error_type: required(oneOf("load_failed", "save_failed", "network", "unknown")), screen: required(oneOf("landing", "onboarding", "digest", "story", "caught_up", "games_hub", "game_home", "game_picker", "game_round", "game_result", "badges", "menu")) },
  app_backgrounded: { active_ms: required(integer(86_400_000)) }
};

export type AnalyticsValidationMode = "strict" | "sanitize";
export type AnalyticsValidationResult =
  | { ok: true; properties: Record<string, string | number | boolean>; droppedKeys: string[] }
  | { ok: false; error: "unknown_event" | "invalid_properties"; key?: string };

export function validateAnalyticsProperties(eventName: string, input: unknown, mode: AnalyticsValidationMode): AnalyticsValidationResult {
  if (!(ANALYTICS_EVENT_NAMES as readonly string[]).includes(eventName)) return { ok: false, error: "unknown_event" };
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "invalid_properties" };
  const schema = ANALYTICS_SCHEMAS[eventName as AnalyticsEventName];
  const properties = input as Record<string, unknown>;
  const accepted: Record<string, string | number | boolean> = {};
  const droppedKeys: string[] = [];

  for (const [key, value] of Object.entries(properties)) {
    const rule = schema[key];
    if (!rule || !rule.validate(value)) {
      if (mode === "strict") return { ok: false, error: "invalid_properties", key };
      droppedKeys.push(key);
      continue;
    }
    accepted[key] = value as string | number | boolean;
  }
  for (const [key, rule] of Object.entries(schema)) {
    if (rule.required && !(key in properties)) return { ok: false, error: "invalid_properties", key };
  }
  return { ok: true, properties: accepted, droppedKeys };
}

export function prepareAnalyticsProperties(
  eventName: string,
  input: unknown,
  environment: "development" | "test" | "production",
  warn: (eventName: string, key: string) => void = () => undefined
) {
  const result = validateAnalyticsProperties(eventName, input, environment === "production" ? "sanitize" : "strict");
  if (result.ok && environment === "production") result.droppedKeys.forEach((key) => warn(eventName, key));
  return result;
}


import { supabaseRequest } from "./supabase-server";

const FREEZE_INTERVAL_MS = 90 * 24 * 60 * 60 * 1000;

export type UserRecord = {
  anonymous_id: string;
  streak_count: number;
  last_read_date: string | null;
  total_stories_read: number;
  game_correct_count: number;
  game_total_count: number;
  freezes_available: number;
  freezes_used_total: number;
  freezes_granted_total: number;
  created_at: string;
};

const USER_FIELDS = [
  "anonymous_id",
  "streak_count",
  "last_read_date",
  "total_stories_read",
  "game_correct_count",
  "game_total_count",
  "freezes_available",
  "freezes_used_total",
  "freezes_granted_total",
  "created_at"
].join(",");

export async function getUserRecord(anonymousId: string) {
  const query = new URLSearchParams({
    anonymous_id: `eq.${anonymousId}`,
    select: USER_FIELDS,
    limit: "1"
  });
  const [user] = await supabaseRequest<UserRecord[]>(`/rest/v1/users?${query}`);
  return user ?? null;
}

export async function refreshFreezeEntitlement(user: UserRecord) {
  const accountAge = Math.max(0, Date.now() - new Date(user.created_at).getTime());
  const earnedPeriods = Math.floor(accountAge / FREEZE_INTERVAL_MS);
  const newlyEarned = Math.max(0, earnedPeriods - user.freezes_granted_total);
  const freezesAvailable = Math.min(3, user.freezes_available + newlyEarned);
  if (newlyEarned === 0) return user;

  const query = new URLSearchParams({ anonymous_id: `eq.${user.anonymous_id}` });
  const [updated] = await supabaseRequest<UserRecord[]>(`/rest/v1/users?${query}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ freezes_available: freezesAvailable, freezes_granted_total: earnedPeriods })
  });
  return updated ?? { ...user, freezes_available: freezesAvailable, freezes_granted_total: earnedPeriods };
}

export async function readRefreshedUser(anonymousId: string) {
  const user = await getUserRecord(anonymousId);
  return user ? refreshFreezeEntitlement(user) : null;
}

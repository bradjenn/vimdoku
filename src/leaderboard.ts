import type { GameRecord } from './storage';

export const PLAYER_NAME_KEY = 'vimdoku-player-name-v1';

export type LeaderboardEntry = {
  completedAt: string;
  difficulty?: string;
  elapsedMs: number;
  id: string;
  player: string;
  puzzle: string;
  source: string;
};

const LEADERBOARD_ENDPOINT = import.meta.env.VITE_LEADERBOARD_ENDPOINT as
  | string
  | undefined;

export function hasGlobalLeaderboard() {
  return Boolean(LEADERBOARD_ENDPOINT);
}

export async function fetchGlobalLeaderboard() {
  if (!LEADERBOARD_ENDPOINT) {
    throw new Error('No global leaderboard endpoint is configured.');
  }

  const response = await fetch(LEADERBOARD_ENDPOINT);
  if (!response.ok) throw new Error(`Leaderboard request failed: ${response.status}`);
  const payload = await response.json();
  const entries: LeaderboardEntry[] = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.scores)
      ? payload.scores
      : [];

  return entries
    .map(normalizeEntry)
    .filter((entry): entry is LeaderboardEntry => Boolean(entry))
    .slice(0, 50);
}

export async function submitGlobalScore(record: GameRecord) {
  if (!LEADERBOARD_ENDPOINT || record.status !== 'completed') return;

  await fetch(LEADERBOARD_ENDPOINT, {
    body: JSON.stringify({
      completedAt: record.completedAt ?? record.updatedAt,
      difficulty: record.difficulty,
      elapsedMs: record.elapsedMs,
      id: record.id,
      player: localStorage.getItem(PLAYER_NAME_KEY) || 'anonymous',
      puzzle: record.puzzle,
      source: record.source,
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}

function normalizeEntry(entry: LeaderboardEntry): LeaderboardEntry | null {
  if (!entry.id || !entry.puzzle || !Number.isFinite(entry.elapsedMs)) return null;
  return {
    completedAt: String(entry.completedAt ?? ''),
    difficulty: entry.difficulty ? String(entry.difficulty) : undefined,
    elapsedMs: Math.max(0, Math.floor(entry.elapsedMs)),
    id: String(entry.id),
    player: String(entry.player || 'anonymous'),
    puzzle: String(entry.puzzle),
    source: String(entry.source || 'unknown'),
  };
}

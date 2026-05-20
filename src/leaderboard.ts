import { sanitizePlayMode, type PlayMode } from './playModes';
import type { GameRecord } from './storage';
import type { PuzzleSize } from './sudoku';
import { sanitizeVariantId, type VariantId } from './variants';

export const PLAYER_NAME_KEY = 'vimdoku-player-name-v1';

export type LeaderboardEntry = {
  completedAt: string;
  difficulty?: string;
  elapsedMs: number;
  id: string;
  player: string;
  playMode?: PlayMode;
  puzzle: string;
  puzzleSize?: PuzzleSize;
  source: string;
  variantId?: VariantId;
};

const LEADERBOARD_ENDPOINT = import.meta.env.VITE_LEADERBOARD_ENDPOINT as
  | string
  | undefined;

export function hasGlobalLeaderboard() {
  return Boolean(LEADERBOARD_ENDPOINT);
}

export async function fetchGlobalLeaderboard(
  puzzleSize: PuzzleSize = '9x9',
  playMode: PlayMode = 'classic',
  variantId: VariantId = 'classic',
) {
  if (!LEADERBOARD_ENDPOINT) {
    throw new Error('No global leaderboard endpoint is configured.');
  }

  const url = new URL(LEADERBOARD_ENDPOINT);
  url.searchParams.set('puzzleSize', puzzleSize);
  url.searchParams.set('playMode', playMode);
  url.searchParams.set('variantId', variantId);
  const response = await fetch(url);
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
    .filter((entry) => leaderboardEntryMatches(entry, puzzleSize, playMode, variantId))
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
      playMode: record.playMode,
      puzzle: record.puzzle,
      puzzleSize: record.puzzleSize,
      source: record.source,
      variantId: record.variantId,
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
    playMode: sanitizePlayMode(entry.playMode),
    puzzle: String(entry.puzzle),
    puzzleSize: entry.puzzleSize === '6x6' ? '6x6' : '9x9',
    source: String(entry.source || 'unknown'),
    variantId: sanitizeVariantId(entry.variantId),
  };
}

export function leaderboardEntryMatches(
  entry: LeaderboardEntry,
  puzzleSize: PuzzleSize,
  playMode: PlayMode,
  variantId: VariantId,
) {
  return (
    (entry.puzzleSize ?? '9x9') === puzzleSize &&
    (entry.playMode ?? 'classic') === playMode &&
    (entry.variantId ?? 'classic') === variantId
  );
}

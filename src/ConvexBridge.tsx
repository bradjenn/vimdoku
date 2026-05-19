import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import type { FunctionReference } from 'convex/server';
import type { LeaderboardEntry } from './leaderboard';
import type { PlayMode } from './playModes';
import type { GameRecord } from './storage';
import type { PuzzleSize } from './sudoku';
import { getOrCreateGuestId } from './identity';

export type CloudProfile = {
  anonId: string;
  createdAt: string;
  name: string;
  updatedAt: string;
};

export type CloudStats = {
  averageElapsedMs?: number;
  bestElapsedMs?: number;
  completedCount: number;
  currentStreak: number;
  inProgressCount: number;
  lastCompletedAt?: string;
  syncedGames: number;
};

type SubmitScoreArgs = {
  anonId: string;
  completedAt: string;
  difficulty?: string;
  elapsedMs: number;
  player: string;
  playMode?: PlayMode;
  puzzle: string;
  puzzleSize?: PuzzleSize;
  recordId: string;
  source: string;
};

type UpsertGameArgs = {
  anonId: string;
  completedAt?: string;
  completion: number;
  difficulty?: string;
  elapsedMs: number;
  givens: boolean[];
  grid: number[];
  notes: number[][];
  playMode?: PlayMode;
  puzzle: string;
  puzzleSize?: PuzzleSize;
  recordId: string;
  source: string;
  status: 'in-progress' | 'completed';
  updatedAt: string;
};

const topScoresRef = makeFunctionReference<
  'query',
  { limit?: number; playMode?: PlayMode; puzzleSize?: PuzzleSize },
  LeaderboardEntry[]
>('leaderboards:top');

const submitScoreRef = makeFunctionReference<'mutation', SubmitScoreArgs, string>(
  'leaderboards:submitScore',
);

const upsertProfileRef = makeFunctionReference<
  'mutation',
  { anonId: string; name: string },
  string
>('profiles:upsert');

const currentProfileRef = makeFunctionReference<
  'query',
  { anonId: string },
  CloudProfile | null
>('profiles:current');

const upsertGameRef = makeFunctionReference<'mutation', UpsertGameArgs, string>(
  'games:upsert',
);

const statsRef = makeFunctionReference<'query', { anonId: string }, CloudStats>(
  'games:stats',
);

export function ConvexBridge({
  currentRecord,
  gameRecords,
  leaderboardOpen,
  leaderboardMode,
  leaderboardSize,
  onProfile,
  onScores,
  onStats,
  onStatus,
  playerName,
  scoreRecordId,
  scoreSubmissionsEnabled,
}: {
  currentRecord: GameRecord;
  gameRecords: GameRecord[];
  leaderboardOpen: boolean;
  leaderboardMode: PlayMode;
  leaderboardSize: PuzzleSize;
  onProfile: (profile: CloudProfile | null) => void;
  onScores: (scores: LeaderboardEntry[]) => void;
  onStats: (stats: CloudStats | null) => void;
  onStatus: (status: string) => void;
  playerName: string;
  scoreRecordId: string | null;
  scoreSubmissionsEnabled: boolean;
}) {
  const anonId = useMemo(() => getOrCreateGuestId(), []);
  const submittedIds = useRef(new Set<string>());
  const syncedGameIds = useRef(new Set<string>());
  const lastGameSyncAt = useRef(0);
  const topScores = useQuery(
    topScoresRef as FunctionReference<'query'>,
    leaderboardOpen
      ? { limit: 50, playMode: leaderboardMode, puzzleSize: leaderboardSize }
      : 'skip',
  ) as LeaderboardEntry[] | undefined;
  const profile = useQuery(
    currentProfileRef as FunctionReference<'query'>,
    { anonId },
  ) as CloudProfile | null | undefined;
  const stats = useQuery(statsRef as FunctionReference<'query'>, { anonId }) as
    | CloudStats
    | undefined;
  const submitScore = useMutation(
    submitScoreRef as FunctionReference<'mutation'>,
  ) as (args: SubmitScoreArgs) => Promise<string>;
  const upsertProfile = useMutation(
    upsertProfileRef as FunctionReference<'mutation'>,
  ) as (args: { anonId: string; name: string }) => Promise<string>;
  const upsertGame = useMutation(
    upsertGameRef as FunctionReference<'mutation'>,
  ) as (args: UpsertGameArgs) => Promise<string>;

  useEffect(() => {
    void upsertProfile({ anonId, name: playerName }).catch(() => {
      onStatus('Could not sync Convex profile.');
    });
  }, [anonId, onStatus, playerName, upsertProfile]);

  useEffect(() => {
    if (profile === undefined) return;
    onProfile(profile);
  }, [onProfile, profile]);

  useEffect(() => {
    if (!stats) return;
    onStats(stats);
  }, [onStats, stats]);

  useEffect(() => {
    if (!topScores) return;
    onScores(topScores);
    onStatus('Live Convex leaderboard.');
  }, [onScores, onStatus, topScores]);

  useEffect(() => {
    const now = Date.now();
    const isFinal = currentRecord.status === 'completed';
    if (!isFinal && now - lastGameSyncAt.current < 15000) return;
    lastGameSyncAt.current = now;

    void upsertGame(toGameArgs(currentRecord, anonId)).catch(() => {
      onStatus('Could not sync current game to Convex.');
    });
  }, [anonId, currentRecord, onStatus, upsertGame]);

  useEffect(() => {
    const recordsToSync = gameRecords
      .filter((record) => !syncedGameIds.current.has(syncKey(record)))
      .slice(0, 8);
    if (recordsToSync.length === 0) return;

    for (const record of recordsToSync) {
      syncedGameIds.current.add(syncKey(record));
      void upsertGame(toGameArgs(record, anonId)).catch(() => {
        syncedGameIds.current.delete(syncKey(record));
        onStatus('Could not backfill game history to Convex.');
      });
    }
  }, [anonId, gameRecords, onStatus, upsertGame]);

  useEffect(() => {
    if (!scoreSubmissionsEnabled) return;
    if (currentRecord.status !== 'completed') return;
    if (scoreRecordId !== currentRecord.id) return;
    if (submittedIds.current.has(currentRecord.id)) return;
    submittedIds.current.add(currentRecord.id);

    void submitScore(toScoreArgs(currentRecord, anonId, playerName)).catch(() => {
      submittedIds.current.delete(currentRecord.id);
      onStatus('Could not submit Convex score.');
    });
  }, [
    anonId,
    currentRecord,
    onStatus,
    playerName,
    scoreRecordId,
    scoreSubmissionsEnabled,
    submitScore,
  ]);

  return null;
}

function syncKey(record: GameRecord) {
  return `${record.id}:${record.status}:${record.updatedAt}:${record.elapsedMs}`;
}

function toGameArgs(record: GameRecord, anonId: string): UpsertGameArgs {
  return {
    anonId,
    completedAt: record.completedAt,
    completion: record.completion,
    difficulty: record.difficulty,
    elapsedMs: record.elapsedMs,
    givens: record.givens,
    grid: record.grid,
    notes: record.notes,
    playMode: record.playMode,
    puzzle: record.puzzle,
    puzzleSize: record.puzzleSize,
    recordId: record.id,
    source: record.source,
    status: record.status,
    updatedAt: record.updatedAt,
  };
}

function toScoreArgs(
  record: GameRecord,
  anonId: string,
  playerName: string,
): SubmitScoreArgs {
  return {
    anonId,
    completedAt: record.completedAt ?? record.updatedAt,
    difficulty: record.difficulty,
    elapsedMs: record.elapsedMs,
    player: playerName,
    playMode: record.playMode,
    puzzle: record.puzzle,
    puzzleSize: record.puzzleSize,
    recordId: record.id,
    source: record.source,
  };
}

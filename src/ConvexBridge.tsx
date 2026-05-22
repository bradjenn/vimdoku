import { useEffect, useRef } from 'react';
import { useConvexAuth } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import type { FunctionReference } from 'convex/server';
import type { LeaderboardEntry } from './leaderboard';
import type { PlayMode } from './playModes';
import type { GameRecord } from './storage';
import type { PuzzleSize } from './sudoku';
import type { VariantId } from './variants';

export type CloudProfile = {
  anonId: string;
  authSubject?: string;
  createdAt: string;
  friendCode?: string;
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
  variantId?: VariantId;
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
  cornerMarks: number[][];
  cellColors: Array<number | null>;
  playMode?: PlayMode;
  puzzle: string;
  puzzleSize?: PuzzleSize;
  recordId: string;
  source: string;
  status: 'in-progress' | 'completed';
  updatedAt: string;
  variantId?: VariantId;
};

const topScoresRef = makeFunctionReference<
  'query',
  { limit?: number; playMode?: PlayMode; puzzleSize?: PuzzleSize; variantId?: VariantId },
  LeaderboardEntry[]
>('leaderboards:top');

const submitScoreRef = makeFunctionReference<'mutation', SubmitScoreArgs, string>(
  'leaderboards:submitScore',
);

const claimGuestProfileRef = makeFunctionReference<
  'mutation',
  { anonId: string; name: string },
  CloudProfile | null
>('profiles:claimGuest');

const currentSessionProfileRef = makeFunctionReference<
  'query',
  Record<string, never>,
  CloudProfile | null
>('profiles:currentForSession');

const upsertGameRef = makeFunctionReference<'mutation', UpsertGameArgs, string>(
  'games:upsert',
);

const statsRef = makeFunctionReference<'query', { anonId: string }, CloudStats>(
  'games:stats',
);

export function ConvexBridge({
  currentRecord,
  gameRecords,
  guestId,
  leaderboardOpen,
  leaderboardMode,
  leaderboardSize,
  leaderboardVariant,
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
  guestId: string;
  leaderboardOpen: boolean;
  leaderboardMode: PlayMode;
  leaderboardSize: PuzzleSize;
  leaderboardVariant: VariantId;
  onProfile: (profile: CloudProfile | null) => void;
  onScores: (scores: LeaderboardEntry[]) => void;
  onStats: (stats: CloudStats | null) => void;
  onStatus: (status: string) => void;
  playerName: string;
  scoreRecordId: string | null;
  scoreSubmissionsEnabled: boolean;
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const submittedIds = useRef(new Set<string>());
  const syncedGameIds = useRef(new Set<string>());
  const lastGameSyncAt = useRef(0);
  const topScores = useQuery(
    topScoresRef as FunctionReference<'query'>,
    leaderboardOpen
      ? {
          limit: 50,
          playMode: leaderboardMode,
          puzzleSize: leaderboardSize,
          variantId: leaderboardVariant,
        }
      : 'skip',
  ) as LeaderboardEntry[] | undefined;
  const sessionProfile = useQuery(
    currentSessionProfileRef as FunctionReference<'query'>,
    isAuthenticated ? {} : 'skip',
  ) as CloudProfile | null | undefined;
  const activeProfile = isAuthenticated ? sessionProfile : null;
  const anonId = activeProfile?.anonId ?? guestId;
  const cloudSyncEnabled = isAuthenticated && Boolean(activeProfile?.authSubject);
  const stats = useQuery(
    statsRef as FunctionReference<'query'>,
    cloudSyncEnabled ? { anonId } : 'skip',
  ) as CloudStats | undefined;
  const submitScore = useMutation(
    submitScoreRef as FunctionReference<'mutation'>,
  ) as (args: SubmitScoreArgs) => Promise<string>;
  const claimGuestProfile = useMutation(
    claimGuestProfileRef as FunctionReference<'mutation'>,
  ) as (args: { anonId: string; name: string }) => Promise<CloudProfile | null>;
  const upsertGame = useMutation(
    upsertGameRef as FunctionReference<'mutation'>,
  ) as (args: UpsertGameArgs) => Promise<string>;

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) return;
    void claimGuestProfile({ anonId: guestId, name: playerName }).catch(() => {
      onStatus('Could not sync Convex profile.');
    });
  }, [
    claimGuestProfile,
    guestId,
    isAuthenticated,
    isLoading,
    onStatus,
    playerName,
  ]);

  useEffect(() => {
    if (activeProfile === undefined) return;
    onProfile(activeProfile);
  }, [activeProfile, onProfile]);

  useEffect(() => {
    if (!stats) return;
    onStats(stats);
  }, [onStats, stats]);

  useEffect(() => {
    if (cloudSyncEnabled) return;
    onStats(null);
  }, [cloudSyncEnabled, onStats]);

  useEffect(() => {
    if (!topScores) return;
    onScores(topScores);
    onStatus('Live Convex leaderboard.');
  }, [onScores, onStatus, topScores]);

  useEffect(() => {
    if (!cloudSyncEnabled) return;
    const now = Date.now();
    const isFinal = currentRecord.status === 'completed';
    if (!isFinal && now - lastGameSyncAt.current < 15000) return;
    lastGameSyncAt.current = now;

    void upsertGame(toGameArgs(currentRecord, anonId)).catch(() => {
      onStatus('Could not sync current game to Convex.');
    });
  }, [anonId, cloudSyncEnabled, currentRecord, onStatus, upsertGame]);

  useEffect(() => {
    if (!cloudSyncEnabled) return;
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
  }, [anonId, cloudSyncEnabled, gameRecords, onStatus, upsertGame]);

  useEffect(() => {
    if (!cloudSyncEnabled) return;
    if (!scoreSubmissionsEnabled) return;
    if (currentRecord.status !== 'completed') return;
    if (currentRecord.elapsedMs <= 0) return;
    if (scoreRecordId !== currentRecord.id) return;
    if (submittedIds.current.has(currentRecord.id)) return;
    submittedIds.current.add(currentRecord.id);

    void submitScore(toScoreArgs(currentRecord, anonId, playerName)).catch(() => {
      submittedIds.current.delete(currentRecord.id);
      onStatus('Could not submit Convex score.');
    });
  }, [
    anonId,
    cloudSyncEnabled,
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
    cornerMarks: record.cornerMarks,
    cellColors: record.cellColors,
    playMode: record.playMode,
    puzzle: record.puzzle,
    puzzleSize: record.puzzleSize,
    recordId: record.id,
    source: record.source,
    status: record.status,
    updatedAt: record.updatedAt,
    variantId: record.variantId,
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
    variantId: record.variantId,
  };
}

import type { PlayMode } from './playModes';
import type { GameMeta } from './storage';
import type { PuzzleDifficulty, PuzzleSize } from './sudoku';

export type ChallengeAttempt = {
  anonId: string;
  completedAt?: string;
  completion: number;
  elapsedMs: number;
  player: string;
  recordId: string;
  startedAt: string;
  status: 'in-progress' | 'completed';
  updatedAt: string;
};

export type ChallengeRace = {
  attempts: ChallengeAttempt[];
  challengeId: string;
  createdAt: string;
  creatorName: string;
  difficulty?: PuzzleDifficulty | 'custom';
  playMode: PlayMode;
  puzzle: string;
  puzzleSize: PuzzleSize;
  source: string;
  status: 'open' | 'closed';
  title: string;
};

export type ChallengeCreateRequest = {
  challengeId: string;
  creatorName: string;
  difficulty?: PuzzleDifficulty | 'custom';
  playMode: PlayMode;
  puzzle: string;
  puzzleSize: PuzzleSize;
  requestId: string;
  source: string;
};

export function challengeIdFromPath(pathname: string) {
  const match = pathname.match(/^\/challenge\/([a-z0-9-]+)$/i);
  return match?.[1] ?? null;
}

export function challengePath(challengeId: string) {
  return `/challenge/${challengeId}`;
}

export function makeChallengeId() {
  const entropy =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `race-${entropy.toLowerCase()}`;
}

export function challengeGameId(challengeId: string) {
  return `challenge-race-${challengeId}`;
}

export function challengeIdFromGameId(gameId: string) {
  return gameId.startsWith('challenge-race-')
    ? gameId.replace('challenge-race-', '')
    : null;
}

export function createChallengeGameMeta(challenge: ChallengeRace): GameMeta {
  return {
    difficulty: challenge.difficulty,
    id: challengeGameId(challenge.challengeId),
    playMode: challenge.playMode,
    puzzle: challenge.puzzle,
    puzzleSize: challenge.puzzleSize,
    source: `challenge race ${challenge.challengeId}`,
    startedAt: new Date().toISOString(),
  };
}

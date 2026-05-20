import type { PlayMode } from './playModes';
import type { GameMeta } from './storage';
import type { PuzzleDifficulty, PuzzleSize } from './sudoku';

export type ChallengeAttempt = {
  anonId: string;
  completedAt?: string;
  completion: number;
  elapsedMs: number;
  mistakes: number;
  player: string;
  recordId: string;
  startedAt: string;
  status: 'in-progress' | 'completed';
  updatedAt: string;
};

export type ChallengeKind = 'race' | 'streak';

export type ChallengeRace = {
  attempts: ChallengeAttempt[];
  challengeId: string;
  challengeKind: ChallengeKind;
  createdAt: string;
  creatorName: string;
  difficulty?: PuzzleDifficulty | 'custom';
  playMode: PlayMode;
  puzzle: string;
  puzzleSize: PuzzleSize;
  recipientAnonId?: string;
  recipientName?: string;
  source: string;
  status: 'open' | 'closed';
  title: string;
};

export type ChallengeCreateRequest = {
  challengeId: string;
  challengeKind: ChallengeKind;
  creatorName: string;
  difficulty?: PuzzleDifficulty | 'custom';
  playMode: PlayMode;
  puzzle: string;
  puzzleSize: PuzzleSize;
  recipientAnonId?: string;
  recipientName?: string;
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

export function makeChallengeId(challengeKind: ChallengeKind = 'race') {
  const entropy =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${challengeKind}-${entropy.toLowerCase()}`;
}

export function challengeGameId(
  challengeId: string,
  challengeKind: ChallengeKind = 'race',
) {
  return `challenge-${challengeKind}-${challengeId}`;
}

export function challengeIdFromGameId(gameId: string) {
  const match = gameId.match(/^challenge-(?:race|streak)-(.+)$/);
  return match?.[1] ?? null;
}

export function challengeKindFromGameId(gameId: string): ChallengeKind | null {
  const match = gameId.match(/^challenge-(race|streak)-/);
  return (match?.[1] as ChallengeKind | undefined) ?? null;
}

export function challengeKindLabel(challengeKind: ChallengeKind) {
  return challengeKind === 'streak' ? 'streak battle' : 'race';
}

export function createChallengeGameMeta(challenge: ChallengeRace): GameMeta {
  return {
    difficulty: challenge.difficulty,
    id: challengeGameId(challenge.challengeId, challenge.challengeKind),
    playMode: challenge.playMode,
    puzzle: challenge.puzzle,
    puzzleSize: challenge.puzzleSize,
    source: `challenge ${challengeKindLabel(challenge.challengeKind)} ${challenge.challengeId}`,
    startedAt: new Date().toISOString(),
  };
}

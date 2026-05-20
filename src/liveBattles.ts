import type { PlayMode } from './playModes';
import type { GameMeta } from './storage';
import type { PuzzleDifficulty, PuzzleSize } from './sudoku';
import type { VariantId } from './variants';

export type LiveBattlePresence = {
  anonId: string;
  completion: number;
  elapsedMs: number;
  lastSeenAt: number;
  mistakes: number;
  player: string;
  recordId?: string;
  selectedCell?: number;
  status: 'online' | 'ready' | 'solving' | 'finished';
  updatedAt: string;
};

export type LiveBattleRoom = {
  createdAt: string;
  creatorName: string;
  difficulty?: PuzzleDifficulty | 'custom';
  playMode: PlayMode;
  presence: LiveBattlePresence[];
  puzzle: string;
  puzzleSize: PuzzleSize;
  roomId: string;
  source: string;
  status: 'waiting' | 'live' | 'finished';
  title: string;
  variantId: VariantId;
};

export type LiveBattleCreateRequest = {
  creatorName: string;
  difficulty?: PuzzleDifficulty | 'custom';
  playMode: PlayMode;
  puzzle: string;
  puzzleSize: PuzzleSize;
  requestId: string;
  roomId: string;
  source: string;
  variantId: VariantId;
};

export function liveBattleIdFromPath(pathname: string) {
  const match = pathname.match(/^\/battle\/live\/([a-z0-9-]+)$/i);
  return match?.[1] ?? null;
}

export function liveBattlePath(roomId: string) {
  return `/battle/live/${roomId}`;
}

export function makeLiveBattleId() {
  const entropy =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `live-${entropy.toLowerCase()}`;
}

export function liveBattleGameId(roomId: string) {
  return `live-battle-${roomId}`;
}

export function liveBattleIdFromGameId(gameId: string) {
  const match = gameId.match(/^live-battle-(.+)$/);
  return match?.[1] ?? null;
}

export function createLiveBattleGameMeta(room: LiveBattleRoom): GameMeta {
  return {
    difficulty: room.difficulty,
    id: liveBattleGameId(room.roomId),
    playMode: room.playMode,
    puzzle: room.puzzle,
    puzzleSize: room.puzzleSize,
    source: `live race ${room.roomId}`,
    startedAt: new Date().toISOString(),
    variantId: room.variantId,
  };
}

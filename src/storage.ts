import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  EMPTY_NOTES,
  STARTER_GRID,
  cloneNotes,
  parseGrid,
  type Grid,
  type Notes,
  type PuzzleDifficulty,
} from './sudoku';

export type Snapshot = {
  grid: Grid;
  notes: Notes;
  givens: boolean[];
};

export type GameMeta = {
  id: string;
  puzzle: string;
  source: string;
  difficulty?: PuzzleDifficulty | 'custom';
  startedAt: string;
};

export type GameRecord = Snapshot &
  GameMeta & {
    completion: number;
    elapsedMs: number;
    status: 'in-progress' | 'completed';
    updatedAt: string;
    completedAt?: string;
  };

type AppEntry =
  | { key: 'activeGame'; value: GameMeta }
  | { key: 'snapshot'; value: Snapshot }
  | { key: 'migratedLocalStorage'; value: boolean };

type StoredState = {
  activeGame: GameMeta;
  records: GameRecord[];
  snapshot: Snapshot;
};

interface VimdokuDb extends DBSchema {
  app: {
    key: AppEntry['key'];
    value: AppEntry;
  };
  games: {
    indexes: {
      'by-status': GameRecord['status'];
      'by-updated': string;
    };
    key: string;
    value: GameRecord;
  };
}

const DB_NAME = 'vimdoku';
const DB_VERSION = 1;
const STORAGE_KEY = 'vimdoku-state-v1';
const GAME_META_KEY = 'vimdoku-active-game-v1';
const GAME_RECORDS_KEY = 'vimdoku-game-records-v1';

let dbPromise: Promise<IDBPDatabase<VimdokuDb>> | null = null;

export function createGameMeta(
  puzzleGrid: Grid,
  source: string,
  difficulty?: PuzzleDifficulty | 'custom',
): GameMeta {
  const now = new Date().toISOString();
  const puzzle = gridToString(puzzleGrid);
  return {
    id: `${hashString(`${puzzle}:${source}:${now}`).toString(36)}-${Date.now().toString(36)}`,
    puzzle,
    source,
    difficulty,
    startedAt: now,
  };
}

export function createGameRecord(
  meta: GameMeta,
  grid: Grid,
  notes: Notes,
  givens: boolean[],
  completed: boolean,
  elapsedMs = 0,
): GameRecord {
  const now = new Date().toISOString();
  return {
    ...meta,
    grid: [...grid],
    notes: cloneNotes(notes),
    givens: [...givens],
    completion: grid.filter(Boolean).length,
    elapsedMs: Math.max(0, Math.floor(elapsedMs)),
    status: completed ? 'completed' : 'in-progress',
    updatedAt: now,
    completedAt: completed ? now : undefined,
  };
}

export function loadLegacySnapshot(): Snapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot;
    return sanitizeSnapshot(parsed);
  } catch {
    return null;
  }
}

export function loadLegacyGameRecords(): GameRecord[] {
  try {
    const raw = localStorage.getItem(GAME_RECORDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GameRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeGameRecord).filter(isGameRecord).slice(0, 80);
  } catch {
    return [];
  }
}

export function loadInitialGameMeta() {
  const stored = loadLegacyActiveGame();
  if (stored) return stored;

  const snapshot = loadLegacySnapshot();
  const puzzleGrid =
    snapshot?.grid.map((value, index) => (snapshot.givens[index] ? value : 0)) ??
    STARTER_GRID;
  return createGameMeta(puzzleGrid, snapshot ? 'saved puzzle' : 'starter', 'custom');
}

export async function loadStoredState(): Promise<StoredState> {
  await migrateLocalStorage();
  const db = await getDb();
  const [snapshotEntry, activeGameEntry, records] = await Promise.all([
    db.get('app', 'snapshot'),
    db.get('app', 'activeGame'),
    db.getAll('games'),
  ]);

  const fallbackSnapshot = loadLegacySnapshot() ?? {
    grid: STARTER_GRID,
    givens: STARTER_GRID.map(Boolean),
    notes: EMPTY_NOTES,
  };
  const snapshot =
    snapshotEntry?.key === 'snapshot'
      ? sanitizeSnapshot(snapshotEntry.value) ?? fallbackSnapshot
      : fallbackSnapshot;

  const activeGame =
    activeGameEntry?.key === 'activeGame'
      ? sanitizeGameMeta(activeGameEntry.value) ?? loadInitialGameMeta()
      : loadInitialGameMeta();

  return {
    activeGame,
    records: records.map(sanitizeGameRecord).filter(isGameRecord).slice(0, 80),
    snapshot,
  };
}

export async function saveStoredState(
  snapshot: Snapshot,
  activeGame: GameMeta,
  records: GameRecord[],
) {
  const db = await getDb();
  const tx = db.transaction(['app', 'games'], 'readwrite');
  await Promise.all([
    tx.objectStore('app').put({ key: 'snapshot', value: snapshot }),
    tx.objectStore('app').put({ key: 'activeGame', value: activeGame }),
    tx.objectStore('games').clear(),
  ]);

  for (const record of records.slice(0, 80)) {
    await tx.objectStore('games').put(record);
  }

  await tx.done;
}

export function upsertGameRecord(records: GameRecord[], nextRecord: GameRecord) {
  const existing = records.find((record) => record.id === nextRecord.id);
  const merged: GameRecord = {
    ...nextRecord,
    completedAt:
      nextRecord.status === 'completed'
        ? existing?.completedAt ?? nextRecord.completedAt
        : undefined,
  };
  return [merged, ...records.filter((record) => record.id !== nextRecord.id)].slice(0, 80);
}

export function gridToString(grid: Grid) {
  return grid.map((value) => (value >= 1 && value <= 9 ? value : 0)).join('');
}

async function migrateLocalStorage() {
  const db = await getDb();
  const migrated = await db.get('app', 'migratedLocalStorage');
  if (migrated?.key === 'migratedLocalStorage' && migrated.value) return;

  const snapshot = loadLegacySnapshot();
  const activeGame = loadLegacyActiveGame() ?? loadInitialGameMeta();
  const records = loadLegacyGameRecords();
  const recordsToStore =
    records.length > 0 || !snapshot
      ? records
      : [createGameRecord(activeGame, snapshot.grid, snapshot.notes, snapshot.givens, false)];

  const tx = db.transaction(['app', 'games'], 'readwrite');
  if (snapshot) {
    await tx.objectStore('app').put({ key: 'snapshot', value: snapshot });
  }
  await tx.objectStore('app').put({ key: 'activeGame', value: activeGame });
  for (const record of recordsToStore) {
    await tx.objectStore('games').put(record);
  }
  await tx.objectStore('app').put({ key: 'migratedLocalStorage', value: true });
  await tx.done;
}

function getDb() {
  dbPromise ??= openDB<VimdokuDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('app', { keyPath: 'key' });
      const games = db.createObjectStore('games', { keyPath: 'id' });
      games.createIndex('by-status', 'status');
      games.createIndex('by-updated', 'updatedAt');
    },
  });
  return dbPromise;
}

function loadLegacyActiveGame(): GameMeta | null {
  try {
    const raw = localStorage.getItem(GAME_META_KEY);
    if (!raw) return null;
    return sanitizeGameMeta(JSON.parse(raw) as GameMeta);
  } catch {
    return null;
  }
}

function sanitizeSnapshot(snapshot: Snapshot): Snapshot | null {
  if (snapshot.grid?.length !== 81 || snapshot.givens?.length !== 81) return null;
  return {
    grid: parseGrid(snapshot.grid.join('')),
    givens: snapshot.givens.map(Boolean),
    notes:
      snapshot.notes?.length === 81
        ? snapshot.notes.map((cell) =>
            cell.filter((value) => value >= 1 && value <= 9).sort(),
          )
        : EMPTY_NOTES,
  };
}

function sanitizeGameMeta(meta: GameMeta): GameMeta | null {
  if (!meta.id || !meta.puzzle || !meta.source || !meta.startedAt) return null;
  return {
    id: String(meta.id),
    puzzle: gridToString(parseGrid(meta.puzzle)),
    source: String(meta.source),
    difficulty: meta.difficulty,
    startedAt: String(meta.startedAt),
  };
}

function sanitizeGameRecord(record: GameRecord): GameRecord | null {
  if (
    !record.id ||
    record.grid?.length !== 81 ||
    record.givens?.length !== 81 ||
    record.notes?.length !== 81
  ) {
    return null;
  }

  const fallbackPuzzle = record.givens
    .map((given, index) => (given ? record.grid[index] : 0))
    .join('');

  return {
    id: String(record.id),
    puzzle: gridToString(parseGrid(record.puzzle ?? fallbackPuzzle)),
    source: String(record.source ?? 'unknown'),
    difficulty: record.difficulty,
    startedAt: String(record.startedAt),
    updatedAt: String(record.updatedAt ?? record.startedAt),
    completedAt: record.completedAt ? String(record.completedAt) : undefined,
    completion: Math.max(0, Math.min(81, Number(record.completion) || 0)),
    elapsedMs: Math.max(0, Math.floor(Number(record.elapsedMs) || 0)),
    status: record.status === 'completed' ? 'completed' : 'in-progress',
    grid: parseGrid(record.grid.join('')),
    givens: record.givens.map(Boolean),
    notes: record.notes.map((cell) =>
      cell.filter((value) => value >= 1 && value <= 9).sort(),
    ),
  };
}

function isGameRecord(record: GameRecord | null): record is GameRecord {
  return record !== null;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

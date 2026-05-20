import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  EMPTY_NOTES,
  STARTER_GRID,
  cloneNotes,
  emptyNotes,
  parseGrid,
  puzzleSizeFromGrid,
  type Grid,
  type Notes,
  type PuzzleDifficulty,
  type PuzzleSize,
} from './sudoku';
import { sanitizePlayMode, type PlayMode } from './playModes';
import { sanitizeVariantId, type VariantId } from './variants';

export type CellColors = Array<number | null>;

export type Snapshot = {
  cellColors: CellColors;
  cornerMarks: Notes;
  grid: Grid;
  notes: Notes;
  givens: boolean[];
  variantId: VariantId;
};

export type GameMeta = {
  id: string;
  playMode: PlayMode;
  puzzle: string;
  puzzleSize: PuzzleSize;
  source: string;
  difficulty?: PuzzleDifficulty | 'custom';
  startedAt: string;
  variantId: VariantId;
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
  puzzleSize: PuzzleSize = puzzleSizeFromGrid(puzzleGrid),
  playMode: PlayMode = 'classic',
  variantId: VariantId = 'classic',
): GameMeta {
  const now = new Date().toISOString();
  const puzzle = gridToString(puzzleGrid, puzzleSize);
  return {
    id: `${hashString(`${puzzle}:${source}:${puzzleSize}:${playMode}:${now}`).toString(36)}-${Date.now().toString(36)}`,
    playMode,
    puzzle,
    puzzleSize,
    source,
    difficulty,
    startedAt: now,
    variantId,
  };
}

export function createGameRecord(
  meta: GameMeta,
  grid: Grid,
  notes: Notes,
  cornerMarks: Notes,
  cellColors: CellColors,
  givens: boolean[],
  completed: boolean,
  elapsedMs = 0,
): GameRecord {
  const now = new Date().toISOString();
  return {
    ...meta,
    cellColors: sanitizeCellColors(cellColors, meta.puzzleSize),
    cornerMarks: sanitizeNotes(cornerMarks, meta.puzzleSize),
    grid: [...grid],
    notes: cloneNotes(notes),
    givens: [...givens],
    variantId: sanitizeVariantId(meta.variantId),
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
  return createGameMeta(
    puzzleGrid,
    snapshot ? 'saved puzzle' : 'starter',
    'custom',
    puzzleSizeFromGrid(puzzleGrid),
    'classic',
    snapshot?.variantId ?? 'classic',
  );
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
    cellColors: emptyCellColors('9x9'),
    cornerMarks: emptyNotes('9x9'),
    grid: STARTER_GRID,
    givens: STARTER_GRID.map(Boolean),
    notes: EMPTY_NOTES,
    variantId: 'classic',
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

export function gridToString(
  grid: Grid,
  puzzleSize: PuzzleSize = puzzleSizeFromGrid(grid),
) {
  const maxDigit = puzzleSize === '6x6' ? 6 : 9;
  return grid.map((value) => (value >= 1 && value <= maxDigit ? value : 0)).join('');
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
      : [
          createGameRecord(
            { ...activeGame, variantId: snapshot.variantId },
            snapshot.grid,
            snapshot.notes,
            snapshot.cornerMarks,
            snapshot.cellColors,
            snapshot.givens,
            false,
          ),
        ];

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
  const puzzleSize = puzzleSizeFromGrid(snapshot.grid ?? []);
  const cellCount = puzzleSize === '6x6' ? 36 : 81;
  if (snapshot.grid?.length !== cellCount || snapshot.givens?.length !== cellCount) {
    return null;
  }
  return {
    cellColors: sanitizeCellColors(snapshot.cellColors, puzzleSize),
    cornerMarks: sanitizeNotes(snapshot.cornerMarks, puzzleSize),
    grid: parseGrid(snapshot.grid.join(''), puzzleSize),
    givens: snapshot.givens.map(Boolean),
    notes: sanitizeNotes(snapshot.notes, puzzleSize),
    variantId: sanitizeVariantId(snapshot.variantId),
  };
}

function sanitizeGameMeta(meta: GameMeta): GameMeta | null {
  if (!meta.id || !meta.puzzle || !meta.source || !meta.startedAt) return null;
  const puzzleSize =
    meta.puzzleSize === '6x6' || meta.puzzleSize === '9x9'
      ? meta.puzzleSize
      : puzzleSizeFromGrid(String(meta.puzzle));
  return {
    id: String(meta.id),
    playMode: sanitizePlayMode(meta.playMode),
    puzzle: gridToString(parseGrid(meta.puzzle, puzzleSize), puzzleSize),
    puzzleSize,
    source: String(meta.source),
    difficulty: meta.difficulty,
    startedAt: String(meta.startedAt),
    variantId: sanitizeVariantId(meta.variantId),
  };
}

function sanitizeGameRecord(record: GameRecord): GameRecord | null {
  const puzzleSize =
    record.puzzleSize === '6x6' || record.puzzleSize === '9x9'
      ? record.puzzleSize
      : puzzleSizeFromGrid(record.grid ?? record.puzzle ?? '');
  const cellCount = puzzleSize === '6x6' ? 36 : 81;
  const maxDigit = puzzleSize === '6x6' ? 6 : 9;

  if (
    !record.id ||
    record.grid?.length !== cellCount ||
    record.givens?.length !== cellCount ||
    record.notes?.length !== cellCount
  ) {
    return null;
  }

  const fallbackPuzzle = record.givens
    .map((given, index) => (given ? record.grid[index] : 0))
    .join('');

  return {
    id: String(record.id),
    playMode: sanitizePlayMode(record.playMode),
    puzzle: gridToString(parseGrid(record.puzzle ?? fallbackPuzzle, puzzleSize), puzzleSize),
    puzzleSize,
    source: String(record.source ?? 'unknown'),
    difficulty: record.difficulty,
    startedAt: String(record.startedAt),
    updatedAt: String(record.updatedAt ?? record.startedAt),
    completedAt: record.completedAt ? String(record.completedAt) : undefined,
    completion: Math.max(0, Math.min(cellCount, Number(record.completion) || 0)),
    elapsedMs: Math.max(0, Math.floor(Number(record.elapsedMs) || 0)),
    status: record.status === 'completed' ? 'completed' : 'in-progress',
    cellColors: sanitizeCellColors(record.cellColors, puzzleSize),
    cornerMarks: sanitizeNotes(record.cornerMarks, puzzleSize),
    grid: parseGrid(record.grid.join(''), puzzleSize),
    givens: record.givens.map(Boolean),
    notes: record.notes.map((cell) => sanitizeNoteCell(cell, maxDigit)),
    variantId: sanitizeVariantId(record.variantId),
  };
}

function emptyCellColors(puzzleSize: PuzzleSize): CellColors {
  return Array(puzzleSize === '6x6' ? 36 : 81).fill(null);
}

function sanitizeCellColors(
  cellColors: CellColors | undefined,
  puzzleSize: PuzzleSize,
): CellColors {
  const cellCount = puzzleSize === '6x6' ? 36 : 81;
  if (!Array.isArray(cellColors) || cellColors.length !== cellCount) {
    return emptyCellColors(puzzleSize);
  }
  return cellColors.map((value) =>
    typeof value === 'number' && value >= 0 && value <= 5 ? Math.floor(value) : null,
  );
}

function sanitizeNotes(notes: Notes | undefined, puzzleSize: PuzzleSize): Notes {
  const cellCount = puzzleSize === '6x6' ? 36 : 81;
  const maxDigit = puzzleSize === '6x6' ? 6 : 9;
  if (!Array.isArray(notes) || notes.length !== cellCount) return emptyNotes(puzzleSize);
  return notes.map((cell) => sanitizeNoteCell(cell, maxDigit));
}

function sanitizeNoteCell(cell: number[] | undefined, maxDigit: number) {
  if (!Array.isArray(cell)) return [];
  return [...new Set(cell.filter((value) => value >= 1 && value <= maxDigit))]
    .map((value) => Math.floor(value))
    .sort();
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

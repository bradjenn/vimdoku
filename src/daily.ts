import { modeLabel, type PlayMode } from './playModes';
import { formatHumanDate } from './dates';
import {
  boardConfigFor,
  puzzleSizeFromGrid,
  type Grid,
  type PuzzleDifficulty,
  type PuzzleSize,
} from './sudoku';
import type { GameMeta, GameRecord } from './storage';

export type DailyRoute = {
  dateKey: string;
  difficulty: PuzzleDifficulty;
  playMode: PlayMode;
  puzzleSize: PuzzleSize;
};

export function dailySeed(
  difficulty: PuzzleDifficulty,
  source = 'vimdoku',
  dateKey = todayDateKey(),
  puzzleSize: PuzzleSize = '9x9',
  playMode: PlayMode = 'classic',
) {
  return hashString(`${source}:${puzzleSize}:${playMode}:${difficulty}:${dateKey}`);
}

export function createDailyGameMeta(
  puzzleGrid: Grid,
  difficulty: PuzzleDifficulty,
  dateKey: string,
  puzzleSize: PuzzleSize = '9x9',
  playMode: PlayMode = 'classic',
): GameMeta {
  return {
    difficulty,
    id: dailyGameId(difficulty, dateKey, puzzleSize, playMode),
    playMode,
    puzzle: gridToPuzzleString(puzzleGrid, puzzleSize),
    puzzleSize,
    source: `vimdoku ${puzzleSize} ${modeLabel(playMode)} daily ${dateKey}`,
    startedAt: `${dateKey}T00:00:00.000Z`,
    variantId: 'classic',
  };
}

export function dailyGameId(
  difficulty: PuzzleDifficulty,
  dateKey: string,
  puzzleSize: PuzzleSize,
  playMode: PlayMode,
) {
  if (puzzleSize === '9x9' && playMode === 'classic') {
    return `daily-vimdoku-${difficulty}-${dateKey}`;
  }
  return playMode === 'classic'
    ? `daily-vimdoku-${puzzleSize}-${difficulty}-${dateKey}`
    : `daily-vimdoku-${puzzleSize}-${playMode}-${difficulty}-${dateKey}`;
}

export function findDailyRecord(
  records: GameRecord[],
  difficulty: PuzzleDifficulty,
  dateKey: string,
  puzzleSize: PuzzleSize = '9x9',
  playMode: PlayMode = 'classic',
) {
  const id = dailyGameId(difficulty, dateKey, puzzleSize, playMode);
  return records.find((record) => record.id === id) ?? null;
}

export function parseDailyRoute(pathname: string): DailyRoute | null {
  const modeCanonical = pathname.match(
    /^\/play\/daily\/(6x6|9x9)\/(classic|speedrun|zen|no-check)\/(easy|medium|hard|expert)\/(\d{4}-\d{2}-\d{2})$/,
  );
  if (modeCanonical) {
    if (!isValidDateKey(modeCanonical[4])) return null;
    return {
      dateKey: modeCanonical[4],
      difficulty: modeCanonical[3] as PuzzleDifficulty,
      playMode: modeCanonical[2] as PlayMode,
      puzzleSize: modeCanonical[1] as PuzzleSize,
    };
  }

  const sizedCanonical = pathname.match(
    /^\/play\/daily\/(6x6|9x9)\/(easy|medium|hard|expert)\/(\d{4}-\d{2}-\d{2})$/,
  );
  if (sizedCanonical) {
    if (!isValidDateKey(sizedCanonical[3])) return null;
    return {
      dateKey: sizedCanonical[3],
      difficulty: sizedCanonical[2] as PuzzleDifficulty,
      playMode: 'classic',
      puzzleSize: sizedCanonical[1] as PuzzleSize,
    };
  }

  const canonical = pathname.match(
    /^\/play\/daily\/(easy|medium|hard|expert)\/(\d{4}-\d{2}-\d{2})$/,
  );
  if (canonical) {
    if (!isValidDateKey(canonical[2])) return null;
    return {
      dateKey: canonical[2],
      difficulty: canonical[1] as PuzzleDifficulty,
      playMode: 'classic',
      puzzleSize: '9x9',
    };
  }

  const modeShort = pathname.match(
    /^\/play\/(6x6|9x9|6|9)\/(classic|speedrun|zen|no-check)\/([emhx]|easy|medium|hard|expert)\/(\d{4}-\d{2}-\d{2})$/,
  );
  if (modeShort) {
    if (!isValidDateKey(modeShort[4])) return null;
    return {
      dateKey: modeShort[4],
      difficulty: expandDifficultySlug(modeShort[3]),
      playMode: modeShort[2] as PlayMode,
      puzzleSize: expandSizeSlug(modeShort[1]),
    };
  }

  const sizedShort = pathname.match(
    /^\/play\/(6x6|9x9|6|9)\/([emhx]|easy|medium|hard|expert)\/(\d{4}-\d{2}-\d{2})$/,
  );
  if (sizedShort) {
    if (!isValidDateKey(sizedShort[3])) return null;
    return {
      dateKey: sizedShort[3],
      difficulty: expandDifficultySlug(sizedShort[2]),
      playMode: 'classic',
      puzzleSize: expandSizeSlug(sizedShort[1]),
    };
  }

  const short = pathname.match(
    /^\/play\/([emhx]|easy|medium|hard|expert)\/(\d{4}-\d{2}-\d{2})$/,
  );
  if (!short) return null;
  if (!isValidDateKey(short[2])) return null;
  return {
    dateKey: short[2],
    difficulty: expandDifficultySlug(short[1]),
    playMode: 'classic',
    puzzleSize: '9x9',
  };
}

export function dailyPath(route: DailyRoute) {
  if (route.puzzleSize === '9x9' && route.playMode === 'classic') {
    return `/play/daily/${route.difficulty}/${route.dateKey}`;
  }
  if (route.playMode === 'classic') {
    return `/play/daily/${route.puzzleSize}/${route.difficulty}/${route.dateKey}`;
  }
  return `/play/daily/${route.puzzleSize}/${route.playMode}/${route.difficulty}/${route.dateKey}`;
}

export function todayDateKey() {
  return dateKeyFromDate(new Date());
}

export function offsetDateKey(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return dateKeyFromDate(date);
}

export function shiftDateKey(dateKey: string, offsetDays: number) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return todayDateKey();
  date.setDate(date.getDate() + offsetDays);
  const shifted = dateKeyFromDate(date);
  return shifted > todayDateKey() ? todayDateKey() : shifted;
}

export function formatDailyDate(dateKey: string) {
  return formatHumanDate(dateKey, dateKey);
}

export function isValidDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  return !Number.isNaN(date.getTime()) && dateKeyFromDate(date) === dateKey;
}

function expandDifficultySlug(slug: string): PuzzleDifficulty {
  if (slug === 'e') return 'easy';
  if (slug === 'm') return 'medium';
  if (slug === 'h') return 'hard';
  if (slug === 'x') return 'expert';
  return slug as PuzzleDifficulty;
}

function expandSizeSlug(slug: string): PuzzleSize {
  return slug === '6' || slug === '6x6' ? '6x6' : '9x9';
}

function dateKeyFromDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function gridToPuzzleString(
  grid: Grid,
  puzzleSize: PuzzleSize = puzzleSizeFromGrid(grid),
) {
  const maxDigit = boardConfigFor(puzzleSize).size;
  return grid.map((value) => (value >= 1 && value <= maxDigit ? value : 0)).join('');
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

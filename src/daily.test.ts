import { describe, expect, it } from 'vitest';
import {
  createDailyGameMeta,
  dailyGameId,
  dailyPath,
  dailySeed,
  findDailyRecord,
  formatDailyDate,
  isValidDateKey,
  parseDailyRoute,
  shiftDateKey,
} from './daily';
import { parseGrid } from './sudoku';
import type { GameRecord } from './storage';

describe('daily routes', () => {
  it('parses canonical and short daily URLs', () => {
    expect(parseDailyRoute('/play/daily/easy/2026-05-18')).toEqual({
      dateKey: '2026-05-18',
      difficulty: 'easy',
      playMode: 'classic',
      puzzleSize: '9x9',
    });
    expect(parseDailyRoute('/play/6x6/no-check/h/2026-05-18')).toEqual({
      dateKey: '2026-05-18',
      difficulty: 'hard',
      playMode: 'no-check',
      puzzleSize: '6x6',
    });
  });

  it('rejects impossible dates', () => {
    expect(parseDailyRoute('/play/daily/easy/2026-02-31')).toBeNull();
    expect(isValidDateKey('2026-02-31')).toBe(false);
  });

  it('formats daily paths in the canonical shape', () => {
    expect(
      dailyPath({
        dateKey: '2026-05-18',
        difficulty: 'medium',
        playMode: 'classic',
        puzzleSize: '9x9',
      }),
    ).toBe('/play/daily/medium/2026-05-18');
    expect(
      dailyPath({
        dateKey: '2026-05-18',
        difficulty: 'medium',
        playMode: 'speedrun',
        puzzleSize: '6x6',
      }),
    ).toBe('/play/daily/6x6/speedrun/medium/2026-05-18');
  });

  it('keeps daily IDs stable across supported mode and size combinations', () => {
    expect(dailyGameId('easy', '2026-05-18', '9x9', 'classic')).toBe(
      'daily-vimdoku-easy-2026-05-18',
    );
    expect(dailyGameId('easy', '2026-05-18', '6x6', 'classic')).toBe(
      'daily-vimdoku-6x6-easy-2026-05-18',
    );
    expect(dailyGameId('easy', '2026-05-18', '6x6', 'zen')).toBe(
      'daily-vimdoku-6x6-zen-easy-2026-05-18',
    );
  });
});

describe('daily metadata', () => {
  it('creates daily game metadata from a generated puzzle', () => {
    const grid = parseGrid('123456'.repeat(6), '6x6');
    const meta = createDailyGameMeta(grid, 'hard', '2026-05-18', '6x6', 'zen');

    expect(meta).toMatchObject({
      difficulty: 'hard',
      id: 'daily-vimdoku-6x6-zen-hard-2026-05-18',
      playMode: 'zen',
      puzzleSize: '6x6',
      source: 'vimdoku 6x6 zen daily 2026-05-18',
      startedAt: '2026-05-18T00:00:00.000Z',
    });
  });

  it('finds completed daily records by generated ID', () => {
    const record = {
      id: 'daily-vimdoku-6x6-hard-2026-05-18',
      playMode: 'classic',
      puzzleSize: '6x6',
    } as GameRecord;

    expect(findDailyRecord([record], 'hard', '2026-05-18', '6x6', 'classic')).toBe(
      record,
    );
    expect(findDailyRecord([record], 'easy', '2026-05-18', '6x6', 'classic')).toBeNull();
  });

  it('hashes daily seeds deterministically', () => {
    expect(dailySeed('easy', 'vimdoku', '2026-05-18', '6x6', 'classic')).toBe(
      dailySeed('easy', 'vimdoku', '2026-05-18', '6x6', 'classic'),
    );
    expect(dailySeed('easy', 'vimdoku', '2026-05-18', '6x6', 'classic')).not.toBe(
      dailySeed('easy', 'vimdoku', '2026-05-19', '6x6', 'classic'),
    );
  });

  it('shifts dates and formats readable labels', () => {
    expect(shiftDateKey('2026-05-18', -1)).toBe('2026-05-17');
    expect(formatDailyDate('2026-05-22')).toBe('22nd May 2026');
    expect(formatDailyDate('not-a-date')).toBe('not-a-date');
  });
});

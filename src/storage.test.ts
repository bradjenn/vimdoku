import { describe, expect, it } from 'vitest';
import {
  createGameMeta,
  createGameRecord,
  gridToString,
  upsertGameRecord,
  type GameRecord,
} from './storage';
import { emptyGrid, emptyNotes, parseGrid } from './sudoku';

describe('storage helpers', () => {
  it('serializes puzzle grids with size-aware digit clamping', () => {
    expect(gridToString([1, 6, 7, 9, 0], '6x6')).toBe('16000');
    expect(gridToString([1, 6, 7, 9, 0], '9x9')).toBe('16790');
  });

  it('creates game metadata with puzzle size and mode included', () => {
    const grid = parseGrid('123456'.repeat(6), '6x6');
    const meta = createGameMeta(grid, 'unit test', 'easy', '6x6', 'speedrun');

    expect(meta).toMatchObject({
      difficulty: 'easy',
      playMode: 'speedrun',
      puzzle: '123456'.repeat(6),
      puzzleSize: '6x6',
      source: 'unit test',
    });
    expect(meta.id).toBeTruthy();
  });

  it('creates immutable game records with bounded elapsed time', () => {
    const meta = createGameMeta(emptyGrid('6x6'), 'unit test', 'custom', '6x6');
    const grid = emptyGrid('6x6');
    const notes = emptyNotes('6x6');
    const cornerMarks = emptyNotes('6x6');
    const cellColors = Array(36).fill(null);
    const givens = grid.map(Boolean);
    grid[0] = 1;
    notes[1] = [1, 2];
    cornerMarks[2] = [3, 4];
    cellColors[3] = 2;

    const record = createGameRecord(
      meta,
      grid,
      notes,
      cornerMarks,
      cellColors,
      givens,
      false,
      -12,
    );
    grid[0] = 2;
    notes[1].push(3);
    cornerMarks[2].push(5);
    cellColors[3] = 4;

    expect(record.grid[0]).toBe(1);
    expect(record.notes[1]).toEqual([1, 2]);
    expect(record.cornerMarks[2]).toEqual([3, 4]);
    expect(record.cellColors[3]).toBe(2);
    expect(record.elapsedMs).toBe(0);
    expect(record.completion).toBe(1);
    expect(record.status).toBe('in-progress');
  });

  it('preserves first completion timestamps when upserting records', () => {
    const existing = {
      id: 'game-1',
      completedAt: '2026-05-18T12:00:00.000Z',
      status: 'completed',
    } as GameRecord;
    const next = {
      id: 'game-1',
      completedAt: '2026-05-19T12:00:00.000Z',
      status: 'completed',
    } as GameRecord;

    expect(upsertGameRecord([existing], next)[0].completedAt).toBe(
      '2026-05-18T12:00:00.000Z',
    );
  });

  it('removes completion timestamps when a record is back in progress', () => {
    const next = {
      id: 'game-1',
      completedAt: '2026-05-19T12:00:00.000Z',
      status: 'in-progress',
    } as GameRecord;

    expect(upsertGameRecord([], next)[0].completedAt).toBeUndefined();
  });
});

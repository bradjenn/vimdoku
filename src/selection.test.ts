import { describe, expect, it } from 'vitest';
import {
  boxSelection,
  columnSelection,
  nextEmptyCell,
  rectangularSelection,
  rowSelection,
} from './selection';

describe('nextEmptyCell', () => {
  it('moves forward to the next empty editable cell', () => {
    const grid = [1, 0, 2, 0];
    const givens = [true, false, false, false];

    expect(nextEmptyCell(grid, givens, 0)).toBe(1);
  });

  it('skips filled cells and givens', () => {
    const grid = [1, 2, 0, 0, 0];
    const givens = [true, false, true, false, false];

    expect(nextEmptyCell(grid, givens, 0)).toBe(3);
  });

  it('wraps around the board', () => {
    const grid = [0, 1, 2, 3];
    const givens = [false, false, false, false];

    expect(nextEmptyCell(grid, givens, 3)).toBe(0);
  });

  it('returns null when no empty editable cell remains', () => {
    const grid = [0, 2, 3];
    const givens = [true, false, false];

    expect(nextEmptyCell(grid, givens, 1)).toBeNull();
  });
});

describe('selection helpers', () => {
  it('builds rectangular visual selections', () => {
    expect([...rectangularSelection(0, 7, '6x6')]).toEqual([0, 1, 6, 7]);
  });

  it('selects rows, columns, and boxes', () => {
    expect([...rowSelection(8, '6x6')]).toEqual([6, 7, 8, 9, 10, 11]);
    expect([...columnSelection(8, '6x6')]).toEqual([2, 8, 14, 20, 26, 32]);
    expect([...boxSelection(8, '6x6')]).toEqual([0, 1, 2, 6, 7, 8]);
  });
});

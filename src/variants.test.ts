import { describe, expect, it } from 'vitest';
import { checkVariant } from './variants';
import { emptyGrid } from './sudoku';

describe('variants', () => {
  it('classic has no extra variant checks', () => {
    const grid = emptyGrid('9x9');
    grid[0] = 1;
    grid[10] = 1;

    expect(checkVariant(grid, '9x9', 'classic')).toEqual([]);
  });

  it('detects anti-knight conflicts', () => {
    const grid = emptyGrid('9x9');
    grid[0] = 1;
    grid[11] = 1;

    expect(checkVariant(grid, '9x9', 'anti-knight')).toEqual([
      {
        cells: [0, 11],
        message: '1 repeats across an anti-knight move.',
        variant: 'anti-knight',
      },
    ]);
  });

  it('detects anti-king conflicts', () => {
    const grid = emptyGrid('9x9');
    grid[0] = 2;
    grid[10] = 2;

    expect(checkVariant(grid, '9x9', 'anti-king')[0]).toEqual({
      cells: [0, 10],
      message: '2 touches diagonally in anti-king mode.',
      variant: 'anti-king',
    });
  });

  it('detects diagonal conflicts', () => {
    const grid = emptyGrid('9x9');
    grid[0] = 3;
    grid[10] = 3;

    expect(checkVariant(grid, '9x9', 'diagonal')[0]).toEqual({
      cells: [0, 10],
      message: '3 repeats on a diagonal.',
      variant: 'diagonal',
    });
  });

  it('detects non-consecutive conflicts', () => {
    const grid = emptyGrid('6x6');
    grid[0] = 3;
    grid[1] = 4;

    expect(checkVariant(grid, '6x6', 'non-consecutive')[0]).toEqual({
      cells: [0, 1],
      message: '3 and 4 are consecutive neighbours.',
      variant: 'non-consecutive',
    });
  });
});

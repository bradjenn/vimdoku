import { describe, expect, it } from 'vitest';
import { checkGrid } from './checks';
import { STARTER_GRID } from './sudoku';

describe('checkGrid', () => {
  it('reports a clean partial board without using the solution', () => {
    expect(checkGrid(STARTER_GRID, '9x9')).toEqual({
      issues: [],
      message: 'Check passed: no row, column, or box conflicts.',
      ok: true,
    });
  });

  it('reports repeated digits in a unit', () => {
    const grid = [...STARTER_GRID];
    grid[2] = 5;
    const result = checkGrid(grid, '9x9');

    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({
      cells: [0, 2],
      label: 'row 1',
      unit: 'row',
      value: 5,
    });
  });
});

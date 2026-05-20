import { describe, expect, it } from 'vitest';
import {
  STARTER_GRID,
  boardConfigFor,
  candidatesAsNotes,
  candidatesFor,
  emptyNotes,
  findConflicts,
  generatePuzzle,
  isValidMove,
  labelCell,
  nextHint,
  parseGrid,
  peers,
  pruneImpossibleNotes,
  removeRelatedNotes,
  solveGrid,
} from './sudoku';

const STARTER_SOLUTION =
  '534678912' +
  '672195348' +
  '198342567' +
  '859761423' +
  '426853791' +
  '713924856' +
  '961537284' +
  '287419635' +
  '345286179';

describe('sudoku board configuration', () => {
  it('describes classic 9x9 and compact 6x6 boards', () => {
    expect(boardConfigFor('9x9')).toMatchObject({
      boxCols: 3,
      boxRows: 3,
      cellCount: 81,
      digits: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      size: 9,
    });
    expect(boardConfigFor('6x6')).toMatchObject({
      boxCols: 3,
      boxRows: 2,
      cellCount: 36,
      digits: [1, 2, 3, 4, 5, 6],
      size: 6,
    });
  });

  it('parses grids by clamping invalid digits and padding missing cells', () => {
    const grid = parseGrid('1.789', '6x6');

    expect(grid).toHaveLength(36);
    expect(grid.slice(0, 5)).toEqual([1, 0, 0, 0, 0]);
  });

  it('labels cells using row-column coordinates', () => {
    expect(labelCell(0, '9x9')).toBe('r1c1');
    expect(labelCell(35, '6x6')).toBe('r6c6');
  });
});

describe('sudoku peer and conflict logic', () => {
  it('builds peer sets for both board sizes', () => {
    expect(peers(0, '9x9')).toHaveLength(20);
    expect(peers(0, '6x6')).toHaveLength(12);
    expect(peers(0, '6x6')).not.toContain(0);
  });

  it('validates moves against rows, columns, and boxes', () => {
    expect(isValidMove(STARTER_GRID, 2, 4, '9x9')).toBe(true);
    expect(isValidMove(STARTER_GRID, 2, 5, '9x9')).toBe(false);
  });

  it('finds all cells involved in a conflict', () => {
    const grid = [...STARTER_GRID];
    grid[2] = 5;

    expect([...findConflicts(grid, '9x9')].sort((a, b) => a - b)).toEqual([0, 2]);
  });
});

describe('sudoku candidates, notes, and solver', () => {
  it('calculates candidates for empty cells', () => {
    expect(candidatesFor(STARTER_GRID, 2, '9x9')).toEqual([1, 2, 4]);
  });

  it('creates and prunes candidate notes', () => {
    const notes = candidatesAsNotes(STARTER_GRID, '9x9');
    expect(notes[2]).toEqual([1, 2, 4]);

    const staleNotes = emptyNotes('9x9');
    staleNotes[2] = [1, 2, 4, 5];
    expect(pruneImpossibleNotes(STARTER_GRID, staleNotes, '9x9')[2]).toEqual([
      1, 2, 4,
    ]);
  });

  it('removes related notes after an entry', () => {
    const notes = emptyNotes('6x6').map(() => [1, 2, 3]);
    const next = removeRelatedNotes(notes, 0, 2, '6x6');

    expect(next[0]).toEqual([]);
    expect(next[1]).toEqual([1, 3]);
    expect(next[35]).toEqual([1, 2, 3]);
  });

  it('solves the starter puzzle without mutating it', () => {
    const before = [...STARTER_GRID];
    const solution = solveGrid(STARTER_GRID, '9x9');

    expect(solution?.join('')).toBe(STARTER_SOLUTION);
    expect(STARTER_GRID).toEqual(before);
  });

  it('finds pointing candidate hints once singles are exhausted', () => {
    const grid = parseGrid(
      '609800500' +
        '238100769' +
        '000006000' +
        '060720483' +
        '027008600' +
        '840061200' +
        '000600000' +
        '780003956' +
        '006087104',
    );

    const hint = nextHint(grid, '9x9');

    expect(hint).toMatchObject({
      kind: 'elimination',
      technique: 'Pointing candidate',
      values: [4],
      message: '4 is locked into row 3 inside box 1.',
    });
  });

  it('finds claiming candidate hints once singles are exhausted', () => {
    const grid = parseGrid(
      '467319825' +
        '010280670' +
        '002760009' +
        '625471398' +
        '030526040' +
        '174938256' +
        '200657000' +
        '041892060' +
        '006143082',
    );

    const hint = nextHint(grid, '9x9');

    expect(hint).toMatchObject({
      kind: 'elimination',
      technique: 'Claiming candidate',
      values: [9],
      message: 'column 2 claims 9 inside box 7.',
    });
  });

  it('generates deterministic solvable puzzles for both board sizes', () => {
    const puzzle9 = generatePuzzle('easy', 1234, '9x9');
    const puzzle6 = generatePuzzle('medium', 1234, '6x6');

    expect(puzzle9).toEqual(generatePuzzle('easy', 1234, '9x9'));
    expect(puzzle6).toEqual(generatePuzzle('medium', 1234, '6x6'));
    expect(solveGrid(puzzle9, '9x9')).not.toBeNull();
    expect(solveGrid(puzzle6, '6x6')).not.toBeNull();
  });
});

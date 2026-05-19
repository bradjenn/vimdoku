export type Grid = number[];
export type Notes = number[][];
export type PuzzleDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

export type Hint =
  | {
      kind: 'single';
      technique: string;
      cell: number;
      value: number;
      nudge: string;
      message: string;
      detail: string;
    }
  | {
      kind: 'solution';
      technique: string;
      cell: number;
      value: number;
      nudge: string;
      message: string;
      detail: string;
    }
  | {
      kind: 'complete';
      message: string;
    }
  | {
      kind: 'invalid';
      message: string;
    };

export const EMPTY_GRID: Grid = Array(81).fill(0);
export const EMPTY_NOTES: Notes = Array.from({ length: 81 }, () => []);

export const STARTER_GRID: Grid = parseGrid(
  '530070000' +
    '600195000' +
    '098000060' +
    '800060003' +
    '400803001' +
    '700020006' +
    '060000280' +
    '000419005' +
    '000080079',
);

const DIFFICULTY_CLUES: Record<PuzzleDifficulty, number> = {
  easy: 42,
  medium: 36,
  hard: 30,
  expert: 26,
};

export function parseGrid(input: string): Grid {
  const cells = input
    .replace(/[^0-9.]/g, '')
    .slice(0, 81)
    .padEnd(81, '0')
    .split('')
    .map((char) => (char === '.' ? 0 : Number(char)));

  return cells.map((value) => (value >= 1 && value <= 9 ? value : 0));
}

export function generatePuzzle(
  difficulty: PuzzleDifficulty = 'medium',
  seed = Date.now(),
): Grid {
  const targetClues = DIFFICULTY_CLUES[difficulty];
  let bestPuzzle = STARTER_GRID;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const random = seededRandom(seed + attempt * 0x9e3779b1);
    const puzzle = makeSolvedGrid(random);
    let clueCount = 81;

    const pairs = shuffle(
      Array.from({ length: 41 }, (_, index) => index),
      random,
    ).map((index) => (index === 40 ? [index] : [index, 80 - index]));

    for (const pair of pairs) {
      if (clueCount <= targetClues) break;

      const previous = pair.map((index) => puzzle[index]);
      const removed = previous.filter(Boolean).length;
      if (removed === 0 || clueCount - removed < targetClues) continue;

      for (const index of pair) puzzle[index] = 0;

      if (countSolutions(puzzle, 2) === 1) {
        clueCount -= removed;
      } else {
        pair.forEach((index, offset) => {
          puzzle[index] = previous[offset];
        });
      }
    }

    const distance = Math.abs(clueCount - targetClues);
    if (
      distance < bestDistance ||
      (distance === bestDistance && puzzle.filter(Boolean).length < bestPuzzle.filter(Boolean).length)
    ) {
      bestPuzzle = [...puzzle];
      bestDistance = distance;
    }

    if (distance <= 2) return bestPuzzle;
  }

  return bestPuzzle;
}

export function cloneNotes(notes: Notes): Notes {
  return notes.map((cell) => [...cell]);
}

export function peers(index: number): Set<number> {
  const row = Math.floor(index / 9);
  const col = index % 9;
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  const result = new Set<number>();

  for (let i = 0; i < 9; i += 1) {
    result.add(row * 9 + i);
    result.add(i * 9 + col);
  }

  for (let r = boxRow; r < boxRow + 3; r += 1) {
    for (let c = boxCol; c < boxCol + 3; c += 1) {
      result.add(r * 9 + c);
    }
  }

  result.delete(index);
  return result;
}

export function isValidMove(grid: Grid, index: number, value: number): boolean {
  if (value === 0) return true;
  for (const peer of peers(index)) {
    if (grid[peer] === value) return false;
  }
  return true;
}

export function findConflicts(grid: Grid): Set<number> {
  const conflicts = new Set<number>();

  grid.forEach((value, index) => {
    if (value === 0) return;
    const withoutCell = [...grid];
    withoutCell[index] = 0;
    if (!isValidMove(withoutCell, index, value)) {
      conflicts.add(index);
      for (const peer of peers(index)) {
        if (grid[peer] === value) conflicts.add(peer);
      }
    }
  });

  return conflicts;
}

export function candidatesFor(grid: Grid, index: number): number[] {
  if (grid[index] !== 0) return [];
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((value) =>
    isValidMove(grid, index, value),
  );
}

export function candidatesAsNotes(grid: Grid): Notes {
  return grid.map((value, index) => (value === 0 ? candidatesFor(grid, index) : []));
}

export function pruneImpossibleNotes(grid: Grid, notes: Notes): Notes {
  return notes.map((cell, index) => {
    const candidates = candidatesFor(grid, index);
    return cell.filter((note) => candidates.includes(note));
  });
}

export function solveGrid(grid: Grid): Grid | null {
  if (findConflicts(grid).size > 0) return null;
  const working = [...grid];

  function solve(): boolean {
    let bestIndex = -1;
    let bestCandidates: number[] = [];

    for (let index = 0; index < 81; index += 1) {
      if (working[index] !== 0) continue;
      const candidates = candidatesFor(working, index);
      if (candidates.length === 0) return false;
      if (bestIndex === -1 || candidates.length < bestCandidates.length) {
        bestIndex = index;
        bestCandidates = candidates;
      }
    }

    if (bestIndex === -1) return true;

    for (const candidate of bestCandidates) {
      working[bestIndex] = candidate;
      if (solve()) return true;
      working[bestIndex] = 0;
    }

    return false;
  }

  return solve() ? working : null;
}

function countSolutions(grid: Grid, limit: number): number {
  if (findConflicts(grid).size > 0) return 0;
  const working = [...grid];
  let count = 0;

  function search(): void {
    if (count >= limit) return;

    let bestIndex = -1;
    let bestCandidates: number[] = [];

    for (let index = 0; index < 81; index += 1) {
      if (working[index] !== 0) continue;
      const candidates = candidatesFor(working, index);
      if (candidates.length === 0) return;
      if (bestIndex === -1 || candidates.length < bestCandidates.length) {
        bestIndex = index;
        bestCandidates = candidates;
      }
    }

    if (bestIndex === -1) {
      count += 1;
      return;
    }

    for (const candidate of bestCandidates) {
      working[bestIndex] = candidate;
      search();
      working[bestIndex] = 0;
      if (count >= limit) return;
    }
  }

  search();
  return count;
}

export function nextHint(grid: Grid): Hint {
  if (findConflicts(grid).size > 0) {
    return {
      kind: 'invalid',
      message: 'There is a conflict on the board. Fix highlighted cells first.',
    };
  }

  if (grid.every(Boolean)) {
    return { kind: 'complete', message: 'The board is complete.' };
  }

  for (let index = 0; index < 81; index += 1) {
    const candidates = candidatesFor(grid, index);
    if (candidates.length === 1) {
      return {
        kind: 'single',
        technique: 'Naked single',
        cell: index,
        value: candidates[0],
        nudge: `${labelCell(index)} is nearly forced.`,
        message: `${labelCell(index)} can only be ${candidates[0]}.`,
        detail: `Every other digit conflicts with the row, column, or box around ${labelCell(
          index,
        )}.`,
      };
    }
  }

  for (const unit of allUnits()) {
    for (let value = 1; value <= 9; value += 1) {
      const possibleCells = unit.filter(
        (index) => grid[index] === 0 && candidatesFor(grid, index).includes(value),
      );
      if (possibleCells.length === 1) {
        return {
          kind: 'single',
          technique: 'Hidden single',
          cell: possibleCells[0],
          value,
          nudge: `Look for where ${value} can go in ${unitLabel(unit)}.`,
          message: `${value} has only one place in ${unitLabel(unit)}.`,
          detail: `${labelCell(
            possibleCells[0],
          )} is the only open cell in that unit that can accept ${value}.`,
        };
      }
    }
  }

  const solved = solveGrid(grid);
  if (!solved) {
    return {
      kind: 'invalid',
      message: 'This puzzle does not currently have a solution.',
    };
  }

  const cell = grid.findIndex((value) => value === 0);
  return {
    kind: 'solution',
    technique: 'Solver nudge',
    cell,
    value: solved[cell],
    nudge: `Try investigating ${labelCell(cell)}.`,
    message: `No simple single is available. Try ${solved[cell]} at ${labelCell(cell)}.`,
    detail:
      'The lightweight human hint engine did not find a naked or hidden single, so this falls back to the solved grid.',
  };
}

export function removeRelatedNotes(notes: Notes, index: number, value: number): Notes {
  const next = cloneNotes(notes);
  next[index] = [];
  for (const peer of peers(index)) {
    next[peer] = next[peer].filter((note) => note !== value);
  }
  return next;
}

export function labelCell(index: number): string {
  return `r${Math.floor(index / 9) + 1}c${(index % 9) + 1}`;
}

function allUnits(): number[][] {
  const units: number[][] = [];

  for (let i = 0; i < 9; i += 1) {
    units.push(Array.from({ length: 9 }, (_, col) => i * 9 + col));
    units.push(Array.from({ length: 9 }, (_, row) => row * 9 + i));
  }

  for (let boxRow = 0; boxRow < 3; boxRow += 1) {
    for (let boxCol = 0; boxCol < 3; boxCol += 1) {
      const unit: number[] = [];
      for (let row = boxRow * 3; row < boxRow * 3 + 3; row += 1) {
        for (let col = boxCol * 3; col < boxCol * 3 + 3; col += 1) {
          unit.push(row * 9 + col);
        }
      }
      units.push(unit);
    }
  }

  return units;
}

function makeSolvedGrid(random: () => number): Grid {
  const bands = shuffle([0, 1, 2], random);
  const stacks = shuffle([0, 1, 2], random);
  const rows = bands.flatMap((band) =>
    shuffle([0, 1, 2], random).map((row) => band * 3 + row),
  );
  const cols = stacks.flatMap((stack) =>
    shuffle([0, 1, 2], random).map((col) => stack * 3 + col),
  );
  const values = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], random);

  return rows.flatMap((row) =>
    cols.map((col) => values[(row * 3 + Math.floor(row / 3) + col) % 9]),
  );
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function unitLabel(unit: number[]): string {
  const first = unit[0];
  const second = unit[1];

  if (second === first + 1) return `row ${Math.floor(first / 9) + 1}`;
  if (second === first + 9) return `column ${(first % 9) + 1}`;
  return `box ${Math.floor(first / 27) * 3 + Math.floor((first % 9) / 3) + 1}`;
}

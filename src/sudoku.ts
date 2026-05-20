export type Grid = number[];
export type Notes = number[][];
export type PuzzleDifficulty = 'easy' | 'medium' | 'hard' | 'expert';
export type PuzzleSize = '6x6' | '9x9';

export type BoardConfig = {
  boxCols: number;
  boxRows: number;
  cellCount: number;
  digits: number[];
  puzzleSize: PuzzleSize;
  size: number;
};

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
      kind: 'elimination';
      technique: string;
      cells: number[];
      values: number[];
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

export const DEFAULT_PUZZLE_SIZE: PuzzleSize = '9x9';

export const BOARD_CONFIGS: Record<PuzzleSize, BoardConfig> = {
  '6x6': {
    boxCols: 3,
    boxRows: 2,
    cellCount: 36,
    digits: [1, 2, 3, 4, 5, 6],
    puzzleSize: '6x6',
    size: 6,
  },
  '9x9': {
    boxCols: 3,
    boxRows: 3,
    cellCount: 81,
    digits: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    puzzleSize: '9x9',
    size: 9,
  },
};

export const EMPTY_GRID: Grid = emptyGrid();
export const EMPTY_NOTES: Notes = emptyNotes();

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

const DIFFICULTY_CLUES: Record<PuzzleSize, Record<PuzzleDifficulty, number>> = {
  '6x6': {
    easy: 24,
    medium: 20,
    hard: 17,
    expert: 14,
  },
  '9x9': {
    easy: 42,
    medium: 36,
    hard: 30,
    expert: 26,
  },
};

export function boardConfigFor(puzzleSize: PuzzleSize = DEFAULT_PUZZLE_SIZE) {
  return BOARD_CONFIGS[puzzleSize] ?? BOARD_CONFIGS[DEFAULT_PUZZLE_SIZE];
}

export function emptyGrid(puzzleSize: PuzzleSize = DEFAULT_PUZZLE_SIZE): Grid {
  return Array(boardConfigFor(puzzleSize).cellCount).fill(0);
}

export function emptyNotes(puzzleSize: PuzzleSize = DEFAULT_PUZZLE_SIZE): Notes {
  return Array.from({ length: boardConfigFor(puzzleSize).cellCount }, () => []);
}

export function puzzleSizeFromGrid(grid: Grid | string): PuzzleSize {
  const length = typeof grid === 'string' ? normalizeGridText(grid).length : grid.length;
  return length === BOARD_CONFIGS['6x6'].cellCount ? '6x6' : '9x9';
}

export function parseGrid(
  input: string,
  puzzleSize: PuzzleSize = puzzleSizeFromGrid(input),
): Grid {
  const config = boardConfigFor(puzzleSize);
  const cells = normalizeGridText(input)
    .slice(0, config.cellCount)
    .padEnd(config.cellCount, '0')
    .split('')
    .map((char) => (char === '.' ? 0 : Number(char)));

  return cells.map((value) =>
    value >= 1 && value <= config.size ? value : 0,
  );
}

export function generatePuzzle(
  difficulty: PuzzleDifficulty = 'medium',
  seed = Date.now(),
  puzzleSize: PuzzleSize = DEFAULT_PUZZLE_SIZE,
): Grid {
  const config = boardConfigFor(puzzleSize);
  const targetClues = DIFFICULTY_CLUES[puzzleSize][difficulty];
  let bestPuzzle = makeSolvedGrid(puzzleSize, seededRandom(seed));
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const random = seededRandom(seed + attempt * 0x9e3779b1);
    const puzzle = makeSolvedGrid(puzzleSize, random);
    let clueCount = config.cellCount;

    const midpoint = Math.floor(config.cellCount / 2);
    const pairs = shuffle(
      Array.from({ length: midpoint + 1 }, (_, index) => index),
      random,
    ).map((index) =>
      config.cellCount % 2 === 1 && index === midpoint
        ? [index]
        : [index, config.cellCount - 1 - index],
    );

    for (const pair of pairs) {
      if (clueCount <= targetClues) break;

      const previous = pair.map((index) => puzzle[index]);
      const removed = previous.filter(Boolean).length;
      if (removed === 0 || clueCount - removed < targetClues) continue;

      for (const index of pair) puzzle[index] = 0;

      if (countSolutions(puzzle, 2, puzzleSize) === 1) {
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

export function peers(
  index: number,
  puzzleSize: PuzzleSize = DEFAULT_PUZZLE_SIZE,
): Set<number> {
  const config = boardConfigFor(puzzleSize);
  const row = Math.floor(index / config.size);
  const col = index % config.size;
  const boxRow = Math.floor(row / config.boxRows) * config.boxRows;
  const boxCol = Math.floor(col / config.boxCols) * config.boxCols;
  const result = new Set<number>();

  for (let i = 0; i < config.size; i += 1) {
    result.add(row * config.size + i);
    result.add(i * config.size + col);
  }

  for (let r = boxRow; r < boxRow + config.boxRows; r += 1) {
    for (let c = boxCol; c < boxCol + config.boxCols; c += 1) {
      result.add(r * config.size + c);
    }
  }

  result.delete(index);
  return result;
}

export function isValidMove(
  grid: Grid,
  index: number,
  value: number,
  puzzleSize: PuzzleSize = puzzleSizeFromGrid(grid),
): boolean {
  if (value === 0) return true;
  for (const peer of peers(index, puzzleSize)) {
    if (grid[peer] === value) return false;
  }
  return true;
}

export function findConflicts(
  grid: Grid,
  puzzleSize: PuzzleSize = puzzleSizeFromGrid(grid),
): Set<number> {
  const conflicts = new Set<number>();

  grid.forEach((value, index) => {
    if (value === 0) return;
    const withoutCell = [...grid];
    withoutCell[index] = 0;
    if (!isValidMove(withoutCell, index, value, puzzleSize)) {
      conflicts.add(index);
      for (const peer of peers(index, puzzleSize)) {
        if (grid[peer] === value) conflicts.add(peer);
      }
    }
  });

  return conflicts;
}

export function candidatesFor(
  grid: Grid,
  index: number,
  puzzleSize: PuzzleSize = puzzleSizeFromGrid(grid),
): number[] {
  if (grid[index] !== 0) return [];
  return boardConfigFor(puzzleSize).digits.filter((value) =>
    isValidMove(grid, index, value, puzzleSize),
  );
}

export function candidatesAsNotes(
  grid: Grid,
  puzzleSize: PuzzleSize = puzzleSizeFromGrid(grid),
): Notes {
  return grid.map((value, index) =>
    value === 0 ? candidatesFor(grid, index, puzzleSize) : [],
  );
}

export function pruneImpossibleNotes(
  grid: Grid,
  notes: Notes,
  puzzleSize: PuzzleSize = puzzleSizeFromGrid(grid),
): Notes {
  return notes.map((cell, index) => {
    const candidates = candidatesFor(grid, index, puzzleSize);
    return cell.filter((note) => candidates.includes(note));
  });
}

export function solveGrid(
  grid: Grid,
  puzzleSize: PuzzleSize = puzzleSizeFromGrid(grid),
): Grid | null {
  const config = boardConfigFor(puzzleSize);
  if (findConflicts(grid, puzzleSize).size > 0) return null;
  const working = [...grid];

  function solve(): boolean {
    let bestIndex = -1;
    let bestCandidates: number[] = [];

    for (let index = 0; index < config.cellCount; index += 1) {
      if (working[index] !== 0) continue;
      const candidates = candidatesFor(working, index, puzzleSize);
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

function countSolutions(
  grid: Grid,
  limit: number,
  puzzleSize: PuzzleSize,
): number {
  const config = boardConfigFor(puzzleSize);
  if (findConflicts(grid, puzzleSize).size > 0) return 0;
  const working = [...grid];
  let count = 0;

  function search(): void {
    if (count >= limit) return;

    let bestIndex = -1;
    let bestCandidates: number[] = [];

    for (let index = 0; index < config.cellCount; index += 1) {
      if (working[index] !== 0) continue;
      const candidates = candidatesFor(working, index, puzzleSize);
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

export function nextHint(
  grid: Grid,
  puzzleSize: PuzzleSize = puzzleSizeFromGrid(grid),
): Hint {
  if (findConflicts(grid, puzzleSize).size > 0) {
    return {
      kind: 'invalid',
      message: 'There is a conflict on the board. Fix highlighted cells first.',
    };
  }

  if (grid.every(Boolean)) {
    return { kind: 'complete', message: 'The board is complete.' };
  }

  const config = boardConfigFor(puzzleSize);
  for (let index = 0; index < config.cellCount; index += 1) {
    const candidates = candidatesFor(grid, index, puzzleSize);
    if (candidates.length === 1) {
      return {
        kind: 'single',
        technique: 'Naked single',
        cell: index,
        value: candidates[0],
        nudge: `${labelCell(index, puzzleSize)} is nearly forced.`,
        message: `${labelCell(index, puzzleSize)} can only be ${candidates[0]}.`,
        detail: `Every other digit conflicts with the row, column, or box around ${labelCell(
          index,
          puzzleSize,
        )}.`,
      };
    }
  }

  for (const unit of allUnits(puzzleSize)) {
    for (const value of config.digits) {
      const possibleCells = unit.filter(
        (index) =>
          grid[index] === 0 && candidatesFor(grid, index, puzzleSize).includes(value),
      );
      if (possibleCells.length === 1) {
        return {
          kind: 'single',
          technique: 'Hidden single',
          cell: possibleCells[0],
          value,
          nudge: `Look for where ${value} can go in ${unitLabel(unit, puzzleSize)}.`,
          message: `${value} has only one place in ${unitLabel(unit, puzzleSize)}.`,
          detail: `${labelCell(
            possibleCells[0],
            puzzleSize,
          )} is the only open cell in that unit that can accept ${value}.`,
        };
      }
    }
  }

  const techniqueHint =
    findPointingCandidate(grid, puzzleSize) ??
    findClaimingCandidate(grid, puzzleSize) ??
    findNakedPair(grid, puzzleSize);
  if (techniqueHint) return techniqueHint;

  const solved = solveGrid(grid, puzzleSize);
  if (!solved) {
    return {
      kind: 'invalid',
      message: 'This puzzle does not currently have a solution.',
    };
  }

  const cell = grid.indexOf(0);
  return {
    kind: 'solution',
    technique: 'Solver nudge',
    cell,
    value: solved[cell],
    nudge: `Try investigating ${labelCell(cell, puzzleSize)}.`,
    message: `No simple single is available. Try ${solved[cell]} at ${labelCell(cell, puzzleSize)}.`,
    detail:
      'The lightweight human hint engine did not find a naked or hidden single, so this falls back to the solved grid.',
  };
}

function findPointingCandidate(
  grid: Grid,
  puzzleSize: PuzzleSize,
): Hint | null {
  const config = boardConfigFor(puzzleSize);

  for (const box of boxUnits(puzzleSize)) {
    for (const value of config.digits) {
      const possibleCells = candidateCells(grid, box, value, puzzleSize);
      if (possibleCells.length < 2) continue;

      const rows = unique(possibleCells.map((index) => Math.floor(index / config.size)));
      if (rows.length === 1) {
        const row = rowUnit(rows[0], puzzleSize);
        const targets = candidateCells(
          grid,
          row.filter((index) => !box.includes(index)),
          value,
          puzzleSize,
        );
        if (targets.length > 0) {
          return eliminationHint(
            'Pointing candidate',
            value,
            possibleCells,
            targets,
            `Check ${unitLabel(box, puzzleSize)} before scanning row ${rows[0] + 1}.`,
            `${value} is locked into row ${rows[0] + 1} inside ${unitLabel(box, puzzleSize)}.`,
            `Every possible ${value} in ${unitLabel(
              box,
              puzzleSize,
            )} sits on row ${rows[0] + 1}, so remove ${value} from ${listCells(
              targets,
              puzzleSize,
            )}.`,
          );
        }
      }

      const cols = unique(possibleCells.map((index) => index % config.size));
      if (cols.length === 1) {
        const col = columnUnit(cols[0], puzzleSize);
        const targets = candidateCells(
          grid,
          col.filter((index) => !box.includes(index)),
          value,
          puzzleSize,
        );
        if (targets.length > 0) {
          return eliminationHint(
            'Pointing candidate',
            value,
            possibleCells,
            targets,
            `Check ${unitLabel(box, puzzleSize)} before scanning column ${cols[0] + 1}.`,
            `${value} is locked into column ${cols[0] + 1} inside ${unitLabel(box, puzzleSize)}.`,
            `Every possible ${value} in ${unitLabel(
              box,
              puzzleSize,
            )} sits on column ${cols[0] + 1}, so remove ${value} from ${listCells(
              targets,
              puzzleSize,
            )}.`,
          );
        }
      }
    }
  }

  return null;
}

function findClaimingCandidate(
  grid: Grid,
  puzzleSize: PuzzleSize,
): Hint | null {
  const config = boardConfigFor(puzzleSize);
  const lineUnits = [
    ...Array.from({ length: config.size }, (_, row) => rowUnit(row, puzzleSize)),
    ...Array.from({ length: config.size }, (_, col) => columnUnit(col, puzzleSize)),
  ];

  for (const unit of lineUnits) {
    for (const value of config.digits) {
      const possibleCells = candidateCells(grid, unit, value, puzzleSize);
      if (possibleCells.length < 2) continue;

      const boxes = unique(possibleCells.map((index) => boxIndex(index, puzzleSize)));
      if (boxes.length !== 1) continue;

      const box = boxUnit(boxes[0], puzzleSize);
      const targets = candidateCells(
        grid,
        box.filter((index) => !unit.includes(index)),
        value,
        puzzleSize,
      );
      if (targets.length === 0) continue;

      return eliminationHint(
        'Claiming candidate',
        value,
        possibleCells,
        targets,
        `Check where ${value} fits in ${unitLabel(unit, puzzleSize)}.`,
        `${unitLabel(unit, puzzleSize)} claims ${value} inside ${unitLabel(box, puzzleSize)}.`,
        `All ${value} candidates for ${unitLabel(
          unit,
          puzzleSize,
        )} are inside ${unitLabel(box, puzzleSize)}, so remove ${value} from ${listCells(
          targets,
          puzzleSize,
        )}.`,
      );
    }
  }

  return null;
}

function findNakedPair(grid: Grid, puzzleSize: PuzzleSize): Hint | null {
  for (const unit of allUnits(puzzleSize)) {
    const pairs = new Map<string, number[]>();

    for (const index of unit) {
      const candidates = candidatesFor(grid, index, puzzleSize);
      if (candidates.length !== 2) continue;
      const key = candidates.join('');
      pairs.set(key, [...(pairs.get(key) ?? []), index]);
    }

    for (const [key, cells] of pairs) {
      if (cells.length !== 2) continue;
      const values = key.split('').map(Number);
      const targets = unit.filter(
        (index) =>
          !cells.includes(index) &&
          grid[index] === 0 &&
          candidatesFor(grid, index, puzzleSize).some((value) => values.includes(value)),
      );
      if (targets.length === 0) continue;

      return {
        kind: 'elimination',
        technique: 'Naked pair',
        cells: [...cells, ...targets],
        values,
        nudge: `Two cells in ${unitLabel(unit, puzzleSize)} share the same two candidates.`,
        message: `${listCells(cells, puzzleSize)} form a naked pair ${values.join('/')}.`,
        detail: `Those two cells must contain ${values.join(
          ' and ',
        )}, so remove them from ${listCells(targets, puzzleSize)}.`,
      };
    }
  }

  return null;
}

export function removeRelatedNotes(
  notes: Notes,
  index: number,
  value: number,
  puzzleSize: PuzzleSize = notes.length === BOARD_CONFIGS['6x6'].cellCount ? '6x6' : '9x9',
): Notes {
  const next = cloneNotes(notes);
  next[index] = [];
  for (const peer of peers(index, puzzleSize)) {
    next[peer] = next[peer].filter((note) => note !== value);
  }
  return next;
}

export function labelCell(
  index: number,
  puzzleSize: PuzzleSize = DEFAULT_PUZZLE_SIZE,
): string {
  const size = boardConfigFor(puzzleSize).size;
  return `r${Math.floor(index / size) + 1}c${(index % size) + 1}`;
}

function eliminationHint(
  technique: string,
  value: number,
  sourceCells: number[],
  targetCells: number[],
  nudge: string,
  message: string,
  detail: string,
): Hint {
  return {
    kind: 'elimination',
    technique,
    cells: [...sourceCells, ...targetCells],
    values: [value],
    nudge,
    message,
    detail,
  };
}

function candidateCells(
  grid: Grid,
  cells: number[],
  value: number,
  puzzleSize: PuzzleSize,
): number[] {
  return cells.filter(
    (index) => grid[index] === 0 && candidatesFor(grid, index, puzzleSize).includes(value),
  );
}

function rowUnit(row: number, puzzleSize: PuzzleSize): number[] {
  const config = boardConfigFor(puzzleSize);
  return Array.from({ length: config.size }, (_, col) => row * config.size + col);
}

function columnUnit(col: number, puzzleSize: PuzzleSize): number[] {
  const config = boardConfigFor(puzzleSize);
  return Array.from({ length: config.size }, (_, row) => row * config.size + col);
}

function boxIndex(index: number, puzzleSize: PuzzleSize): number {
  const config = boardConfigFor(puzzleSize);
  const row = Math.floor(index / config.size);
  const col = index % config.size;
  const boxesPerRow = config.size / config.boxCols;
  return (
    Math.floor(row / config.boxRows) * boxesPerRow +
    Math.floor(col / config.boxCols)
  );
}

function boxUnit(box: number, puzzleSize: PuzzleSize): number[] {
  const config = boardConfigFor(puzzleSize);
  const boxesPerRow = config.size / config.boxCols;
  const boxRow = Math.floor(box / boxesPerRow);
  const boxCol = box % boxesPerRow;
  const unit: number[] = [];

  for (let row = boxRow * config.boxRows; row < boxRow * config.boxRows + config.boxRows; row += 1) {
    for (let col = boxCol * config.boxCols; col < boxCol * config.boxCols + config.boxCols; col += 1) {
      unit.push(row * config.size + col);
    }
  }

  return unit;
}

function boxUnits(puzzleSize: PuzzleSize): number[][] {
  const config = boardConfigFor(puzzleSize);
  const boxCount = config.cellCount / config.size;
  return Array.from({ length: boxCount }, (_, box) => boxUnit(box, puzzleSize));
}

function unique(values: number[]): number[] {
  return [...new Set(values)];
}

function listCells(cells: number[], puzzleSize: PuzzleSize): string {
  return cells.map((cell) => labelCell(cell, puzzleSize)).join(', ');
}

function allUnits(puzzleSize: PuzzleSize): number[][] {
  const config = boardConfigFor(puzzleSize);
  const units: number[][] = [];

  for (let i = 0; i < config.size; i += 1) {
    units.push(Array.from({ length: config.size }, (_, col) => i * config.size + col));
    units.push(Array.from({ length: config.size }, (_, row) => row * config.size + i));
  }

  for (let boxRow = 0; boxRow < config.size / config.boxRows; boxRow += 1) {
    for (let boxCol = 0; boxCol < config.size / config.boxCols; boxCol += 1) {
      const unit: number[] = [];
      for (let row = boxRow * config.boxRows; row < boxRow * config.boxRows + config.boxRows; row += 1) {
        for (let col = boxCol * config.boxCols; col < boxCol * config.boxCols + config.boxCols; col += 1) {
          unit.push(row * config.size + col);
        }
      }
      units.push(unit);
    }
  }

  return units;
}

function makeSolvedGrid(
  puzzleSize: PuzzleSize,
  random: () => number,
): Grid {
  const config = boardConfigFor(puzzleSize);
  const bandCount = config.size / config.boxRows;
  const stackCount = config.size / config.boxCols;
  const bands = shuffle(
    Array.from({ length: bandCount }, (_, index) => index),
    random,
  );
  const stacks = shuffle(
    Array.from({ length: stackCount }, (_, index) => index),
    random,
  );
  const rows = bands.flatMap((band) =>
    shuffle(
      Array.from({ length: config.boxRows }, (_, row) => band * config.boxRows + row),
      random,
    ),
  );
  const cols = stacks.flatMap((stack) =>
    shuffle(
      Array.from({ length: config.boxCols }, (_, col) => stack * config.boxCols + col),
      random,
    ),
  );
  const values = shuffle(config.digits, random);

  return rows.flatMap((row) =>
    cols.map((col) =>
      values[(row * config.boxCols + Math.floor(row / config.boxRows) + col) % config.size],
    ),
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

function unitLabel(unit: number[], puzzleSize: PuzzleSize): string {
  const config = boardConfigFor(puzzleSize);
  const first = unit[0];
  const rows = unique(unit.map((index) => Math.floor(index / config.size)));
  const cols = unique(unit.map((index) => index % config.size));

  if (rows.length === 1 && unit.length === config.size) return `row ${rows[0] + 1}`;
  if (cols.length === 1 && unit.length === config.size) return `column ${cols[0] + 1}`;

  const row = Math.floor(first / config.size);
  const col = first % config.size;
  const boxesPerRow = config.size / config.boxCols;
  return `box ${
    Math.floor(row / config.boxRows) * boxesPerRow +
    Math.floor(col / config.boxCols) +
    1
  }`;
}

function normalizeGridText(input: string) {
  return input.replace(/[^0-9.]/g, '');
}

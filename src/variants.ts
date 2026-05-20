import { boardConfigFor, type Grid, type PuzzleSize } from './sudoku';

export type VariantId = 'classic' | 'anti-knight' | 'anti-king' | 'diagonal' | 'non-consecutive';

export type VariantCheckIssue = {
  cells: [number, number];
  message: string;
  variant: VariantId;
};

export const VARIANTS: Record<VariantId, { label: string; rules: string }> = {
  classic: {
    label: 'Classic',
    rules:
      'Place each digit once in every row, column, and box. Digits may not repeat in a unit.',
  },
  'anti-knight': {
    label: 'Anti-knight',
    rules:
      'Classic sudoku rules apply. Matching digits may not be a chess knight move apart.',
  },
  'anti-king': {
    label: 'Anti-king',
    rules:
      'Classic sudoku rules apply. Matching digits may not touch diagonally.',
  },
  diagonal: {
    label: 'Diagonal',
    rules:
      'Classic sudoku rules apply. Each main diagonal must also contain every digit once.',
  },
  'non-consecutive': {
    label: 'Non-consecutive',
    rules:
      'Classic sudoku rules apply. Orthogonally adjacent digits may not be consecutive.',
  },
};

export function sanitizeVariantId(value: unknown): VariantId {
  return value === 'anti-knight' ||
    value === 'anti-king' ||
    value === 'diagonal' ||
    value === 'non-consecutive'
    ? value
    : 'classic';
}

export function checkVariant(
  grid: Grid,
  puzzleSize: PuzzleSize,
  variant: VariantId = 'classic',
) {
  if (variant === 'classic') return [];
  if (variant === 'diagonal') return checkDiagonal(grid, puzzleSize);
  if (variant === 'anti-king') return checkOffsetMatches(grid, puzzleSize, variant, [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ]);
  if (variant === 'non-consecutive') return checkNonConsecutive(grid, puzzleSize);
  return checkOffsetMatches(grid, puzzleSize, variant, [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ]);
}

function checkOffsetMatches(
  grid: Grid,
  puzzleSize: PuzzleSize,
  variant: VariantId,
  deltas: number[][],
) {
  const config = boardConfigFor(puzzleSize);
  const issues: VariantCheckIssue[] = [];

  for (let index = 0; index < grid.length; index += 1) {
    const value = grid[index];
    if (value === 0) continue;
    const row = Math.floor(index / config.size);
    const col = index % config.size;
    for (const [deltaRow, deltaCol] of deltas) {
      const nextRow = row + deltaRow;
      const nextCol = col + deltaCol;
      if (
        nextRow < 0 ||
        nextRow >= config.size ||
        nextCol < 0 ||
        nextCol >= config.size
      ) {
        continue;
      }
      const peer = nextRow * config.size + nextCol;
      if (peer > index && grid[peer] === value) {
        issues.push({
          cells: [index, peer],
          message:
            variant === 'anti-king'
              ? `${value} touches diagonally in anti-king mode.`
              : `${value} repeats across an anti-knight move.`,
          variant,
        });
      }
    }
  }
  return issues;
}

function checkDiagonal(grid: Grid, puzzleSize: PuzzleSize) {
  const config = boardConfigFor(puzzleSize);
  const issues: VariantCheckIssue[] = [];
  const diagonals = [
    Array.from({ length: config.size }, (_, index) => index * config.size + index),
    Array.from(
      { length: config.size },
      (_, index) => index * config.size + (config.size - index - 1),
    ),
  ];

  for (const diagonal of diagonals) {
    const byValue = new Map<number, number[]>();
    for (const cell of diagonal) {
      const value = grid[cell];
      if (value === 0) continue;
      byValue.set(value, [...(byValue.get(value) ?? []), cell]);
    }
    for (const [value, cells] of byValue) {
      if (cells.length > 1) {
        issues.push({
          cells: [cells[0], cells[1]],
          message: `${value} repeats on a diagonal.`,
          variant: 'diagonal',
        });
      }
    }
  }
  return issues;
}

function checkNonConsecutive(grid: Grid, puzzleSize: PuzzleSize) {
  const config = boardConfigFor(puzzleSize);
  const issues: VariantCheckIssue[] = [];
  const deltas = [
    [0, 1],
    [1, 0],
  ];

  for (let index = 0; index < grid.length; index += 1) {
    const value = grid[index];
    if (value === 0) continue;
    const row = Math.floor(index / config.size);
    const col = index % config.size;
    for (const [deltaRow, deltaCol] of deltas) {
      const nextRow = row + deltaRow;
      const nextCol = col + deltaCol;
      if (nextRow >= config.size || nextCol >= config.size) continue;
      const peer = nextRow * config.size + nextCol;
      const peerValue = grid[peer];
      if (peerValue !== 0 && Math.abs(value - peerValue) === 1) {
        issues.push({
          cells: [index, peer],
          message: `${value} and ${peerValue} are consecutive neighbours.`,
          variant: 'non-consecutive',
        });
      }
    }
  }
  return issues;
}

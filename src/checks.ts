import { boardConfigFor, type Grid, type PuzzleSize } from './sudoku';

export type CheckIssue = {
  cells: number[];
  label: string;
  unit: 'row' | 'column' | 'box';
  value: number;
};

export type CheckResult =
  | { issues: []; message: string; ok: true }
  | { issues: CheckIssue[]; message: string; ok: false };

export function checkGrid(grid: Grid, puzzleSize: PuzzleSize): CheckResult {
  const config = boardConfigFor(puzzleSize);
  const issues: CheckIssue[] = [];

  for (let index = 0; index < config.size; index += 1) {
    collectUnitIssues(
      issues,
      Array.from({ length: config.size }, (_, col) => index * config.size + col),
      `row ${index + 1}`,
      'row',
      grid,
    );
    collectUnitIssues(
      issues,
      Array.from({ length: config.size }, (_, row) => row * config.size + index),
      `column ${index + 1}`,
      'column',
      grid,
    );
  }

  for (let boxRow = 0; boxRow < config.size / config.boxRows; boxRow += 1) {
    for (let boxCol = 0; boxCol < config.size / config.boxCols; boxCol += 1) {
      const cells: number[] = [];
      for (
        let row = boxRow * config.boxRows;
        row < boxRow * config.boxRows + config.boxRows;
        row += 1
      ) {
        for (
          let col = boxCol * config.boxCols;
          col < boxCol * config.boxCols + config.boxCols;
          col += 1
        ) {
          cells.push(row * config.size + col);
        }
      }
      collectUnitIssues(
        issues,
        cells,
        `box ${boxRow * (config.size / config.boxCols) + boxCol + 1}`,
        'box',
        grid,
      );
    }
  }

  if (issues.length === 0) {
    return {
      issues: [],
      message: 'Check passed: no row, column, or box conflicts.',
      ok: true,
    };
  }

  const first = issues[0];
  return {
    issues,
    message: `Check found ${first.value} repeated in ${first.label}.`,
    ok: false,
  };
}

function collectUnitIssues(
  issues: CheckIssue[],
  cells: number[],
  label: string,
  unit: CheckIssue['unit'],
  grid: Grid,
) {
  const byValue = new Map<number, number[]>();
  for (const cell of cells) {
    const value = grid[cell];
    if (value === 0) continue;
    byValue.set(value, [...(byValue.get(value) ?? []), cell]);
  }
  for (const [value, repeatedCells] of byValue) {
    if (repeatedCells.length > 1) {
      issues.push({ cells: repeatedCells, label, unit, value });
    }
  }
}

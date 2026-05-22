import { boardConfigFor, type PuzzleSize } from './sudoku';

export function rectangularSelection(
  anchor: number,
  focus: number,
  puzzleSize: PuzzleSize,
) {
  const size = boardConfigFor(puzzleSize).size;
  const r1 = Math.min(Math.floor(anchor / size), Math.floor(focus / size));
  const r2 = Math.max(Math.floor(anchor / size), Math.floor(focus / size));
  const c1 = Math.min(anchor % size, focus % size);
  const c2 = Math.max(anchor % size, focus % size);
  const cells = new Set<number>();
  for (let row = r1; row <= r2; row += 1) {
    for (let col = c1; col <= c2; col += 1) cells.add(row * size + col);
  }
  return cells;
}

export function rowSelection(index: number, puzzleSize: PuzzleSize) {
  const size = boardConfigFor(puzzleSize).size;
  const row = Math.floor(index / size);
  return new Set(Array.from({ length: size }, (_, col) => row * size + col));
}

export function columnSelection(index: number, puzzleSize: PuzzleSize) {
  const size = boardConfigFor(puzzleSize).size;
  const col = index % size;
  return new Set(Array.from({ length: size }, (_, row) => row * size + col));
}

export function boxSelection(index: number, puzzleSize: PuzzleSize) {
  const config = boardConfigFor(puzzleSize);
  const row = Math.floor(index / config.size);
  const col = index % config.size;
  const boxRow = Math.floor(row / config.boxRows) * config.boxRows;
  const boxCol = Math.floor(col / config.boxCols) * config.boxCols;
  const cells = new Set<number>();
  for (let r = boxRow; r < boxRow + config.boxRows; r += 1) {
    for (let c = boxCol; c < boxCol + config.boxCols; c += 1) {
      cells.add(r * config.size + c);
    }
  }
  return cells;
}

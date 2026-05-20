import {
  emptyNotes,
  parseGrid,
  puzzleSizeFromGrid,
  type Grid,
  type Notes,
  type PuzzleSize,
} from './sudoku';
import { sanitizeVariantId, type VariantId } from './variants';

export type SharedPuzzle = {
  cellColors?: Array<number | null>;
  cornerMarks?: Notes;
  elapsedMs?: number;
  givens: boolean[];
  grid: Grid;
  kind?: 'puzzle' | 'state';
  notes?: Notes;
  puzzleSize: PuzzleSize;
  rules?: string;
  title?: string;
  variantId?: VariantId;
};

export function encodePuzzleLinkData(puzzle: SharedPuzzle) {
  const kind = puzzle.kind ?? 'puzzle';
  const normalized: SharedPuzzle = {
    givens: puzzle.givens.map(Boolean),
    grid: parseGrid(puzzle.grid.join(''), puzzle.puzzleSize),
    puzzleSize: puzzle.puzzleSize,
    rules: puzzle.rules?.trim() || undefined,
    title: puzzle.title?.trim() || undefined,
    variantId: puzzle.variantId ?? 'classic',
  };
  if (kind === 'state') {
    normalized.kind = kind;
    normalized.cellColors = sanitizeCellColors(puzzle.cellColors, puzzle.puzzleSize);
    normalized.cornerMarks = sanitizeNotes(puzzle.cornerMarks, puzzle.puzzleSize);
    normalized.elapsedMs = Math.max(0, Math.floor(puzzle.elapsedMs ?? 0));
    normalized.notes = sanitizeNotes(puzzle.notes, puzzle.puzzleSize);
  }
  return encodeBase64Url(JSON.stringify(normalized));
}

export function decodePuzzleLinkData(value: string): SharedPuzzle | null {
  try {
    const parsed = JSON.parse(decodeBase64Url(value)) as SharedPuzzle;
    const puzzleSize =
      parsed.puzzleSize === '6x6' || parsed.puzzleSize === '9x9'
        ? parsed.puzzleSize
        : puzzleSizeFromGrid(parsed.grid ?? []);
    const grid = parseGrid(parsed.grid?.join('') ?? '', puzzleSize);
    if (parsed.givens?.length !== grid.length) return null;
    const kind = parsed.kind === 'state' ? 'state' : 'puzzle';
    const shared: SharedPuzzle = {
      givens: parsed.givens.map(Boolean),
      grid,
      puzzleSize,
      rules: parsed.rules ? String(parsed.rules) : undefined,
      title: parsed.title ? String(parsed.title) : undefined,
      variantId: sanitizeVariantId(parsed.variantId),
    };
    if (kind === 'state') {
      shared.kind = kind;
      shared.cellColors = sanitizeCellColors(parsed.cellColors, puzzleSize);
      shared.cornerMarks = sanitizeNotes(parsed.cornerMarks, puzzleSize);
      shared.elapsedMs = Math.max(0, Math.floor(parsed.elapsedMs ?? 0));
      shared.notes = sanitizeNotes(parsed.notes, puzzleSize);
    }
    return shared;
  } catch {
    return null;
  }
}

function sanitizeNotes(notes: Notes | undefined, puzzleSize: PuzzleSize): Notes {
  const cellCount = puzzleSize === '6x6' ? 36 : 81;
  const maxDigit = puzzleSize === '6x6' ? 6 : 9;
  if (!Array.isArray(notes) || notes.length !== cellCount) return emptyNotes(puzzleSize);
  return notes.map((cell) =>
    Array.isArray(cell)
      ? [...new Set(cell.filter((value) => value >= 1 && value <= maxDigit))]
          .map((value) => Math.floor(value))
          .sort()
      : [],
  );
}

function sanitizeCellColors(
  cellColors: Array<number | null> | undefined,
  puzzleSize: PuzzleSize,
) {
  const cellCount = puzzleSize === '6x6' ? 36 : 81;
  if (!Array.isArray(cellColors) || cellColors.length !== cellCount) {
    return Array(cellCount).fill(null);
  }
  return cellColors.map((value) =>
    typeof value === 'number' && value >= 0 && value <= 5 ? Math.floor(value) : null,
  );
}

function encodeBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    Math.ceil(value.length / 4) * 4,
    '=',
  );
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

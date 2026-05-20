import { parseGrid, puzzleSizeFromGrid, type Grid, type PuzzleSize } from './sudoku';
import { sanitizeVariantId, type VariantId } from './variants';

export type SharedPuzzle = {
  givens: boolean[];
  grid: Grid;
  puzzleSize: PuzzleSize;
  rules?: string;
  title?: string;
  variantId?: VariantId;
};

export function encodePuzzleLinkData(puzzle: SharedPuzzle) {
  const normalized: SharedPuzzle = {
    givens: puzzle.givens.map(Boolean),
    grid: parseGrid(puzzle.grid.join(''), puzzle.puzzleSize),
    puzzleSize: puzzle.puzzleSize,
    rules: puzzle.rules?.trim() || undefined,
    title: puzzle.title?.trim() || undefined,
    variantId: puzzle.variantId ?? 'classic',
  };
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
    return {
      givens: parsed.givens.map(Boolean),
      grid,
      puzzleSize,
      rules: parsed.rules ? String(parsed.rules) : undefined,
      title: parsed.title ? String(parsed.title) : undefined,
      variantId: sanitizeVariantId(parsed.variantId),
    };
  } catch {
    return null;
  }
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

import { describe, expect, it } from 'vitest';
import { decodePuzzleLinkData, encodePuzzleLinkData } from './puzzleLinks';
import { parseGrid } from './sudoku';

describe('puzzle link encoding', () => {
  it('round-trips shared puzzle data', () => {
    const grid = parseGrid('123456'.repeat(6), '6x6');
    const payload = {
      givens: grid.map(Boolean),
      grid,
      puzzleSize: '6x6' as const,
      rules: 'Rules text',
      title: 'Test puzzle',
      variantId: 'anti-knight' as const,
    };

    expect(decodePuzzleLinkData(encodePuzzleLinkData(payload))).toEqual(payload);
  });

  it('rejects malformed payloads', () => {
    expect(decodePuzzleLinkData('not-valid')).toBeNull();
  });
});

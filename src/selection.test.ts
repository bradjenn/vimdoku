import { describe, expect, it } from 'vitest';
import {
  boxSelection,
  columnSelection,
  rectangularSelection,
  rowSelection,
} from './selection';

describe('selection helpers', () => {
  it('builds rectangular visual selections', () => {
    expect([...rectangularSelection(0, 7, '6x6')]).toEqual([0, 1, 6, 7]);
  });

  it('selects rows, columns, and boxes', () => {
    expect([...rowSelection(8, '6x6')]).toEqual([6, 7, 8, 9, 10, 11]);
    expect([...columnSelection(8, '6x6')]).toEqual([2, 8, 14, 20, 26, 32]);
    expect([...boxSelection(8, '6x6')]).toEqual([0, 1, 2, 6, 7, 8]);
  });
});

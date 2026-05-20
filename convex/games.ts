import { v } from 'convex/values';
import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';

const snapshotArgs = {
  anonId: v.string(),
  completedAt: v.optional(v.string()),
  completion: v.number(),
  difficulty: v.optional(v.string()),
  elapsedMs: v.number(),
  cellColors: v.optional(v.array(v.union(v.number(), v.null()))),
  cornerMarks: v.optional(v.array(v.array(v.number()))),
  givens: v.array(v.boolean()),
  grid: v.array(v.number()),
  notes: v.array(v.array(v.number())),
  playMode: v.optional(v.string()),
  puzzle: v.string(),
  puzzleSize: v.optional(v.string()),
  recordId: v.string(),
  source: v.string(),
  status: v.union(v.literal('in-progress'), v.literal('completed')),
  updatedAt: v.string(),
  variantId: v.optional(v.string()),
};

export const upsert = mutation({
  args: snapshotArgs,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('games')
      .withIndex('by_recordId', (q) => q.eq('recordId', args.recordId))
      .unique();

    const doc = {
      anonId: args.anonId,
      completedAt: args.completedAt,
      completion: clampNumber(args.completion, 0, args.puzzleSize === '6x6' ? 36 : 81),
      difficulty: args.difficulty,
      elapsedMs: Math.max(0, Math.floor(args.elapsedMs)),
      cellColors: cleanCellColors(args.cellColors, args.puzzleSize),
      cornerMarks: cleanNotes(args.cornerMarks, args.puzzleSize),
      givens: args.givens.slice(0, args.puzzleSize === '6x6' ? 36 : 81),
      grid: args.grid.slice(0, args.puzzleSize === '6x6' ? 36 : 81),
      notes: args.notes
        .slice(0, args.puzzleSize === '6x6' ? 36 : 81)
        .map((note) => note.slice(0, args.puzzleSize === '6x6' ? 6 : 9)),
      playMode: cleanPlayMode(args.playMode),
      puzzle: args.puzzle,
      puzzleSize: args.puzzleSize ?? '9x9',
      recordId: args.recordId,
      source: args.source,
      status: args.status,
      updatedAt: args.updatedAt,
      variantId: cleanVariantId(args.variantId),
    };

    if (existing) {
      await ctx.db.patch(existing._id, doc);
      return existing._id;
    }

    return await ctx.db.insert('games', doc);
  },
});

export const listMine = query({
  args: {
    anonId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = clampNumber(args.limit ?? 50, 1, 100);
    return await ctx.db
      .query('games')
      .withIndex('by_anonId_updated', (q) => q.eq('anonId', args.anonId))
      .order('desc')
      .take(limit);
  },
});

export const stats = query({
  args: {
    anonId: v.string(),
  },
  handler: async (ctx, args) => {
    const games = await ctx.db
      .query('games')
      .withIndex('by_anonId_updated', (q) => q.eq('anonId', args.anonId))
      .order('desc')
      .take(200);
    const completed = games.filter((game) => game.status === 'completed');
    const timed = completed.filter((game) => game.elapsedMs > 0);
    const totalElapsedMs = timed.reduce((total, game) => total + game.elapsedMs, 0);
    const bestElapsedMs =
      timed.length > 0
        ? Math.min(...timed.map((game) => game.elapsedMs))
        : undefined;

    return {
      averageElapsedMs:
        timed.length > 0 ? Math.round(totalElapsedMs / timed.length) : undefined,
      bestElapsedMs,
      completedCount: completed.length,
      currentStreak: countStreak(completed.map((game) => game.completedAt ?? game.updatedAt)),
      inProgressCount: games.filter((game) => game.status === 'in-progress').length,
      lastCompletedAt: completed[0]?.completedAt ?? completed[0]?.updatedAt,
      syncedGames: games.length,
    };
  },
});

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function countStreak(values: string[]) {
  const days = new Set(
    values
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()))
      .map((date) => date.toISOString().slice(0, 10)),
  );

  let streak = 0;
  const cursor = new Date();
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

function cleanPlayMode(value: string | undefined) {
  return value === 'speedrun' || value === 'zen' || value === 'no-check'
    ? value
    : 'classic';
}

function cleanVariantId(value: string | undefined) {
  return value === 'anti-knight' ||
    value === 'anti-king' ||
    value === 'diagonal' ||
    value === 'non-consecutive'
    ? value
    : 'classic';
}

function cleanCellColors(
  values: Array<number | null> | undefined,
  puzzleSize: string | undefined,
) {
  const cellCount = puzzleSize === '6x6' ? 36 : 81;
  if (!Array.isArray(values)) return Array(cellCount).fill(null);
  return values.slice(0, cellCount).map((value) =>
    typeof value === 'number' && value >= 0 && value <= 5 ? Math.floor(value) : null,
  );
}

function cleanNotes(values: number[][] | undefined, puzzleSize: string | undefined) {
  const cellCount = puzzleSize === '6x6' ? 36 : 81;
  const maxDigit = puzzleSize === '6x6' ? 6 : 9;
  if (!Array.isArray(values)) return Array.from({ length: cellCount }, () => []);
  return values.slice(0, cellCount).map((cell) =>
    Array.isArray(cell)
      ? [...new Set(cell.filter((value) => value >= 1 && value <= maxDigit))]
          .map((value) => Math.floor(value))
          .sort()
      : [],
  );
}

import { v } from 'convex/values';
import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';

export const submitScore = mutation({
  args: {
    anonId: v.string(),
    completedAt: v.string(),
    difficulty: v.optional(v.string()),
    elapsedMs: v.number(),
    player: v.string(),
    puzzle: v.string(),
    puzzleSize: v.optional(v.string()),
    recordId: v.string(),
    source: v.string(),
  },
  handler: async (ctx, args) => {
    const elapsedMs = Math.max(0, Math.floor(args.elapsedMs));
    const player = cleanName(args.player);
    const existing = await ctx.db
      .query('scores')
      .withIndex('by_recordId', (q) => q.eq('recordId', args.recordId))
      .unique();

    if (existing) {
      if (elapsedMs >= existing.elapsedMs) return existing._id;
      await ctx.db.patch(existing._id, {
        completedAt: args.completedAt,
        difficulty: args.difficulty,
        elapsedMs,
        player,
        puzzleSize: cleanPuzzleSize(args.puzzleSize),
        source: args.source,
      });
      return existing._id;
    }

    return await ctx.db.insert('scores', {
      anonId: args.anonId,
      completedAt: args.completedAt,
      createdAt: new Date().toISOString(),
      difficulty: args.difficulty,
      elapsedMs,
      player,
      puzzle: args.puzzle,
      puzzleSize: cleanPuzzleSize(args.puzzleSize),
      recordId: args.recordId,
      source: args.source,
    });
  },
});

export const top = query({
  args: {
    limit: v.optional(v.number()),
    puzzle: v.optional(v.string()),
    puzzleSize: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 50)));
    const scores = args.puzzle
      ? await ctx.db
          .query('scores')
          .withIndex('by_puzzle_elapsedMs', (q) => q.eq('puzzle', args.puzzle ?? ''))
          .order('asc')
          .take(limit)
      : args.puzzleSize
        ? await ctx.db
            .query('scores')
            .withIndex('by_puzzleSize_elapsedMs', (q) =>
              q.eq('puzzleSize', cleanPuzzleSize(args.puzzleSize)),
            )
            .order('asc')
            .take(limit)
      : await ctx.db.query('scores').withIndex('by_elapsedMs').order('asc').take(limit);

    return scores.map((score) => ({
      completedAt: score.completedAt,
      difficulty: score.difficulty,
      elapsedMs: score.elapsedMs,
      id: score.recordId,
      player: score.player,
      puzzle: score.puzzle,
      puzzleSize: score.puzzleSize ?? '9x9',
      source: score.source,
    }));
  },
});

function cleanName(value: string) {
  const trimmed = value.trim().slice(0, 32);
  return trimmed || 'anonymous';
}

function cleanPuzzleSize(value: string | undefined) {
  return value === '6x6' ? '6x6' : '9x9';
}

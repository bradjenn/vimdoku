import { v } from 'convex/values';
import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';

export const upsert = mutation({
  args: {
    anonId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const name = cleanName(args.name);
    const existing = await ctx.db
      .query('profiles')
      .withIndex('by_anonId', (q) => q.eq('anonId', args.anonId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert('profiles', {
      anonId: args.anonId,
      createdAt: now,
      name,
      updatedAt: now,
    });
  },
});

export const current = query({
  args: {
    anonId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('profiles')
      .withIndex('by_anonId', (q) => q.eq('anonId', args.anonId))
      .unique();
  },
});

function cleanName(value: string) {
  const trimmed = value.trim().slice(0, 32);
  return trimmed || 'anonymous';
}

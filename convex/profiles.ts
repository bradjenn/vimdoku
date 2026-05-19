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
    const friendCode = makeFriendCode(args.anonId);
    const existing = await ctx.db
      .query('profiles')
      .withIndex('by_anonId', (q) => q.eq('anonId', args.anonId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        friendCode: existing.friendCode ?? friendCode,
        name,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert('profiles', {
      anonId: args.anonId,
      createdAt: now,
      friendCode,
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

export const publicByFriendCode = query({
  args: {
    friendCode: v.string(),
  },
  handler: async (ctx, args) => {
    const friendCode = cleanFriendCode(args.friendCode);
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_friendCode', (q) => q.eq('friendCode', friendCode))
      .unique();

    if (!profile) return null;

    const games = await ctx.db
      .query('games')
      .withIndex('by_anonId_updated', (q) => q.eq('anonId', profile.anonId))
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
      createdAt: profile.createdAt,
      friendCode: profile.friendCode ?? friendCode,
      name: profile.name,
      stats: {
        averageElapsedMs:
          timed.length > 0 ? Math.round(totalElapsedMs / timed.length) : undefined,
        bestElapsedMs,
        completedCount: completed.length,
        currentStreak: countStreak(
          completed.map((game) => game.completedAt ?? game.updatedAt),
        ),
        lastCompletedAt: completed[0]?.completedAt ?? completed[0]?.updatedAt,
      },
      recentCompleted: completed.slice(0, 8).map((game) => ({
        completedAt: game.completedAt ?? game.updatedAt,
        difficulty: game.difficulty,
        elapsedMs: game.elapsedMs,
        playMode: game.playMode ?? 'classic',
        puzzleSize: game.puzzleSize ?? '9x9',
        source: game.source,
      })),
      updatedAt: profile.updatedAt,
    };
  },
});

function cleanName(value: string) {
  const trimmed = value.trim().slice(0, 32);
  return trimmed || 'anonymous';
}

function cleanFriendCode(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return compact.startsWith('VIM')
    ? `VIM-${compact.slice(3, 9)}`
    : `VIM-${compact.slice(0, 6)}`;
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

function makeFriendCode(value: string) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  let code = '';
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[(hash >>> (index * 5)) & 31];
  }
  return `VIM-${code}`;
}

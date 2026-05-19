import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';
import { v } from 'convex/values';

export const createRace = mutation({
  args: {
    challengeId: v.string(),
    creatorAnonId: v.string(),
    creatorName: v.string(),
    difficulty: v.optional(v.string()),
    playMode: v.optional(v.string()),
    puzzle: v.string(),
    puzzleSize: v.optional(v.string()),
    source: v.string(),
  },
  handler: async (ctx, args) => {
    const challengeId = cleanChallengeId(args.challengeId);
    const existing = await ctx.db
      .query('challenges')
      .withIndex('by_challengeId', (q) => q.eq('challengeId', challengeId))
      .unique();

    if (existing) return existing.challengeId;

    const puzzleSize = cleanPuzzleSize(args.puzzleSize);
    const playMode = cleanPlayMode(args.playMode);
    const source = cleanText(args.source, 80) || 'vimdoku puzzle';
    const difficulty = args.difficulty
      ? cleanText(args.difficulty, 24)
      : undefined;
    const titleParts = [puzzleSize, playMode, difficulty].filter(Boolean);

    await ctx.db.insert('challenges', {
      challengeId,
      createdAt: new Date().toISOString(),
      creatorAnonId: args.creatorAnonId,
      creatorName: cleanName(args.creatorName),
      difficulty,
      playMode,
      puzzle: cleanPuzzle(args.puzzle, puzzleSize),
      puzzleSize,
      source,
      status: 'open',
      title: `Race ${titleParts.join(' / ')}`,
    });

    return challengeId;
  },
});

export const getRace = query({
  args: {
    challengeId: v.string(),
  },
  handler: async (ctx, args) => {
    const challengeId = cleanChallengeId(args.challengeId);
    const challenge = await ctx.db
      .query('challenges')
      .withIndex('by_challengeId', (q) => q.eq('challengeId', challengeId))
      .unique();

    if (!challenge) return null;

    const attempts = await ctx.db
      .query('challengeAttempts')
      .withIndex('by_challengeId_and_updatedAt', (q) =>
        q.eq('challengeId', challengeId),
      )
      .order('desc')
      .take(80);

    return {
      challengeId: challenge.challengeId,
      createdAt: challenge.createdAt,
      creatorName: challenge.creatorName,
      difficulty: challenge.difficulty,
      playMode: challenge.playMode ?? 'classic',
      puzzle: challenge.puzzle,
      puzzleSize: challenge.puzzleSize ?? '9x9',
      source: challenge.source,
      status: challenge.status,
      title: challenge.title,
      attempts: attempts
        .map((attempt) => ({
          anonId: attempt.anonId,
          completedAt: attempt.completedAt,
          completion: attempt.completion,
          elapsedMs: attempt.elapsedMs,
          player: attempt.player,
          recordId: attempt.recordId,
          startedAt: attempt.startedAt,
          status: attempt.status,
          updatedAt: attempt.updatedAt,
        }))
        .sort(compareAttempts),
    };
  },
});

export const listMine = query({
  args: {
    anonId: v.string(),
  },
  handler: async (ctx, args) => {
    const [created, attemptRows] = await Promise.all([
      ctx.db
        .query('challenges')
        .withIndex('by_creatorAnonId', (q) => q.eq('creatorAnonId', args.anonId))
        .collect(),
      ctx.db
        .query('challengeAttempts')
        .withIndex('by_anonId_updated', (q) => q.eq('anonId', args.anonId))
        .order('desc')
        .collect(),
    ]);
    const createdIds = new Set(created.map((challenge) => challenge.challengeId));
    const challengeIds = new Set([
      ...createdIds,
      ...attemptRows.map((attempt) => attempt.challengeId),
    ]);

    const rows = await Promise.all(
      [...challengeIds].map(async (challengeId) => {
        const challenge =
          created.find((item) => item.challengeId === challengeId) ??
          (await ctx.db
            .query('challenges')
            .withIndex('by_challengeId', (q) => q.eq('challengeId', challengeId))
            .unique());
        if (!challenge) return null;

        const attempts = await ctx.db
          .query('challengeAttempts')
          .withIndex('by_challengeId_and_updatedAt', (q) =>
            q.eq('challengeId', challengeId),
          )
          .order('desc')
          .take(80);
        const sortedAttempts = attempts
          .map((attempt) => ({
            anonId: attempt.anonId,
            completedAt: attempt.completedAt,
            completion: attempt.completion,
            elapsedMs: attempt.elapsedMs,
            player: attempt.player,
            recordId: attempt.recordId,
            startedAt: attempt.startedAt,
            status: attempt.status,
            updatedAt: attempt.updatedAt,
          }))
          .sort(compareAttempts);
        const mine = sortedAttempts.find((attempt) => attempt.anonId === args.anonId);

        return {
          attempts: sortedAttempts,
          challengeId: challenge.challengeId,
          createdAt: challenge.createdAt,
          creatorName: challenge.creatorName,
          difficulty: challenge.difficulty,
          isCreator: challenge.creatorAnonId === args.anonId,
          myAttempt: mine,
          playMode: challenge.playMode ?? 'classic',
          puzzleSize: challenge.puzzleSize ?? '9x9',
          source: challenge.source,
          status: challenge.status,
          title: challenge.title,
          updatedAt: latestChallengeActivity(challenge.createdAt, sortedAttempts),
        };
      }),
    );

    return rows
      .filter((row) => row !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 60);
  },
});

export const startAttempt = mutation({
  args: {
    anonId: v.string(),
    challengeId: v.string(),
    player: v.string(),
    recordId: v.string(),
  },
  handler: async (ctx, args) => {
    const challengeId = cleanChallengeId(args.challengeId);
    const challenge = await ctx.db
      .query('challenges')
      .withIndex('by_challengeId', (q) => q.eq('challengeId', challengeId))
      .unique();
    if (!challenge) throw new Error('Challenge not found.');

    const existingAttempts = await ctx.db
      .query('challengeAttempts')
      .withIndex('by_challengeId_and_updatedAt', (q) =>
        q.eq('challengeId', challengeId),
      )
      .take(80);
    const existing =
      existingAttempts.find((attempt) => attempt.anonId === args.anonId) ?? null;

    if (existing) {
      if (existing.status === 'completed') return existing._id;
      await ctx.db.patch(existing._id, {
        player: cleanName(args.player),
        recordId: args.recordId,
        updatedAt: new Date().toISOString(),
      });
      return existing._id;
    }

    const now = new Date().toISOString();
    return await ctx.db.insert('challengeAttempts', {
      anonId: args.anonId,
      challengeId,
      completion: 0,
      elapsedMs: 0,
      player: cleanName(args.player),
      recordId: args.recordId,
      startedAt: now,
      status: 'in-progress',
      updatedAt: now,
    });
  },
});

export const submitAttempt = mutation({
  args: {
    anonId: v.string(),
    challengeId: v.string(),
    completedAt: v.string(),
    completion: v.number(),
    elapsedMs: v.number(),
    player: v.string(),
    recordId: v.string(),
  },
  handler: async (ctx, args) => {
    const challengeId = cleanChallengeId(args.challengeId);
    const challenge = await ctx.db
      .query('challenges')
      .withIndex('by_challengeId', (q) => q.eq('challengeId', challengeId))
      .unique();
    if (!challenge) throw new Error('Challenge not found.');

    const existingAttempts = await ctx.db
      .query('challengeAttempts')
      .withIndex('by_challengeId_and_updatedAt', (q) =>
        q.eq('challengeId', challengeId),
      )
      .take(80);
    const existing =
      existingAttempts.find((attempt) => attempt.anonId === args.anonId) ?? null;
    const elapsedMs = Math.max(0, Math.floor(args.elapsedMs));
    const completion = Math.max(0, Math.floor(args.completion));
    const doc = {
      completedAt: args.completedAt,
      completion,
      elapsedMs,
      player: cleanName(args.player),
      recordId: args.recordId,
      status: 'completed' as const,
      updatedAt: new Date().toISOString(),
    };

    if (existing) {
      if (existing.status === 'completed' && existing.elapsedMs <= elapsedMs) {
        return existing._id;
      }
      await ctx.db.patch(existing._id, doc);
      return existing._id;
    }

    return await ctx.db.insert('challengeAttempts', {
      ...doc,
      anonId: args.anonId,
      challengeId,
      startedAt: args.completedAt,
    });
  },
});

function compareAttempts(
  a: { elapsedMs: number; status: string; updatedAt: string },
  b: { elapsedMs: number; status: string; updatedAt: string },
) {
  if (a.status !== b.status) return a.status === 'completed' ? -1 : 1;
  if (a.status === 'completed') return a.elapsedMs - b.elapsedMs;
  return b.updatedAt.localeCompare(a.updatedAt);
}

function latestChallengeActivity(
  createdAt: string,
  attempts: Array<{ updatedAt: string }>,
) {
  return attempts.reduce(
    (latest, attempt) =>
      attempt.updatedAt.localeCompare(latest) > 0 ? attempt.updatedAt : latest,
    createdAt,
  );
}

function cleanChallengeId(value: string) {
  return value.replace(/[^a-z0-9-]/gi, '').slice(0, 48) || 'race';
}

function cleanName(value: string) {
  return cleanText(value, 32) || 'anonymous';
}

function cleanText(value: string, maxLength: number) {
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function cleanPuzzle(value: string, puzzleSize: string) {
  const cellCount = puzzleSize === '6x6' ? 36 : 81;
  return value.replace(/[^0-9.]/g, '').slice(0, cellCount).padEnd(cellCount, '0');
}

function cleanPuzzleSize(value: string | undefined) {
  return value === '6x6' ? '6x6' : '9x9';
}

function cleanPlayMode(value: string | undefined) {
  return value === 'speedrun' || value === 'zen' || value === 'no-check'
    ? value
    : 'classic';
}

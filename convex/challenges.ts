import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';
import { v } from 'convex/values';
import type { MutationCtx } from './_generated/server';

export const createRace = mutation({
  args: {
    challengeId: v.string(),
    challengeKind: v.optional(v.string()),
    creatorAnonId: v.string(),
    creatorName: v.string(),
    difficulty: v.optional(v.string()),
    playMode: v.optional(v.string()),
    puzzle: v.string(),
    puzzleSize: v.optional(v.string()),
    recipientAnonId: v.optional(v.string()),
    recipientName: v.optional(v.string()),
    source: v.string(),
    variantId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const challengeId = cleanChallengeId(args.challengeId);
    const existing = await ctx.db
      .query('challenges')
      .withIndex('by_challengeId', (q) => q.eq('challengeId', challengeId))
      .unique();

    if (existing) return existing.challengeId;

    const challengeKind = cleanChallengeKind(args.challengeKind);
    const puzzleSize = cleanPuzzleSize(args.puzzleSize);
    const playMode = cleanPlayMode(args.playMode);
    const variantId = cleanVariantId(args.variantId);
    const source = cleanText(args.source, 80) || 'vimdoku puzzle';
    const difficulty = args.difficulty
      ? cleanText(args.difficulty, 24)
      : undefined;
    const recipientAnonId = cleanOptionalId(args.recipientAnonId);
    const recipientName = args.recipientName
      ? cleanName(args.recipientName)
      : undefined;
    if (recipientAnonId) {
      const isFriend = await acceptedFriendshipExists(
        ctx,
        args.creatorAnonId,
        recipientAnonId,
      );
      if (!isFriend) throw new Error('Direct challenges can only be sent to friends.');
    }
    const titleParts = [puzzleSize, playMode, difficulty].filter(Boolean);

    await ctx.db.insert('challenges', {
      challengeId,
      challengeKind,
      createdAt: new Date().toISOString(),
      creatorAnonId: args.creatorAnonId,
      creatorName: cleanName(args.creatorName),
      difficulty,
      playMode,
      puzzle: cleanPuzzle(args.puzzle, puzzleSize),
      puzzleSize,
      recipientAnonId,
      recipientName,
      source,
      status: 'open',
      title: `${challengeKind === 'streak' ? 'Streak battle' : 'Race'} ${titleParts.join(' / ')}`,
      variantId,
    });

    if (recipientAnonId) {
      await ctx.db.insert('notifications', {
        actorAnonId: args.creatorAnonId,
        actorName: cleanName(args.creatorName),
        body: `${cleanName(args.creatorName)} challenged you to a ${challengeKindLabel(challengeKind)}.`,
        challengeId,
        createdAt: new Date().toISOString(),
        recipientAnonId,
        title: 'new challenge',
        type: 'challenge',
      });
    }

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
      challengeKind: challenge.challengeKind ?? 'race',
      createdAt: challenge.createdAt,
      creatorName: challenge.creatorName,
      difficulty: challenge.difficulty,
      playMode: challenge.playMode ?? 'classic',
      puzzle: challenge.puzzle,
      puzzleSize: challenge.puzzleSize ?? '9x9',
      recipientAnonId: challenge.recipientAnonId,
      recipientName: challenge.recipientName,
      source: challenge.source,
      status: challenge.status,
      title: challenge.title,
      variantId: cleanVariantId(challenge.variantId),
      attempts: attempts
        .map((attempt) => ({
          anonId: attempt.anonId,
          completedAt: attempt.completedAt,
          completion: attempt.completion,
          elapsedMs: attempt.elapsedMs,
          mistakes: attempt.mistakes ?? 0,
          player: attempt.player,
          recordId: attempt.recordId,
          startedAt: attempt.startedAt,
          status: attempt.status,
          updatedAt: attempt.updatedAt,
        }))
        .sort(compareAttemptsFor(challenge.challengeKind ?? 'race')),
    };
  },
});

export const listMine = query({
  args: {
    anonId: v.string(),
  },
  handler: async (ctx, args) => {
    const [created, received, attemptRows] = await Promise.all([
      ctx.db
        .query('challenges')
        .withIndex('by_creatorAnonId', (q) => q.eq('creatorAnonId', args.anonId))
        .collect(),
      ctx.db
        .query('challenges')
        .withIndex('by_recipientAnonId', (q) => q.eq('recipientAnonId', args.anonId))
        .collect(),
      ctx.db
        .query('challengeAttempts')
        .withIndex('by_anonId_updated', (q) => q.eq('anonId', args.anonId))
        .order('desc')
        .collect(),
    ]);
    const visibleChallenges = [...created, ...received];
    const createdIds = new Set(created.map((challenge) => challenge.challengeId));
    const receivedIds = new Set(received.map((challenge) => challenge.challengeId));
    const challengeIds = new Set([
      ...createdIds,
      ...receivedIds,
      ...attemptRows.map((attempt) => attempt.challengeId),
    ]);

    const rows = await Promise.all(
      [...challengeIds].map(async (challengeId) => {
        const challenge =
          visibleChallenges.find((item) => item.challengeId === challengeId) ??
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
            mistakes: attempt.mistakes ?? 0,
            player: attempt.player,
            recordId: attempt.recordId,
            startedAt: attempt.startedAt,
            status: attempt.status,
            updatedAt: attempt.updatedAt,
          }))
          .sort(compareAttemptsFor(challenge.challengeKind ?? 'race'));
        const mine = sortedAttempts.find((attempt) => attempt.anonId === args.anonId);

        return {
          attempts: sortedAttempts,
          challengeId: challenge.challengeId,
          challengeKind: challenge.challengeKind ?? 'race',
          createdAt: challenge.createdAt,
          creatorName: challenge.creatorName,
          difficulty: challenge.difficulty,
          isCreator: challenge.creatorAnonId === args.anonId,
          isRecipient: challenge.recipientAnonId === args.anonId,
          myAttempt: mine,
          playMode: challenge.playMode ?? 'classic',
          puzzleSize: challenge.puzzleSize ?? '9x9',
          recipientAnonId: challenge.recipientAnonId,
          recipientName: challenge.recipientName,
          source: challenge.source,
          status: challenge.status,
          title: challenge.title,
          updatedAt: latestChallengeActivity(challenge.createdAt, sortedAttempts),
          variantId: cleanVariantId(challenge.variantId),
        };
      }),
    );

    return rows
      .filter((row) => row !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 60);
  },
});

export const listResults = query({
  args: {
    anonId: v.string(),
  },
  handler: async (ctx, args) => {
    const recentChallenges = await ctx.db.query('challenges').order('desc').take(80);
    const attemptRows = await ctx.db
      .query('challengeAttempts')
      .withIndex('by_anonId_updated', (q) => q.eq('anonId', args.anonId))
      .order('desc')
      .take(80);
    const attemptedIds = new Set(attemptRows.map((attempt) => attempt.challengeId));

    const rows = await Promise.all(
      recentChallenges
        .filter(
          (challenge) =>
            !challenge.recipientAnonId ||
            challenge.creatorAnonId === args.anonId ||
            challenge.recipientAnonId === args.anonId ||
            attemptedIds.has(challenge.challengeId),
        )
        .map(async (challenge) => {
          const attempts = await ctx.db
            .query('challengeAttempts')
            .withIndex('by_challengeId_and_updatedAt', (q) =>
              q.eq('challengeId', challenge.challengeId),
            )
            .order('desc')
            .take(80);
          const sortedAttempts = attempts
            .map((attempt) => ({
              anonId: attempt.anonId,
              completedAt: attempt.completedAt,
              completion: attempt.completion,
              elapsedMs: attempt.elapsedMs,
              mistakes: attempt.mistakes ?? 0,
              player: attempt.player,
              recordId: attempt.recordId,
              startedAt: attempt.startedAt,
              status: attempt.status,
              updatedAt: attempt.updatedAt,
            }))
            .sort(compareAttemptsFor(challenge.challengeKind ?? 'race'));
          const mine = sortedAttempts.find((attempt) => attempt.anonId === args.anonId);

          return {
            attempts: sortedAttempts,
            challengeId: challenge.challengeId,
            challengeKind: challenge.challengeKind ?? 'race',
            createdAt: challenge.createdAt,
            creatorName: challenge.creatorName,
            difficulty: challenge.difficulty,
            isCreator: challenge.creatorAnonId === args.anonId,
            isRecipient: challenge.recipientAnonId === args.anonId,
            myAttempt: mine,
            playMode: challenge.playMode ?? 'classic',
            puzzleSize: challenge.puzzleSize ?? '9x9',
            recipientAnonId: challenge.recipientAnonId,
            recipientName: challenge.recipientName,
            source: challenge.source,
            status: challenge.status,
            title: challenge.title,
            updatedAt: latestChallengeActivity(challenge.createdAt, sortedAttempts),
            variantId: cleanVariantId(challenge.variantId),
          };
        }),
    );

    return rows
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 80);
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
    if (challenge.status === 'closed') throw new Error('Challenge is closed.');

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
      mistakes: 0,
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
    mistakes: v.optional(v.number()),
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
    if (challenge.status === 'closed') throw new Error('Challenge is closed.');

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
    const mistakes = Math.max(0, Math.floor(args.mistakes ?? 0));
    const doc = {
      completedAt: args.completedAt,
      completion,
      elapsedMs,
      mistakes,
      player: cleanName(args.player),
      recordId: args.recordId,
      status: 'completed' as const,
      updatedAt: new Date().toISOString(),
    };

    if (existing) {
      if (existing.status === 'completed' && existing.elapsedMs <= elapsedMs) {
        const player = cleanName(args.player);
        if (shouldUseSubmittedName(existing.player, player)) {
          await ctx.db.patch(existing._id, {
            player,
            updatedAt: new Date().toISOString(),
          });
        }
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

function compareAttemptsFor(challengeKind: string) {
  return (
    a: { elapsedMs: number; mistakes?: number; status: string; updatedAt: string },
    b: { elapsedMs: number; mistakes?: number; status: string; updatedAt: string },
  ) => {
    if (a.status !== b.status) return a.status === 'completed' ? -1 : 1;
    if (a.status === 'completed') {
      if (challengeKind === 'streak') {
        const mistakeDelta = (a.mistakes ?? 0) - (b.mistakes ?? 0);
        if (mistakeDelta !== 0) return mistakeDelta;
      }
      return a.elapsedMs - b.elapsedMs;
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  };
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

function cleanOptionalId(value: string | undefined) {
  const cleaned = value?.replace(/[^a-z0-9-]/gi, '').slice(0, 80);
  return cleaned || undefined;
}

function cleanChallengeKind(value: string | undefined) {
  return value === 'streak' ? 'streak' : 'race';
}

function challengeKindLabel(value: string) {
  return value === 'streak' ? 'streak battle' : 'race';
}

function cleanName(value: string) {
  return cleanText(value, 32) || 'anonymous';
}

function shouldUseSubmittedName(current: string, next: string) {
  if (current === next) return false;
  if (isAnonymousName(next)) return false;
  return isAnonymousName(current) || current !== next;
}

function isAnonymousName(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === '' || normalized === 'anonymous';
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

function cleanVariantId(value: string | undefined) {
  return value === 'anti-knight' ||
    value === 'anti-king' ||
    value === 'diagonal' ||
    value === 'non-consecutive'
    ? value
    : 'classic';
}

async function acceptedFriendshipExists(
  ctx: MutationCtx,
  anonId: string,
  friendAnonId: string,
) {
  const outgoing = await ctx.db
    .query('friendships')
    .withIndex('by_requesterAnonId', (q) => q.eq('requesterAnonId', anonId))
    .collect();
  if (
    outgoing.some(
      (friendship) =>
        friendship.recipientAnonId === friendAnonId &&
        friendship.status === 'accepted',
    )
  ) {
    return true;
  }

  const incoming = await ctx.db
    .query('friendships')
    .withIndex('by_recipientAnonId', (q) => q.eq('recipientAnonId', anonId))
    .collect();
  return incoming.some(
    (friendship) =>
      friendship.requesterAnonId === friendAnonId &&
      friendship.status === 'accepted',
  );
}

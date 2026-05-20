import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';
import { v } from 'convex/values';

export const createRoom = mutation({
  args: {
    creatorAnonId: v.string(),
    creatorName: v.string(),
    difficulty: v.optional(v.string()),
    playMode: v.optional(v.string()),
    puzzle: v.string(),
    puzzleSize: v.optional(v.string()),
    roomId: v.string(),
    source: v.string(),
    variantId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const roomId = cleanRoomId(args.roomId);
    const existing = await ctx.db
      .query('liveBattles')
      .withIndex('by_roomId', (q) => q.eq('roomId', roomId))
      .unique();
    if (existing) return existing.roomId;

    const puzzleSize = cleanPuzzleSize(args.puzzleSize);
    const playMode = cleanPlayMode(args.playMode);
    const variantId = cleanVariantId(args.variantId);
    const difficulty = args.difficulty ? cleanText(args.difficulty, 24) : undefined;
    const source = cleanText(args.source, 80) || 'vimdoku puzzle';
    const titleParts = [puzzleSize, playMode, variantId === 'classic' ? null : variantId, difficulty]
      .filter(Boolean)
      .join(' / ');

    await ctx.db.insert('liveBattles', {
      createdAt: new Date().toISOString(),
      creatorAnonId: cleanId(args.creatorAnonId),
      creatorName: cleanName(args.creatorName),
      difficulty,
      playMode,
      puzzle: cleanPuzzle(args.puzzle, puzzleSize),
      puzzleSize,
      roomId,
      source,
      status: 'waiting',
      title: `Live race ${titleParts}`,
      variantId,
    });

    return roomId;
  },
});

export const getRoom = query({
  args: {
    roomId: v.string(),
  },
  handler: async (ctx, args) => {
    const roomId = cleanRoomId(args.roomId);
    const room = await ctx.db
      .query('liveBattles')
      .withIndex('by_roomId', (q) => q.eq('roomId', roomId))
      .unique();
    if (!room) return null;

    const presence = await ctx.db
      .query('liveBattlePresence')
      .withIndex('by_roomId', (q) => q.eq('roomId', roomId))
      .collect();

    return {
      createdAt: room.createdAt,
      creatorName: room.creatorName,
      difficulty: room.difficulty,
      playMode: room.playMode ?? 'classic',
      presence: presence
        .map((row) => ({
          anonId: row.anonId,
          completion: row.completion,
          elapsedMs: row.elapsedMs,
          lastSeenAt: row.lastSeenAt,
          mistakes: row.mistakes ?? 0,
          player: row.player,
          recordId: row.recordId,
          selectedCell: row.selectedCell,
          status: row.status,
          updatedAt: row.updatedAt,
        }))
        .sort(comparePresence),
      puzzle: room.puzzle,
      puzzleSize: room.puzzleSize ?? '9x9',
      roomId: room.roomId,
      source: room.source,
      status: room.status,
      title: room.title,
      variantId: cleanVariantId(room.variantId),
    };
  },
});

export const heartbeat = mutation({
  args: {
    anonId: v.string(),
    completion: v.number(),
    elapsedMs: v.number(),
    mistakes: v.optional(v.number()),
    player: v.string(),
    recordId: v.optional(v.string()),
    roomId: v.string(),
    selectedCell: v.optional(v.number()),
    status: v.union(
      v.literal('online'),
      v.literal('ready'),
      v.literal('solving'),
      v.literal('finished'),
    ),
  },
  handler: async (ctx, args) => {
    const roomId = cleanRoomId(args.roomId);
    const room = await ctx.db
      .query('liveBattles')
      .withIndex('by_roomId', (q) => q.eq('roomId', roomId))
      .unique();
    if (!room) throw new Error('Live battle room not found.');

    const anonId = cleanId(args.anonId);
    const roomPresence = await ctx.db
      .query('liveBattlePresence')
      .withIndex('by_roomId', (q) => q.eq('roomId', roomId))
      .collect();
    const existing = roomPresence.find((row) => row.anonId === anonId) ?? null;
    const nowIso = new Date().toISOString();
    const nextPresence = {
      completion: Math.max(0, Math.floor(args.completion)),
      elapsedMs: Math.max(0, Math.floor(args.elapsedMs)),
      lastSeenAt: Date.now(),
      mistakes: Math.max(0, Math.floor(args.mistakes ?? 0)),
      player: cleanName(args.player),
      recordId: args.recordId ? cleanText(args.recordId, 120) : undefined,
      selectedCell:
        typeof args.selectedCell === 'number'
          ? Math.max(0, Math.floor(args.selectedCell))
          : undefined,
      status: args.status,
      updatedAt: nowIso,
    };

    if (existing) {
      await ctx.db.patch(existing._id, nextPresence);
    } else {
      await ctx.db.insert('liveBattlePresence', {
        ...nextPresence,
        anonId,
        roomId,
      });
    }

    const nextStatus =
      args.status === 'finished'
        ? 'finished'
        : room.status === 'waiting' && args.status === 'solving'
          ? 'live'
          : room.status;
    if (nextStatus !== room.status) {
      await ctx.db.patch(room._id, { status: nextStatus });
    }

    return roomId;
  },
});

function comparePresence(
  a: { completion: number; elapsedMs: number; lastSeenAt: number; status: string },
  b: { completion: number; elapsedMs: number; lastSeenAt: number; status: string },
) {
  if (a.status !== b.status) {
    if (a.status === 'finished') return -1;
    if (b.status === 'finished') return 1;
  }
  if (a.completion !== b.completion) return b.completion - a.completion;
  if (a.elapsedMs !== b.elapsedMs) return a.elapsedMs - b.elapsedMs;
  return b.lastSeenAt - a.lastSeenAt;
}

function cleanRoomId(value: string) {
  return value.replace(/[^a-z0-9-]/gi, '').slice(0, 48) || 'live';
}

function cleanId(value: string) {
  return value.replace(/[^a-z0-9-]/gi, '').slice(0, 120) || 'anonymous';
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

function cleanVariantId(value: string | undefined) {
  return value === 'anti-knight' ||
    value === 'anti-king' ||
    value === 'diagonal' ||
    value === 'non-consecutive'
    ? value
    : 'classic';
}

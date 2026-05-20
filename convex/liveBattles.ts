import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';
import { v } from 'convex/values';

export const createRoom = mutation({
  args: {
    battleKind: v.optional(v.union(v.literal('race'), v.literal('turns'))),
    creatorAnonId: v.string(),
    creatorName: v.string(),
    difficulty: v.optional(v.string()),
    playMode: v.optional(v.string()),
    puzzle: v.string(),
    puzzleSize: v.optional(v.string()),
    roomId: v.string(),
    source: v.string(),
    turnSeconds: v.optional(v.number()),
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
    const battleKind = cleanBattleKind(args.battleKind);
    const turnSeconds = cleanTurnSeconds(args.turnSeconds);
    const difficulty = args.difficulty ? cleanText(args.difficulty, 24) : undefined;
    const source = cleanText(args.source, 80) || 'vimdoku puzzle';
    const titleParts = [puzzleSize, playMode, variantId === 'classic' ? null : variantId, difficulty]
      .filter(Boolean)
      .join(' / ');

    await ctx.db.insert('liveBattles', {
      battleKind,
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
      title: `${battleKind === 'turns' ? 'Turn battle' : 'Live race'} ${titleParts}`,
      turnNumber: 0,
      turnSeconds,
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
      battleKind: room.battleKind ?? 'race',
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
          lives: row.lives,
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
      turnAnonId: room.turnAnonId,
      turnEndsAt: room.turnEndsAt,
      turnNumber: room.turnNumber ?? 0,
      turnSeconds: room.turnSeconds ?? 20,
      turnStartedAt: room.turnStartedAt,
      variantId: cleanVariantId(room.variantId),
      winnerAnonId: room.winnerAnonId,
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
      lives: existing?.lives ?? (room.battleKind === 'turns' ? 3 : undefined),
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
      const patch: {
        status: 'waiting' | 'live' | 'finished';
        turnAnonId?: string;
        turnEndsAt?: number;
        turnNumber?: number;
        turnStartedAt?: number;
      } = { status: nextStatus };
      if (
        room.battleKind === 'turns' &&
        nextStatus === 'live' &&
        !room.turnAnonId
      ) {
        const turn = pickNextTurn(
          roomPresence.some((row) => row.anonId === anonId)
            ? roomPresence
            : [
                ...roomPresence,
                {
                  anonId,
                  completion: nextPresence.completion,
                  elapsedMs: nextPresence.elapsedMs,
                  lastSeenAt: nextPresence.lastSeenAt,
                  lives: nextPresence.lives,
                  player: nextPresence.player,
                  roomId,
                  status: nextPresence.status,
                  updatedAt: nextPresence.updatedAt,
                },
              ],
          null,
        );
        if (turn) {
          const now = Date.now();
          patch.turnAnonId = turn;
          patch.turnStartedAt = now;
          patch.turnEndsAt = now + (room.turnSeconds ?? 20) * 1000;
          patch.turnNumber = (room.turnNumber ?? 0) + 1;
        }
      }
      await ctx.db.patch(room._id, patch);
    }

    return roomId;
  },
});

export const submitTurn = mutation({
  args: {
    anonId: v.string(),
    completion: v.number(),
    correct: v.boolean(),
    elapsedMs: v.number(),
    player: v.string(),
    recordId: v.string(),
    roomId: v.string(),
    selectedCell: v.number(),
  },
  handler: async (ctx, args) => {
    const roomId = cleanRoomId(args.roomId);
    const room = await ctx.db
      .query('liveBattles')
      .withIndex('by_roomId', (q) => q.eq('roomId', roomId))
      .unique();
    if (!room) throw new Error('Live battle room not found.');
    if (room.battleKind !== 'turns') return { ok: false, message: 'Room is not turn-based.' };
    if (room.status === 'finished') return { ok: false, message: 'Battle is finished.' };

    const anonId = cleanId(args.anonId);
    const presence = await ctx.db
      .query('liveBattlePresence')
      .withIndex('by_roomId', (q) => q.eq('roomId', roomId))
      .collect();
    const existing = presence.find((row) => row.anonId === anonId) ?? null;
    if (!existing) throw new Error('You are not in this battle room yet.');
    if (room.turnAnonId !== anonId) return { ok: false, message: 'Not your turn.' };

    const now = Date.now();
    const timedOut = typeof room.turnEndsAt === 'number' && room.turnEndsAt <= now;
    const lifeLoss = timedOut || !args.correct ? 1 : 0;
    const nextLives = Math.max(0, (existing.lives ?? 3) - lifeLoss);
    const nowIso = new Date().toISOString();

    await ctx.db.patch(existing._id, {
      completion: Math.max(existing.completion, Math.floor(args.completion)),
      elapsedMs: Math.max(0, Math.floor(args.elapsedMs)),
      lastSeenAt: now,
      lives: nextLives,
      mistakes: (existing.mistakes ?? 0) + lifeLoss,
      player: cleanName(args.player),
      recordId: cleanText(args.recordId, 120),
      selectedCell: Math.max(0, Math.floor(args.selectedCell)),
      status: args.completion >= cellCountFor(room.puzzleSize ?? '9x9') ? 'finished' : 'solving',
      updatedAt: nowIso,
    });

    const nextPresence = presence.map((row) =>
      row._id === existing._id
        ? {
            ...row,
            completion: Math.max(existing.completion, Math.floor(args.completion)),
            lastSeenAt: now,
            lives: nextLives,
            status:
              args.completion >= cellCountFor(room.puzzleSize ?? '9x9')
                ? 'finished'
                : 'solving',
          }
        : row,
    );
    const hasTwoPlayers = nextPresence.length >= 2;
    const winner =
      args.completion >= cellCountFor(room.puzzleSize ?? '9x9')
        ? anonId
        : hasTwoPlayers && alivePlayers(nextPresence).length <= 1
          ? alivePlayers(nextPresence)[0]?.anonId ?? anonId
          : null;

    if (winner) {
      await ctx.db.patch(room._id, {
        status: 'finished',
        winnerAnonId: winner,
      });
      return { ok: true, message: winner === anonId ? 'You won.' : 'Battle finished.' };
    }

    await advanceTurn(
      (patch) => ctx.db.patch(room._id, patch),
      room,
      nextPresence,
      anonId,
      now,
    );
    return {
      ok: true,
      message: timedOut ? 'Turn timed out.' : args.correct ? 'Turn accepted.' : 'Life lost.',
    };
  },
});

export const claimTimeout = mutation({
  args: {
    anonId: v.string(),
    roomId: v.string(),
  },
  handler: async (ctx, args) => {
    const roomId = cleanRoomId(args.roomId);
    const room = await ctx.db
      .query('liveBattles')
      .withIndex('by_roomId', (q) => q.eq('roomId', roomId))
      .unique();
    if (!room || room.battleKind !== 'turns') return { ok: false };
    if (room.status === 'finished' || !room.turnAnonId || !room.turnEndsAt) {
      return { ok: false };
    }
    const now = Date.now();
    if (room.turnEndsAt > now) return { ok: false };

    const presence = await ctx.db
      .query('liveBattlePresence')
      .withIndex('by_roomId', (q) => q.eq('roomId', roomId))
      .collect();
    const current = presence.find((row) => row.anonId === room.turnAnonId);
    if (!current) return { ok: false };
    const nextLives = Math.max(0, (current.lives ?? 3) - 1);
    await ctx.db.patch(current._id, {
      lastSeenAt: now,
      lives: nextLives,
      mistakes: (current.mistakes ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    });

    const nextPresence = presence.map((row) =>
      row._id === current._id ? { ...row, lives: nextLives } : row,
    );
    const alive = alivePlayers(nextPresence);
    if (presence.length >= 2 && alive.length <= 1) {
      await ctx.db.patch(room._id, {
        status: 'finished',
        winnerAnonId: alive[0]?.anonId ?? cleanId(args.anonId),
      });
      return { ok: true };
    }

    await advanceTurn(
      (patch) => ctx.db.patch(room._id, patch),
      room,
      nextPresence,
      current.anonId,
      now,
    );
    return { ok: true };
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

async function advanceTurn(
  patchRoom: (patch: {
    status: 'live';
    turnAnonId: string;
    turnEndsAt: number;
    turnNumber: number;
    turnStartedAt: number;
  }) => Promise<void>,
  room: {
    turnNumber?: number;
    turnSeconds?: number;
  },
  presence: Array<{ anonId: string; lastSeenAt: number; lives?: number; status: string }>,
  currentAnonId: string | null,
  now: number,
) {
  const nextAnonId = pickNextTurn(presence, currentAnonId);
  if (!nextAnonId) return;
  await patchRoom({
    status: 'live',
    turnAnonId: nextAnonId,
    turnEndsAt: now + (room.turnSeconds ?? 20) * 1000,
    turnNumber: (room.turnNumber ?? 0) + 1,
    turnStartedAt: now,
  });
}

function pickNextTurn(
  presence: Array<{ anonId: string; lastSeenAt: number; lives?: number; status: string }>,
  currentAnonId: string | null,
) {
  const alive = alivePlayers(presence);
  if (alive.length === 0) return null;
  if (!currentAnonId) return alive[0].anonId;
  const currentIndex = alive.findIndex((row) => row.anonId === currentAnonId);
  return alive[(currentIndex + 1 + alive.length) % alive.length].anonId;
}

function alivePlayers(
  presence: Array<{ anonId: string; lastSeenAt: number; lives?: number; status: string }>,
) {
  const now = Date.now();
  return presence
    .filter((row) => (row.lives ?? 3) > 0)
    .filter((row) => row.status !== 'finished')
    .filter((row) => now - row.lastSeenAt < 30000)
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

function cellCountFor(puzzleSize: string) {
  return puzzleSize === '6x6' ? 36 : 81;
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

function cleanBattleKind(value: string | undefined) {
  return value === 'turns' ? 'turns' : 'race';
}

function cleanTurnSeconds(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 20;
  return Math.max(8, Math.min(90, Math.floor(value)));
}

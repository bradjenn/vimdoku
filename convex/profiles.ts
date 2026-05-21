import { v } from 'convex/values'
import {
  mutationGeneric as mutation,
  queryGeneric as query,
} from 'convex/server'
import type { MutationCtx, QueryCtx } from './_generated/server'

export const upsert = mutation({
  args: {
    anonId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString()
    const name = cleanName(args.name)
    const friendCode = makeFriendCode(args.anonId)
    const existing = await ctx.db
      .query('profiles')
      .withIndex('by_anonId', (q) => q.eq('anonId', args.anonId))
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, {
        friendCode: existing.friendCode ?? friendCode,
        name,
        updatedAt: now,
      })
      await repairPlayerName(ctx, args.anonId, name, existing.name)
      return existing._id
    }

    const profileId = await ctx.db.insert('profiles', {
      anonId: args.anonId,
      createdAt: now,
      friendCode,
      name,
      updatedAt: now,
    })
    await repairPlayerName(ctx, args.anonId, name)
    return profileId
  },
})

export const current = query({
  args: {
    anonId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('profiles')
      .withIndex('by_anonId', (q) => q.eq('anonId', args.anonId))
      .unique()
  },
})

export const currentForSession = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null

    return await ctx.db
      .query('profiles')
      .withIndex('by_authSubject', (q) =>
        q.eq('authSubject', identity.tokenIdentifier),
      )
      .unique()
  },
})

export const claimGuest = mutation({
  args: {
    anonId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null

    const now = new Date().toISOString()
    const name = cleanName(args.name)
    const friendCode = makeFriendCode(args.anonId)
    const existingAuthProfile = await ctx.db
      .query('profiles')
      .withIndex('by_authSubject', (q) =>
        q.eq('authSubject', identity.tokenIdentifier),
      )
      .unique()

    if (existingAuthProfile) {
      await ctx.db.patch(existingAuthProfile._id, {
        friendCode: existingAuthProfile.friendCode ?? friendCode,
        name,
        updatedAt: now,
      })
      await repairPlayerName(
        ctx,
        existingAuthProfile.anonId,
        name,
        existingAuthProfile.name,
      )
      return {
        ...existingAuthProfile,
        friendCode: existingAuthProfile.friendCode ?? friendCode,
        name,
        updatedAt: now,
      }
    }

    const existingGuestProfile = await ctx.db
      .query('profiles')
      .withIndex('by_anonId', (q) => q.eq('anonId', args.anonId))
      .unique()

    if (existingGuestProfile) {
      await ctx.db.patch(existingGuestProfile._id, {
        authSubject: identity.tokenIdentifier,
        friendCode: existingGuestProfile.friendCode ?? friendCode,
        name,
        updatedAt: now,
      })
      await repairPlayerName(ctx, args.anonId, name, existingGuestProfile.name)
      return {
        ...existingGuestProfile,
        authSubject: identity.tokenIdentifier,
        friendCode: existingGuestProfile.friendCode ?? friendCode,
        name,
        updatedAt: now,
      }
    }

    const profileId = await ctx.db.insert('profiles', {
      anonId: args.anonId,
      authSubject: identity.tokenIdentifier,
      createdAt: now,
      friendCode,
      name,
      updatedAt: now,
    })
    await repairPlayerName(ctx, args.anonId, name)
    return await ctx.db.get(profileId)
  },
})

export const publicByFriendCode = query({
  args: {
    friendCode: v.string(),
    viewerAnonId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const friendCode = cleanFriendCode(args.friendCode)
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_friendCode', (q) => q.eq('friendCode', friendCode))
      .unique()

    if (!profile) return null

    const games = await ctx.db
      .query('games')
      .withIndex('by_anonId_updated', (q) => q.eq('anonId', profile.anonId))
      .order('desc')
      .take(200)
    const completed = games.filter((game) => game.status === 'completed')
    const timed = completed.filter((game) => game.elapsedMs > 0)
    const totalElapsedMs = timed.reduce(
      (total, game) => total + game.elapsedMs,
      0,
    )
    const bestElapsedMs =
      timed.length > 0
        ? Math.min(...timed.map((game) => game.elapsedMs))
        : undefined
    const friendships = await acceptedFriendshipsFor(ctx, profile.anonId)
    const publicFriends = await Promise.all(
      friendships.slice(0, 24).map(async (friendship) => {
        const friendAnonId =
          friendship.requesterAnonId === profile.anonId
            ? friendship.recipientAnonId
            : friendship.requesterAnonId
        const friendProfile = await ctx.db
          .query('profiles')
          .withIndex('by_anonId', (q) => q.eq('anonId', friendAnonId))
          .unique()

        if (!friendProfile?.friendCode) return null

        const friendStats = await publicStatsFor(ctx, friendAnonId)
        return {
          friendCode: friendProfile.friendCode,
          name: friendProfile.name,
          stats: friendStats,
        }
      }),
    )

    return {
      anonId: profile.anonId,
      createdAt: profile.createdAt,
      friendCode: profile.friendCode ?? friendCode,
      friends: publicFriends.filter((friend) => friend !== null),
      friendshipStatus: await friendshipStatusFor(
        ctx,
        args.viewerAnonId,
        profile.anonId,
      ),
      name: profile.name,
      stats: {
        averageElapsedMs:
          timed.length > 0
            ? Math.round(totalElapsedMs / timed.length)
            : undefined,
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
    }
  },
})

function cleanName(value: string) {
  const trimmed = value.trim().slice(0, 32)
  return trimmed || 'anonymous'
}

async function repairPlayerName(
  ctx: MutationCtx,
  anonId: string,
  name: string,
  previousName?: string,
) {
  if (isAnonymousName(name)) return

  const [livePresence, challengeAttempts] = await Promise.all([
    ctx.db
      .query('liveBattlePresence')
      .withIndex('by_anonId_and_updatedAt', (q) => q.eq('anonId', anonId))
      .order('desc')
      .take(100),
    ctx.db
      .query('challengeAttempts')
      .withIndex('by_anonId_updated', (q) => q.eq('anonId', anonId))
      .order('desc')
      .take(100),
  ])

  await Promise.all([
    ...livePresence
      .filter((row) => shouldUseProfileName(row.player, name, previousName))
      .map((row) =>
        ctx.db.patch(row._id, {
          player: name,
        }),
      ),
    ...challengeAttempts
      .filter((row) => shouldUseProfileName(row.player, name, previousName))
      .map((row) =>
        ctx.db.patch(row._id, {
          player: name,
        }),
      ),
  ])
}

function shouldUseProfileName(
  current: string,
  next: string,
  previous?: string,
) {
  if (current === next) return false
  if (isAnonymousName(next)) return false
  if (isAnonymousName(current)) return true
  return previous !== undefined && current === previous
}

function isAnonymousName(value: string) {
  const normalized = value.trim().toLowerCase()
  return normalized === '' || normalized === 'anonymous'
}

async function acceptedFriendshipsFor(ctx: QueryCtx, anonId: string) {
  const [outgoing, incoming] = await Promise.all([
    ctx.db
      .query('friendships')
      .withIndex('by_requesterAnonId', (q) => q.eq('requesterAnonId', anonId))
      .collect(),
    ctx.db
      .query('friendships')
      .withIndex('by_recipientAnonId', (q) => q.eq('recipientAnonId', anonId))
      .collect(),
  ])

  return [...outgoing, ...incoming]
    .filter((friendship) => friendship.status === 'accepted')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

async function publicStatsFor(ctx: QueryCtx, anonId: string) {
  const games = await ctx.db
    .query('games')
    .withIndex('by_anonId_updated', (q) => q.eq('anonId', anonId))
    .order('desc')
    .take(200)
  const completed = games.filter((game) => game.status === 'completed')
  const timed = completed.filter((game) => game.elapsedMs > 0)
  const bestElapsedMs =
    timed.length > 0
      ? Math.min(...timed.map((game) => game.elapsedMs))
      : undefined

  return {
    bestElapsedMs,
    completedCount: completed.length,
  }
}

async function friendshipStatusFor(
  ctx: QueryCtx,
  viewerAnonId: string | undefined,
  profileAnonId: string,
) {
  if (!viewerAnonId) return 'none'
  if (viewerAnonId === profileAnonId) return 'self'

  const outgoing = await ctx.db
    .query('friendships')
    .withIndex('by_requesterAnonId', (q) =>
      q.eq('requesterAnonId', viewerAnonId),
    )
    .collect()
  const outgoingMatch = outgoing.find(
    (friendship) => friendship.recipientAnonId === profileAnonId,
  )
  if (outgoingMatch?.status === 'accepted') return 'accepted'
  if (outgoingMatch?.status === 'pending') return 'outgoing'

  const incoming = await ctx.db
    .query('friendships')
    .withIndex('by_recipientAnonId', (q) =>
      q.eq('recipientAnonId', viewerAnonId),
    )
    .collect()
  const incomingMatch = incoming.find(
    (friendship) => friendship.requesterAnonId === profileAnonId,
  )
  if (incomingMatch?.status === 'accepted') return 'accepted'
  if (incomingMatch?.status === 'pending') return 'incoming'

  return 'none'
}

function cleanFriendCode(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return compact.startsWith('VIM')
    ? `VIM-${compact.slice(3, 9)}`
    : `VIM-${compact.slice(0, 6)}`
}

function countStreak(values: string[]) {
  const days = new Set(
    values
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()))
      .map((date) => date.toISOString().slice(0, 10)),
  )

  let streak = 0
  const cursor = new Date()
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return streak
}

function makeFriendCode(value: string) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  let code = ''
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[(hash >>> (index * 5)) & 31]
  }
  return `VIM-${code}`
}

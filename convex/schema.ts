import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  profiles: defineTable({
    anonId: v.string(),
    authSubject: v.optional(v.string()),
    createdAt: v.string(),
    friendCode: v.optional(v.string()),
    name: v.string(),
    updatedAt: v.string(),
  })
    .index('by_anonId', ['anonId'])
    .index('by_friendCode', ['friendCode']),

  games: defineTable({
    anonId: v.string(),
    completedAt: v.optional(v.string()),
    completion: v.number(),
    difficulty: v.optional(v.string()),
    elapsedMs: v.number(),
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
  })
    .index('by_anonId_updated', ['anonId', 'updatedAt'])
    .index('by_recordId', ['recordId'])
    .index('by_status', ['status']),

  scores: defineTable({
    anonId: v.string(),
    completedAt: v.string(),
    createdAt: v.string(),
    difficulty: v.optional(v.string()),
    elapsedMs: v.number(),
    leaderboardKey: v.optional(v.string()),
    player: v.string(),
    playMode: v.optional(v.string()),
    puzzle: v.string(),
    puzzleSize: v.optional(v.string()),
    recordId: v.string(),
    source: v.string(),
  })
    .index('by_elapsedMs', ['elapsedMs'])
    .index('by_leaderboardKey_and_elapsedMs', ['leaderboardKey', 'elapsedMs'])
    .index('by_puzzleSize_elapsedMs', ['puzzleSize', 'elapsedMs'])
    .index('by_puzzle_elapsedMs', ['puzzle', 'elapsedMs'])
    .index('by_recordId', ['recordId']),

  challenges: defineTable({
    challengeId: v.string(),
    createdAt: v.string(),
    creatorAnonId: v.string(),
    creatorName: v.string(),
    difficulty: v.optional(v.string()),
    playMode: v.optional(v.string()),
    puzzle: v.string(),
    puzzleSize: v.optional(v.string()),
    source: v.string(),
    status: v.union(v.literal('open'), v.literal('closed')),
    title: v.string(),
  }).index('by_challengeId', ['challengeId']),

  challengeAttempts: defineTable({
    anonId: v.string(),
    challengeId: v.string(),
    completedAt: v.optional(v.string()),
    completion: v.number(),
    elapsedMs: v.number(),
    player: v.string(),
    recordId: v.string(),
    startedAt: v.string(),
    status: v.union(v.literal('in-progress'), v.literal('completed')),
    updatedAt: v.string(),
  })
    .index('by_challengeId_and_anonId', ['challengeId', 'anonId'])
    .index('by_challengeId_and_elapsedMs', ['challengeId', 'elapsedMs'])
    .index('by_challengeId_and_updatedAt', ['challengeId', 'updatedAt']),

  friendships: defineTable({
    createdAt: v.string(),
    recipientAnonId: v.string(),
    requesterAnonId: v.string(),
    status: v.union(v.literal('pending'), v.literal('accepted')),
    updatedAt: v.string(),
  })
    .index('by_requesterAnonId', ['requesterAnonId'])
    .index('by_recipientAnonId', ['recipientAnonId'])
    .index('by_status', ['status']),
});

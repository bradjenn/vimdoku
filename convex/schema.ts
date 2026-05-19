import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  profiles: defineTable({
    anonId: v.string(),
    createdAt: v.string(),
    name: v.string(),
    updatedAt: v.string(),
  }).index('by_anonId', ['anonId']),

  games: defineTable({
    anonId: v.string(),
    completedAt: v.optional(v.string()),
    completion: v.number(),
    difficulty: v.optional(v.string()),
    elapsedMs: v.number(),
    givens: v.array(v.boolean()),
    grid: v.array(v.number()),
    notes: v.array(v.array(v.number())),
    puzzle: v.string(),
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
    player: v.string(),
    puzzle: v.string(),
    recordId: v.string(),
    source: v.string(),
  })
    .index('by_elapsedMs', ['elapsedMs'])
    .index('by_puzzle_elapsedMs', ['puzzle', 'elapsedMs'])
    .index('by_recordId', ['recordId']),
});

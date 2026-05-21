import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server'
import { v } from 'convex/values'

export const list = query({
  args: {
    limit: v.optional(v.number()),
    recipientAnonId: v.string(),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(50, Math.floor(args.limit ?? 20)))
    return await ctx.db
      .query('notifications')
      .withIndex('by_recipientAnonId_and_createdAt', (q) =>
        q.eq('recipientAnonId', args.recipientAnonId),
      )
      .order('desc')
      .take(limit)
  },
})

export const unreadCount = query({
  args: {
    recipientAnonId: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('notifications')
      .withIndex('by_recipientAnonId_and_createdAt', (q) =>
        q.eq('recipientAnonId', args.recipientAnonId),
      )
      .order('desc')
      .take(100)
    return rows.filter((row) => !row.readAt).length
  },
})

export const markRead = mutation({
  args: {
    notificationId: v.id('notifications'),
    recipientAnonId: v.string(),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId)
    if (!notification) return null
    if (notification.recipientAnonId !== args.recipientAnonId) {
      throw new Error('Only the recipient can read this notification.')
    }
    if (notification.readAt) return notification._id
    await ctx.db.patch(notification._id, {
      readAt: new Date().toISOString(),
    })
    return notification._id
  },
})

export const markAllRead = mutation({
  args: {
    recipientAnonId: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('notifications')
      .withIndex('by_recipientAnonId_and_createdAt', (q) =>
        q.eq('recipientAnonId', args.recipientAnonId),
      )
      .order('desc')
      .take(100)
    const unreadRows = rows.filter((row) => !row.readAt)
    const readAt = new Date().toISOString()
    await Promise.all(
      unreadRows.map((row) =>
        ctx.db.patch(row._id, {
          readAt,
        }),
      ),
    )
    return unreadRows.length
  },
})

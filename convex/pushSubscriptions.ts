import { v } from 'convex/values'
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'

type PushSubscriptionRow = {
  _id: Id<'pushSubscriptions'>
  anonId: string
  auth: string
  dateKey: string
  endpoint: string
  p256dh: string
  timezone: string
}

export const settings = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    const publicKey = process.env.VAPID_PUBLIC_KEY ?? ''
    if (!identity) {
      return {
        enabled: false,
        publicKey,
      }
    }

    const rows = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_authSubject', (q) =>
        q.eq('authSubject', identity.tokenIdentifier),
      )
      .take(50)

    return {
      enabled: rows.some((row) => row.enabled),
      publicKey,
    }
  },
})

export const upsert = mutation({
  args: {
    auth: v.string(),
    endpoint: v.string(),
    p256dh: v.string(),
    reminderHour: v.optional(v.number()),
    timezone: v.string(),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Sign in to enable daily reminders.')

    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_authSubject', (q) =>
        q.eq('authSubject', identity.tokenIdentifier),
      )
      .unique()
    if (!profile) throw new Error('Claim your profile before enabling reminders.')

    const now = new Date().toISOString()
    const existing = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_endpoint', (q) => q.eq('endpoint', cleanText(args.endpoint)))
      .first()
    const patch = {
      anonId: profile.anonId,
      auth: cleanText(args.auth),
      authSubject: identity.tokenIdentifier,
      enabled: true,
      endpoint: cleanText(args.endpoint),
      p256dh: cleanText(args.p256dh),
      reminderHour: cleanReminderHour(args.reminderHour),
      timezone: cleanTimezone(args.timezone),
      updatedAt: now,
      userAgent: args.userAgent ? cleanText(args.userAgent, 240) : undefined,
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch)
      return existing._id
    }

    return await ctx.db.insert('pushSubscriptions', {
      ...patch,
      createdAt: now,
    })
  },
})

export const disable = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return 0

    const rows = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_authSubject', (q) =>
        q.eq('authSubject', identity.tokenIdentifier),
      )
      .take(50)
    const now = new Date().toISOString()
    await Promise.all(
      rows.map((row) =>
        ctx.db.patch(row._id, {
          enabled: false,
          updatedAt: now,
        }),
      ),
    )
    return rows.length
  },
})

export const dueDailyReminders = internalQuery({
  args: {
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_enabled', (q) => q.eq('enabled', true))
      .take(500)

    const due: PushSubscriptionRow[] = []
    for (const row of rows) {
      const local = localDateParts(args.now, row.timezone)
      if (local.hour !== row.reminderHour) continue
      if (row.lastSentDateKey === local.dateKey) continue
      if (await completedDaily(ctx, row.anonId, local.dateKey)) continue

      due.push({
        _id: row._id,
        anonId: row.anonId,
        auth: row.auth,
        dateKey: local.dateKey,
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        timezone: row.timezone,
      })
    }
    return due
  },
})

export const markSent = internalMutation({
  args: {
    dateKey: v.string(),
    subscriptionId: v.id('pushSubscriptions'),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.subscriptionId, {
      lastSentDateKey: args.dateKey,
      updatedAt: new Date().toISOString(),
    })
    return args.subscriptionId
  },
})

export const disableById = internalMutation({
  args: {
    subscriptionId: v.id('pushSubscriptions'),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.subscriptionId, {
      enabled: false,
      updatedAt: new Date().toISOString(),
    })
    return args.subscriptionId
  },
})

async function completedDaily(ctx: QueryCtx, anonId: string, dateKey: string) {
  const rows = await ctx.db
    .query('games')
    .withIndex('by_anonId_updated', (q) => q.eq('anonId', anonId))
    .order('desc')
    .take(120)

  return rows.some(
    (row: Doc<'games'>) =>
      row.status === 'completed' &&
      (row.recordId.includes(dateKey) || row.source.includes(`daily ${dateKey}`)),
  )
}

function localDateParts(now: number, timezone: string) {
  const date = new Date(now)
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
      month: '2-digit',
      timeZone: timezone,
      year: 'numeric',
    }).formatToParts(date)
    const get = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? ''
    const hour = Number(get('hour')) % 24
    return {
      dateKey: `${get('year')}-${get('month')}-${get('day')}`,
      hour,
    }
  } catch {
    return {
      dateKey: date.toISOString().slice(0, 10),
      hour: date.getUTCHours(),
    }
  }
}

function cleanReminderHour(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 9
  return Math.max(0, Math.min(23, Math.floor(value)))
}

function cleanText(value: string, maxLength = 512) {
  return value.trim().slice(0, maxLength)
}

function cleanTimezone(value: string) {
  return cleanText(value || 'UTC', 80) || 'UTC'
}

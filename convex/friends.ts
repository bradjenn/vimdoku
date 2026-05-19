import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';
import { v } from 'convex/values';

export const list = query({
  args: {
    anonId: v.string(),
  },
  handler: async (ctx, args) => {
    const [outgoing, incoming] = await Promise.all([
      ctx.db
        .query('friendships')
        .withIndex('by_requesterAnonId', (q) => q.eq('requesterAnonId', args.anonId))
        .collect(),
      ctx.db
        .query('friendships')
        .withIndex('by_recipientAnonId', (q) => q.eq('recipientAnonId', args.anonId))
        .collect(),
    ]);
    const rows = [...outgoing, ...incoming].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
    const profileIds = new Set<string>();
    for (const row of rows) {
      profileIds.add(row.requesterAnonId);
      profileIds.add(row.recipientAnonId);
    }
    const profiles = await Promise.all(
      [...profileIds].map(async (anonId) => {
        const profile = await ctx.db
          .query('profiles')
          .withIndex('by_anonId', (q) => q.eq('anonId', anonId))
          .unique();
        return [anonId, profile] as const;
      }),
    );
    const profileByAnonId = new Map(profiles);

    return rows.map((row) => {
      const isIncoming = row.recipientAnonId === args.anonId;
      const otherAnonId = isIncoming ? row.requesterAnonId : row.recipientAnonId;
      const otherProfile = profileByAnonId.get(otherAnonId);
      return {
        createdAt: row.createdAt,
        direction: isIncoming ? 'incoming' : 'outgoing',
        friend: {
          anonId: otherAnonId,
          friendCode: otherProfile?.friendCode ?? '',
          name: otherProfile?.name ?? 'anonymous',
        },
        friendshipId: row._id,
        status: row.status,
        updatedAt: row.updatedAt,
      };
    });
  },
});

export const request = mutation({
  args: {
    friendCode: v.string(),
    requesterAnonId: v.string(),
  },
  handler: async (ctx, args) => {
    const friendCode = cleanFriendCode(args.friendCode);
    const recipient = await ctx.db
      .query('profiles')
      .withIndex('by_friendCode', (q) => q.eq('friendCode', friendCode))
      .unique();

    if (!recipient) throw new Error('Friend code not found.');
    if (recipient.anonId === args.requesterAnonId) {
      throw new Error('That is your own friend code.');
    }

    const outgoing = await ctx.db
      .query('friendships')
      .withIndex('by_requesterAnonId', (q) =>
        q.eq('requesterAnonId', args.requesterAnonId),
      )
      .collect();
    const existingOutgoing = outgoing.find(
      (row) => row.recipientAnonId === recipient.anonId,
    );
    if (existingOutgoing) return existingOutgoing._id;

    const incoming = await ctx.db
      .query('friendships')
      .withIndex('by_requesterAnonId', (q) => q.eq('requesterAnonId', recipient.anonId))
      .collect();
    const reciprocal = incoming.find(
      (row) => row.recipientAnonId === args.requesterAnonId,
    );
    const now = new Date().toISOString();
    if (reciprocal) {
      await ctx.db.patch(reciprocal._id, {
        status: 'accepted',
        updatedAt: now,
      });
      return reciprocal._id;
    }

    return await ctx.db.insert('friendships', {
      createdAt: now,
      recipientAnonId: recipient.anonId,
      requesterAnonId: args.requesterAnonId,
      status: 'pending',
      updatedAt: now,
    });
  },
});

export const accept = mutation({
  args: {
    anonId: v.string(),
    friendshipId: v.id('friendships'),
  },
  handler: async (ctx, args) => {
    const friendship = await ctx.db.get(args.friendshipId);
    if (!friendship) throw new Error('Friend request not found.');
    if (friendship.recipientAnonId !== args.anonId) {
      throw new Error('Only the recipient can accept this request.');
    }
    await ctx.db.patch(args.friendshipId, {
      status: 'accepted',
      updatedAt: new Date().toISOString(),
    });
    return args.friendshipId;
  },
});

export const remove = mutation({
  args: {
    anonId: v.string(),
    friendshipId: v.id('friendships'),
  },
  handler: async (ctx, args) => {
    const friendship = await ctx.db.get(args.friendshipId);
    if (!friendship) return null;
    if (
      friendship.recipientAnonId !== args.anonId &&
      friendship.requesterAnonId !== args.anonId
    ) {
      throw new Error('Only a participant can remove this friendship.');
    }
    await ctx.db.delete(args.friendshipId);
    return args.friendshipId;
  },
});

function cleanFriendCode(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return compact.startsWith('VIM')
    ? `VIM-${compact.slice(3, 9)}`
    : `VIM-${compact.slice(0, 6)}`;
}

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import type { FunctionReference } from 'convex/server';
import { getOrCreateGuestId } from './identity';

export type FriendSummary = {
  anonId: string;
  friendCode: string;
  name: string;
};

type FriendshipRow = {
  createdAt: string;
  direction: 'incoming' | 'outgoing';
  friend: FriendSummary;
  friendshipId: string;
  status: 'pending' | 'accepted';
  updatedAt: string;
};

const listFriendsRef = makeFunctionReference<
  'query',
  { anonId: string },
  FriendshipRow[]
>('friends:list');

const requestFriendRef = makeFunctionReference<
  'mutation',
  { friendCode: string; requesterAnonId: string },
  string
>('friends:request');

const acceptFriendRef = makeFunctionReference<
  'mutation',
  { anonId: string; friendshipId: string },
  string
>('friends:accept');

const removeFriendRef = makeFunctionReference<
  'mutation',
  { anonId: string; friendshipId: string },
  string | null
>('friends:remove');

export function FriendsPanel({
  friendCode,
  onChallengeFriend,
}: {
  friendCode: string;
  onChallengeFriend: (friend: FriendSummary) => void;
}) {
  const anonId = useMemo(() => getOrCreateGuestId(), []);
  const [codeInput, setCodeInput] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const [status, setStatus] = useState('');
  const rows = useQuery(listFriendsRef as FunctionReference<'query'>, {
    anonId,
  }) as FriendshipRow[] | undefined;
  const requestFriend = useMutation(
    requestFriendRef as FunctionReference<'mutation'>,
  ) as (args: { friendCode: string; requesterAnonId: string }) => Promise<string>;
  const acceptFriend = useMutation(
    acceptFriendRef as FunctionReference<'mutation'>,
  ) as (args: { anonId: string; friendshipId: string }) => Promise<string>;
  const removeFriend = useMutation(
    removeFriendRef as FunctionReference<'mutation'>,
  ) as (args: { anonId: string; friendshipId: string }) => Promise<string | null>;
  const friends = rows?.filter((row) => row.status === 'accepted') ?? [];
  const incoming = rows?.filter(
    (row) => row.status === 'pending' && row.direction === 'incoming',
  ) ?? [];
  const outgoing = rows?.filter(
    (row) => row.status === 'pending' && row.direction === 'outgoing',
  ) ?? [];

  async function copyCode() {
    await navigator.clipboard?.writeText(friendCode).catch(() => undefined);
    setCopyState('copied');
    setStatus('Friend code copied.');
    window.setTimeout(() => setCopyState('idle'), 1600);
  }

  async function addFriend() {
    const friendCode = codeInput.trim();
    if (!friendCode) {
      setStatus('Enter a friend code first.');
      return;
    }
    setStatus('Sending friend request...');
    try {
      await requestFriend({ friendCode, requesterAnonId: anonId });
      setCodeInput('');
      setStatus('Friend request sent.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not add friend.');
    }
  }

  async function accept(friendshipId: string) {
    setStatus('Accepting friend request...');
    try {
      await acceptFriend({ anonId, friendshipId });
      setStatus('Friend added.');
    } catch {
      setStatus('Could not accept friend request.');
    }
  }

  async function remove(friendshipId: string) {
    setStatus('Updating friends...');
    try {
      await removeFriend({ anonId, friendshipId });
      setStatus('Friendship removed.');
    } catch {
      setStatus('Could not remove friend.');
    }
  }

  return (
    <section className="border border-[var(--border)] bg-[var(--input-bg)]">
      <header className="border-b border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
        [friends]
      </header>
      <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-3">
          <div className="border border-[var(--border)] bg-[var(--panel-bg)] p-3">
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--muted)]">
              your friend code
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <code className="truncate border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-sm font-black uppercase tracking-[0.16em] text-[var(--app-text)]">
                {friendCode || 'syncing'}
              </code>
              <button
                type="button"
                disabled={!friendCode}
                className={`min-w-24 border px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.14em] transition disabled:cursor-wait disabled:opacity-50 ${
                  copyState === 'copied'
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
                    : 'border-[var(--border)] bg-[var(--button-bg)] hover:border-[var(--accent)]'
                }`}
                onClick={() => void copyCode()}
              >
                {copyState === 'copied' ? 'copied' : 'copy'}
              </button>
            </div>
          </div>

          <div className="border border-[var(--border)] bg-[var(--panel-bg)] p-3">
            <label className="block">
              <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--muted)]">
                add by code
              </span>
              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input
                  className="min-w-0 border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-sm uppercase tracking-[0.12em] text-[var(--app-text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
                  placeholder="VIM-ABC123"
                  value={codeInput}
                  onChange={(event) => setCodeInput(event.target.value)}
                />
                <button
                  type="button"
                  className="border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 font-mono text-xs font-black uppercase tracking-[0.14em] text-[var(--app-bg)]"
                  onClick={() => void addFriend()}
                >
                  add
                </button>
              </div>
            </label>
          </div>

          {status && (
            <p className="border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.14em] text-[var(--accent)]">
              {status}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <FriendList
            empty="No friends yet. Share your code or add someone else's."
            onChallengeFriend={onChallengeFriend}
            onRemove={(id) => void remove(id)}
            rows={friends}
            title="friends"
          />
          <FriendList
            empty="No incoming requests."
            onAccept={(id) => void accept(id)}
            onRemove={(id) => void remove(id)}
            rows={incoming}
            title="requests"
          />
          <FriendList
            empty="No outgoing requests."
            onRemove={(id) => void remove(id)}
            rows={outgoing}
            title="sent"
          />
        </div>
      </div>
    </section>
  );
}

function FriendList({
  empty,
  onAccept,
  onChallengeFriend,
  onRemove,
  rows,
  title,
}: {
  empty: string;
  onAccept?: (friendshipId: string) => void;
  onChallengeFriend?: (friend: FriendSummary) => void;
  onRemove: (friendshipId: string) => void;
  rows: FriendshipRow[];
  title: string;
}) {
  return (
    <div className="border border-[var(--border)] bg-[var(--panel-bg)]">
      <header className="border-b border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
        {title} <span className="text-[var(--accent)]">{rows.length}</span>
      </header>
      {rows.length === 0 ? (
        <p className="p-3 text-sm leading-relaxed text-[var(--muted)]">{empty}</p>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {rows.map((row) => (
            <article
              key={row.friendshipId}
              className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-sm font-black text-[var(--app-text)]">
                  {row.friend.name}
                </p>
                <p className="mt-1 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-[var(--muted)]">
                  {row.friend.friendCode || 'friend code pending'}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {onChallengeFriend && (
                  <button
                    type="button"
                    className="border border-[var(--accent)] bg-[var(--accent)] px-2.5 py-1.5 font-mono text-[0.65rem] font-black uppercase tracking-[0.12em] text-[var(--app-bg)]"
                    onClick={() => onChallengeFriend(row.friend)}
                  >
                    challenge
                  </button>
                )}
                {onAccept && (
                  <button
                    type="button"
                    className="border border-[var(--accent)] px-2.5 py-1.5 font-mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[var(--accent)]"
                    onClick={() => onAccept(row.friendshipId)}
                  >
                    accept
                  </button>
                )}
                <button
                  type="button"
                  className="border border-[var(--border)] px-2.5 py-1.5 font-mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[var(--danger)] hover:border-[var(--danger)]"
                  onClick={() => onRemove(row.friendshipId)}
                >
                  remove
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

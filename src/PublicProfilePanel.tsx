import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import type { FunctionReference } from 'convex/server';
import { getOrCreateGuestId } from './identity';

export type PublicProfile = {
  createdAt: string;
  friendCode: string;
  friends: PublicProfileFriend[];
  friendshipStatus: FriendshipStatus;
  name: string;
  recentCompleted: PublicProfileCompletion[];
  stats: {
    averageElapsedMs?: number;
    bestElapsedMs?: number;
    completedCount: number;
    currentStreak: number;
    lastCompletedAt?: string;
  };
  updatedAt: string;
};

type PublicProfileCompletion = {
  completedAt: string;
  difficulty?: string;
  elapsedMs: number;
  playMode: string;
  puzzleSize: string;
  source: string;
};

type PublicProfileFriend = {
  friendCode: string;
  name: string;
  stats: {
    bestElapsedMs?: number;
    completedCount: number;
  };
};

type FriendshipStatus = 'none' | 'incoming' | 'outgoing' | 'accepted' | 'self';

const publicProfileRef = makeFunctionReference<
  'query',
  { friendCode: string; viewerAnonId: string },
  PublicProfile | null
>('profiles:publicByFriendCode');

const requestFriendRef = makeFunctionReference<
  'mutation',
  { friendCode: string; requesterAnonId: string },
  string
>('friends:request');

export function PublicProfilePanel({
  friendCode,
  onBack,
  onChallenge,
}: {
  friendCode: string;
  onBack: () => void;
  onChallenge: (profile: PublicProfile) => void;
}) {
  const viewerAnonId = useMemo(() => getOrCreateGuestId(), []);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const [friendStatus, setFriendStatus] = useState('');
  const [isUpdatingFriend, setIsUpdatingFriend] = useState(false);
  const profile = useQuery(publicProfileRef as FunctionReference<'query'>, {
    friendCode,
    viewerAnonId,
  }) as PublicProfile | null | undefined;
  const requestFriend = useMutation(
    requestFriendRef as FunctionReference<'mutation'>,
  ) as (args: { friendCode: string; requesterAnonId: string }) => Promise<string>;
  const profileUrl = useMemo(
    () => `${window.location.origin}/u/${encodeURIComponent(friendCode)}`,
    [friendCode],
  );

  async function copyProfileUrl() {
    await navigator.clipboard?.writeText(profileUrl).catch(() => undefined);
    setCopyState('copied');
    window.setTimeout(() => setCopyState('idle'), 1600);
  }

  async function addFriend(profile: PublicProfile) {
    setIsUpdatingFriend(true);
    setFriendStatus(
      profile.friendshipStatus === 'incoming'
        ? 'Accepting friend request...'
        : 'Sending friend request...',
    );
    try {
      await requestFriend({
        friendCode: profile.friendCode,
        requesterAnonId: viewerAnonId,
      });
      setFriendStatus(
        profile.friendshipStatus === 'incoming'
          ? 'Friend added.'
          : 'Friend request sent.',
      );
    } catch (error) {
      setFriendStatus(
        error instanceof Error ? error.message : 'Could not update friendship.',
      );
    } finally {
      setIsUpdatingFriend(false);
    }
  }

  if (profile === undefined) {
    return <PublicProfileShell status="loading public profile..." />;
  }

  if (profile === null) {
    return (
      <PublicProfileShell
        status="profile not found"
        action={
          <button
            type="button"
            className="border border-[var(--border)] bg-[var(--button-bg)] px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-text)] hover:border-[var(--accent)]"
            onClick={onBack}
          >
            back
          </button>
        }
      />
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
      <section className="border border-[var(--border)] bg-[var(--input-bg)]">
        <header className="border-b border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
          [public identity]
        </header>
        <div className="space-y-4 p-4">
          <div className="grid aspect-square w-20 place-items-center border border-[var(--accent)] bg-[var(--panel-soft)] font-mono text-3xl font-black text-[var(--accent)]">
            {profile.name.trim().slice(0, 1).toUpperCase() || 'A'}
          </div>
          <div>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--muted)]">
              handle
            </p>
            <h2 className="mt-2 truncate font-mono text-2xl font-black text-[var(--app-text)]">
              {profile.name}
            </h2>
          </div>
          <ProfileMeta label="friend code" value={profile.friendCode} />
          <ProfileMeta label="joined" value={formatDate(profile.createdAt)} />
          <div className="grid gap-2">
            <FriendActionButton
              busy={isUpdatingFriend}
              status={profile.friendshipStatus}
              onClick={() => void addFriend(profile)}
            />
            <button
              type="button"
              className="border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 font-mono text-xs font-black uppercase tracking-[0.16em] text-[var(--app-bg)]"
              onClick={() => onChallenge(profile)}
            >
              challenge
            </button>
            <button
              type="button"
              className="border border-[var(--border)] bg-[var(--button-bg)] px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-text)] hover:border-[var(--accent)]"
              onClick={() => void copyProfileUrl()}
            >
              {copyState === 'copied' ? 'copied link' : 'copy profile link'}
            </button>
          </div>
          {friendStatus && (
            <p className="border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-[var(--accent)]">
              {friendStatus}
            </p>
          )}
        </div>
      </section>

      <section className="border border-[var(--border)] bg-[var(--input-bg)]">
        <header className="border-b border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
          [public stats]
        </header>
        <div className="grid grid-cols-2 gap-px bg-[var(--border)] lg:grid-cols-4">
          <ProfileStat
            label="completed"
            value={String(profile.stats.completedCount)}
          />
          <ProfileStat label="streak" value={`${profile.stats.currentStreak}d`} />
          <ProfileStat
            label="best"
            value={
              profile.stats.bestElapsedMs
                ? formatDuration(profile.stats.bestElapsedMs)
                : '--'
            }
          />
          <ProfileStat
            label="average"
            value={
              profile.stats.averageElapsedMs
                ? formatDuration(profile.stats.averageElapsedMs)
                : '--'
            }
          />
        </div>
        <div className="border-t border-[var(--border)] p-4 font-mono text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
          last completion:{' '}
          <span className="text-[var(--app-text)]">
            {profile.stats.lastCompletedAt
              ? formatDate(profile.stats.lastCompletedAt)
              : 'none yet'}
          </span>
        </div>
      </section>

      <section className="border border-[var(--border)] bg-[var(--input-bg)] lg:col-span-2">
        <header className="border-b border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
          [public friends]
        </header>
        {profile.friends.length === 0 ? (
          <p className="p-4 text-sm leading-relaxed text-[var(--muted)]">
            No public friends yet.
          </p>
        ) : (
          <div className="grid gap-px bg-[var(--border)] md:grid-cols-2">
            {profile.friends.map((friend) => (
              <a
                key={friend.friendCode}
                className="group block bg-[var(--input-bg)] p-4 transition hover:bg-[var(--panel-soft)]"
                href={`/u/${encodeURIComponent(friend.friendCode)}`}
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center border border-[var(--accent)] bg-[var(--status-bg)] font-mono text-sm font-black text-[var(--accent)]">
                    {friend.name.trim().slice(0, 1).toUpperCase() || 'A'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-sm font-black text-[var(--app-text)] group-hover:text-[var(--accent)]">
                      {friend.name}
                    </span>
                    <span className="mt-1 block font-mono text-[0.65rem] uppercase tracking-[0.14em] text-[var(--muted)]">
                      {friend.friendCode}
                    </span>
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-[0.65rem] uppercase tracking-[0.14em]">
                  <span className="border border-[var(--border)] bg-[var(--status-bg)] px-2 py-1 text-[var(--muted)]">
                    completed{' '}
                    <span className="text-[var(--app-text)]">
                      {friend.stats.completedCount}
                    </span>
                  </span>
                  <span className="border border-[var(--border)] bg-[var(--status-bg)] px-2 py-1 text-[var(--muted)]">
                    best{' '}
                    <span className="text-[var(--app-text)]">
                      {friend.stats.bestElapsedMs
                        ? formatDuration(friend.stats.bestElapsedMs)
                        : '--'}
                    </span>
                  </span>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="border border-[var(--border)] bg-[var(--input-bg)] lg:col-span-2">
        <header className="border-b border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
          [recent solves]
        </header>
        {profile.recentCompleted.length === 0 ? (
          <p className="p-4 text-sm leading-relaxed text-[var(--muted)]">
            No completed puzzles have synced yet.
          </p>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {profile.recentCompleted.map((game) => (
              <article
                key={`${game.completedAt}-${game.source}-${game.elapsedMs}`}
                className="grid gap-3 p-3 font-mono text-xs uppercase tracking-[0.12em] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold text-[var(--app-text)]">
                    {game.source}
                  </p>
                  <p className="mt-1 text-[var(--muted)]">
                    {game.puzzleSize} · {game.playMode}
                    {game.difficulty ? ` · ${game.difficulty}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[var(--muted)]">
                  <span className="text-[var(--accent)]">
                    {formatDuration(game.elapsedMs)}
                  </span>
                  <span>{formatDate(game.completedAt)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PublicProfileShell({
  action,
  status,
}: {
  action?: ReactNode;
  status: string;
}) {
  return (
    <section className="border border-[var(--border)] bg-[var(--input-bg)] p-5">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
        [public profile]
      </p>
      <p className="mt-3 font-mono text-sm uppercase tracking-[0.12em] text-[var(--muted)]">
        {status}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </section>
  );
}

function FriendActionButton({
  busy,
  onClick,
  status,
}: {
  busy: boolean;
  onClick: () => void;
  status: FriendshipStatus;
}) {
  const disabled =
    busy || status === 'accepted' || status === 'outgoing' || status === 'self';
  const label =
    busy
      ? 'updating'
      : status === 'accepted'
      ? 'friends'
      : status === 'outgoing'
        ? 'request sent'
        : status === 'incoming'
          ? 'accept friend'
          : status === 'self'
            ? 'your profile'
            : 'add friend';

  return (
    <button
      type="button"
      disabled={disabled}
      className={`border px-3 py-2 font-mono text-xs font-black uppercase tracking-[0.16em] transition disabled:cursor-default ${
        disabled
          ? 'border-[var(--border)] bg-[var(--status-bg)] text-[var(--muted)]'
          : 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)] active:translate-y-px'
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function ProfileMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.14em]">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="truncate text-right text-[var(--app-text)]">{value}</span>
    </div>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--input-bg)] p-4">
      <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-3 font-mono text-2xl font-black text-[var(--app-text)]">
        {value}
      </p>
    </div>
  );
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

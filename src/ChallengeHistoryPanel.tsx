import { useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import type { FunctionReference } from 'convex/server';
import { getOrCreateGuestId } from './identity';
import { challengeKindLabel, type ChallengeKind } from './challenges';
import { modeLabel, type PlayMode } from './playModes';
import type { PuzzleDifficulty, PuzzleSize } from './sudoku';

type ChallengeAttemptSummary = {
  anonId: string;
  completedAt?: string;
  completion: number;
  elapsedMs: number;
  mistakes: number;
  player: string;
  recordId: string;
  startedAt: string;
  status: 'in-progress' | 'completed';
  updatedAt: string;
};

type ChallengeSummary = {
  attempts: ChallengeAttemptSummary[];
  challengeId: string;
  challengeKind: ChallengeKind;
  createdAt: string;
  creatorName: string;
  difficulty?: PuzzleDifficulty | 'custom';
  isCreator: boolean;
  myAttempt?: ChallengeAttemptSummary;
  playMode: PlayMode;
  puzzleSize: PuzzleSize;
  source: string;
  status: 'open' | 'closed';
  title: string;
  updatedAt: string;
};

const listMineRef = makeFunctionReference<
  'query',
  { anonId: string },
  ChallengeSummary[]
>('challenges:listMine');

export function ChallengeHistoryPanel({
  onCopyLink,
  onOpenChallenge,
}: {
  onCopyLink: (challengeId: string) => void;
  onOpenChallenge: (challengeId: string) => void;
}) {
  const anonId = useMemo(() => getOrCreateGuestId(), []);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const challenges = useQuery(listMineRef as FunctionReference<'query'>, {
    anonId,
  }) as ChallengeSummary[] | undefined;

  function copyLink(challengeId: string) {
    onCopyLink(challengeId);
    setCopiedId(challengeId);
    window.setTimeout(() => setCopiedId(null), 1600);
  }

  return (
    <section className="border border-[var(--border)] bg-[var(--input-bg)]">
      <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
        <span>[my challenges]</span>
        <span className="text-[var(--muted)]">
          {challenges ? `${challenges.length} challenges` : 'loading'}
        </span>
      </header>
      {challenges === undefined ? (
        <p className="p-4 text-sm leading-relaxed text-[var(--muted)]">
          Loading challenges...
        </p>
      ) : challenges.length === 0 ? (
        <p className="p-4 text-sm leading-relaxed text-[var(--muted)]">
          No challenges yet. Create a link, send it to a friend, and
          results will collect here.
        </p>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {challenges.map((challenge) => (
            <article key={challenge.challengeId} className="p-3">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <button
                  type="button"
                  className="min-w-0 text-left"
                  onClick={() => onOpenChallenge(challenge.challengeId)}
                >
                  <p className="truncate font-mono text-sm font-black uppercase tracking-[0.12em] text-[var(--app-text)] hover:text-[var(--accent)]">
                    {challenge.challengeId}
                  </p>
                  <p className="mt-1 truncate text-sm text-[var(--muted)]">
                    {challenge.source}
                  </p>
                </button>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className="border border-[var(--accent)] bg-[var(--accent)] px-2.5 py-1.5 font-mono text-[0.65rem] font-black uppercase tracking-[0.12em] text-[var(--app-bg)]"
                    onClick={() => onOpenChallenge(challenge.challengeId)}
                  >
                    open
                  </button>
                  <button
                    type="button"
                    className={`border px-2.5 py-1.5 font-mono text-[0.65rem] font-bold uppercase tracking-[0.12em] ${
                      copiedId === challenge.challengeId
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
                        : 'border-[var(--border)] bg-[var(--button-bg)] text-[var(--app-text)] hover:border-[var(--accent)]'
                    }`}
                    onClick={() => copyLink(challenge.challengeId)}
                  >
                    {copiedId === challenge.challengeId ? 'copied' : 'copy'}
                  </button>
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <ChallengeFact
                  label="role"
                  value={challenge.isCreator ? 'creator' : 'racer'}
                />
                <ChallengeFact
                  label="type"
                  value={challengeKindLabel(challenge.challengeKind)}
                />
                <ChallengeFact
                  label="rules"
                  value={`${challenge.puzzleSize} ${modeLabel(challenge.playMode)}`}
                />
                <ChallengeFact
                  label="difficulty"
                  value={challenge.difficulty ?? 'custom'}
                />
                <ChallengeFact
                  label="updated"
                  value={formatDate(challenge.updatedAt)}
                />
              </div>

              <ChallengeResults challenge={challenge} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ChallengeResults({ challenge }: { challenge: ChallengeSummary }) {
  const completed = challenge.attempts.filter(
    (attempt) => attempt.status === 'completed',
  );
  const active = challenge.attempts.filter((attempt) => attempt.status !== 'completed');
  const leader = completed[0];
  const mine = challenge.myAttempt;

  return (
    <div className="mt-3 border border-[var(--border)] bg-[var(--panel-bg)]">
      <div className="grid gap-px bg-[var(--border)] md:grid-cols-3">
        <ResultTile
          label="leader"
          value={leader ? leader.player : '--'}
          detail={leader ? formatDuration(leader.elapsedMs) : 'no finish yet'}
        />
        <ResultTile
          label="you"
          value={mine ? attemptLabel(mine) : 'not joined'}
          detail={mine ? attemptDetail(mine) : challenge.isCreator ? 'creator' : '--'}
        />
        <ResultTile
          label="field"
          value={`${completed.length}/${challenge.attempts.length}`}
          detail={`${active.length} racing`}
        />
      </div>

      {challenge.attempts.length > 0 && (
        <div className="divide-y divide-[var(--border)]">
          {challenge.attempts.slice(0, 4).map((attempt, index) => (
            <div
              key={`${attempt.anonId}-${attempt.recordId}`}
              className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 font-mono"
            >
              <span className="text-xs font-black text-[var(--accent)]">
                {attempt.status === 'completed' ? index + 1 : '...'}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-[var(--app-text)]">
                  {attempt.player}
                </span>
                <span className="block text-[0.65rem] uppercase tracking-[0.14em] text-[var(--muted)]">
                  {attempt.status === 'completed'
                    ? formatDate(attempt.completedAt ?? attempt.updatedAt)
                    : `${attempt.completion} filled`}
                </span>
              </span>
              <span className="text-sm font-black text-[var(--app-text)]">
                {attempt.status === 'completed'
                  ? challenge.challengeKind === 'streak'
                    ? `${attempt.mistakes} / ${formatDuration(attempt.elapsedMs)}`
                    : formatDuration(attempt.elapsedMs)
                  : 'racing'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChallengeFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.12em]">
      <span className="text-[var(--muted)]">{label}</span>{' '}
      <span className="text-[var(--app-text)]">{value}</span>
    </div>
  );
}

function ResultTile({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-[var(--input-bg)] p-3 font-mono">
      <p className="text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-2 truncate text-sm font-black text-[var(--app-text)]">
        {value}
      </p>
      <p className="mt-1 truncate text-[0.65rem] uppercase tracking-[0.12em] text-[var(--accent)]">
        {detail}
      </p>
    </div>
  );
}

function attemptLabel(attempt: ChallengeAttemptSummary) {
  return attempt.status === 'completed' ? 'finished' : 'racing';
}

function attemptDetail(attempt: ChallengeAttemptSummary) {
  return attempt.status === 'completed'
    ? attempt.mistakes > 0
      ? `${attempt.mistakes} misses`
      : formatDuration(attempt.elapsedMs)
    : `${attempt.completion} filled`;
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

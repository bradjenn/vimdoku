import { useMemo, useState } from 'react'
import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import type { FunctionReference } from 'convex/server'
import { challengeKindLabel, type ChallengeKind } from './challenges'
import { formatHumanDate } from './dates'
import { modeLabel, type PlayMode } from './playModes'
import type { PuzzleDifficulty, PuzzleSize } from './sudoku'

type ChallengeAttemptSummary = {
  anonId: string
  completedAt?: string
  completion: number
  elapsedMs: number
  mistakes: number
  player: string
  recordId: string
  startedAt: string
  status: 'in-progress' | 'completed'
  updatedAt: string
}

type ChallengeSummary = {
  attempts: ChallengeAttemptSummary[]
  challengeId: string
  challengeKind: ChallengeKind
  createdAt: string
  creatorName: string
  difficulty?: PuzzleDifficulty | 'custom'
  isCreator: boolean
  isRecipient: boolean
  myAttempt?: ChallengeAttemptSummary
  playMode: PlayMode
  puzzleSize: PuzzleSize
  recipientAnonId?: string
  recipientName?: string
  source: string
  status: 'open' | 'closed'
  title: string
  updatedAt: string
}

type LiveBattlePresenceSummary = {
  anonId: string
  completion: number
  elapsedMs: number
  lastSeenAt: number
  lives?: number
  mistakes: number
  player: string
  recordId?: string
  selectedCell?: number
  status: 'online' | 'ready' | 'solving' | 'finished'
  updatedAt: string
}

type LiveBattleResultSummary = {
  battleKind: 'race' | 'turns'
  createdAt: string
  creatorName: string
  difficulty?: PuzzleDifficulty | 'custom'
  playMode: PlayMode
  presence: LiveBattlePresenceSummary[]
  puzzleSize: PuzzleSize
  roomId: string
  source: string
  status: 'finished'
  title: string
  updatedAt: string
  variantId?: string
  winnerAnonId?: string
}

const listMineRef = makeFunctionReference<
  'query',
  { anonId: string },
  ChallengeSummary[]
>('challenges:listMine')

const listResultsRef = makeFunctionReference<
  'query',
  { anonId: string },
  ChallengeSummary[]
>('challenges:listResults')

const listLiveResultsRef = makeFunctionReference<
  'query',
  { anonId: string },
  LiveBattleResultSummary[]
>('liveBattles:listResults')

export function ChallengeHistoryPanel({
  anonId,
  onCopyLink,
  onOpenChallenge,
  onOpenResults,
}: {
  anonId: string
  onCopyLink: (challengeId: string) => void
  onOpenChallenge: (challengeId: string) => void
  onOpenResults: () => void
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const challenges = useQuery(listMineRef as FunctionReference<'query'>, {
    anonId,
  }) as ChallengeSummary[] | undefined

  function copyLink(challengeId: string) {
    onCopyLink(challengeId)
    setCopiedId(challengeId)
    window.setTimeout(() => setCopiedId(null), 1600)
  }

  return (
    <section className="border border-[var(--border)] bg-[var(--input-bg)]">
      <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
        <span>[my challenges]</span>
        <button
          type="button"
          onClick={onOpenResults}
          className="border border-[var(--border)] bg-[var(--button-bg)] px-2 py-1 font-bold text-[var(--app-text)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          {challenges ? 'view results' : 'loading'}
        </button>
      </header>
      {challenges === undefined ? (
        <p className="p-4 text-sm leading-relaxed text-[var(--muted)]">
          Loading challenges...
        </p>
      ) : challenges.length === 0 ? (
        <p className="p-4 text-sm leading-relaxed text-[var(--muted)]">
          No challenges yet. Create a link, send it to a friend, and results
          will collect here.
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
                  value={
                    challenge.isRecipient
                      ? 'challenged'
                      : challenge.isCreator
                        ? 'creator'
                        : 'racer'
                  }
                />
                <ChallengeFact
                  label="opponent"
                  value={challenge.recipientName ?? 'open link'}
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
  )
}

export function ChallengeResultsView({
  anonId,
  onCopyLink,
  onCopyLiveBattle,
  onNewChallenge,
  onOpenChallenge,
  onOpenLiveBattle,
}: {
  anonId: string
  onCopyLink: (challengeId: string) => void
  onCopyLiveBattle: (roomId: string) => void
  onNewChallenge: () => void
  onOpenChallenge: (challengeId: string) => void
  onOpenLiveBattle: (roomId: string) => void
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copiedRoomId, setCopiedRoomId] = useState<string | null>(null)
  const challenges = useQuery(listResultsRef as FunctionReference<'query'>, {
    anonId,
  }) as ChallengeSummary[] | undefined
  const liveBattles = useQuery(
    listLiveResultsRef as FunctionReference<'query'>,
    { anonId },
  ) as LiveBattleResultSummary[] | undefined
  const results = useMemo(
    () => summarizeChallengeResults(challenges ?? [], liveBattles ?? []),
    [challenges, liveBattles],
  )

  function copyLink(challengeId: string) {
    onCopyLink(challengeId)
    setCopiedId(challengeId)
    window.setTimeout(() => setCopiedId(null), 1600)
  }

  function copyLiveBattle(roomId: string) {
    onCopyLiveBattle(roomId)
    setCopiedRoomId(roomId)
    window.setTimeout(() => setCopiedRoomId(null), 1600)
  }

  if (challenges === undefined || liveBattles === undefined) {
    return (
      <section className="border border-[var(--border)] bg-[var(--input-bg)] p-5">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
          loading challenge results
        </p>
      </section>
    )
  }

  if (challenges.length === 0 && liveBattles.length === 0) {
    return (
      <section className="border border-[var(--border)] bg-[var(--input-bg)] p-5">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
          no matches yet
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          Create a challenge link, send it to a friend, and this page becomes
          the match log for completed and in-progress challenges.
        </p>
        <button
          type="button"
          onClick={onNewChallenge}
          className="mt-4 border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 font-mono text-xs font-black uppercase tracking-[0.16em] text-[var(--app-bg)]"
        >
          new challenge
        </button>
      </section>
    )
  }

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-3 border border-[var(--border)] bg-[var(--status-bg)] px-4 py-3">
        <div>
          <p className="font-mono text-[0.65rem] font-black uppercase tracking-[0.22em] text-[var(--accent)]">
            [challenge-results]
          </p>
          <h2 className="mt-1 font-mono text-2xl font-semibold uppercase tracking-[0.12em] text-[var(--app-text)]">
            match results
          </h2>
        </div>
        <button
          type="button"
          onClick={onNewChallenge}
          className="border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 font-mono text-xs font-black uppercase tracking-[0.14em] text-[var(--app-bg)]"
        >
          new challenge
        </button>
      </header>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-3">
          {results.matchCards.length === 0 &&
          results.liveBattleCards.length === 0 ? (
            <section className="border border-[var(--border)] bg-[var(--input-bg)] p-4">
              <p className="font-mono text-sm text-[var(--muted)]">
                No completed results yet.
              </p>
            </section>
          ) : (
            <>
              {results.liveBattleCards.map((match) => (
                <LiveBattleResultCard
                  copiedId={copiedRoomId}
                  key={match.room.roomId}
                  match={match}
                  onCopyLink={copyLiveBattle}
                  onOpenBattle={onOpenLiveBattle}
                />
              ))}
              {results.matchCards.map((match) => (
                <MatchResultCard
                  copiedId={copiedId}
                  key={match.challenge.challengeId}
                  match={match}
                  onCopyLink={copyLink}
                  onOpenChallenge={onOpenChallenge}
                />
              ))}
            </>
          )}
        </section>

        {results.standings.length > 0 && (
          <aside>
            <StandingsTable players={results.standings.slice(0, 8)} />
          </aside>
        )}
      </div>
    </div>
  )
}

function StandingsTable({ players }: { players: StandingRecord[] }) {
  return (
    <section className="border border-[var(--border)] bg-[var(--input-bg)]">
      <header className="border-b border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-[0.65rem] font-black uppercase tracking-[0.22em] text-[var(--accent)]">
        [standings]
      </header>
      <table className="w-full border-collapse font-mono text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--status-bg)] font-mono text-[0.6rem] uppercase tracking-[0.16em] text-[var(--muted)]">
            <th className="w-px px-3 py-1.5 text-left font-normal" scope="col">
              #
            </th>
            <th className="px-1 py-1.5 text-left font-normal" scope="col">
              player
            </th>
            <th className="w-px px-1.5 py-1.5 text-right font-normal" scope="col">
              <abbr title="Played" className="no-underline">p</abbr>
            </th>
            <th className="w-px px-1.5 py-1.5 text-right font-normal" scope="col">
              <abbr title="Won" className="no-underline">w</abbr>
            </th>
            <th className="w-px px-1.5 py-1.5 text-right font-normal" scope="col">
              <abbr title="Drawn" className="no-underline">d</abbr>
            </th>
            <th className="w-px px-3 py-1.5 text-right font-normal" scope="col">
              <abbr title="Lost" className="no-underline">l</abbr>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {players.map((player, index) => (
            <tr key={player.player}>
              <td className="w-px whitespace-nowrap px-3 py-2 text-[var(--muted)]">
                {String(index + 1).padStart(2, '0')}
              </td>
              <td className="px-1 py-2 font-black text-[var(--app-text)]">
                {player.player}
              </td>
              <td className="w-px whitespace-nowrap px-1.5 py-2 text-right tabular-nums text-[var(--muted)]">
                {player.played}
              </td>
              <td className="w-px whitespace-nowrap px-1.5 py-2 text-right tabular-nums font-black text-[var(--accent)]">
                {player.wins}
              </td>
              <td className="w-px whitespace-nowrap px-1.5 py-2 text-right tabular-nums text-[var(--muted)]">
                {player.draws}
              </td>
              <td className="w-px whitespace-nowrap px-3 py-2 text-right tabular-nums text-[var(--muted)]">
                {player.losses}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function MatchResultCard({
  copiedId,
  match,
  onCopyLink,
  onOpenChallenge,
}: {
  copiedId: string | null
  match: MatchCard
  onCopyLink: (challengeId: string) => void
  onOpenChallenge: (challengeId: string) => void
}) {
  return (
    <article className="border border-[var(--border)] bg-[var(--input-bg)]">
      <header className="grid gap-3 bg-[var(--status-bg)] p-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0 font-mono">
          <p className="truncate text-sm uppercase tracking-wide text-[var(--accent)]">
            {challengeSummaryLabel(match.challenge)}
          </p>
          <h3 className="mt-2 truncate text-xl font-semibold text-[var(--app-text)]">
            {match.winner.player} won in {attemptScore(match.challenge, match.winner)}
          </h3>
          <p className="mt-1 truncate text-sm text-[var(--muted)]">
            {matchOpponentLabel(match)} / {formatDate(match.date)} /{' '}
            {match.challenge.challengeId}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onOpenChallenge(match.challenge.challengeId)}
            className="border border-[var(--border)] bg-[var(--button-bg)] px-3 py-2 font-mono text-xs font-black uppercase tracking-[0.14em] text-[var(--app-text)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            open
          </button>
          <button
            type="button"
            onClick={() => onCopyLink(match.challenge.challengeId)}
            className={`border px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.14em] transition ${
              copiedId === match.challenge.challengeId
                ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
                : 'border-[var(--border)] bg-[var(--button-bg)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
            }`}
          >
            {copiedId === match.challenge.challengeId ? 'copied' : 'copy'}
          </button>
        </div>
      </header>
    </article>
  )
}

function LiveBattleResultCard({
  copiedId,
  match,
  onCopyLink,
  onOpenBattle,
}: {
  copiedId: string | null
  match: LiveBattleCard
  onCopyLink: (roomId: string) => void
  onOpenBattle: (roomId: string) => void
}) {
  const winnerTime = liveBattleWinnerTime(match.room, match.winner)
  const opponent = match.opponent

  return (
    <article className="border border-[var(--border)] bg-[var(--input-bg)]">
      <header className="grid gap-3 bg-[var(--status-bg)] p-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0 font-mono">
          <p className="truncate text-sm uppercase tracking-wide text-[var(--accent)]">
            {liveBattleSummaryLabel(match.room)}
          </p>
          <h3 className="mt-2 truncate text-xl font-semibold text-[var(--app-text)]">
            {match.winner.player} won in {formatDuration(winnerTime)}
          </h3>
          <p className="mt-1 truncate text-sm text-[var(--muted)]">
            {opponent ? `vs ${opponent.player}` : 'opponent unavailable'} /{' '}
            {formatDate(match.date)} / {match.room.roomId}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onOpenBattle(match.room.roomId)}
            className="border border-[var(--border)] bg-[var(--button-bg)] px-3 py-2 font-mono text-xs font-black uppercase tracking-[0.14em] text-[var(--app-text)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            open
          </button>
          <button
            type="button"
            onClick={() => onCopyLink(match.room.roomId)}
            className={`border px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.14em] transition ${
              copiedId === match.room.roomId
                ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
                : 'border-[var(--border)] bg-[var(--button-bg)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
            }`}
          >
            {copiedId === match.room.roomId ? 'copied' : 'copy'}
          </button>
        </div>
      </header>
    </article>
  )
}

function ChallengeResults({ challenge }: { challenge: ChallengeSummary }) {
  const completed = challenge.attempts.filter(
    (attempt) => attempt.status === 'completed',
  )
  const active = challenge.attempts.filter(
    (attempt) => attempt.status !== 'completed',
  )
  const leader = completed[0]
  const mine = challenge.myAttempt

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
          detail={
            mine ? attemptDetail(mine) : challenge.isCreator ? 'creator' : '--'
          }
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
  )
}

function ChallengeFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.12em]">
      <span className="text-[var(--muted)]">{label}</span>{' '}
      <span className="text-[var(--app-text)]">{value}</span>
    </div>
  )
}

function ResultTile({
  detail,
  label,
  value,
}: {
  detail: string
  label: string
  value: string
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
  )
}

function attemptLabel(attempt: ChallengeAttemptSummary) {
  return attempt.status === 'completed' ? 'finished' : 'racing'
}

function attemptDetail(attempt: ChallengeAttemptSummary) {
  return attempt.status === 'completed'
    ? attempt.mistakes > 0
      ? `${attempt.mistakes} misses`
      : formatDuration(attempt.elapsedMs)
    : `${attempt.completion} filled`
}

function challengeSummaryLabel(challenge: ChallengeSummary) {
  return [
    challengeKindLabel(challenge.challengeKind),
    challenge.puzzleSize,
    modeLabel(challenge.playMode),
    challenge.difficulty,
  ]
    .filter(Boolean)
    .join(' / ')
}

function liveBattleSummaryLabel(room: LiveBattleResultSummary) {
  return [
    room.battleKind === 'turns' ? 'turn battle' : 'live race',
    room.puzzleSize,
    modeLabel(room.playMode),
    room.variantId && room.variantId !== 'classic' ? room.variantId : null,
    room.difficulty,
  ]
    .filter(Boolean)
    .join(' / ')
}

function matchOpponentLabel(match: MatchCard) {
  if (match.runnerUp) return `vs ${match.runnerUp.player}`
  return 'awaiting another player'
}

function liveBattleWinner(room: LiveBattleResultSummary) {
  if (room.winnerAnonId) {
    const winner = room.presence.find(
      (player) => player.anonId === room.winnerAnonId,
    )
    if (winner) return winner
  }
  return room.presence.find((player) => player.status === 'finished') ?? null
}

function liveBattleWinnerTime(
  room: LiveBattleResultSummary,
  winner: LiveBattlePresenceSummary,
) {
  if (winner.elapsedMs > 0) return winner.elapsedMs
  return Math.max(0, winner.lastSeenAt - new Date(room.createdAt).getTime())
}

type MatchCard = {
  challenge: ChallengeSummary
  completedCount: number
  date: string
  margin: string
  runnerUp: ChallengeAttemptSummary | null
  winner: ChallengeAttemptSummary
}

type LiveBattleCard = {
  date: string
  opponent: LiveBattlePresenceSummary | null
  room: LiveBattleResultSummary
  winner: LiveBattlePresenceSummary
}

type StandingRecord = {
  draws: number
  losses: number
  played: number
  player: string
  wins: number
}

function summarizeChallengeResults(
  challenges: ChallengeSummary[],
  liveBattles: LiveBattleResultSummary[],
) {
  const matchCards: MatchCard[] = []
  const liveBattleCards: LiveBattleCard[] = []
  const standings = new Map<string, StandingRecord>()
  let activeAttempts = 0
  let totalFinishes = 0

  for (const room of liveBattles) {
    const winner = liveBattleWinner(room)
    if (!winner) continue
    const opponent =
      room.presence.find((player) => player.anonId !== winner.anonId) ?? null
    const date = winner.updatedAt
    liveBattleCards.push({
      date,
      opponent,
      room,
      winner,
    })

    if (opponent) {
      const winnerRecord = standingFor(standings, winner.player)
      const opponentRecord = standingFor(standings, opponent.player)
      winnerRecord.played += 1
      winnerRecord.wins += 1
      opponentRecord.played += 1
      opponentRecord.losses += 1
    }
  }

  for (const challenge of challenges) {
    const completed = challenge.attempts.filter(
      (attempt) => attempt.status === 'completed',
    )
    const active = challenge.attempts.filter(
      (attempt) => attempt.status !== 'completed',
    )
    activeAttempts += active.length
    totalFinishes += completed.length

    const winner = completed[0]
    if (!winner) continue
    const runnerUp = completed[1] ?? null
    const date = winner.completedAt ?? winner.updatedAt
    matchCards.push({
      challenge,
      completedCount: completed.length,
      date,
      margin: runnerUp
        ? resultMargin(challenge, winner, runnerUp)
        : 'awaiting rivals',
      runnerUp,
      winner,
    })

    for (let i = 0; i < completed.length; i++) {
      for (let j = i + 1; j < completed.length; j++) {
        const a = completed[i]
        const b = completed[j]
        const recordA = standingFor(standings, a.player)
        const recordB = standingFor(standings, b.player)
        recordA.played += 1
        recordB.played += 1
        const cmp = compareAttempts(challenge, a, b)
        if (cmp < 0) {
          recordA.wins += 1
          recordB.losses += 1
        } else if (cmp > 0) {
          recordB.wins += 1
          recordA.losses += 1
        } else {
          recordA.draws += 1
          recordB.draws += 1
        }
      }
    }
  }

  const standingsRows = [...standings.values()].sort(
    (a, b) =>
      b.wins - a.wins ||
      a.losses - b.losses ||
      b.draws - a.draws ||
      a.player.localeCompare(b.player),
  )
  const sortedCards = matchCards.sort((a, b) => b.date.localeCompare(a.date))
  const sortedLiveCards = liveBattleCards.sort((a, b) =>
    b.date.localeCompare(a.date),
  )

  return {
    activeAttempts,
    completedMatches: matchCards.filter((match) => match.runnerUp),
    latestResult: sortedCards[0] ?? null,
    liveBattleCards: sortedLiveCards,
    matchCards: sortedCards,
    openMatches: challenges
      .filter((challenge) => {
        const completed = challenge.attempts.filter(
          (attempt) => attempt.status === 'completed',
        )
        return challenge.status === 'open' && completed.length < 2
      })
      .slice(0, 6),
    standings: standingsRows,
    topRival: standingsRows[0] ?? null,
    totalFinishes,
  }
}

function standingFor(records: Map<string, StandingRecord>, player: string) {
  const existing = records.get(player)
  if (existing) return existing
  const next: StandingRecord = {
    draws: 0,
    losses: 0,
    played: 0,
    player,
    wins: 0,
  }
  records.set(player, next)
  return next
}

function compareAttempts(
  challenge: ChallengeSummary,
  a: ChallengeAttemptSummary,
  b: ChallengeAttemptSummary,
) {
  if (challenge.challengeKind === 'streak' && a.mistakes !== b.mistakes) {
    return a.mistakes - b.mistakes
  }
  return a.elapsedMs - b.elapsedMs
}

function resultMargin(
  challenge: ChallengeSummary,
  winner: ChallengeAttemptSummary,
  runnerUp: ChallengeAttemptSummary,
) {
  if (challenge.challengeKind === 'streak') {
    const mistakeDelta = runnerUp.mistakes - winner.mistakes
    if (mistakeDelta > 0) return `${mistakeDelta} fewer misses`
  }
  const delta = runnerUp.elapsedMs - winner.elapsedMs
  if (delta <= 0) return 'tie break'
  return `${formatDuration(delta)} faster`
}

function attemptScore(
  challenge: ChallengeSummary,
  attempt: ChallengeAttemptSummary,
) {
  if (challenge.challengeKind === 'streak') {
    return `${attempt.mistakes} misses / ${formatDuration(attempt.elapsedMs)}`
  }
  return formatDuration(attempt.elapsedMs)
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600)
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`
}

function formatDate(value: string) {
  return formatHumanDate(value, value)
}

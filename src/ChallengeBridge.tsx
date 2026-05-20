import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import type { FunctionReference } from 'convex/server';
import type {
  ChallengeCreateRequest,
  ChallengeRace,
} from './challenges';
import { getOrCreateGuestId } from './identity';
import type { GameRecord } from './storage';

type CreateRaceArgs = {
  challengeId: string;
  challengeKind?: string;
  creatorAnonId: string;
  creatorName: string;
  difficulty?: string;
  playMode?: string;
  puzzle: string;
  puzzleSize?: string;
  recipientAnonId?: string;
  recipientName?: string;
  source: string;
  variantId?: string;
};

type StartAttemptArgs = {
  anonId: string;
  challengeId: string;
  player: string;
  recordId: string;
};

type SubmitAttemptArgs = {
  anonId: string;
  challengeId: string;
  completedAt: string;
  completion: number;
  elapsedMs: number;
  mistakes?: number;
  player: string;
  recordId: string;
};

const getRaceRef = makeFunctionReference<
  'query',
  { challengeId: string },
  ChallengeRace | null
>('challenges:getRace');

const createRaceRef = makeFunctionReference<'mutation', CreateRaceArgs, string>(
  'challenges:createRace',
);

const startAttemptRef = makeFunctionReference<
  'mutation',
  StartAttemptArgs,
  string
>('challenges:startAttempt');

const submitAttemptRef = makeFunctionReference<
  'mutation',
  SubmitAttemptArgs,
  string
>('challenges:submitAttempt');

export function ChallengeBridge({
  activeChallengeId,
  challengeId,
  createRequest,
  currentRecord,
  currentMistakes,
  onChallenge,
  onCreateResult,
  onStatus,
  playerName,
}: {
  activeChallengeId: string | null;
  challengeId: string | null;
  createRequest: ChallengeCreateRequest | null;
  currentRecord: GameRecord;
  currentMistakes: number;
  onChallenge: (challenge: ChallengeRace | null) => void;
  onCreateResult: (challengeId: string, requestId: string) => void;
  onStatus: (status: string) => void;
  playerName: string;
}) {
  const anonId = useMemo(() => getOrCreateGuestId(), []);
  const handledCreateRequest = useRef<string | null>(null);
  const startedAttempts = useRef(new Set<string>());
  const submittedAttempts = useRef(new Set<string>());
  const challenge = useQuery(
    getRaceRef as FunctionReference<'query'>,
    challengeId ? { challengeId } : 'skip',
  ) as ChallengeRace | null | undefined;
  const createRace = useMutation(
    createRaceRef as FunctionReference<'mutation'>,
  ) as (args: CreateRaceArgs) => Promise<string>;
  const startAttempt = useMutation(
    startAttemptRef as FunctionReference<'mutation'>,
  ) as (args: StartAttemptArgs) => Promise<string>;
  const submitAttempt = useMutation(
    submitAttemptRef as FunctionReference<'mutation'>,
  ) as (args: SubmitAttemptArgs) => Promise<string>;

  useEffect(() => {
    if (challenge === undefined) return;
    onChallenge(challenge);
  }, [challenge, onChallenge]);

  useEffect(() => {
    if (!createRequest) return;
    if (handledCreateRequest.current === createRequest.requestId) return;
    handledCreateRequest.current = createRequest.requestId;

    void createRace({
      challengeId: createRequest.challengeId,
      challengeKind: createRequest.challengeKind,
      creatorAnonId: anonId,
      creatorName: createRequest.creatorName,
      difficulty: createRequest.difficulty,
      playMode: createRequest.playMode,
      puzzle: createRequest.puzzle,
      puzzleSize: createRequest.puzzleSize,
      recipientAnonId: createRequest.recipientAnonId,
      recipientName: createRequest.recipientName,
      source: createRequest.source,
      variantId: createRequest.variantId,
    })
      .then((createdId) => onCreateResult(createdId, createRequest.requestId))
      .catch(() => {
        handledCreateRequest.current = null;
        onStatus('Could not create challenge link.');
      });
  }, [anonId, createRace, createRequest, onCreateResult, onStatus]);

  useEffect(() => {
    if (!activeChallengeId) return;
    if (currentRecord.status !== 'in-progress') return;
    const key = `${activeChallengeId}:${anonId}:${currentRecord.id}`;
    if (startedAttempts.current.has(key)) return;
    startedAttempts.current.add(key);

    void startAttempt({
      anonId,
      challengeId: activeChallengeId,
      player: playerName,
      recordId: currentRecord.id,
    }).catch(() => {
      startedAttempts.current.delete(key);
      onStatus('Could not join challenge.');
    });
  }, [activeChallengeId, anonId, currentRecord, onStatus, playerName, startAttempt]);

  useEffect(() => {
    if (!activeChallengeId) return;
    if (currentRecord.status !== 'completed') return;
    const key = `${activeChallengeId}:${anonId}:${currentRecord.id}:${currentRecord.elapsedMs}`;
    if (submittedAttempts.current.has(key)) return;
    submittedAttempts.current.add(key);

    void submitAttempt({
      anonId,
      challengeId: activeChallengeId,
      completedAt: currentRecord.completedAt ?? currentRecord.updatedAt,
      completion: currentRecord.completion,
      elapsedMs: currentRecord.elapsedMs,
      mistakes: currentMistakes,
      player: playerName,
      recordId: currentRecord.id,
    }).catch(() => {
      submittedAttempts.current.delete(key);
      onStatus('Could not submit challenge result.');
    });
  }, [
    activeChallengeId,
    anonId,
    currentMistakes,
    currentRecord,
    onStatus,
    playerName,
    submitAttempt,
  ]);

  return null;
}

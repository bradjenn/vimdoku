import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import type { FunctionReference } from 'convex/server';
import { getOrCreateGuestId } from './identity';
import type {
  LiveBattleCreateRequest,
  LiveBattleRoom,
} from './liveBattles';
import type { GameRecord } from './storage';

type CreateRoomArgs = {
  creatorAnonId: string;
  creatorName: string;
  difficulty?: string;
  playMode?: string;
  puzzle: string;
  puzzleSize?: string;
  roomId: string;
  source: string;
  variantId?: string;
};

type HeartbeatArgs = {
  anonId: string;
  completion: number;
  elapsedMs: number;
  mistakes?: number;
  player: string;
  recordId?: string;
  roomId: string;
  selectedCell?: number;
  status: 'online' | 'ready' | 'solving' | 'finished';
};

const getRoomRef = makeFunctionReference<
  'query',
  { roomId: string },
  LiveBattleRoom | null
>('liveBattles:getRoom');

const createRoomRef = makeFunctionReference<'mutation', CreateRoomArgs, string>(
  'liveBattles:createRoom',
);

const heartbeatRef = makeFunctionReference<'mutation', HeartbeatArgs, string>(
  'liveBattles:heartbeat',
);

export function LiveBattleBridge({
  activeRoomId,
  createRequest,
  currentMistakes,
  currentRecord,
  onCreateResult,
  onRoom,
  onStatus,
  playerName,
  roomId,
  selectedCell,
}: {
  activeRoomId: string | null;
  createRequest: LiveBattleCreateRequest | null;
  currentMistakes: number;
  currentRecord: GameRecord;
  onCreateResult: (roomId: string, requestId: string) => void;
  onRoom: (room: LiveBattleRoom | null) => void;
  onStatus: (status: string) => void;
  playerName: string;
  roomId: string | null;
  selectedCell: number;
}) {
  const anonId = useMemo(() => getOrCreateGuestId(), []);
  const handledCreateRequest = useRef<string | null>(null);
  const room = useQuery(
    getRoomRef as FunctionReference<'query'>,
    roomId ? { roomId } : 'skip',
  ) as LiveBattleRoom | null | undefined;
  const createRoom = useMutation(
    createRoomRef as FunctionReference<'mutation'>,
  ) as (args: CreateRoomArgs) => Promise<string>;
  const heartbeat = useMutation(
    heartbeatRef as FunctionReference<'mutation'>,
  ) as (args: HeartbeatArgs) => Promise<string>;

  useEffect(() => {
    if (room === undefined) return;
    onRoom(room);
  }, [onRoom, room]);

  useEffect(() => {
    if (!createRequest) return;
    if (handledCreateRequest.current === createRequest.requestId) return;
    handledCreateRequest.current = createRequest.requestId;

    void createRoom({
      creatorAnonId: anonId,
      creatorName: createRequest.creatorName,
      difficulty: createRequest.difficulty,
      playMode: createRequest.playMode,
      puzzle: createRequest.puzzle,
      puzzleSize: createRequest.puzzleSize,
      roomId: createRequest.roomId,
      source: createRequest.source,
      variantId: createRequest.variantId,
    })
      .then((createdRoomId) => onCreateResult(createdRoomId, createRequest.requestId))
      .catch(() => {
        handledCreateRequest.current = null;
        onStatus('Could not create live battle room.');
      });
  }, [anonId, createRequest, createRoom, onCreateResult, onStatus]);

  useEffect(() => {
    const heartbeatRoomId = activeRoomId ?? roomId;
    if (!heartbeatRoomId) return;
    const sendHeartbeat = () => {
      const isActiveRoom = activeRoomId === heartbeatRoomId;
      const status = isActiveRoom
        ? currentRecord.status === 'completed'
          ? 'finished'
          : 'solving'
        : 'ready';
      void heartbeat({
        anonId,
        completion: isActiveRoom ? currentRecord.completion : 0,
        elapsedMs: isActiveRoom ? currentRecord.elapsedMs : 0,
        mistakes: isActiveRoom ? currentMistakes : 0,
        player: playerName,
        recordId: isActiveRoom ? currentRecord.id : undefined,
        roomId: heartbeatRoomId,
        selectedCell: isActiveRoom ? selectedCell : undefined,
        status,
      }).catch(() => {
        onStatus('Could not update live battle presence.');
      });
    };

    sendHeartbeat();
    const timer = window.setInterval(sendHeartbeat, 2500);
    return () => window.clearInterval(timer);
  }, [
    activeRoomId,
    anonId,
    currentMistakes,
    currentRecord,
    heartbeat,
    onStatus,
    playerName,
    roomId,
    selectedCell,
  ]);

  return null;
}

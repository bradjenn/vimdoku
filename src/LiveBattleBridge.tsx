import { useEffect, useMemo, useRef } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import type { FunctionReference } from 'convex/server'
import { getOrCreateGuestId } from './identity'
import type {
  LiveBattleCreateRequest,
  LiveBattleRoom,
  LiveBattleTurnRequest,
} from './liveBattles'
import type { GameRecord } from './storage'

type CreateRoomArgs = {
  battleKind?: 'race' | 'turns' | 'coop'
  creatorAnonId: string
  creatorName: string
  difficulty?: string
  playMode?: string
  puzzle: string
  puzzleSize?: string
  roomId: string
  source: string
  turnLives?: number
  turnSeconds?: number
  variantId?: string
}

type HeartbeatArgs = {
  anonId: string
  completion: number
  elapsedMs: number
  mistakes?: number
  player: string
  recordId?: string
  roomId: string
  selectedCell?: number
  sharedGrid?: string
  status: 'online' | 'ready' | 'solving' | 'finished'
}

type SubmitTurnArgs = {
  anonId: string
  completion: number
  correct: boolean
  elapsedMs: number
  player: string
  recordId: string
  roomId: string
  selectedCell: number
}

type ClaimTimeoutArgs = {
  anonId: string
  roomId: string
}

const getRoomRef = makeFunctionReference<
  'query',
  { roomId: string },
  LiveBattleRoom | null
>('liveBattles:getRoom')

const createRoomRef = makeFunctionReference<'mutation', CreateRoomArgs, string>(
  'liveBattles:createRoom',
)

const heartbeatRef = makeFunctionReference<'mutation', HeartbeatArgs, string>(
  'liveBattles:heartbeat',
)

const submitTurnRef = makeFunctionReference<
  'mutation',
  SubmitTurnArgs,
  { ok: boolean; message?: string }
>('liveBattles:submitTurn')

const claimTimeoutRef = makeFunctionReference<
  'mutation',
  ClaimTimeoutArgs,
  { ok: boolean }
>('liveBattles:claimTimeout')

export function LiveBattleBridge({
  activeRoomId,
  createRequest,
  currentGrid,
  currentMistakes,
  currentRecord,
  onCreateResult,
  onRoom,
  onStatus,
  onTurnRequestHandled,
  playerName,
  roomId,
  selectedCell,
  turnRequest,
}: {
  activeRoomId: string | null
  createRequest: LiveBattleCreateRequest | null
  currentGrid: string
  currentMistakes: number
  currentRecord: GameRecord
  onCreateResult: (roomId: string, requestId: string) => void
  onRoom: (room: LiveBattleRoom | null) => void
  onStatus: (status: string) => void
  onTurnRequestHandled: (requestId: string) => void
  playerName: string
  roomId: string | null
  selectedCell: number
  turnRequest: LiveBattleTurnRequest | null
}) {
  const anonId = useMemo(() => getOrCreateGuestId(), [])
  const handledCreateRequest = useRef<string | null>(null)
  const handledTurnRequest = useRef<string | null>(null)
  const room = useQuery(
    getRoomRef as FunctionReference<'query'>,
    roomId ? { roomId } : 'skip',
  ) as LiveBattleRoom | null | undefined
  const createRoom = useMutation(
    createRoomRef as FunctionReference<'mutation'>,
  ) as (args: CreateRoomArgs) => Promise<string>
  const heartbeat = useMutation(
    heartbeatRef as FunctionReference<'mutation'>,
  ) as (args: HeartbeatArgs) => Promise<string>
  const submitTurn = useMutation(
    submitTurnRef as FunctionReference<'mutation'>,
  ) as (args: SubmitTurnArgs) => Promise<{ ok: boolean; message?: string }>
  const claimTimeout = useMutation(
    claimTimeoutRef as FunctionReference<'mutation'>,
  ) as (args: ClaimTimeoutArgs) => Promise<{ ok: boolean }>

  useEffect(() => {
    if (room === undefined) return
    onRoom(room)
  }, [onRoom, room])

  useEffect(() => {
    if (!createRequest) return
    if (handledCreateRequest.current === createRequest.requestId) return
    handledCreateRequest.current = createRequest.requestId

    void createRoom({
      battleKind: createRequest.battleKind,
      creatorAnonId: anonId,
      creatorName: createRequest.creatorName,
      difficulty: createRequest.difficulty,
      playMode: createRequest.playMode,
      puzzle: createRequest.puzzle,
      puzzleSize: createRequest.puzzleSize,
      roomId: createRequest.roomId,
      source: createRequest.source,
      turnLives:
        createRequest.battleKind === 'turns'
          ? createRequest.turnLives
          : undefined,
      turnSeconds:
        createRequest.battleKind === 'turns'
          ? createRequest.turnSeconds
          : undefined,
      variantId: createRequest.variantId,
    })
      .then((createdRoomId) =>
        onCreateResult(createdRoomId, createRequest.requestId),
      )
      .catch(() => {
        handledCreateRequest.current = null
        onStatus('Could not create live battle room.')
      })
  }, [anonId, createRequest, createRoom, onCreateResult, onStatus])

  useEffect(() => {
    if (!turnRequest) return
    if (handledTurnRequest.current === turnRequest.requestId) return
    handledTurnRequest.current = turnRequest.requestId
    void submitTurn({
      anonId,
      completion: turnRequest.completion,
      correct: turnRequest.correct,
      elapsedMs: turnRequest.elapsedMs,
      player: turnRequest.player,
      recordId: turnRequest.recordId,
      roomId: turnRequest.roomId,
      selectedCell: turnRequest.selectedCell,
    })
      .then((result) => {
        onTurnRequestHandled(turnRequest.requestId)
        if (result.message) onStatus(result.message)
      })
      .catch(() => {
        handledTurnRequest.current = null
        onStatus('Could not submit turn.')
      })
  }, [anonId, onStatus, onTurnRequestHandled, submitTurn, turnRequest])

  useEffect(() => {
    const heartbeatRoomId = activeRoomId ?? roomId
    if (!heartbeatRoomId) return
    const sendHeartbeat = () => {
      const isActiveRoom = activeRoomId === heartbeatRoomId
      const status = isActiveRoom
        ? currentRecord.status === 'completed'
          ? 'finished'
          : 'solving'
        : 'ready'
      void heartbeat({
        anonId,
        completion: isActiveRoom ? currentRecord.completion : 0,
        elapsedMs: isActiveRoom ? currentRecord.elapsedMs : 0,
        mistakes: isActiveRoom ? currentMistakes : 0,
        player: playerName,
        recordId: isActiveRoom ? currentRecord.id : undefined,
        roomId: heartbeatRoomId,
        selectedCell: isActiveRoom ? selectedCell : undefined,
        sharedGrid:
          isActiveRoom && room?.battleKind === 'coop' ? currentGrid : undefined,
        status,
      }).catch((error: unknown) => {
        onStatus(
          error instanceof Error
            ? error.message
            : 'Could not update live battle presence.',
        )
      })
    }

    sendHeartbeat()
    const timer = window.setInterval(sendHeartbeat, 2500)
    return () => window.clearInterval(timer)
  }, [
    activeRoomId,
    anonId,
    currentGrid,
    currentMistakes,
    currentRecord,
    heartbeat,
    onStatus,
    playerName,
    roomId,
    room?.battleKind,
    selectedCell,
  ])

  useEffect(() => {
    if (!room || room.battleKind !== 'turns' || room.status === 'finished')
      return
    if (!room.turnEndsAt || !room.turnAnonId) return

    const claimIfExpired = () => {
      if (!room.turnEndsAt || room.turnEndsAt > Date.now()) return
      void claimTimeout({ anonId, roomId: room.roomId }).catch(() => {
        onStatus('Could not advance timed out turn.')
      })
    }

    claimIfExpired()
    const timer = window.setInterval(claimIfExpired, 1000)
    return () => window.clearInterval(timer)
  }, [anonId, claimTimeout, onStatus, room])

  return null
}

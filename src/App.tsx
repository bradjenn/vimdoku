import {
  AlertCircle,
  Bell,
  ChevronDown,
  Check,
  Eraser,
  FileText,
  History,
  Home,
  Menu,
  Palette,
  Pause,
  Play,
  Plus,
  Search,
  Settings,
  Swords,
  Terminal,
  Trophy,
  UserRound,
  Wrench,
} from 'lucide-react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { useAuthActions, useConvexAuth } from '@convex-dev/auth/react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import type { FunctionReference } from 'convex/server'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import Tesseract from 'tesseract.js'
import {
  EMPTY_NOTES,
  STARTER_GRID,
  boardConfigFor,
  emptyGrid,
  emptyNotes,
  type BoardConfig,
  type Grid,
  type Hint,
  type Notes,
  type PuzzleDifficulty,
  type PuzzleSize,
  candidatesAsNotes,
  cloneNotes,
  findConflicts,
  generatePuzzle,
  labelCell,
  nextHint,
  parseGrid,
  puzzleSizeFromGrid,
  pruneImpossibleNotes,
  removeRelatedNotes,
  solveGrid,
} from './sudoku'
import {
  createDailyGameMeta,
  dailyPath,
  dailySeed,
  findDailyRecord,
  formatDailyDate,
  isValidDateKey,
  offsetDateKey,
  parseDailyRoute,
  shiftDateKey,
  todayDateKey,
} from './daily'
import {
  createGameMeta,
  createGameRecord,
  loadInitialGameMeta,
  loadLegacyGameRecords,
  loadLegacySnapshot,
  loadStoredState,
  saveStoredState,
  upsertGameRecord,
  gridToString,
  type GameMeta,
  type GameRecord,
  type Snapshot,
  type SolveEvent,
  type SolveEventKind,
} from './storage'
import {
  PLAYER_NAME_KEY,
  fetchGlobalLeaderboard,
  hasGlobalLeaderboard,
  leaderboardEntryMatches,
  submitGlobalScore,
  type LeaderboardEntry,
} from './leaderboard'
import { ChallengeBridge } from './ChallengeBridge'
import {
  ChallengeHistoryPanel,
  ChallengeResultsView,
} from './ChallengeHistoryPanel'
import { LiveBattleBridge } from './LiveBattleBridge'
import { FriendsPanel, type FriendSummary } from './FriendsPanel'
import {
  challengeKindFromGameId,
  challengeKindLabel,
  challengeIdFromGameId,
  challengeIdFromPath,
  challengePath,
  createChallengeGameMeta,
  makeChallengeId,
  type ChallengeKind,
  type ChallengeCreateRequest,
  type ChallengeRace,
} from './challenges'
import {
  createLiveBattleGameMeta,
  liveBattleIdFromGameId,
  liveBattleIdFromPath,
  liveBattlePath,
  makeLiveBattleId,
  type LiveBattleCreateRequest,
  type LiveBattleKind,
  type LiveBattleRoom,
  type LiveBattleTurnRequest,
} from './liveBattles'
import {
  ConvexBridge,
  type CloudProfile,
  type CloudStats,
} from './ConvexBridge'
import { hasConvexBackend } from './convexClient'
import { getOrCreateGuestId, shortGuestId } from './identity'
import { PublicProfilePanel } from './PublicProfilePanel'
import { PLAY_MODES, modeLabel, modePolicy, type PlayMode } from './playModes'
import { checkGrid } from './checks'
import {
  boxSelection,
  columnSelection,
  nextEmptyCell,
  rectangularSelection,
  rowSelection,
} from './selection'
import { decodePuzzleLinkData, encodePuzzleLinkData } from './puzzleLinks'
import { VARIANTS, checkVariant, type VariantId } from './variants'
import { TuiDialog } from './ui'

type ReviewCell = {
  value: number
  confidence: number
}

type EditorMode = 'normal' | 'annotate' | 'corner' | 'color' | 'visual'
type ToolMode = 'digit' | 'center' | 'corner' | 'color'
type HintMode = 'nudge' | 'explain' | 'show'
type CommandMode = 'command' | 'search'
type MenuModal =
  | 'menu'
  | 'settings'
  | 'commands'
  | 'new'
  | 'rules'
  | 'theme'
  | 'tools'
  | null
type RouteModal = 'menu' | 'settings' | 'commands' | 'rules' | 'theme' | 'tools'
type TimerPauseReason = 'manual' | 'auto' | null
type PageRoute =
  | 'dashboard'
  | 'play'
  | 'new'
  | 'games'
  | 'leaderboards'
  | 'challenge'
  | 'live-battle'
  | 'profile'
type GameLibraryFilter = 'all' | 'in-progress' | 'completed'
type ChallengePuzzleSource = 'daily' | 'generated' | 'current'
type ChallengeSetupKind = ChallengeKind | 'live-race' | 'live-turns' | 'coop'
type ThemeId = (typeof CODE_THEMES)[number]['id']
type CommandSuggestion = {
  command: string
  description: string
  keywords?: string
}
type FriendshipRow = {
  direction: 'incoming' | 'outgoing'
  friend: FriendSummary
  friendshipId: string
  status: 'pending' | 'accepted'
}

const THEME_KEY = 'vimdoku-theme-v1'
const TIMER_PAUSED_GAME_KEY = 'vimdoku-paused-game-v1'
const NEW_GAME_DIFFICULTIES: PuzzleDifficulty[] = [
  'easy',
  'medium',
  'hard',
  'expert',
]
const PUZZLE_SIZES: PuzzleSize[] = ['9x9', '6x6']
const LEADERBOARD_PLAY_MODES = PLAY_MODES.filter(
  (mode) => modePolicy(mode).scoreEnabled,
)
const CELL_COLORS = [
  '#f7768e',
  '#e0af68',
  '#9ece6a',
  '#7dcfff',
  '#bb9af7',
  '#f5c2e7',
] as const
const listFriendsRef = makeFunctionReference<
  'query',
  { anonId: string },
  FriendshipRow[]
>('friends:list')

type NotificationRow = {
  _id: string
  actorName: string
  body: string
  challengeId?: string
  createdAt: string
  readAt?: string
  title: string
  type: 'challenge'
}

const listNotificationsRef = makeFunctionReference<
  'query',
  { limit?: number; recipientAnonId: string },
  NotificationRow[]
>('notifications:list')

const unreadNotificationsRef = makeFunctionReference<
  'query',
  { recipientAnonId: string },
  number
>('notifications:unreadCount')

const markNotificationReadRef = makeFunctionReference<
  'mutation',
  { notificationId: string; recipientAnonId: string },
  string | null
>('notifications:markRead')

const markAllNotificationsReadRef = makeFunctionReference<
  'mutation',
  { recipientAnonId: string },
  number
>('notifications:markAllRead')

// Single source of truth for the Space-leader menu — drives both the
// which-key popup and the keydown resolution below.
const LEADER_BINDINGS: [key: string, label: string][] = [
  ['e', 'toggle sidebar'],
  ['h', 'toggle hint engine'],
  ['n', 'new game'],
  ['g', 'puzzle log'],
  ['l', 'leaderboards'],
  ['p', 'profile'],
  ['i', 'import image'],
  ['s', 'settings'],
  ['t', 'tools'],
  ['c', 'colorscheme'],
  ['m', 'menu'],
]

// alpha-nvim style startup splash — ANSI Shadow font, same as LazyVim's logo.
const VIMDOKU_BANNER = [
  '██╗   ██╗██╗███╗   ███╗██████╗  ██████╗ ██╗  ██╗██╗   ██╗',
  '██║   ██║██║████╗ ████║██╔══██╗██╔═══██╗██║ ██╔╝██║   ██║',
  '██║   ██║██║██╔████╔██║██║  ██║██║   ██║█████╔╝ ██║   ██║',
  '╚██╗ ██╔╝██║██║╚██╔╝██║██║  ██║██║   ██║██╔═██╗ ██║   ██║',
  ' ╚████╔╝ ██║██║ ╚═╝ ██║██████╔╝╚██████╔╝██║  ██╗╚██████╔╝',
  '  ╚═══╝  ╚═╝╚═╝     ╚═╝╚═════╝  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ',
].join('\n')

const DASHBOARD_ACTIONS: [key: string, label: string][] = [
  ['n', 'new game'],
  ['c', 'continue'],
  ['g', 'puzzle log'],
  ['l', 'leaderboards'],
  ['r', 'challenge'],
  ['p', 'profile'],
  ['s', 'settings'],
]

const COMMAND_SUGGESTIONS: CommandSuggestion[] = [
  {
    command: 'hint',
    description: 'ask the hint engine for the next useful move',
  },
  { command: 'tools', description: 'open the tool palette' },
  {
    command: 'theme',
    description: 'open the colorscheme picker',
    keywords: 'colorscheme colour color',
  },
  { command: 'rules', description: 'open puzzle rules and variant checks' },
  { command: 'share', description: 'copy a clean puzzle link' },
  {
    command: 'share-state',
    description: 'copy puzzle with notes, colours, timer, and progress',
  },
  { command: 'pause', description: 'pause the puzzle timer' },
  { command: 'resume', description: 'resume the puzzle timer' },
  { command: 'check', description: 'check classic and variant conflicts' },
  { command: 'notes', description: 'fill centre candidates' },
  { command: 'prune', description: 'remove impossible centre candidates' },
  { command: 'clear-notes', description: 'clear centre and corner notes' },
  { command: 'row', description: 'select the current row' },
  { command: 'col', description: 'select the current column' },
  { command: 'box', description: 'select the current box' },
  { command: 'all', description: 'select every cell' },
  { command: 'color 1', description: 'colour selected cells' },
  { command: 'color clear', description: 'clear selected colour' },
  {
    command: 'anti-knight',
    description: 'switch variant checks to anti-knight',
  },
  { command: 'anti-king', description: 'switch variant checks to anti-king' },
  { command: 'diagonal', description: 'switch variant checks to diagonal' },
  {
    command: 'non-consecutive',
    description: 'switch variant checks to non-consecutive',
  },
  { command: 'classic', description: 'switch back to classic rules' },
  { command: 'new', description: 'open new game' },
  { command: 'daily', description: 'open today daily' },
  { command: 'yesterday', description: 'open yesterday daily' },
  { command: 'games', description: 'open puzzle library' },
  { command: 'leaderboards', description: 'open leaderboards' },
  { command: 'challenge', description: 'open challenges' },
  { command: 'profile', description: 'open profile' },
  { command: 'settings', description: 'open settings' },
  { command: 'import', description: 'import a puzzle image' },
  { command: 'solve', description: 'fill the solution' },
  { command: 'reset', description: 'reset player entries' },
] as const

const CODE_THEMES = [
  {
    id: 'tokyonight',
    name: 'Tokyo Night',
    swatches: ['#1a1b26', '#7aa2f7', '#bb9af7'],
    vars: {
      // Canonical folke/tokyonight (night): bg #1a1b26, bg_dark #16161e,
      // bg_highlight #292e42, fg #c0caf5, comment #565f89.
      '--app-bg': '#1a1b26',
      '--app-text': '#c0caf5',
      '--workspace-bg': '#1a1b26',
      '--sidebar-bg': '#16161e',
      '--panel-bg': '#1a1b26',
      '--panel-soft': '#292e42',
      '--cell-bg': '#1a1b26',
      '--cell-peer': '#292e42',
      '--cell-selected': '#7aa2f7',
      '--cell-same': '#7dcfff',
      '--cell-search': '#ff9e64',
      '--cell-hint': '#bb9af7',
      '--cell-conflict': '#f7768e',
      '--grid-line': '#15161e',
      '--border': '#414868',
      '--muted': '#565f89',
      '--accent': '#7aa2f7',
      '--accent-2': '#bb9af7',
      '--danger': '#f7768e',
      '--button-bg': '#16161e',
      '--input-bg': '#16161e',
      '--note': '#a9b1d6',
      '--given': '#c0caf5',
      '--entry': '#7dcfff',
      '--status-bg': '#16161e',
      '--status-text': '#c0caf5',
    },
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    swatches: ['#282828', '#fabd2f', '#b8bb26'],
    vars: {
      // Canonical morhetz/gruvbox (dark, medium): bg0 #282828, bg1 #3c3836,
      // bg2 #504945, bg3 #665c54, fg #ebdbb2, gray #928374.
      '--app-bg': '#282828',
      '--app-text': '#ebdbb2',
      '--workspace-bg': '#282828',
      '--sidebar-bg': '#1d2021',
      '--panel-bg': '#282828',
      '--panel-soft': '#3c3836',
      '--cell-bg': '#282828',
      '--cell-peer': '#3c3836',
      '--cell-selected': '#fabd2f',
      '--cell-same': '#83a598',
      '--cell-search': '#fe8019',
      '--cell-hint': '#8ec07c',
      '--cell-conflict': '#fb4934',
      '--grid-line': '#1d2021',
      '--border': '#504945',
      '--muted': '#928374',
      '--accent': '#fabd2f',
      '--accent-2': '#b8bb26',
      '--danger': '#fb4934',
      '--button-bg': '#3c3836',
      '--input-bg': '#1d2021',
      '--note': '#bdae93',
      '--given': '#fbf1c7',
      '--entry': '#83a598',
      '--status-bg': '#1d2021',
      '--status-text': '#ebdbb2',
    },
  },
  {
    id: 'kanagawa',
    name: 'Kanagawa',
    swatches: ['#1f1f28', '#7e9cd8', '#98bb6c'],
    vars: {
      // Canonical rebelot/kanagawa (wave): sumiInk0..4 + crystalBlue (the
      // wave) as the iconic primary, springGreen as the secondary accent.
      '--app-bg': '#1f1f28',
      '--app-text': '#dcd7ba',
      '--workspace-bg': '#1f1f28',
      '--sidebar-bg': '#16161d',
      '--panel-bg': '#1f1f28',
      '--panel-soft': '#2a2a37',
      '--cell-bg': '#1f1f28',
      '--cell-peer': '#2a2a37',
      '--cell-selected': '#7e9cd8',
      '--cell-same': '#7fb4ca',
      '--cell-search': '#ffa066',
      '--cell-hint': '#957fb8',
      '--cell-conflict': '#e46876',
      '--grid-line': '#16161d',
      '--border': '#54546d',
      '--muted': '#727169',
      '--accent': '#7e9cd8',
      '--accent-2': '#98bb6c',
      '--danger': '#e46876',
      '--button-bg': '#2a2a37',
      '--input-bg': '#16161d',
      '--note': '#c8c093',
      '--given': '#dcd7ba',
      '--entry': '#7fb4ca',
      '--status-bg': '#16161d',
      '--status-text': '#dcd7ba',
    },
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin',
    swatches: ['#1e1e2e', '#cba6f7', '#89b4fa'],
    vars: {
      // Canonical Catppuccin Mocha: base #1e1e2e is the primary bg; mantle
      // #181825 and crust #11111b are the darker layers; surface0..2 for
      // hover/selection; overlay0 for muted text.
      '--app-bg': '#1e1e2e',
      '--app-text': '#cdd6f4',
      '--workspace-bg': '#1e1e2e',
      '--sidebar-bg': '#181825',
      '--panel-bg': '#1e1e2e',
      '--panel-soft': '#313244',
      '--cell-bg': '#1e1e2e',
      '--cell-peer': '#313244',
      '--cell-selected': '#cba6f7',
      '--cell-same': '#94e2d5',
      '--cell-search': '#fab387',
      '--cell-hint': '#89b4fa',
      '--cell-conflict': '#f38ba8',
      '--grid-line': '#11111b',
      '--border': '#45475a',
      '--muted': '#6c7086',
      '--accent': '#cba6f7',
      '--accent-2': '#89b4fa',
      '--danger': '#f38ba8',
      '--button-bg': '#313244',
      '--input-bg': '#181825',
      '--note': '#bac2de',
      '--given': '#cdd6f4',
      '--entry': '#89dceb',
      '--status-bg': '#181825',
      '--status-text': '#cdd6f4',
    },
  },
  {
    id: 'monokai',
    name: 'Monokai Pro',
    swatches: ['#2d2a2e', '#ffd866', '#ab9df2'],
    vars: {
      // Canonical Monokai Pro (filter dark): bg #2d2a2e, bgDark #221f22,
      // bgDarkest #19181a, fg #fcfcfa, comment #727072.
      '--app-bg': '#2d2a2e',
      '--app-text': '#fcfcfa',
      '--workspace-bg': '#2d2a2e',
      '--sidebar-bg': '#221f22',
      '--panel-bg': '#2d2a2e',
      '--panel-soft': '#403e41',
      '--cell-bg': '#2d2a2e',
      '--cell-peer': '#403e41',
      '--cell-selected': '#ffd866',
      '--cell-same': '#78dce8',
      '--cell-search': '#fc9867',
      '--cell-hint': '#ab9df2',
      '--cell-conflict': '#ff6188',
      '--grid-line': '#19181a',
      '--border': '#5b595c',
      '--muted': '#727072',
      '--accent': '#ffd866',
      '--accent-2': '#ab9df2',
      '--danger': '#ff6188',
      '--button-bg': '#403e41',
      '--input-bg': '#221f22',
      '--note': '#c1c0c0',
      '--given': '#fcfcfa',
      '--entry': '#78dce8',
      '--status-bg': '#221f22',
      '--status-text': '#fcfcfa',
    },
  },
  {
    id: 'github-light',
    name: 'GitHub Light',
    swatches: ['#ffffff', '#0969da', '#8250df'],
    vars: {
      '--app-bg': '#f6f8fa',
      '--app-text': '#24292f',
      '--workspace-bg': '#ffffff',
      '--sidebar-bg': '#f6f8fa',
      '--panel-bg': '#ffffff',
      '--panel-soft': '#eaeef2',
      '--cell-bg': '#ffffff',
      '--cell-peer': '#eaeef2',
      '--cell-selected': '#0969da',
      '--cell-same': '#1a7f37',
      '--cell-search': '#fb8500',
      '--cell-hint': '#8250df',
      '--cell-conflict': '#cf222e',
      '--grid-line': '#24292f',
      '--border': '#d0d7de',
      '--muted': '#57606a',
      '--accent': '#0969da',
      '--accent-2': '#8250df',
      '--danger': '#cf222e',
      '--button-bg': '#ffffff',
      '--input-bg': '#f6f8fa',
      '--note': '#57606a',
      '--given': '#24292f',
      '--entry': '#0969da',
      '--status-bg': '#eaeef2',
      '--status-text': '#24292f',
    },
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    swatches: ['#fdf6e3', '#268bd2', '#859900'],
    vars: {
      '--app-bg': '#eee8d5',
      '--app-text': '#586e75',
      '--workspace-bg': '#fdf6e3',
      '--sidebar-bg': '#eee8d5',
      '--panel-bg': '#fdf6e3',
      '--panel-soft': '#eee8d5',
      '--cell-bg': '#fdf6e3',
      '--cell-peer': '#eee8d5',
      '--cell-selected': '#268bd2',
      '--cell-same': '#2aa198',
      '--cell-search': '#cb4b16',
      '--cell-hint': '#6c71c4',
      '--cell-conflict': '#dc322f',
      '--grid-line': '#073642',
      '--border': '#93a1a1',
      '--muted': '#839496',
      '--accent': '#268bd2',
      '--accent-2': '#859900',
      '--danger': '#dc322f',
      '--button-bg': '#fdf6e3',
      '--input-bg': '#eee8d5',
      '--note': '#657b83',
      '--given': '#073642',
      '--entry': '#268bd2',
      '--status-bg': '#eee8d5',
      '--status-text': '#586e75',
    },
  },
  {
    id: 'papercolor-light',
    name: 'PaperColor Light',
    swatches: ['#eeeeee', '#005f87', '#d75f00'],
    vars: {
      '--app-bg': '#d7d7d7',
      '--app-text': '#444444',
      '--workspace-bg': '#eeeeee',
      '--sidebar-bg': '#e4e4e4',
      '--panel-bg': '#eeeeee',
      '--panel-soft': '#d7d7d7',
      '--cell-bg': '#eeeeee',
      '--cell-peer': '#d7d7d7',
      '--cell-selected': '#005f87',
      '--cell-same': '#00875f',
      '--cell-search': '#d75f00',
      '--cell-hint': '#5f5faf',
      '--cell-conflict': '#af0000',
      '--grid-line': '#1c1c1c',
      '--border': '#878787',
      '--muted': '#6c6c6c',
      '--accent': '#005f87',
      '--accent-2': '#00875f',
      '--danger': '#af0000',
      '--button-bg': '#eeeeee',
      '--input-bg': '#e4e4e4',
      '--note': '#5f5f5f',
      '--given': '#1c1c1c',
      '--entry': '#005f87',
      '--status-bg': '#d7d7d7',
      '--status-text': '#444444',
    },
  },
  {
    id: 'quiet-light',
    name: 'Quiet Light',
    swatches: ['#f5f5f5', '#007acc', '#c586c0'],
    vars: {
      '--app-bg': '#f3f3f3',
      '--app-text': '#1f1f1f',
      '--workspace-bg': '#ffffff',
      '--sidebar-bg': '#f3f3f3',
      '--panel-bg': '#ffffff',
      '--panel-soft': '#e8e8e8',
      '--cell-bg': '#ffffff',
      '--cell-peer': '#e8e8e8',
      '--cell-selected': '#007acc',
      '--cell-same': '#16825d',
      '--cell-search': '#ca5010',
      '--cell-hint': '#795e9f',
      '--cell-conflict': '#a31515',
      '--grid-line': '#1f1f1f',
      '--border': '#c8c8c8',
      '--muted': '#6a6a6a',
      '--accent': '#007acc',
      '--accent-2': '#795e9f',
      '--danger': '#a31515',
      '--button-bg': '#ffffff',
      '--input-bg': '#f3f3f3',
      '--note': '#555555',
      '--given': '#1f1f1f',
      '--entry': '#007acc',
      '--status-bg': '#e8e8e8',
      '--status-text': '#1f1f1f',
    },
  },
] as const

function App() {
  const navigate = useNavigate()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const routeModal = modalFromPath(pathname)
  const activePage = pageFromPath(pathname)
  const publicFriendCode = useMemo(
    () => publicFriendCodeFromPath(pathname),
    [pathname],
  )
  const dailyRoute = useMemo(() => parseDailyRoute(pathname), [pathname])
  const routeChallengeId = useMemo(
    () => challengeIdFromPath(pathname),
    [pathname],
  )
  const routeChallengeResults = pathname === '/challenge/results'
  const routeLiveBattleId = useMemo(
    () => liveBattleIdFromPath(pathname),
    [pathname],
  )
  const sharedPuzzlePayload = useMemo(
    () => sharedPuzzlePayloadFromPath(pathname),
    [pathname],
  )
  const showDashboard = activePage === 'dashboard'
  const [grid, setGrid] = useState<Grid>(
    () => loadLegacySnapshot()?.grid ?? STARTER_GRID,
  )
  const [notes, setNotes] = useState<Notes>(
    () => loadLegacySnapshot()?.notes ?? EMPTY_NOTES,
  )
  const [givens, setGivens] = useState<boolean[]>(
    () => loadLegacySnapshot()?.givens ?? STARTER_GRID.map(Boolean),
  )
  const [selected, setSelected] = useState(0)
  const [noteMode, setNoteMode] = useState(false)
  const [shiftHeld, setShiftHeld] = useState(false)
  const [visualAnchor, setVisualAnchor] = useState<number | null>(null)
  const [explicitSelection, setExplicitSelection] =
    useState<Set<number> | null>(null)
  const [history, setHistory] = useState<Snapshot[]>([])
  const [future, setFuture] = useState<Snapshot[]>([])
  const [hint, setHint] = useState<Hint | null>(null)
  const [toolMode, setToolMode] = useState<ToolMode>('digit')
  const [activeColor, setActiveColor] = useState(0)
  const [variantId, setVariantId] = useState<VariantId>('classic')
  const [cellColors, setCellColors] = useState<(number | null)[]>(
    () =>
      loadLegacySnapshot()?.cellColors ?? Array(STARTER_GRID.length).fill(null),
  )
  const [cornerMarks, setCornerMarks] = useState<Notes>(
    () =>
      loadLegacySnapshot()?.cornerMarks ??
      emptyNotes(puzzleSizeFromGrid(STARTER_GRID)),
  )
  const [hintMode, setHintMode] = useState<HintMode>('explain')
  const [review, setReview] = useState<ReviewCell[] | null>(null)
  const [reviewSelected, setReviewSelected] = useState(0)
  const [_ocrStatus, setOcrStatus] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [commandMode, setCommandMode] = useState<CommandMode | null>(null)
  const [commandValue, setCommandValue] = useState('')
  const [commandCursor, setCommandCursor] = useState(0)
  const [statusLine, setStatusLine] = useState('Ready. Press : for commands.')
  const [highlightDigit, setHighlightDigit] = useState<number | null>(null)
  const [themeId, setThemeId] = useState<ThemeId>(() => loadTheme())
  const [menuModal, setMenuModal] = useState<MenuModal>(null)
  const [gamePickerOpen, setGamePickerOpen] = useState(false)
  const [gameQuery, setGameQuery] = useState('')
  const [gameLibraryQuery, setGameLibraryQuery] = useState('')
  const [gameLibraryFilter, setGameLibraryFilter] =
    useState<GameLibraryFilter>('all')
  const [gameCursor, setGameCursor] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [timerPaused, setTimerPaused] = useState(false)
  const [timerPauseReason, setTimerPauseReason] =
    useState<TimerPauseReason>(null)
  const [hintUses, setHintUses] = useState(0)
  const [manualPauseCount, setManualPauseCount] = useState(0)
  const [solveEvents, setSolveEvents] = useState<SolveEvent[]>([])
  const [activeGame, setActiveGame] = useState<GameMeta>(() =>
    loadInitialGameMeta(),
  )
  const [gameRecords, setGameRecords] = useState<GameRecord[]>(() =>
    loadLegacyGameRecords(),
  )
  const [globalScores, setGlobalScores] = useState<LeaderboardEntry[]>([])
  const [leaderboardStatus, setLeaderboardStatus] = useState('')
  const [challengeRace, setChallengeRace] = useState<ChallengeRace | null>(null)
  const [challengeStatus, setChallengeStatus] = useState('')
  const [challengeShareUrl, setChallengeShareUrl] = useState('')
  const [challengeSetupOpen, setChallengeSetupOpen] = useState(false)
  const [challengeRecipient, setChallengeRecipient] =
    useState<FriendSummary | null>(null)
  const [challengeMistakes, setChallengeMistakes] = useState(0)
  const [challengeCreateRequest, setChallengeCreateRequest] =
    useState<ChallengeCreateRequest | null>(null)
  const [liveBattleRoom, setLiveBattleRoom] = useState<LiveBattleRoom | null>(
    null,
  )
  const [liveBattleStatus, setLiveBattleStatus] = useState('')
  const [liveBattleShareUrl, setLiveBattleShareUrl] = useState('')
  const [liveBattleCreateRequest, setLiveBattleCreateRequest] =
    useState<LiveBattleCreateRequest | null>(null)
  const [liveBattleTurnRequest, setLiveBattleTurnRequest] =
    useState<LiveBattleTurnRequest | null>(null)
  const [cloudProfile, setCloudProfile] = useState<CloudProfile | null>(null)
  const [cloudStats, setCloudStats] = useState<CloudStats | null>(null)
  const [guestId] = useState(() => getOrCreateGuestId())
  const [playerName, setPlayerName] = useState(
    () => localStorage.getItem(PLAYER_NAME_KEY) || 'anonymous',
  )
  const [storageReady, setStorageReady] = useState(false)
  const [newGameDifficulty, setNewGameDifficulty] =
    useState<PuzzleDifficulty>('medium')
  const [newGameMode, setNewGameMode] = useState<PlayMode>('classic')
  const [newGameSize, setNewGameSize] = useState<PuzzleSize>('9x9')
  const [newGameVariant, setNewGameVariant] = useState<VariantId>('classic')
  const [dailyDateKey, setDailyDateKey] = useState(() => todayDateKey())
  const [dashboardDifficulty, setDashboardDifficulty] =
    useState<PuzzleDifficulty>('easy')
  const [dashboardMode, setDashboardMode] = useState<PlayMode>('classic')
  const [dashboardSize, setDashboardSize] = useState<PuzzleSize>('9x9')
  const [challengeDifficulty, setChallengeDifficulty] =
    useState<PuzzleDifficulty>('medium')
  const [challengeKind, setChallengeKind] = useState<ChallengeSetupKind>('race')
  const [challengeMode, setChallengeMode] = useState<PlayMode>('classic')
  const [challengeSize, setChallengeSize] = useState<PuzzleSize>('9x9')
  const [challengeVariant, setChallengeVariant] = useState<VariantId>('classic')
  const [challengeSource, setChallengeSource] =
    useState<ChallengePuzzleSource>('daily')
  const [challengeTurnSeconds, setChallengeTurnSeconds] = useState(20)
  const [challengeTurnLives, setChallengeTurnLives] = useState(3)
  const leaderboardFilters = useMemo(
    () => leaderboardFiltersFromPath(pathname) ?? DEFAULT_LEADERBOARD_FILTERS,
    [pathname],
  )
  const leaderboardScope = useMemo(
    () => leaderboardScopeFromPath(pathname),
    [pathname],
  )
  const leaderboardSize = leaderboardFilters.size
  const leaderboardMode = leaderboardFilters.mode
  const leaderboardVariant = leaderboardFilters.variant
  const leaderboardDifficulty = leaderboardScope?.difficulty ?? 'easy'
  const [solvedDismissed, setSolvedDismissed] = useState(false)
  const [solvedNamePromptGameId, setSolvedNamePromptGameId] = useState<
    string | null
  >(null)
  const [newPuzzleText, setNewPuzzleText] = useState('')
  const [newGameStatus, setNewGameStatus] = useState('')
  const [isFetchingPuzzle, setIsFetchingPuzzle] = useState(false)
  const [hintRailOpen, setHintRailOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [toolsPanelOpen, setToolsPanelOpen] = useState(true)
  const [leaderPending, setLeaderPending] = useState(false)
  const [compactStatus, setCompactStatus] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 640px)').matches,
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingKeyRef = useRef('')
  const submittedScoreIdsRef = useRef(new Set<string>())
  const previousPageRef = useRef(activePage)
  const handledLiveRaceStartRef = useRef<string | null>(null)
  const handledLiveRaceFinishRef = useRef<string | null>(null)
  const activeMenuModal = menuModal ?? routeModal
  const hasCustomPlayerName = isCustomPlayerName(playerName)
  const playerId = cloudProfile?.anonId ?? guestId
  const activeSize = activeGame.puzzleSize ?? puzzleSizeFromGrid(grid)
  const activeMode = activeGame.playMode ?? 'classic'
  const activeChallengeId = challengeIdFromGameId(activeGame.id)
  const activeChallengeKind = challengeKindFromGameId(activeGame.id)
  const activeLiveBattleId = liveBattleIdFromGameId(activeGame.id)
  const isLiveBattlePlay =
    activePage === 'live-battle' &&
    Boolean(routeLiveBattleId) &&
    activeLiveBattleId === routeLiveBattleId
  const activeLiveBattleRoom =
    activeLiveBattleId && liveBattleRoom?.roomId === activeLiveBattleId
      ? liveBattleRoom
      : null
  const isTurnBattlePlay =
    isLiveBattlePlay && activeLiveBattleRoom?.battleKind === 'turns'
  const isCoopPlay =
    isLiveBattlePlay && activeLiveBattleRoom?.battleKind === 'coop'
  const isCompetitiveBattlePlay =
    isLiveBattlePlay &&
    Boolean(activeLiveBattleRoom) &&
    activeLiveBattleRoom?.battleKind !== 'coop'
  const showSidebarTools = !isCompetitiveBattlePlay
  const isMyTurnBattleTurn =
    !isTurnBattlePlay || activeLiveBattleRoom?.turnAnonId === playerId
  const showBoard = activePage === 'play' || isLiveBattlePlay
  const activeConfig = boardConfigFor(activeSize)
  const activeDigits = activeConfig.digits
  const activeCellCount = activeConfig.cellCount
  const {
    flashStyle: battleImpactFlashStyle,
    impactStyle: battleImpactStyle,
    triggerImpact: triggerBattleImpact,
  } = useScreenImpact()
  const policy = useMemo(() => modePolicy(activeMode), [activeMode])
  const {
    notesEnabled,
    hintsEnabled,
    pauseEnabled,
    timerEnabled,
    scoreEnabled,
  } = policy

  const updatePlayerName = useCallback((value: string) => {
    setPlayerName(value)
  }, [])

  const goToDashboard = useCallback(() => {
    void navigate({ to: '/' })
  }, [navigate])

  const goToPlay = useCallback(() => {
    void navigate({ to: '/play' })
  }, [navigate])

  const openDailyPuzzle = useCallback(
    (
      difficulty: PuzzleDifficulty,
      dateKey = todayDateKey(),
      puzzleSize: PuzzleSize = newGameSize,
      playMode: PlayMode = newGameMode,
    ) => {
      if (puzzleSize === '9x9' && playMode === 'classic') {
        void navigate({
          to: '/play/daily/$difficulty/$date',
          params: { date: dateKey, difficulty },
        })
        return
      }
      if (playMode === 'classic') {
        void navigate({
          to: '/play/daily/$size/$difficulty/$date',
          params: { date: dateKey, difficulty, size: puzzleSize },
        })
        return
      }
      void navigate({
        to: '/play/daily/$size/$mode/$difficulty/$date',
        params: { date: dateKey, difficulty, mode: playMode, size: puzzleSize },
      })
    },
    [navigate, newGameMode, newGameSize],
  )

  const goToProfile = useCallback(() => {
    setStatusLine('Opened profile.')
    void navigate({ to: '/profile' })
  }, [navigate])

  const openPublicProfile = useCallback(
    (friendCode: string) => {
      const compactCode = compactFriendCode(friendCode)
      setStatusLine(`Opened ${compactCode} profile.`)
      void navigate({ to: `/u/${encodeURIComponent(compactCode)}` })
    },
    [navigate],
  )

  const navigateToPage = useCallback(
    (page: PageRoute) => {
      const path =
        page === 'dashboard'
          ? '/'
          : page === 'play'
            ? '/play'
            : page === 'new'
              ? '/new'
              : page === 'games'
                ? '/games'
                : page === 'leaderboards'
                  ? '/leaderboards'
                  : page === 'challenge'
                    ? routeChallengeResults
                      ? '/challenge/results'
                      : routeChallengeId
                        ? challengePath(routeChallengeId)
                        : '/challenge'
                    : page === 'live-battle'
                      ? routeLiveBattleId
                        ? liveBattlePath(routeLiveBattleId)
                        : '/challenge'
                      : '/profile'
      void navigate({ to: path })
    },
    [navigate, routeChallengeId, routeChallengeResults, routeLiveBattleId],
  )

  const openModalRoute = useCallback((modal: RouteModal) => {
    setGamePickerOpen(false)
    if (modal === 'commands') setCommandMode(null)
    setMenuModal(modal)
  }, [])

  const chooseToolMode = useCallback((mode: ToolMode) => {
    setToolMode(mode)
    setNoteMode(mode === 'center')
    setStatusLine(toolModeMessage(mode))
  }, [])

  const openNewGame = useCallback(() => {
    setGamePickerOpen(false)
    setCommandMode(null)
    if (activePage === 'play') {
      setMenuModal('new')
      if (routeModal) {
        void navigate({ to: '/play' })
      }
      setStatusLine('Opened new game menu.')
      return
    }
    void navigate({ to: '/new' })
    setStatusLine('Opened new game page.')
  }, [activePage, navigate, routeModal])

  const openChallengeSetup = useCallback(
    (kind: ChallengeSetupKind = 'race', friend?: FriendSummary | null) => {
      setChallengeKind(kind)
      setChallengeRecipient(friend ?? null)
      setChallengeSetupOpen(true)
      setChallengeStatus(
        friend
          ? `Creating direct ${challengeSetupLabel(kind)} for ${friend.name}.`
          : '',
      )
    },
    [],
  )

  const closeMenuModal = useCallback(() => {
    setMenuModal(null)
    if (routeModal) goToPlay()
  }, [goToPlay, routeModal])

  const headerNotifications =
    hasConvexBackend() && cloudProfile?.authSubject ? (
      <NotificationsButton
        recipientAnonId={playerId}
        onOpenChallenge={(challengeId) => {
          closeMenuModal()
          setSolvedDismissed(true)
          void navigate({
            to: '/challenge/$challengeId',
            params: { challengeId },
          })
        }}
      />
    ) : null

  const conflicts = useMemo(
    () => findConflicts(grid, activeSize),
    [activeSize, grid],
  )
  const visibleConflicts = policy.hidesConflicts ? new Set<number>() : conflicts
  const solved = useMemo(() => solveGrid(grid, activeSize), [activeSize, grid])
  const puzzleSolution = useMemo(
    () => solveGrid(parseGrid(activeGame.puzzle, activeSize), activeSize),
    [activeGame.puzzle, activeSize],
  )
  const completion = grid.filter(Boolean).length
  const isSolved = Boolean(
    solved && grid.every((value, index) => value === solved[index]),
  )
  const showSolved =
    isSolved &&
    showBoard &&
    !activeMenuModal &&
    !commandMode &&
    !gamePickerOpen &&
    !review &&
    !solvedDismissed
  const currentRecord = useMemo(
    () =>
      createGameRecord(
        { ...activeGame, variantId },
        grid,
        notes,
        cornerMarks,
        cellColors,
        givens,
        isSolved,
        elapsedMs,
        solveEvents,
      ),
    [
      activeGame,
      cellColors,
      cornerMarks,
      elapsedMs,
      givens,
      grid,
      isSolved,
      notes,
      solveEvents,
      variantId,
    ],
  )
  const liveRaceFinished = Boolean(
    isLiveBattlePlay &&
      activeLiveBattleRoom?.battleKind === 'race' &&
      activeLiveBattleRoom.status === 'finished' &&
      activeLiveBattleRoom.winnerAnonId,
  )
  const liveRaceWinner = liveRaceFinished
    ? (activeLiveBattleRoom?.presence.find(
        (player) => player.anonId === activeLiveBattleRoom.winnerAnonId,
      ) ?? null)
    : null
  const liveRaceOpponent = liveRaceFinished
    ? (activeLiveBattleRoom?.presence.find(
        (player) => player.anonId !== playerId,
      ) ?? null)
    : null
  const liveRaceWon = Boolean(
    liveRaceFinished &&
      activeLiveBattleRoom?.winnerAnonId === playerId &&
      currentRecord.status === 'completed',
  )
  const liveRaceLostResult = Boolean(
    liveRaceFinished && activeLiveBattleRoom?.winnerAnonId !== playerId,
  )
  const liveRaceLost = Boolean(
    liveRaceLostResult && currentRecord.status !== 'completed',
  )
  const liveRaceWinnerElapsedMs =
    liveRaceWinner?.elapsedMs && liveRaceWinner.elapsedMs > 0
      ? liveRaceWinner.elapsedMs
      : activeLiveBattleRoom?.raceStartsAt && liveRaceWinner?.lastSeenAt
        ? Math.max(
            0,
            liveRaceWinner.lastSeenAt - activeLiveBattleRoom.raceStartsAt,
          )
        : undefined
  const boardObscured = timerPaused || liveRaceLost
  const needsSolvedNamePrompt =
    scoreEnabled &&
    (!hasCustomPlayerName || solvedNamePromptGameId === currentRecord.id)
  const trackedGameRecords = useMemo(
    () => upsertGameRecord(gameRecords, currentRecord),
    [currentRecord, gameRecords],
  )
  const inProgressGames = useMemo(
    () =>
      trackedGameRecords
        .filter((record) => record.status === 'in-progress')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [trackedGameRecords],
  )
  const completedGames = useMemo(
    () =>
      trackedGameRecords
        .filter((record) => record.status === 'completed')
        .sort((a, b) =>
          (b.completedAt ?? b.updatedAt).localeCompare(
            a.completedAt ?? a.updatedAt,
          ),
        ),
    [trackedGameRecords],
  )
  const localLeaderboard = useMemo(
    () =>
      completedGames
        .filter((record) => (record.puzzleSize ?? '9x9') === leaderboardSize)
        .filter((record) => (record.playMode ?? 'classic') === leaderboardMode)
        .filter(
          (record) => (record.variantId ?? 'classic') === leaderboardVariant,
        )
        .filter((record) => record.difficulty === leaderboardDifficulty)
        .filter((record) => record.elapsedMs > 0)
        .sort((a, b) => a.elapsedMs - b.elapsedMs)
        .slice(0, 25),
    [
      completedGames,
      leaderboardDifficulty,
      leaderboardMode,
      leaderboardSize,
      leaderboardVariant,
    ],
  )
  const visibleGlobalLeaderboard = useMemo(
    () =>
      globalScores
        .filter((score) =>
          leaderboardEntryMatches(
            score,
            leaderboardSize,
            leaderboardMode,
            leaderboardVariant,
          ),
        )
        .filter((score) => score.difficulty === leaderboardDifficulty),
    [
      globalScores,
      leaderboardDifficulty,
      leaderboardMode,
      leaderboardSize,
      leaderboardVariant,
    ],
  )
  const localProfileStats = useMemo(
    () => buildLocalStats(trackedGameRecords),
    [trackedGameRecords],
  )
  const gameFinderRecords = useMemo(
    () => [...inProgressGames, ...completedGames],
    [completedGames, inProgressGames],
  )
  const filteredGameRecords = useMemo(
    () => filterGameRecords(gameFinderRecords, gameQuery),
    [gameFinderRecords, gameQuery],
  )
  const libraryGameRecords = useMemo(() => {
    const scopedRecords =
      gameLibraryFilter === 'all'
        ? gameFinderRecords
        : gameFinderRecords.filter(
            (record) => record.status === gameLibraryFilter,
          )
    return filterGameRecords(scopedRecords, gameLibraryQuery)
  }, [gameFinderRecords, gameLibraryFilter, gameLibraryQuery])
  const selectedGameRecord =
    filteredGameRecords[
      Math.min(gameCursor, Math.max(0, filteredGameRecords.length - 1))
    ] ?? null
  const commandSuggestions = useMemo(
    () => filterCommandSuggestions(commandValue),
    [commandValue],
  )
  const selectedCommandSuggestion =
    commandSuggestions[
      Math.min(commandCursor, Math.max(0, commandSuggestions.length - 1))
    ] ?? null
  const liveOpponentCursors = useMemo(() => {
    if (!activeLiveBattleId || !liveBattleRoom)
      return new Map<number, string[]>()
    const now = Date.now()
    const cursors = new Map<number, string[]>()
    for (const player of liveBattleRoom.presence) {
      if (player.anonId === playerId) continue
      if (typeof player.selectedCell !== 'number') continue
      if (now - player.lastSeenAt >= 8000) continue
      const names = cursors.get(player.selectedCell) ?? []
      names.push(player.player)
      cursors.set(player.selectedCell, names)
    }
    return cursors
  }, [activeLiveBattleId, liveBattleRoom, playerId])
  const editorMode: EditorMode =
    visualAnchor !== null || explicitSelection !== null
      ? 'visual'
      : toolMode === 'color'
        ? 'color'
        : toolMode === 'corner' || (notesEnabled && shiftHeld)
          ? 'corner'
          : toolMode === 'center' || (notesEnabled && noteMode)
            ? 'annotate'
            : 'normal'

  const recordSolveEvent = useCallback(
    (event: {
      cells?: number[]
      detail?: string
      kind: SolveEventKind
      label: string
      value?: number
    }) => {
      setSolveEvents((current) =>
        [
          ...current,
          {
            ...event,
            atMs: elapsedMs,
            id: `${Date.now().toString(36)}-${current.length.toString(36)}`,
          },
        ].slice(-300),
      )
    },
    [elapsedMs],
  )

  const resumeTimerFromActivity = useCallback(() => {
    if (liveRaceLost) {
      setStatusLine(
        `Race over. ${liveRaceWinner?.player ?? 'Your opponent'} completed first.`,
      )
      return
    }
    if (!timerPaused || isSolved) return
    setTimerPaused(false)
    setTimerPauseReason(null)
    setStatusLine('Timer resumed.')
    recordSolveEvent({
      kind: 'resume',
      label: 'timer resumed',
      detail:
        timerPauseReason === 'auto'
          ? 'activity resumed an auto-paused puzzle'
          : undefined,
    })
  }, [
    isSolved,
    liveRaceLost,
    liveRaceWinner?.player,
    recordSolveEvent,
    timerPauseReason,
    timerPaused,
  ])

  const toggleTimerPaused = useCallback(() => {
    if (liveRaceLost) {
      setStatusLine(
        `Race over. ${liveRaceWinner?.player ?? 'Your opponent'} completed first.`,
      )
      return
    }
    if (!timerEnabled) {
      setStatusLine('Zen mode does not track time.')
      return
    }
    if (!pauseEnabled) {
      setStatusLine('Timer pause is disabled in speedrun.')
      return
    }
    if (isSolved) {
      setStatusLine('Solved puzzles keep their final time.')
      return
    }
    if (!timerPaused) {
      setManualPauseCount((count) => count + 1)
      recordSolveEvent({ kind: 'pause', label: 'timer paused' })
    } else {
      recordSolveEvent({ kind: 'resume', label: 'timer resumed' })
    }
    setTimerPaused((current) => {
      const next = !current
      setTimerPauseReason(next ? 'manual' : null)
      return next
    })
    setStatusLine(timerPaused ? 'Timer resumed.' : 'Timer paused.')
  }, [
    isSolved,
    liveRaceLost,
    liveRaceWinner?.player,
    pauseEnabled,
    recordSolveEvent,
    timerEnabled,
    timerPaused,
  ])

  useEffect(() => {
    if (previousPageRef.current !== activePage && showBoard) {
      resumeTimerFromActivity()
    }
    previousPageRef.current = activePage
  }, [activePage, resumeTimerFromActivity, showBoard])

  // The visual selection is the rectangle spanning the anchor and the
  // (moving) cursor; null whenever visual mode is off.
  const visualCells = useMemo(
    () =>
      explicitSelection ??
      (visualAnchor === null
        ? null
        : rectangularSelection(visualAnchor, selected, activeSize)),
    [activeSize, explicitSelection, visualAnchor, selected],
  )
  const activeCells = useMemo(
    () => visualCells ?? new Set([selected]),
    [selected, visualCells],
  )
  const activeTheme = useMemo(
    () => CODE_THEMES.find((theme) => theme.id === themeId) ?? CODE_THEMES[0],
    [themeId],
  )
  const themeStyle = activeTheme.vars as CSSProperties

  // Mirror theme vars onto :root so Radix-portaled dialogs inherit them.
  useEffect(() => {
    const root = document.documentElement
    for (const [key, value] of Object.entries(activeTheme.vars)) {
      root.style.setProperty(key, value)
    }
    root.style.background = activeTheme.vars['--app-bg']
    root.style.color = activeTheme.vars['--app-text']
    document.body.style.background = activeTheme.vars['--app-bg']
    document.body.style.color = activeTheme.vars['--app-text']
  }, [activeTheme])

  useEffect(() => {
    localStorage.setItem(THEME_KEY, themeId)
  }, [themeId])

  useEffect(() => {
    localStorage.setItem(PLAYER_NAME_KEY, playerName.trim() || 'anonymous')
  }, [playerName])

  useEffect(() => {
    let cancelled = false

    void loadStoredState()
      .then((stored) => {
        if (cancelled) return
        setGrid(stored.snapshot.grid)
        setNotes(stored.snapshot.notes)
        setCornerMarks(stored.snapshot.cornerMarks)
        setCellColors(stored.snapshot.cellColors)
        setGivens(stored.snapshot.givens)
        setVariantId(stored.snapshot.variantId)
        setActiveGame({
          ...stored.activeGame,
          variantId: stored.snapshot.variantId,
        })
        setGameRecords(stored.records)
        const storedRecord = stored.records.find(
          (record) => record.id === stored.activeGame.id,
        )
        setElapsedMs(storedRecord?.elapsedMs ?? 0)
        setSolveEvents(storedRecord?.solveEvents ?? [])
        const storedTimerPaused = loadPausedGameId() === stored.activeGame.id
        setTimerPaused(storedTimerPaused)
        setTimerPauseReason(storedTimerPaused ? 'manual' : null)
      })
      .finally(() => {
        if (!cancelled) setStorageReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!storageReady) return
    if (timerPaused && timerPauseReason === 'manual') {
      localStorage.setItem(TIMER_PAUSED_GAME_KEY, activeGame.id)
    } else if (loadPausedGameId() === activeGame.id) {
      localStorage.removeItem(TIMER_PAUSED_GAME_KEY)
    }
  }, [activeGame.id, storageReady, timerPaused, timerPauseReason])

  useEffect(() => {
    if (
      !storageReady ||
      activePage !== 'play' ||
      !timerEnabled ||
      !pauseEnabled ||
      isSolved
    ) {
      return
    }

    function appIsActive() {
      return document.visibilityState === 'visible' && document.hasFocus()
    }

    function autoPause() {
      if (timerPaused || appIsActive()) return
      setTimerPauseReason('auto')
      setTimerPaused(true)
      recordSolveEvent({
        detail: 'window lost focus or the tab became hidden',
        kind: 'pause',
        label: 'timer auto-paused',
      })
      setStatusLine('Timer auto-paused while Vimdoku was inactive.')
    }

    function autoResume() {
      if (timerPauseReason !== 'auto' || !appIsActive()) return
      setTimerPaused(false)
      setTimerPauseReason(null)
      recordSolveEvent({
        detail: 'window focus returned',
        kind: 'resume',
        label: 'timer auto-resumed',
      })
      setStatusLine('Timer resumed.')
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') autoResume()
      else autoPause()
    }

    window.addEventListener('blur', autoPause)
    window.addEventListener('focus', autoResume)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.removeEventListener('blur', autoPause)
      window.removeEventListener('focus', autoResume)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [
    activePage,
    isSolved,
    pauseEnabled,
    recordSolveEvent,
    storageReady,
    timerEnabled,
    timerPaused,
    timerPauseReason,
  ])

  useEffect(() => {
    if (!storageReady) return
    void saveStoredState(
      { cellColors, cornerMarks, grid, notes, givens, variantId },
      activeGame,
      trackedGameRecords,
    ).catch(() => {
      setStatusLine('Could not save puzzle history.')
    })
  }, [
    activeGame,
    cellColors,
    cornerMarks,
    givens,
    grid,
    notes,
    storageReady,
    trackedGameRecords,
    variantId,
  ])

  useEffect(() => {
    if (
      !storageReady ||
      activePage !== 'play' ||
      activeMenuModal ||
      commandMode ||
      gamePickerOpen ||
      !timerEnabled ||
      timerPaused ||
      isSolved ||
      review
    ) {
      return
    }

    function isVisible() {
      return document.visibilityState === 'visible'
    }

    if (!isVisible()) return
    const timer = window.setInterval(() => {
      if (isVisible()) setElapsedMs((current) => current + 1000)
    }, 1000)

    return () => window.clearInterval(timer)
  }, [
    activeMenuModal,
    activePage,
    commandMode,
    gamePickerOpen,
    isSolved,
    review,
    storageReady,
    timerEnabled,
    timerPaused,
  ])

  useEffect(() => {
    if (activePage !== 'leaderboards') return
    if (hasConvexBackend()) return
    if (!hasGlobalLeaderboard()) return

    void fetchGlobalLeaderboard(
      leaderboardSize,
      leaderboardMode,
      leaderboardVariant,
    )
      .then((scores) => {
        setGlobalScores(scores)
        setLeaderboardStatus('')
      })
      .catch(() => {
        setLeaderboardStatus('Could not load global leaderboard.')
      })
  }, [activePage, leaderboardMode, leaderboardSize, leaderboardVariant])

  useEffect(() => {
    if (!routeChallengeId) return
    setChallengeRace(null)
    setChallengeShareUrl(
      `${window.location.origin}${challengePath(routeChallengeId)}`,
    )
    setChallengeStatus('Loading challenge...')
  }, [routeChallengeId])

  useEffect(() => {
    if (!routeLiveBattleId) return
    setLiveBattleRoom(null)
    setLiveBattleShareUrl(
      `${window.location.origin}${liveBattlePath(routeLiveBattleId)}`,
    )
    setLiveBattleStatus('Loading live battle...')
  }, [routeLiveBattleId])

  useEffect(() => {
    if (!showSolved) {
      if (solvedNamePromptGameId) setSolvedNamePromptGameId(null)
      return
    }
    if (
      scoreEnabled &&
      !hasCustomPlayerName &&
      solvedNamePromptGameId !== currentRecord.id
    ) {
      setSolvedNamePromptGameId(currentRecord.id)
    }
  }, [
    currentRecord.id,
    hasCustomPlayerName,
    scoreEnabled,
    showSolved,
    solvedNamePromptGameId,
  ])

  useEffect(() => {
    if (!showSolved || !currentRecord.completedAt) return
    if (hasConvexBackend()) return
    if (!hasCustomPlayerName) return
    if (!scoreEnabled) return
    if (solvedNamePromptGameId === currentRecord.id) return
    if (submittedScoreIdsRef.current.has(currentRecord.id)) return
    submittedScoreIdsRef.current.add(currentRecord.id)
    void submitGlobalScore(currentRecord).catch(() => {
      setLeaderboardStatus('Could not submit global score.')
    })
  }, [
    currentRecord,
    hasCustomPlayerName,
    scoreEnabled,
    showSolved,
    solvedNamePromptGameId,
  ])

  useEffect(() => {
    const query = window.matchMedia('(max-width: 640px)')
    const sync = () => setCompactStatus(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Shift') setShiftHeld(true)
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.key === 'Shift') setShiftHeld(false)
    }
    // Releasing Shift outside the window never fires keyup, so clear on blur.
    function onBlur() {
      setShiftHeld(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  const pushHistory = useCallback(() => {
    setHistory((current) => [
      ...current.slice(-49),
      { cellColors, cornerMarks, grid, notes, givens, variantId },
    ])
    setFuture([])
  }, [cellColors, cornerMarks, givens, grid, notes, variantId])

  const chooseVariant = useCallback(
    (nextVariant: VariantId) => {
      pushHistory()
      setVariantId(nextVariant)
      setActiveGame((current) => ({ ...current, variantId: nextVariant }))
    },
    [pushHistory],
  )

  const moveSelection = useCallback(
    (deltaRow: number, deltaCol: number) => {
      resumeTimerFromActivity()
      setExplicitSelection(null)
      setSelected((index) => {
        const row = Math.max(
          0,
          Math.min(
            activeConfig.size - 1,
            Math.floor(index / activeConfig.size) + deltaRow,
          ),
        )
        const col = Math.max(
          0,
          Math.min(
            activeConfig.size - 1,
            (index % activeConfig.size) + deltaCol,
          ),
        )
        return row * activeConfig.size + col
      })
    },
    [activeConfig.size, resumeTimerFromActivity],
  )

  // Jump to the same relative cell in an adjacent box ({ and }).
  const moveBox = useCallback(
    (delta: number) => {
      resumeTimerFromActivity()
      setExplicitSelection(null)
      setSelected((index) => {
        const boxesPerRow = activeConfig.size / activeConfig.boxCols
        const boxCount =
          boxesPerRow * (activeConfig.size / activeConfig.boxRows)
        const row = Math.floor(index / activeConfig.size)
        const col = index % activeConfig.size
        const box =
          Math.floor(row / activeConfig.boxRows) * boxesPerRow +
          Math.floor(col / activeConfig.boxCols)
        const nextBox = Math.max(0, Math.min(boxCount - 1, box + delta))
        const within =
          (row % activeConfig.boxRows) * activeConfig.boxCols +
          (col % activeConfig.boxCols)
        const nextRow =
          Math.floor(nextBox / boxesPerRow) * activeConfig.boxRows +
          Math.floor(within / activeConfig.boxCols)
        const nextCol =
          (nextBox % boxesPerRow) * activeConfig.boxCols +
          (within % activeConfig.boxCols)
        return nextRow * activeConfig.size + nextCol
      })
    },
    [activeConfig, resumeTimerFromActivity],
  )

  const setCell = useCallback(
    (value: number) => {
      if (liveRaceLost) {
        setStatusLine(
          `Race over. ${liveRaceWinner?.player ?? 'Your opponent'} completed first.`,
        )
        return
      }
      const targets = [...activeCells].filter((index) => !givens[index])
      if (targets.length === 0) return
      resumeTimerFromActivity()
      if (isTurnBattlePlay && value !== 0) {
        if (!isMyTurnBattleTurn) {
          setStatusLine('Turn battle: wait for your turn.')
          return
        }
        if (targets.length !== 1) {
          setStatusLine('Turn battle: enter one cell at a time.')
          return
        }
        if (!activeLiveBattleRoom || !puzzleSolution) {
          setStatusLine('Turn battle: solution check is not ready yet.')
          return
        }
        const target = targets[0]
        const correct = puzzleSolution[target] === value
        if (!correct) {
          setChallengeMistakes((count) => count + 1)
          setLiveBattleTurnRequest({
            completion,
            correct: false,
            elapsedMs,
            player: playerName,
            recordId: currentRecord.id,
            requestId: `${activeLiveBattleRoom.roomId}-${Date.now().toString(36)}-${target}`,
            roomId: activeLiveBattleRoom.roomId,
            selectedCell: target,
          })
          setStatusLine('Turn battle: bad entry, life lost.')
          triggerBattleImpact(16, 0.42, 0.78)
          return
        }
      }
      pushHistory()
      const mistakes =
        activeChallengeKind === 'streak' && value !== 0
          ? targets.filter(
              (index) => grid[index] !== value && solved?.[index] !== value,
            ).length
          : 0
      if (mistakes > 0) {
        setChallengeMistakes((count) => count + mistakes)
        setStatusLine('Streak battle: bad entry recorded.')
        triggerBattleImpact(12, 0.34, 0.78)
      }
      const nextGrid = [...grid]
      for (const index of targets) nextGrid[index] = value
      if (isTurnBattlePlay && value !== 0 && activeLiveBattleRoom) {
        setLiveBattleTurnRequest({
          completion: nextGrid.filter(Boolean).length,
          correct: true,
          elapsedMs,
          player: playerName,
          recordId: currentRecord.id,
          requestId: `${activeLiveBattleRoom.roomId}-${Date.now().toString(36)}-${targets[0]}`,
          roomId: activeLiveBattleRoom.roomId,
          selectedCell: targets[0],
        })
      }
      setGrid(nextGrid)
      recordSolveEvent({
        cells: targets,
        kind: value === 0 ? 'clear' : 'entry',
        label:
          value === 0
            ? `cleared ${targets.length} cell${targets.length === 1 ? '' : 's'}`
            : `placed ${value}`,
        detail: targets.map((index) => labelCell(index, activeSize)).join(', '),
        value: value || undefined,
      })
      setNotes((current) =>
        value === 0
          ? current
          : targets.reduce(
              (nextNotes, index) =>
                removeRelatedNotes(nextNotes, index, value, activeSize),
              current,
            ),
      )
      if (value !== 0) {
        setCornerMarks((current) =>
          targets.reduce(
            (nextMarks, index) =>
              removeRelatedNotes(nextMarks, index, value, activeSize),
            current,
          ),
        )
      }
      setHint(null)
      if (activeSize === '6x6' && value !== 0 && targets.length === 1) {
        const nextEmpty = nextEmptyCell(nextGrid, givens, selected)
        if (nextEmpty !== null) setSelected(nextEmpty)
      }
    },
    [
      activeChallengeKind,
      activeSize,
      activeCells,
      activeLiveBattleRoom,
      completion,
      currentRecord.id,
      elapsedMs,
      givens,
      grid,
      isMyTurnBattleTurn,
      isTurnBattlePlay,
      liveRaceLost,
      liveRaceWinner?.player,
      playerName,
      pushHistory,
      puzzleSolution,
      recordSolveEvent,
      resumeTimerFromActivity,
      selected,
      solved,
      triggerBattleImpact,
    ],
  )

  const clearCellsCompletely = useCallback(() => {
    if (liveRaceLost) {
      setStatusLine(
        `Race over. ${liveRaceWinner?.player ?? 'Your opponent'} completed first.`,
      )
      return
    }
    const targets = [...activeCells].filter((index) => !givens[index])
    if (targets.length === 0) return
    resumeTimerFromActivity()
    pushHistory()
    setGrid((current) => {
      const next = [...current]
      for (const index of targets) next[index] = 0
      return next
    })
    setNotes((current) => {
      const next = cloneNotes(current)
      for (const index of targets) next[index] = []
      return next
    })
    setCornerMarks((current) => {
      const next = cloneNotes(current)
      for (const index of targets) next[index] = []
      return next
    })
    setCellColors((current) => {
      const next = [...current]
      for (const index of targets) next[index] = null
      return next
    })
    recordSolveEvent({
      cells: targets,
      kind: 'clear',
      label: `hard cleared ${targets.length} cell${targets.length === 1 ? '' : 's'}`,
      detail: 'removed entry, notes, corner marks, and colour',
    })
    setHint(null)
    setStatusLine(
      `Cleared ${targets.length} cell${targets.length === 1 ? '' : 's'} completely.`,
    )
  }, [
    activeCells,
    givens,
    liveRaceLost,
    liveRaceWinner?.player,
    pushHistory,
    recordSolveEvent,
    resumeTimerFromActivity,
  ])

  const toggleNote = useCallback(
    (value: number) => {
      if (liveRaceLost) {
        setStatusLine(
          `Race over. ${liveRaceWinner?.player ?? 'Your opponent'} completed first.`,
        )
        return
      }
      if (!notesEnabled) {
        setStatusLine('Notes are disabled in speedrun.')
        return
      }
      const eligible = [...activeCells].filter(
        (index) => !givens[index] && grid[index] === 0,
      )
      if (eligible.length === 0) return
      resumeTimerFromActivity()
      pushHistory()
      const allHave = eligible.every((index) => notes[index].includes(value))
      setNotes((current) => {
        const next = cloneNotes(current)
        for (const index of eligible) {
          if (allHave) {
            next[index] = next[index].filter((note) => note !== value)
          } else if (!next[index].includes(value)) {
            next[index] = [...next[index], value].sort()
          }
        }
        return next
      })
      setHint(null)
      recordSolveEvent({
        cells: eligible,
        kind: 'note',
        label: `${allHave ? 'removed' : 'added'} centre ${value}`,
        value,
      })
      if (eligible.length > 1) {
        setStatusLine(
          `${allHave ? 'Removed' : 'Annotated'} ${value} ${
            allHave ? 'from' : 'on'
          } ${eligible.length} cells.`,
        )
      }
    },
    [
      activeCells,
      givens,
      grid,
      liveRaceLost,
      liveRaceWinner?.player,
      notes,
      notesEnabled,
      pushHistory,
      recordSolveEvent,
      resumeTimerFromActivity,
    ],
  )

  const toggleCornerMark = useCallback(
    (value: number) => {
      if (liveRaceLost) {
        setStatusLine(
          `Race over. ${liveRaceWinner?.player ?? 'Your opponent'} completed first.`,
        )
        return
      }
      if (!notesEnabled) {
        setStatusLine('Marks are disabled in speedrun.')
        return
      }
      const eligible = [...activeCells].filter(
        (index) => !givens[index] && grid[index] === 0,
      )
      if (eligible.length === 0) return
      resumeTimerFromActivity()
      pushHistory()
      const allHave = eligible.every((index) =>
        cornerMarks[index].includes(value),
      )
      setCornerMarks((current) => {
        const next = cloneNotes(current)
        for (const index of eligible) {
          if (allHave) {
            next[index] = next[index].filter((mark) => mark !== value)
          } else if (!next[index].includes(value)) {
            next[index] = [...next[index], value].sort()
          }
        }
        return next
      })
      setHint(null)
      recordSolveEvent({
        cells: eligible,
        kind: 'corner',
        label: `${allHave ? 'removed' : 'added'} corner ${value}`,
        value,
      })
      setStatusLine(
        `${allHave ? 'Removed' : 'Marked'} corner ${value} ${
          allHave ? 'from' : 'on'
        } ${eligible.length} cell${eligible.length === 1 ? '' : 's'}.`,
      )
    },
    [
      activeCells,
      cornerMarks,
      givens,
      grid,
      liveRaceLost,
      liveRaceWinner?.player,
      notesEnabled,
      pushHistory,
      recordSolveEvent,
      resumeTimerFromActivity,
    ],
  )

  const applyColor = useCallback(
    (colorIndex: number | null) => {
      if (liveRaceLost) {
        setStatusLine(
          `Race over. ${liveRaceWinner?.player ?? 'Your opponent'} completed first.`,
        )
        return
      }
      resumeTimerFromActivity()
      const targets = [...activeCells]
      if (colorIndex !== null) setActiveColor(colorIndex)
      pushHistory()
      setCellColors((current) => {
        const next = [...current]
        for (const index of targets) next[index] = colorIndex
        return next
      })
      setStatusLine(
        colorIndex === null
          ? `Cleared colour from ${targets.length} cell${targets.length === 1 ? '' : 's'}.`
          : `Applied colour ${colorIndex + 1} to ${targets.length} cell${
              targets.length === 1 ? '' : 's'
            }.`,
      )
      recordSolveEvent({
        cells: targets,
        kind: 'color',
        label:
          colorIndex === null
            ? `cleared colour`
            : `applied colour ${colorIndex + 1}`,
        value: colorIndex === null ? undefined : colorIndex + 1,
      })
    },
    [
      activeCells,
      liveRaceLost,
      liveRaceWinner?.player,
      pushHistory,
      recordSolveEvent,
      resumeTimerFromActivity,
    ],
  )

  const clearNotesAcrossBlock = useCallback(() => {
    if (liveRaceLost) {
      setStatusLine(
        `Race over. ${liveRaceWinner?.player ?? 'Your opponent'} completed first.`,
      )
      return
    }
    if (!notesEnabled) return
    const targets = [...activeCells]
    resumeTimerFromActivity()
    pushHistory()
    setNotes((current) => {
      const next = cloneNotes(current)
      for (const index of targets) next[index] = []
      return next
    })
    setHint(null)
    recordSolveEvent({
      cells: targets,
      kind: 'clear',
      label: `cleared centre notes`,
    })
    setStatusLine(`Cleared notes in ${targets.length} cells.`)
  }, [
    activeCells,
    liveRaceLost,
    liveRaceWinner?.player,
    notesEnabled,
    pushHistory,
    recordSolveEvent,
    resumeTimerFromActivity,
  ])

  const clearCornerMarksAcrossSelection = useCallback(() => {
    if (liveRaceLost) {
      setStatusLine(
        `Race over. ${liveRaceWinner?.player ?? 'Your opponent'} completed first.`,
      )
      return
    }
    const targets = [...activeCells]
    resumeTimerFromActivity()
    pushHistory()
    setCornerMarks((current) => {
      const next = cloneNotes(current)
      for (const index of targets) next[index] = []
      return next
    })
    setHint(null)
    recordSolveEvent({
      cells: targets,
      kind: 'clear',
      label: `cleared corner notes`,
    })
    setStatusLine(`Cleared corners in ${targets.length} cells.`)
  }, [
    activeCells,
    liveRaceLost,
    liveRaceWinner?.player,
    pushHistory,
    recordSolveEvent,
    resumeTimerFromActivity,
  ])

  const undo = useCallback(() => {
    if (!history.length) {
      setStatusLine('Nothing to undo.')
      return
    }
    resumeTimerFromActivity()
    const previous = history[history.length - 1]
    setFuture((current) => [
      ...current.slice(-49),
      { cellColors, cornerMarks, grid, notes, givens, variantId },
    ])
    setHistory((current) => current.slice(0, -1))
    setCellColors(previous.cellColors)
    setCornerMarks(previous.cornerMarks)
    setGrid(previous.grid)
    setNotes(previous.notes)
    setGivens(previous.givens)
    setVariantId(previous.variantId)
    setActiveGame((current) => ({ ...current, variantId: previous.variantId }))
    setHint(null)
    setStatusLine('Undid last change.')
  }, [
    cellColors,
    cornerMarks,
    givens,
    grid,
    history,
    notes,
    resumeTimerFromActivity,
    variantId,
  ])

  const redo = useCallback(() => {
    if (!future.length) {
      setStatusLine('Nothing to redo.')
      return
    }
    resumeTimerFromActivity()
    const next = future[future.length - 1]
    setHistory((current) => [
      ...current.slice(-49),
      { cellColors, cornerMarks, grid, notes, givens, variantId },
    ])
    setFuture((current) => current.slice(0, -1))
    setCellColors(next.cellColors)
    setCornerMarks(next.cornerMarks)
    setGrid(next.grid)
    setNotes(next.notes)
    setGivens(next.givens)
    setVariantId(next.variantId)
    setActiveGame((current) => ({ ...current, variantId: next.variantId }))
    setHint(null)
    setStatusLine('Redid change.')
  }, [
    cellColors,
    cornerMarks,
    future,
    givens,
    grid,
    notes,
    resumeTimerFromActivity,
    variantId,
  ])

  const askForHint = useCallback(
    (mode: HintMode = hintMode) => {
      if (!hintsEnabled) {
        setStatusLine('Hints are disabled in speedrun.')
        return
      }
      const next = nextHint(grid, activeSize)
      setHintMode(mode)
      setHint(next)
      setHintUses((count) => count + 1)
      recordSolveEvent({
        cells: hintFocusCells(next),
        detail: 'technique' in next ? next.technique : next.message,
        kind: 'hint',
        label: `${mode} hint`,
        value: 'value' in next ? next.value : undefined,
      })
      if (mode !== 'nudge') {
        const focusCell = hintFocusCells(next)[0]
        if (focusCell !== undefined) setSelected(focusCell)
      }
    },
    [activeSize, grid, hintMode, hintsEnabled, recordSolveEvent],
  )

  const clearHintState = useCallback((closeRail = false) => {
    setHint(null)
    setHighlightDigit(null)
    if (closeRail) setHintRailOpen(false)
    setStatusLine(closeRail ? 'Hints off.' : 'Cleared hints and highlights.')
  }, [])

  const applyHint = useCallback(() => {
    if (!hint || !('cell' in hint) || givens[hint.cell]) return
    resumeTimerFromActivity()
    pushHistory()
    setGrid((current) => {
      const next = [...current]
      next[hint.cell] = hint.value
      return next
    })
    setNotes((current) =>
      removeRelatedNotes(current, hint.cell, hint.value, activeSize),
    )
    setCornerMarks((current) =>
      removeRelatedNotes(current, hint.cell, hint.value, activeSize),
    )
    recordSolveEvent({
      cells: [hint.cell],
      detail: hint.technique,
      kind: 'entry',
      label: `applied hint ${hint.value}`,
      value: hint.value,
    })
    setHint(null)
  }, [
    activeSize,
    givens,
    hint,
    pushHistory,
    recordSolveEvent,
    resumeTimerFromActivity,
  ])

  const resetPuzzle = useCallback(() => {
    resumeTimerFromActivity()
    pushHistory()
    setGrid((current) =>
      current.map((value, index) => (givens[index] ? value : 0)),
    )
    setNotes(emptyNotes(activeSize))
    setCornerMarks(emptyNotes(activeSize))
    setCellColors(Array(activeCellCount).fill(null))
    setHint(null)
    recordSolveEvent({ kind: 'reset', label: 'reset entries' })
  }, [
    activeCellCount,
    activeSize,
    givens,
    pushHistory,
    recordSolveEvent,
    resumeTimerFromActivity,
  ])

  const clearAll = useCallback(() => {
    setGameRecords((current) => upsertGameRecord(current, currentRecord))
    pushHistory()
    setGrid(emptyGrid(activeSize))
    setNotes(emptyNotes(activeSize))
    setCornerMarks(emptyNotes(activeSize))
    setCellColors(Array(activeCellCount).fill(null))
    setGivens(Array(activeCellCount).fill(false))
    setHint(null)
    setElapsedMs(0)
    setTimerPaused(false)
    setTimerPauseReason(null)
    setHintUses(0)
    setManualPauseCount(0)
    setSolveEvents([])
    setChallengeMistakes(0)
    setActiveGame(
      createGameMeta(
        emptyGrid(activeSize),
        'blank',
        'custom',
        activeSize,
        activeMode,
        variantId,
      ),
    )
    goToPlay()
  }, [
    activeCellCount,
    activeMode,
    activeSize,
    currentRecord,
    goToPlay,
    pushHistory,
    variantId,
  ])

  const startNewPuzzle = useCallback(
    (
      nextGrid: Grid,
      message = 'Started new puzzle.',
      source = 'custom',
      difficulty?: PuzzleDifficulty | 'custom',
      puzzleSize: PuzzleSize = puzzleSizeFromGrid(nextGrid),
      playMode: PlayMode = newGameMode,
      meta = createGameMeta(nextGrid, source, difficulty, puzzleSize, playMode),
      navigateToPlay = true,
    ) => {
      setGameRecords((current) => upsertGameRecord(current, currentRecord))
      setGrid(nextGrid)
      setNotes(emptyNotes(meta.puzzleSize))
      setCornerMarks(emptyNotes(meta.puzzleSize))
      setCellColors(Array(nextGrid.length).fill(null))
      setGivens(nextGrid.map(Boolean))
      setHistory([])
      setFuture([])
      setSolvedDismissed(false)
      setHint(null)
      setHighlightDigit(null)
      setElapsedMs(0)
      setTimerPaused(false)
      setTimerPauseReason(null)
      setHintUses(0)
      setManualPauseCount(0)
      setSolveEvents([])
      setChallengeMistakes(0)
      setNoteMode(false)
      setToolMode('digit')
      setVariantId(meta.variantId)
      setVisualAnchor(null)
      setExplicitSelection(null)
      setActiveGame(meta)
      const firstEmpty = nextGrid.indexOf(0)
      setSelected(firstEmpty >= 0 ? firstEmpty : 0)
      setStatusLine(message)
      if (navigateToPlay) goToPlay()
    },
    [currentRecord, goToPlay, newGameMode],
  )

  const loadGameRecord = useCallback(
    (record: GameRecord, message: string, navigateToPlay = true) => {
      setGameRecords((current) => upsertGameRecord(current, currentRecord))
      setGrid(record.grid)
      setNotes(record.notes)
      setCornerMarks(record.cornerMarks)
      setCellColors(record.cellColors)
      setGivens(record.givens)
      setElapsedMs(record.elapsedMs)
      setChallengeMistakes(0)
      setActiveGame({
        id: record.id,
        puzzle: record.puzzle,
        source: record.source,
        difficulty: record.difficulty,
        startedAt: record.startedAt,
        puzzleSize: record.puzzleSize,
        playMode: record.playMode,
        variantId: record.variantId,
      })
      setHistory([])
      setFuture([])
      setSolvedDismissed(record.status === 'completed')
      setHint(null)
      setHighlightDigit(null)
      setGamePickerOpen(false)
      setGameQuery('')
      setGameCursor(0)
      setTimerPaused(false)
      setTimerPauseReason(null)
      setHintUses(0)
      setManualPauseCount(0)
      setSolveEvents(record.solveEvents)
      setNoteMode(false)
      setToolMode('digit')
      setVariantId(record.variantId)
      setVisualAnchor(null)
      setExplicitSelection(null)
      const firstEmpty = record.grid.indexOf(0)
      setSelected(firstEmpty >= 0 ? firstEmpty : 0)
      setStatusLine(message)
      if (navigateToPlay) goToPlay()
    },
    [currentRecord, goToPlay],
  )

  const startGeneratedPuzzle = useCallback(
    (
      difficulty = newGameDifficulty,
      daily = false,
      puzzleSize: PuzzleSize = newGameSize,
      playMode: PlayMode = newGameMode,
      variant: VariantId = newGameVariant,
    ) => {
      if (daily) {
        openDailyPuzzle(difficulty, todayDateKey(), puzzleSize, playMode)
        closeMenuModal()
        setNewGameStatus('')
        return
      }
      const seed = daily ? dailySeed(difficulty) : Date.now()
      const nextPuzzle = generatePuzzleForVariant(
        difficulty,
        seed,
        puzzleSize,
        variant,
      )
      startNewPuzzle(
        nextPuzzle,
        `Generated a ${puzzleSize} ${playMode} ${VARIANTS[variant].label} ${difficulty} puzzle.`,
        'local generated',
        difficulty,
        puzzleSize,
        playMode,
        createGameMeta(
          nextPuzzle,
          'local generated',
          difficulty,
          puzzleSize,
          playMode,
          variant,
        ),
      )
      closeMenuModal()
      setNewGameStatus('')
    },
    [
      closeMenuModal,
      newGameDifficulty,
      newGameMode,
      newGameSize,
      newGameVariant,
      openDailyPuzzle,
      startNewPuzzle,
    ],
  )

  const fetchSudokuMountainPuzzle = useCallback(
    async (daily = false) => {
      if (newGameSize === '6x6') {
        const nextPuzzle = generatePuzzle(
          newGameDifficulty,
          daily
            ? dailySeed(
                newGameDifficulty,
                'vimdoku',
                todayDateKey(),
                '6x6',
                newGameMode,
              )
            : Date.now(),
          '6x6',
        )
        startNewPuzzle(
          nextPuzzle,
          daily
            ? `Started today's 6x6 ${newGameDifficulty} daily.`
            : `Generated a 6x6 ${newGameDifficulty} puzzle.`,
          daily ? 'vimdoku daily' : 'local generated',
          newGameDifficulty,
          '6x6',
          newGameMode,
        )
        closeMenuModal()
        setNewGameStatus('')
        return
      }

      setIsFetchingPuzzle(true)
      setNewGameStatus('Fetching Sudoku Mountain...')

      try {
        const params = new URLSearchParams({
          mode: 'classic',
          difficulty: newGameDifficulty,
        })
        if (daily) {
          params.set(
            'seed',
            String(
              dailySeed(
                newGameDifficulty,
                'mountain',
                todayDateKey(),
                '9x9',
                newGameMode,
              ),
            ),
          )
        }

        const response = await fetch(
          `https://api.sudokumountain.com/v1/generate?${params.toString()}`,
        )
        if (!response.ok) throw new Error(`HTTP ${response.status}`)

        const data = (await response.json()) as {
          puzzle?: string
          seed?: number
        }
        if (!data.puzzle || data.puzzle.replace(/[^0-9.]/g, '').length < 81) {
          throw new Error('Unexpected puzzle payload')
        }

        startNewPuzzle(
          parseGrid(data.puzzle, '9x9'),
          daily
            ? `Loaded today's Sudoku Mountain ${newGameDifficulty} puzzle.`
            : `Loaded Sudoku Mountain ${newGameDifficulty} puzzle #${data.seed ?? 'remote'}.`,
          daily ? 'sudoku mountain daily' : 'sudoku mountain',
          newGameDifficulty,
          '9x9',
          newGameMode,
        )
        closeMenuModal()
        setNewGameStatus('')
      } catch {
        startNewPuzzle(
          generatePuzzle(
            newGameDifficulty,
            daily
              ? dailySeed(
                  newGameDifficulty,
                  'vimdoku',
                  todayDateKey(),
                  '9x9',
                  newGameMode,
                )
              : Date.now(),
            '9x9',
          ),
          'Could not reach Sudoku Mountain. Generated a local puzzle instead.',
          'local generated',
          newGameDifficulty,
          '9x9',
          newGameMode,
        )
        closeMenuModal()
        setNewGameStatus('')
      } finally {
        setIsFetchingPuzzle(false)
      }
    },
    [
      closeMenuModal,
      newGameDifficulty,
      newGameMode,
      newGameSize,
      startNewPuzzle,
    ],
  )

  const startPastedPuzzle = useCallback(() => {
    const pastedSize = puzzleSizeFromGrid(newPuzzleText)
    const nextPuzzle = parseGrid(newPuzzleText, pastedSize)
    const givensCount = nextPuzzle.filter(Boolean).length

    if (givensCount === 0) {
      setNewGameStatus('Paste a 36- or 81-character grid first.')
      return
    }

    if (!solveGrid(nextPuzzle, pastedSize)) {
      setNewGameStatus('That grid has a conflict or no solution.')
      return
    }

    startNewPuzzle(
      nextPuzzle,
      `Loaded pasted ${pastedSize} ${newGameMode} puzzle.`,
      'pasted grid',
      'custom',
      pastedSize,
      newGameMode,
    )
    setNewPuzzleText('')
    setNewGameStatus('')
    closeMenuModal()
  }, [closeMenuModal, newGameMode, newPuzzleText, startNewPuzzle])

  useEffect(() => {
    if (!storageReady || !sharedPuzzlePayload) return
    const shared = decodePuzzleLinkData(sharedPuzzlePayload)
    if (!shared) {
      setStatusLine('Shared puzzle link could not be read.')
      void navigate({ to: '/play', replace: true })
      return
    }
    startNewPuzzle(
      shared.grid,
      shared.kind === 'state'
        ? `Opened shared ${shared.puzzleSize} puzzle state.`
        : `Opened shared ${shared.puzzleSize} puzzle.`,
      shared.title ?? 'shared puzzle',
      'custom',
      shared.puzzleSize,
      'classic',
      createGameMeta(
        shared.grid,
        shared.title ?? 'shared puzzle',
        'custom',
        shared.puzzleSize,
        'classic',
        shared.variantId ?? 'classic',
      ),
      false,
    )
    if (shared.kind === 'state') {
      setNotes(shared.notes ?? emptyNotes(shared.puzzleSize))
      setCornerMarks(shared.cornerMarks ?? emptyNotes(shared.puzzleSize))
      setCellColors(shared.cellColors ?? Array(shared.grid.length).fill(null))
      setElapsedMs(shared.elapsedMs ?? 0)
    }
    void navigate({ to: '/play', replace: true })
  }, [navigate, sharedPuzzlePayload, startNewPuzzle, storageReady])

  const resumeGame = useCallback(
    (record: GameRecord) => {
      closeMenuModal()
      loadGameRecord(
        record,
        record.status === 'completed'
          ? 'Opened completed puzzle.'
          : 'Resumed puzzle.',
      )
    },
    [closeMenuModal, loadGameRecord],
  )

  useEffect(() => {
    if (!storageReady || !dailyRoute) return
    if (pathname !== dailyPath(dailyRoute)) {
      if (
        dailyRoute.puzzleSize === '9x9' &&
        dailyRoute.playMode === 'classic'
      ) {
        void navigate({
          to: '/play/daily/$difficulty/$date',
          params: {
            date: dailyRoute.dateKey,
            difficulty: dailyRoute.difficulty,
          },
          replace: true,
        })
      } else if (dailyRoute.playMode === 'classic') {
        void navigate({
          to: '/play/daily/$size/$difficulty/$date',
          params: {
            date: dailyRoute.dateKey,
            difficulty: dailyRoute.difficulty,
            size: dailyRoute.puzzleSize,
          },
          replace: true,
        })
      } else {
        void navigate({
          to: '/play/daily/$size/$mode/$difficulty/$date',
          params: {
            date: dailyRoute.dateKey,
            difficulty: dailyRoute.difficulty,
            mode: dailyRoute.playMode,
            size: dailyRoute.puzzleSize,
          },
          replace: true,
        })
      }
    }

    const nextPuzzle = generatePuzzle(
      dailyRoute.difficulty,
      dailySeed(
        dailyRoute.difficulty,
        'vimdoku',
        dailyRoute.dateKey,
        dailyRoute.puzzleSize,
        dailyRoute.playMode,
      ),
      dailyRoute.puzzleSize,
    )
    const dailyMeta = createDailyGameMeta(
      nextPuzzle,
      dailyRoute.difficulty,
      dailyRoute.dateKey,
      dailyRoute.puzzleSize,
      dailyRoute.playMode,
    )
    if (activeGame.id === dailyMeta.id) return

    const savedDaily = trackedGameRecords.find(
      (record) => record.id === dailyMeta.id,
    )
    const label = `${dailyRoute.dateKey} ${dailyRoute.puzzleSize} ${dailyRoute.playMode} ${dailyRoute.difficulty} daily`

    const timer = window.setTimeout(() => {
      if (savedDaily) {
        loadGameRecord(savedDaily, `Loaded ${label}.`, false)
        return
      }

      startNewPuzzle(
        nextPuzzle,
        `Started ${label}.`,
        'vimdoku daily',
        dailyRoute.difficulty,
        dailyRoute.puzzleSize,
        dailyRoute.playMode,
        dailyMeta,
        false,
      )
    }, 0)

    return () => window.clearTimeout(timer)
  }, [
    activeGame.id,
    dailyRoute,
    loadGameRecord,
    navigate,
    pathname,
    startNewPuzzle,
    storageReady,
    trackedGameRecords,
  ])

  const deleteGame = useCallback((id: string) => {
    setGameRecords((current) => current.filter((record) => record.id !== id))
    setStatusLine('Removed puzzle from history.')
  }, [])

  const openCommand = useCallback((mode: CommandMode) => {
    setCommandMode(mode)
    setCommandValue('')
    setCommandCursor(0)
    setStatusLine(mode === 'command' ? 'Command mode' : 'Search digit')
  }, [])

  const openGamePicker = useCallback(() => {
    setGameQuery('')
    setGameCursor(0)
    setGamePickerOpen(true)
    setStatusLine('Opened puzzle picker.')
  }, [])

  const closeGamePicker = useCallback(() => {
    setGamePickerOpen(false)
    setGameQuery('')
    setGameCursor(0)
  }, [])

  const openGameLibrary = useCallback(() => {
    closeGamePicker()
    void navigate({ to: '/games' })
    setStatusLine('Opened puzzle library.')
  }, [closeGamePicker, navigate])

  const openLeaderboards = useCallback(() => {
    setLeaderboardStatus(
      hasConvexBackend()
        ? 'Connecting to live Convex leaderboard...'
        : hasGlobalLeaderboard()
          ? 'Loading global leaderboard...'
          : 'Set VITE_LEADERBOARD_ENDPOINT to enable global scores.',
    )
    void navigate({ to: '/leaderboards' })
    setStatusLine('Opened leaderboards.')
  }, [navigate])

  const copyChallengeLink = useCallback((challengeId: string) => {
    const url = `${window.location.origin}${challengePath(challengeId)}`
    setChallengeShareUrl(url)
    void navigator.clipboard?.writeText(url).catch(() => {
      setChallengeStatus('Challenge link is ready. Copy it from the lobby.')
    })
    setStatusLine('Challenge link copied.')
    return url
  }, [])

  const copyLiveBattleLink = useCallback((roomId: string) => {
    const url = `${window.location.origin}${liveBattlePath(roomId)}`
    setLiveBattleShareUrl(url)
    void navigator.clipboard?.writeText(url).catch(() => {
      setLiveBattleStatus('Live battle link is ready. Copy it from the room.')
    })
    setStatusLine('Live battle link copied.')
    return url
  }, [])

  const copyPuzzleLink = useCallback(() => {
    const puzzleGrid = grid.map((value, index) => (givens[index] ? value : 0))
    const payload = encodePuzzleLinkData({
      givens: givens.map(Boolean),
      grid: puzzleGrid,
      puzzleSize: activeSize,
      rules: puzzleRules(activeSize, variantId),
      title: activeGame.source,
      variantId,
    })
    const url = `${window.location.origin}/p/${payload}`
    void navigator.clipboard?.writeText(url).catch(() => {
      setStatusLine('Puzzle link is ready, but clipboard access failed.')
    })
    setStatusLine('Puzzle link copied.')
    return url
  }, [activeGame.source, activeSize, givens, grid, variantId])

  const copyStateLink = useCallback(() => {
    const payload = encodePuzzleLinkData({
      cellColors,
      cornerMarks,
      elapsedMs,
      givens: givens.map(Boolean),
      grid,
      kind: 'state',
      notes,
      puzzleSize: activeSize,
      rules: puzzleRules(activeSize, variantId),
      title: `${activeGame.source} state`,
      variantId,
    })
    const url = `${window.location.origin}/p/${payload}`
    void navigator.clipboard?.writeText(url).catch(() => {
      setStatusLine('State link is ready, but clipboard access failed.')
    })
    setStatusLine('Puzzle state link copied.')
    return url
  }, [
    activeGame.source,
    activeSize,
    cellColors,
    cornerMarks,
    elapsedMs,
    givens,
    grid,
    notes,
    variantId,
  ])

  const createRaceChallenge = useCallback(
    (template?: {
      challengeKind?: ChallengeKind
      difficulty?: PuzzleDifficulty | 'custom'
      playMode: PlayMode
      puzzle: string
      puzzleSize: PuzzleSize
      source: string
      variantId?: VariantId
    }) => {
      if (!hasConvexBackend()) {
        setChallengeStatus('Challenge links need the Convex backend.')
        setStatusLine('Challenge links need the Convex backend.')
        return
      }

      const raceTemplate = template ?? {
        difficulty: activeGame.difficulty,
        playMode: activeMode,
        puzzle: activeGame.puzzle,
        puzzleSize: activeSize,
        source: activeGame.source,
        variantId,
      }
      const nextChallengeKind =
        raceTemplate.challengeKind ?? asyncChallengeKindFromSetup(challengeKind)
      const challengeId = makeChallengeId(nextChallengeKind)
      const request: ChallengeCreateRequest = {
        challengeId,
        challengeKind: nextChallengeKind,
        creatorName: playerName,
        difficulty: raceTemplate.difficulty,
        playMode: raceTemplate.playMode,
        puzzle: raceTemplate.puzzle,
        puzzleSize: raceTemplate.puzzleSize,
        recipientAnonId: challengeRecipient?.anonId,
        recipientName: challengeRecipient?.name,
        requestId: `${challengeId}-${Date.now().toString(36)}`,
        source: raceTemplate.source,
        variantId: raceTemplate.variantId ?? 'classic',
      }
      setChallengeCreateRequest(request)
      setChallengeStatus(
        `Creating ${challengeKindLabel(nextChallengeKind)} link...`,
      )
      setChallengeSetupOpen(false)
      closeMenuModal()
      void navigate({ to: '/challenge/$challengeId', params: { challengeId } })
    },
    [
      activeGame,
      activeMode,
      activeSize,
      challengeKind,
      challengeRecipient,
      closeMenuModal,
      navigate,
      playerName,
      variantId,
    ],
  )

  const handleChallengeCreated = useCallback(
    (challengeId: string, requestId: string) => {
      setChallengeCreateRequest((current) =>
        current?.requestId === requestId ? null : current,
      )
      copyChallengeLink(challengeId)
      setChallengeStatus(
        challengeRecipient
          ? `Direct challenge sent to ${challengeRecipient.name}. Link copied too.`
          : 'Challenge link copied. Send it to a friend.',
      )
    },
    [challengeRecipient, copyChallengeLink],
  )

  const startChallengeRace = useCallback(
    (challenge: ChallengeRace) => {
      const puzzleGrid = parseGrid(challenge.puzzle, challenge.puzzleSize)
      startNewPuzzle(
        puzzleGrid,
        `Started ${challengeKindLabel(challenge.challengeKind)} ${challenge.challengeId}.`,
        `challenge ${challengeKindLabel(challenge.challengeKind)} ${challenge.challengeId}`,
        challenge.difficulty,
        challenge.puzzleSize,
        challenge.playMode,
        createChallengeGameMeta(challenge),
      )
      setChallengeStatus(
        challenge.challengeKind === 'streak'
          ? 'Streak battle started. Bad entries count against you.'
          : 'Race started. The clock is live.',
      )
    },
    [startNewPuzzle],
  )

  const createLiveBattleRoom = useCallback(
    (
      battleKind: LiveBattleKind = 'race',
      template?: {
        difficulty?: PuzzleDifficulty | 'custom'
        playMode: PlayMode
        puzzle: string
        puzzleSize: PuzzleSize
        source: string
        variantId?: VariantId
      },
    ) => {
      if (!hasConvexBackend()) {
        setLiveBattleStatus('Live battles need the Convex backend.')
        setStatusLine('Live battles need the Convex backend.')
        return
      }

      const liveTemplate = template ?? {
        difficulty: activeGame.difficulty,
        playMode: activeMode,
        puzzle: activeGame.puzzle,
        puzzleSize: activeSize,
        source: activeGame.source,
        variantId,
      }
      const roomId = makeLiveBattleId(battleKind)
      const request: LiveBattleCreateRequest = {
        battleKind,
        creatorName: playerName,
        difficulty: liveTemplate.difficulty,
        playMode: liveTemplate.playMode,
        puzzle: liveTemplate.puzzle,
        puzzleSize: liveTemplate.puzzleSize,
        requestId: `${roomId}-${Date.now().toString(36)}`,
        roomId,
        source: liveTemplate.source,
        turnLives: challengeTurnLives,
        turnSeconds: challengeTurnSeconds,
        variantId: liveTemplate.variantId ?? 'classic',
      }
      setLiveBattleCreateRequest(request)
      setLiveBattleStatus(
        battleKind === 'turns'
          ? 'Creating turn battle room...'
          : battleKind === 'coop'
            ? 'Creating co-op room...'
          : 'Creating live battle room...',
      )
      setChallengeSetupOpen(false)
      closeMenuModal()
      void navigate({ to: '/battle/live/$roomId', params: { roomId } })
    },
    [
      activeGame,
      activeMode,
      activeSize,
      challengeTurnLives,
      challengeTurnSeconds,
      closeMenuModal,
      navigate,
      playerName,
      variantId,
    ],
  )

  const createConfiguredChallenge = useCallback(() => {
    const setupKind = challengeKind
    if (challengeSource === 'current') {
      if (isLiveChallengeSetup(setupKind)) {
        createLiveBattleRoom(liveBattleKindFromSetup(setupKind))
      } else {
        createRaceChallenge({
          challengeKind: asyncChallengeKindFromSetup(setupKind),
          difficulty: activeGame.difficulty,
          playMode: activeMode,
          puzzle: activeGame.puzzle,
          puzzleSize: activeSize,
          source: activeGame.source,
          variantId,
        })
      }
      return
    }

    const dateKey = todayDateKey()
    const seed =
      challengeSource === 'daily'
        ? dailySeed(
            challengeDifficulty,
            `vimdoku-${challengeVariant}`,
            dateKey,
            challengeSize,
            challengeMode,
          )
        : Date.now()
    const puzzleGrid = generatePuzzleForVariant(
      challengeDifficulty,
      seed,
      challengeSize,
      challengeVariant,
    )
    const template = {
      difficulty: challengeDifficulty,
      playMode: challengeMode,
      puzzle: gridToString(puzzleGrid, challengeSize),
      puzzleSize: challengeSize,
      source:
        challengeSource === 'daily'
          ? `vimdoku ${challengeSize} ${modeLabel(challengeMode)} ${VARIANTS[challengeVariant].label} daily ${dateKey}`
          : `generated ${challengeSize} ${modeLabel(challengeMode)} ${VARIANTS[challengeVariant].label} ${challengeDifficulty} challenge`,
      variantId: challengeVariant,
    }

    if (isLiveChallengeSetup(setupKind)) {
      createLiveBattleRoom(liveBattleKindFromSetup(setupKind), template)
      return
    }

    createRaceChallenge({
      ...template,
      challengeKind: asyncChallengeKindFromSetup(setupKind),
    })
  }, [
    activeGame,
    activeMode,
    activeSize,
    challengeKind,
    challengeDifficulty,
    challengeMode,
    challengeSize,
    challengeSource,
    challengeVariant,
    createLiveBattleRoom,
    createRaceChallenge,
    variantId,
  ])

  const handleLiveBattleCreated = useCallback(
    (roomId: string, requestId: string) => {
      setLiveBattleCreateRequest((current) =>
        current?.requestId === requestId ? null : current,
      )
      copyLiveBattleLink(roomId)
      setLiveBattleStatus('Live room created. Link copied.')
    },
    [copyLiveBattleLink],
  )

  const startLiveBattle = useCallback(
    (room: LiveBattleRoom) => {
      const label =
        room.battleKind === 'turns'
          ? 'turn battle'
          : room.battleKind === 'coop'
            ? 'co-op'
            : 'live race'
      const puzzleGrid = parseGrid(
        room.battleKind === 'coop' ? (room.sharedGrid ?? room.puzzle) : room.puzzle,
        room.puzzleSize,
      )
      startNewPuzzle(
        puzzleGrid,
        `Joined ${label} ${room.roomId}.`,
        `${label} ${room.roomId}`,
        room.difficulty,
        room.puzzleSize,
        room.playMode,
        createLiveBattleGameMeta(room),
        false,
      )
      setLiveBattleStatus(
        room.battleKind === 'turns'
          ? 'Turn battle joined. Wait for your turn.'
          : room.battleKind === 'coop'
            ? 'Co-op joined. Shared grid is syncing.'
          : 'Live race joined. Presence is updating.',
      )
    },
    [startNewPuzzle],
  )

  useEffect(() => {
    if (!isCoopPlay || !activeLiveBattleRoom?.sharedGrid) return
    const currentGrid = gridToString(grid, activeSize)
    if (activeLiveBattleRoom.sharedGrid === currentGrid) return
    setGrid(parseGrid(activeLiveBattleRoom.sharedGrid, activeSize))
    setStatusLine('Co-op grid synced.')
  }, [activeLiveBattleRoom?.sharedGrid, activeSize, grid, isCoopPlay])

  useEffect(() => {
    if (!routeLiveBattleId || !liveBattleRoom) return
    if (liveBattleRoom.roomId !== routeLiveBattleId) return
    if (liveBattleRoom.battleKind !== 'race') return
    if (liveBattleRoom.status === 'finished') return
    if (activeLiveBattleId === liveBattleRoom.roomId) return
    if (!liveBattleRoom.presence.some((player) => player.anonId === playerId))
      return
    const startsAt =
      liveBattleRoom.status === 'live'
        ? Date.now()
        : liveBattleRoom.raceStartsAt
    if (!startsAt) return

    const key = `${liveBattleRoom.roomId}:${startsAt}`
    if (handledLiveRaceStartRef.current === key) return
    const delay = Math.max(0, startsAt - Date.now())
    const timer = window.setTimeout(() => {
      handledLiveRaceStartRef.current = key
      startLiveBattle(liveBattleRoom)
      setLiveBattleStatus('Race started. First completed grid wins.')
    }, delay)
    return () => window.clearTimeout(timer)
  }, [
    activeLiveBattleId,
    liveBattleRoom,
    playerId,
    routeLiveBattleId,
    startLiveBattle,
  ])

  useEffect(() => {
    if (!activeLiveBattleRoom || activeLiveBattleRoom.battleKind !== 'race')
      return
    if (activeLiveBattleRoom.status !== 'finished') return
    if (!activeLiveBattleRoom.winnerAnonId) return
    const key = `${activeLiveBattleRoom.roomId}:${activeLiveBattleRoom.winnerAnonId}`
    if (handledLiveRaceFinishRef.current === key) return
    handledLiveRaceFinishRef.current = key

    const winner = activeLiveBattleRoom.presence.find(
      (player) => player.anonId === activeLiveBattleRoom.winnerAnonId,
    )
    const won = activeLiveBattleRoom.winnerAnonId === playerId
    const message = won
      ? 'Race finished. You won.'
      : `Race finished. ${winner?.player ?? 'Your opponent'} completed first.`
    setLiveBattleStatus(message)
    setStatusLine(message)
    if (!won && currentRecord.status !== 'completed') {
      setTimerPaused(false)
      setTimerPauseReason(null)
    }
  }, [activeLiveBattleRoom, currentRecord.status, playerId])

  const dashboardSelect = useCallback(
    (key: string) => {
      if (key === 'n') openNewGame()
      else if (key === 'g') openGameLibrary()
      else if (key === 'l') openLeaderboards()
      else if (key === 'r') navigateToPage('challenge')
      else if (key === 'p') goToProfile()
      else if (key === 's') openModalRoute('settings')
      else goToPlay()
    },
    [
      goToPlay,
      goToProfile,
      navigateToPage,
      openGameLibrary,
      openLeaderboards,
      openModalRoute,
      openNewGame,
    ],
  )

  const jumpToNextEmpty = useCallback(
    (direction: 1 | -1) => {
      resumeTimerFromActivity()
      setSelected((index) => {
        for (let step = 1; step <= activeCellCount; step += 1) {
          const next =
            (index + step * direction + activeCellCount * 2) % activeCellCount
          if (grid[next] === 0) return next
        }
        return index
      })
    },
    [activeCellCount, grid, resumeTimerFromActivity],
  )

  const jumpToDigit = useCallback(
    (digit: number, direction: 1 | -1 = 1) => {
      resumeTimerFromActivity()
      setHighlightDigit(digit)
      setSelected((index) => {
        for (let step = 1; step <= activeCellCount; step += 1) {
          const next =
            (index + step * direction + activeCellCount * 2) % activeCellCount
          if (grid[next] === digit) return next
        }
        return index
      })
      setStatusLine(`Highlighting ${digit}. Press Esc to clear.`)
    },
    [activeCellCount, grid, resumeTimerFromActivity],
  )

  const fillAllCandidates = useCallback(() => {
    if (!notesEnabled) {
      setStatusLine('Notes are disabled in speedrun.')
      return
    }
    resumeTimerFromActivity()
    pushHistory()
    setNotes(candidatesAsNotes(grid, activeSize))
    setStatusLine('Annotated every empty cell with current candidates.')
  }, [activeSize, grid, notesEnabled, pushHistory, resumeTimerFromActivity])

  const pruneNotes = useCallback(() => {
    if (!notesEnabled) {
      setStatusLine('Notes are disabled in speedrun.')
      return
    }
    resumeTimerFromActivity()
    pushHistory()
    setNotes((current) => pruneImpossibleNotes(grid, current, activeSize))
    setStatusLine('Removed impossible annotations.')
  }, [activeSize, grid, notesEnabled, pushHistory, resumeTimerFromActivity])

  const clearNotes = useCallback(() => {
    resumeTimerFromActivity()
    pushHistory()
    setNotes(emptyNotes(activeSize))
    setCornerMarks(emptyNotes(activeSize))
    setStatusLine('Cleared annotations.')
  }, [activeSize, pushHistory, resumeTimerFromActivity])

  const runCheck = useCallback(() => {
    const result = checkGrid(grid, activeSize)
    if (!result.ok) {
      setExplicitSelection(new Set(result.issues[0].cells))
      setVisualAnchor(result.issues[0].cells[0])
      setSelected(result.issues[0].cells[1])
      recordSolveEvent({
        cells: result.issues[0].cells,
        detail: result.message,
        kind: 'check',
        label: 'check found conflict',
      })
      setStatusLine(result.message)
      return
    }
    const variantIssues = checkVariant(grid, activeSize, variantId)
    if (variantIssues.length > 0) {
      const issue = variantIssues[0]
      setExplicitSelection(new Set(issue.cells))
      setVisualAnchor(issue.cells[0])
      setSelected(issue.cells[1])
      recordSolveEvent({
        cells: issue.cells,
        detail: issue.message,
        kind: 'check',
        label: 'variant check failed',
      })
      setStatusLine(issue.message)
      return
    }
    recordSolveEvent({
      kind: 'check',
      label: 'check passed',
      detail:
        variantId === 'classic'
          ? result.message
          : `${VARIANTS[variantId].label} constraints hold`,
    })
    setStatusLine(
      variantId === 'classic'
        ? result.message
        : `Check passed: ${VARIANTS[variantId].label} constraints hold.`,
    )
  }, [activeSize, grid, recordSolveEvent, variantId])

  const selectCells = useCallback((cells: Set<number>, message: string) => {
    const ordered = [...cells].sort((a, b) => a - b)
    if (ordered.length === 0) return
    setExplicitSelection(new Set(ordered))
    setVisualAnchor(ordered[0])
    setSelected(ordered[ordered.length - 1])
    setStatusLine(message)
  }, [])

  const placeSolution = useCallback(() => {
    const solution = solveGrid(grid, activeSize)
    if (!solution) {
      setStatusLine('No valid solution from the current board.')
      return
    }
    resumeTimerFromActivity()
    pushHistory()
    setGrid(solution)
    setNotes(emptyNotes(activeSize))
    setStatusLine('Solved the board.')
  }, [activeSize, grid, pushHistory, resumeTimerFromActivity])

  const executeCommand = useCallback(
    (rawCommand: string) => {
      const command = rawCommand.trim().toLowerCase()
      setCommandMode(null)
      setCommandValue('')

      if (!command) {
        setStatusLine('Ready.')
        return
      }

      if (['hint', 'h'].includes(command)) {
        askForHint()
      } else if (['pause', 'timer-pause'].includes(command)) {
        if (!timerPaused) toggleTimerPaused()
      } else if (['resume', 'timer-resume', 'play'].includes(command)) {
        if (timerPaused) toggleTimerPaused()
      } else if (['notes', 'candidates', 'annotate'].includes(command)) {
        fillAllCandidates()
      } else if (['prune', 'prune-notes'].includes(command)) {
        pruneNotes()
      } else if (['clear-notes', 'cn'].includes(command)) {
        clearNotes()
      } else if (['check', 'validate'].includes(command)) {
        runCheck()
      } else if (['rules', 'rule'].includes(command)) {
        openModalRoute('rules')
        setStatusLine('Opened puzzle rules.')
      } else if (['share', 'copy-link', 'puzzle-link'].includes(command)) {
        copyPuzzleLink()
      } else if (
        ['share-state', 'copy-state', 'state-link'].includes(command)
      ) {
        copyStateLink()
      } else if (['select-row', 'row'].includes(command)) {
        selectCells(rowSelection(selected, activeSize), 'Selected current row.')
      } else if (
        ['select-col', 'select-column', 'col', 'column'].includes(command)
      ) {
        selectCells(
          columnSelection(selected, activeSize),
          'Selected current column.',
        )
      } else if (['select-box', 'box'].includes(command)) {
        selectCells(boxSelection(selected, activeSize), 'Selected current box.')
      } else if (['select-all', 'all'].includes(command)) {
        selectCells(
          new Set(Array.from({ length: activeCellCount }, (_, index) => index)),
          'Selected every cell.',
        )
      } else if (
        command.startsWith('color ') ||
        command.startsWith('colour ')
      ) {
        const value = command.split(/\s+/)[1]
        if (value === 'clear') applyColor(null)
        else {
          const index = Number(value) - 1
          if (index >= 0 && index < CELL_COLORS.length) applyColor(index)
          else setStatusLine(`Unknown colour: ${value}`)
        }
      } else if (['tool-digit', 'digit-tool'].includes(command)) {
        chooseToolMode('digit')
      } else if (
        ['tool-notes', 'tool-center', 'centre', 'center'].includes(command)
      ) {
        chooseToolMode('center')
      } else if (['tool-corner', 'corner'].includes(command)) {
        chooseToolMode('corner')
      } else if (
        ['tool-color', 'tool-colour', 'color', 'colour'].includes(command)
      ) {
        chooseToolMode('color')
      } else if (
        command === 'variant anti-knight' ||
        command === 'anti-knight'
      ) {
        chooseVariant('anti-knight')
        setStatusLine('Anti-knight rules active for checks.')
      } else if (command === 'variant anti-king' || command === 'anti-king') {
        chooseVariant('anti-king')
        setStatusLine('Anti-king rules active for checks.')
      } else if (command === 'variant diagonal' || command === 'diagonal') {
        chooseVariant('diagonal')
        setStatusLine('Diagonal rules active for checks.')
      } else if (
        command === 'variant non-consecutive' ||
        command === 'non-consecutive'
      ) {
        chooseVariant('non-consecutive')
        setStatusLine('Non-consecutive rules active for checks.')
      } else if (command === 'variant classic' || command === 'classic') {
        chooseVariant('classic')
        setStatusLine('Classic rules active.')
      } else if (
        ['noh', 'nohlsearch', 'clear-hints', 'clear-hint'].includes(command)
      ) {
        clearHintState()
      } else if (
        ['hints-off', 'hint-off', 'nohint', 'nohints'].includes(command)
      ) {
        clearHintState(true)
      } else if (['reset'].includes(command)) {
        resetPuzzle()
        setStatusLine('Reset player entries.')
      } else if (['menu', 'm'].includes(command)) {
        openModalRoute('menu')
        setStatusLine('Opened menu.')
      } else if (['dashboard', 'start', 'home'].includes(command)) {
        goToDashboard()
        setStatusLine('Opened dashboard.')
      } else if (['new', 'new-game'].includes(command)) {
        openNewGame()
      } else if (['daily', 'today'].includes(command)) {
        openDailyPuzzle(
          newGameDifficulty,
          todayDateKey(),
          newGameSize,
          newGameMode,
        )
        setStatusLine(
          `Opening today's ${newGameSize} ${newGameMode} ${newGameDifficulty} daily.`,
        )
      } else if (['yesterday', 'daily-yesterday'].includes(command)) {
        openDailyPuzzle(
          newGameDifficulty,
          offsetDateKey(-1),
          newGameSize,
          newGameMode,
        )
        setStatusLine(
          `Opening yesterday's ${newGameSize} ${newGameMode} ${newGameDifficulty} daily.`,
        )
      } else if (['games', 'history', 'ls'].includes(command)) {
        openGameLibrary()
      } else if (
        ['leaderboard', 'leaderboards', 'scores', 'lb'].includes(command)
      ) {
        openLeaderboards()
      } else if (['challenge', 'race', 'versus', 'vs'].includes(command)) {
        navigateToPage('challenge')
      } else if (['profile', 'me', 'account'].includes(command)) {
        goToProfile()
      } else if (['clear', 'blank'].includes(command)) {
        clearAll()
        setStatusLine('Started a blank board.')
      } else if (['import', 'image'].includes(command)) {
        fileInputRef.current?.click()
        setStatusLine('Choose a puzzle image to import.')
      } else if (['tools', 'tool'].includes(command)) {
        openModalRoute('tools')
        setStatusLine('Opened tools.')
      } else if (
        ['theme', 'colorscheme', 'colors', 'colours'].includes(command)
      ) {
        openModalRoute('theme')
        setStatusLine('Opened colorscheme.')
      } else if (['settings'].includes(command)) {
        openModalRoute('settings')
        setStatusLine('Opened settings.')
      } else if (['solve'].includes(command)) {
        placeSolution()
      } else if (command.startsWith('/')) {
        const digit = Number(command.slice(1, 2))
        if (digit >= 1 && digit <= activeConfig.size) jumpToDigit(digit)
      } else {
        setStatusLine(`Unknown command: ${rawCommand}`)
      }
    },
    [
      activeConfig.size,
      activeCellCount,
      askForHint,
      activeSize,
      applyColor,
      selected,
      copyPuzzleLink,
      copyStateLink,
      chooseToolMode,
      chooseVariant,
      clearAll,
      clearHintState,
      clearNotes,
      fillAllCandidates,
      goToDashboard,
      goToProfile,
      jumpToDigit,
      navigateToPage,
      newGameDifficulty,
      newGameMode,
      newGameSize,
      openGameLibrary,
      openLeaderboards,
      openDailyPuzzle,
      openModalRoute,
      openNewGame,
      placeSolution,
      pruneNotes,
      resetPuzzle,
      runCheck,
      selectCells,
      timerPaused,
      toggleTimerPaused,
    ],
  )

  useEffect(() => {
    if (!showDashboard) return

    function onDashboardKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase()
      if (key === 'escape') {
        event.preventDefault()
        goToPlay()
        return
      }
      if (key === 'enter') {
        event.preventDefault()
        startGeneratedPuzzle(
          dashboardDifficulty,
          true,
          dashboardSize,
          dashboardMode,
        )
        return
      }
      if (key === '1' || key === '2' || key === '3') {
        event.preventDefault()
        setDashboardDifficulty(
          key === '1' ? 'easy' : key === '2' ? 'medium' : 'hard',
        )
        return
      }
      if (key === '6' || key === '9') {
        event.preventDefault()
        setDashboardSize(key === '6' ? '6x6' : '9x9')
        return
      }
      if (DASHBOARD_ACTIONS.some(([actionKey]) => actionKey === key)) {
        event.preventDefault()
        dashboardSelect(key)
      }
    }

    window.addEventListener('keydown', onDashboardKeyDown)
    return () => window.removeEventListener('keydown', onDashboardKeyDown)
  }, [
    dashboardDifficulty,
    dashboardMode,
    dashboardSize,
    dashboardSelect,
    goToPlay,
    showDashboard,
    startGeneratedPuzzle,
  ])

  useEffect(() => {
    if (!showSolved) return

    function onSolvedKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return
      const key = event.key.toLowerCase()
      if (key === 'escape' || key === 'q') {
        event.preventDefault()
        setSolvedDismissed(true)
      }
    }

    window.addEventListener('keydown', onSolvedKeyDown)
    return () => window.removeEventListener('keydown', onSolvedKeyDown)
  }, [showSolved])

  useEffect(() => {
    if (!activeMenuModal) return

    function onModalKeyDown(event: KeyboardEvent) {
      if (
        event.key === 'Escape' ||
        (event.key.toLowerCase() === 'q' && !isTypingTarget(event.target))
      ) {
        event.preventDefault()
        closeMenuModal()
      }
    }

    window.addEventListener('keydown', onModalKeyDown)
    return () => window.removeEventListener('keydown', onModalKeyDown)
  }, [activeMenuModal, closeMenuModal])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (review) return
      if (showSolved) return
      if (
        showBoard &&
        !activeMenuModal &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'p'
      ) {
        event.preventDefault()
        pendingKeyRef.current = ''
        setVisualAnchor(null)
        setExplicitSelection(null)
        setCommandMode(null)
        setCommandValue('')
        openGamePicker()
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'm') {
        event.preventDefault()
        pendingKeyRef.current = ''
        setVisualAnchor(null)
        setExplicitSelection(null)
        setCommandMode(null)
        setCommandValue('')
        if (activeMenuModal === 'menu') closeMenuModal()
        else openModalRoute('menu')
        return
      }
      if (gamePickerOpen) {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeGamePicker()
          setStatusLine('Closed puzzle picker.')
        }
        return
      }
      if (!showBoard) return
      if (activeMenuModal) return
      if (commandMode) return
      if (isTypingTarget(event.target)) return

      if (event.ctrlKey && !event.metaKey) {
        const ctrlKey = event.key.toLowerCase()
        if (ctrlKey === 'r') {
          event.preventDefault()
          redo()
          return
        }
        if (ctrlKey === 'd') {
          event.preventDefault()
          moveSelection(3, 0)
          return
        }
        if (ctrlKey === 'u') {
          event.preventDefault()
          moveSelection(-3, 0)
          return
        }
      }

      if (visualCells) {
        const visualKey = event.key.toLowerCase()
        if (event.key === 'Escape' || visualKey === 'v') {
          event.preventDefault()
          pendingKeyRef.current = ''
          setVisualAnchor(null)
          setExplicitSelection(null)
          setToolMode('digit')
          setNoteMode(false)
          setStatusLine('Visual mode off. Digit mode restored.')
          return
        }
        const visualDigit = digitFromKeyEvent(event)
        if (visualDigit >= 1 && visualDigit <= activeConfig.size) {
          event.preventDefault()
          if (event.altKey || toolMode === 'color') {
            applyColor((visualDigit - 1) % CELL_COLORS.length)
          } else if (toolMode === 'digit' && !event.shiftKey) {
            setCell(visualDigit)
          } else if (toolMode === 'center' || noteMode) {
            toggleNote(visualDigit)
          } else {
            toggleCornerMark(visualDigit)
          }
          return
        }
        if (['backspace', 'delete'].includes(visualKey)) {
          event.preventDefault()
          clearCellsCompletely()
          return
        }
        if (['0', 'x'].includes(visualKey)) {
          event.preventDefault()
          if (toolMode === 'color') applyColor(null)
          else if (toolMode === 'digit' && !event.shiftKey) setCell(0)
          else if (toolMode === 'center' || noteMode) clearNotesAcrossBlock()
          else clearCornerMarksAcrossSelection()
          return
        }
        // Movement keys fall through to the normal handler below so the
        // cursor — and therefore the selection rectangle — keeps moving.
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenuModal()
        pendingKeyRef.current = ''
        setLeaderPending(false)
        clearHintState()
        return
      }

      // Leader sequences — Space is leader, LazyVim-style.
      if (pendingKeyRef.current === 'leader') {
        pendingKeyRef.current = ''
        setLeaderPending(false)
        const leaderKey = event.key.toLowerCase()
        event.preventDefault()
        if (leaderKey === 'e') {
          setSidebarOpen((current) => {
            setStatusLine(current ? 'Sidebar hidden.' : 'Sidebar shown.')
            return !current
          })
        } else if (leaderKey === 'h') {
          setHintRailOpen((current) => {
            setStatusLine(
              current ? 'Hint engine hidden.' : 'Hint engine shown.',
            )
            return !current
          })
        } else if (leaderKey === 'n') {
          openNewGame()
        } else if (leaderKey === 'g') {
          openGamePicker()
        } else if (leaderKey === 'l') {
          openLeaderboards()
        } else if (leaderKey === 'p') {
          goToProfile()
        } else if (leaderKey === 'i') {
          fileInputRef.current?.click()
          setStatusLine('Choose a puzzle image to import.')
        } else if (leaderKey === 's') {
          openModalRoute('settings')
        } else if (leaderKey === 't') {
          openModalRoute('tools')
        } else if (leaderKey === 'c') {
          openModalRoute('theme')
        } else if (leaderKey === 'm') {
          openModalRoute('menu')
        } else {
          setStatusLine('Leader cancelled.')
        }
        return
      }

      if (event.key === ' ') {
        event.preventDefault()
        pendingKeyRef.current = 'leader'
        setLeaderPending(true)
        return
      }

      if (event.key === ':') {
        event.preventDefault()
        pendingKeyRef.current = ''
        openCommand('command')
        return
      }

      if (event.key === '/') {
        event.preventDefault()
        pendingKeyRef.current = ''
        openCommand('search')
        return
      }

      const numeric = digitFromKeyEvent(event)
      if (numeric >= 1 && numeric <= CELL_COLORS.length && event.altKey) {
        event.preventDefault()
        applyColor(numeric - 1)
        return
      }
      if (
        pendingKeyRef.current === 'f' &&
        numeric >= 1 &&
        numeric <= activeConfig.size
      ) {
        event.preventDefault()
        pendingKeyRef.current = ''
        jumpToDigit(numeric)
        return
      }

      if (numeric >= 1 && numeric <= activeConfig.size) {
        event.preventDefault()
        if (toolMode === 'color') {
          applyColor((numeric - 1) % CELL_COLORS.length)
        } else if (event.shiftKey || toolMode === 'corner') {
          toggleCornerMark(numeric)
        } else if (noteMode || toolMode === 'center') {
          toggleNote(numeric)
        } else {
          setCell(numeric)
        }
        return
      }

      if (event.key === 'G') {
        event.preventDefault()
        pendingKeyRef.current = ''
        setSelected(activeCellCount - 1)
        setStatusLine('Jumped to the last cell.')
        return
      }

      if (event.key === 'P') {
        event.preventDefault()
        pendingKeyRef.current = ''
        toggleTimerPaused()
        return
      }

      const key = event.key.toLowerCase()
      if (pendingKeyRef.current === 'g') {
        pendingKeyRef.current = ''
        if (key === 'g') {
          event.preventDefault()
          setSelected(0)
          setStatusLine('Jumped to the first cell.')
          return
        }
      }

      const movement: Record<string, [number, number]> = {
        h: [0, -1],
        arrowleft: [0, -1],
        j: [1, 0],
        arrowdown: [1, 0],
        k: [-1, 0],
        arrowup: [-1, 0],
        l: [0, 1],
        arrowright: [0, 1],
      }

      // Shift+hjkl jumps a whole box in that direction.
      if (event.shiftKey && ['h', 'j', 'k', 'l'].includes(key)) {
        event.preventDefault()
        const [deltaRow, deltaCol] = movement[key]
        moveSelection(
          deltaRow * activeConfig.boxRows,
          deltaCol * activeConfig.boxCols,
        )
        return
      }

      if (movement[key]) {
        event.preventDefault()
        moveSelection(...movement[key])
        return
      }

      if (['backspace', 'delete'].includes(key)) {
        event.preventDefault()
        clearCellsCompletely()
      } else if (['0', 'x'].includes(key)) {
        event.preventDefault()
        if (toolMode === 'color') applyColor(null)
        else if (event.shiftKey || toolMode === 'corner')
          clearCornerMarksAcrossSelection()
        else if (toolMode === 'center' || noteMode) clearNotesAcrossBlock()
        else setCell(0)
      } else if (key === 'n') {
        event.preventDefault()
        if (notesEnabled) {
          setNoteMode((current) => {
            const next = !current
            setToolMode(next ? 'center' : 'digit')
            return next
          })
        } else setStatusLine('Notes are disabled in speedrun.')
      } else if (key === 'z') {
        event.preventDefault()
        chooseToolMode('digit')
      } else if (key === 'm') {
        event.preventDefault()
        chooseToolMode('center')
      } else if (key === 'a') {
        event.preventDefault()
        chooseToolMode('corner')
      } else if (key === 'c') {
        event.preventDefault()
        chooseToolMode('color')
      } else if (key === 'u') {
        event.preventDefault()
        undo()
      } else if (key === '?') {
        event.preventDefault()
        if (hintsEnabled) {
          setHintRailOpen(true)
          askForHint()
        } else {
          setStatusLine('Hints are disabled in speedrun.')
        }
      } else if (key === 'w') {
        event.preventDefault()
        pendingKeyRef.current = ''
        jumpToNextEmpty(1)
      } else if (key === 'b') {
        event.preventDefault()
        pendingKeyRef.current = ''
        jumpToNextEmpty(-1)
      } else if (key === 'g') {
        event.preventDefault()
        pendingKeyRef.current = 'g'
        setStatusLine('g...')
      } else if (key === 'f') {
        event.preventDefault()
        pendingKeyRef.current = 'f'
        setStatusLine('f...')
      } else if (key === 'v') {
        event.preventDefault()
        pendingKeyRef.current = ''
        setExplicitSelection(null)
        setVisualAnchor(selected)
        setNoteMode(false)
        setToolMode('corner')
        setStatusLine(
          `VISUAL — numbers mark corners, z digit, m centre, c colour.`,
        )
      } else if (key === '}') {
        event.preventDefault()
        pendingKeyRef.current = ''
        moveBox(1)
      } else if (key === '{') {
        event.preventDefault()
        pendingKeyRef.current = ''
        moveBox(-1)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    activeCellCount,
    activeConfig,
    applyColor,
    askForHint,
    chooseToolMode,
    clearCellsCompletely,
    clearCornerMarksAcrossSelection,
    clearHintState,
    clearNotesAcrossBlock,
    closeMenuModal,
    closeGamePicker,
    commandMode,
    gamePickerOpen,
    goToProfile,
    hintsEnabled,
    jumpToDigit,
    jumpToNextEmpty,
    activeMenuModal,
    moveBox,
    moveSelection,
    notesEnabled,
    noteMode,
    openGamePicker,
    openLeaderboards,
    openModalRoute,
    openNewGame,
    openCommand,
    redo,
    review,
    setCell,
    selected,
    showBoard,
    showSolved,
    toolMode,
    toggleCornerMark,
    toggleTimerPaused,
    toggleNote,
    undo,
    visualCells,
  ])

  useEffect(() => {
    if (!review) return

    function onReviewKeyDown(event: KeyboardEvent) {
      const numeric = digitFromKeyEvent(event)
      if (numeric >= 1 && numeric <= 9) {
        event.preventDefault()
        setReview(
          (current) =>
            current?.map((cell, index) =>
              index === reviewSelected ? { ...cell, value: numeric } : cell,
            ) ?? null,
        )
        setReviewSelected((index) => Math.min(80, index + 1))
        return
      }

      const key = event.key.toLowerCase()
      if (['0', 'backspace', 'delete', 'x'].includes(key)) {
        event.preventDefault()
        setReview(
          (current) =>
            current?.map((cell, index) =>
              index === reviewSelected ? { ...cell, value: 0 } : cell,
            ) ?? null,
        )
        return
      }

      const movement: Record<string, [number, number]> = {
        h: [0, -1],
        arrowleft: [0, -1],
        j: [1, 0],
        arrowdown: [1, 0],
        k: [-1, 0],
        arrowup: [-1, 0],
        l: [0, 1],
        arrowright: [0, 1],
      }

      if (movement[key]) {
        event.preventDefault()
        setReviewSelected((index) => {
          const [deltaRow, deltaCol] = movement[key]
          const row = Math.max(0, Math.min(8, Math.floor(index / 9) + deltaRow))
          const col = Math.max(0, Math.min(8, (index % 9) + deltaCol))
          return row * 9 + col
        })
      }
    }

    window.addEventListener('keydown', onReviewKeyDown)
    return () => window.removeEventListener('keydown', onReviewKeyDown)
  }, [review, reviewSelected])

  async function importImage(file: File) {
    setReview(null)
    setImageUrl(URL.createObjectURL(file))
    setOcrStatus('Preparing image')

    try {
      const cells = await recognizeSudokuImage(file, (done, total) => {
        setOcrStatus(`Reading cells ${done}/${total}`)
      })
      setReview(cells)
      setReviewSelected(0)
      setOcrStatus('')
    } catch (error) {
      setOcrStatus(
        error instanceof Error ? error.message : 'Could not read image',
      )
    }
  }

  function acceptReview() {
    if (!review) return
    startNewPuzzle(
      review.map((cell) => cell.value),
      'Loaded image import.',
      'image import',
      'custom',
      '9x9',
      newGameMode,
    )
    setReview(null)
    setImageUrl(null)
  }

  return (
    <main
      className="relative min-h-screen bg-[var(--app-bg)] text-[var(--app-text)] lg:h-screen lg:overflow-hidden"
      style={themeStyle}
    >
      <div
        aria-hidden="true"
        className="crt-overlay pointer-events-none fixed inset-0 z-[8]"
      />
      {hasConvexBackend() && (
        <>
          <ConvexBridge
            currentRecord={currentRecord}
            gameRecords={trackedGameRecords}
            guestId={guestId}
            leaderboardMode={leaderboardMode}
            leaderboardOpen={activePage === 'leaderboards'}
            leaderboardSize={leaderboardSize}
            leaderboardVariant={leaderboardVariant}
            onProfile={setCloudProfile}
            onScores={setGlobalScores}
            onStats={setCloudStats}
            onStatus={setLeaderboardStatus}
            playerName={playerName}
            scoreRecordId={showSolved ? currentRecord.id : null}
            scoreSubmissionsEnabled={
              Boolean(cloudProfile?.authSubject) &&
              hasCustomPlayerName &&
              scoreEnabled &&
              solvedNamePromptGameId !== currentRecord.id
            }
          />
          <ChallengeBridge
            activeChallengeId={activeChallengeId}
            anonId={playerId}
            challengeId={routeChallengeId}
            createRequest={challengeCreateRequest}
            currentRecord={currentRecord}
            currentMistakes={challengeMistakes}
            onChallenge={(nextChallenge) => {
              setChallengeRace(nextChallenge)
              setChallengeStatus(
                nextChallenge
                  ? ''
                  : routeChallengeId
                    ? 'Challenge not found.'
                    : '',
              )
            }}
            onCreateResult={handleChallengeCreated}
            onStatus={setChallengeStatus}
            playerName={playerName}
          />
          <LiveBattleBridge
            activeRoomId={activeLiveBattleId}
            anonId={playerId}
            createRequest={liveBattleCreateRequest}
            currentGrid={gridToString(grid, activeSize)}
            currentMistakes={challengeMistakes}
            currentRecord={currentRecord}
            onCreateResult={handleLiveBattleCreated}
            onRoom={(nextRoom) => {
              setLiveBattleRoom(nextRoom)
              setLiveBattleStatus(
                nextRoom
                  ? ''
                  : routeLiveBattleId
                    ? 'Live battle not found.'
                    : '',
              )
            }}
            onStatus={setLiveBattleStatus}
            onTurnRequestHandled={(requestId) => {
              setLiveBattleTurnRequest((current) =>
                current?.requestId === requestId ? null : current,
              )
            }}
            playerName={playerName}
            roomId={routeLiveBattleId}
            selectedCell={selected}
            turnRequest={liveBattleTurnRequest}
          />
        </>
      )}
      {showDashboard && (
        <DashboardPage
          difficulty={dashboardDifficulty}
          localStats={localProfileStats}
          mode={dashboardMode}
          notifications={headerNotifications}
          onModeChange={setDashboardMode}
          onSizeChange={setDashboardSize}
          onDifficultyChange={setDashboardDifficulty}
          onPlay={() =>
            startGeneratedPuzzle(
              dashboardDifficulty,
              true,
              dashboardSize,
              dashboardMode,
            )
          }
          onSelect={dashboardSelect}
          puzzleSize={dashboardSize}
        />
      )}

      {activePage === 'games' && (
        <AppPageFrame
          extraActions={headerNotifications}
          onOpenMenu={() => openModalRoute('menu')}
          title="puzzle log"
        >
          <GameLibrary
            activeGameId={activeGame.id}
            completedCount={completedGames.length}
            filter={gameLibraryFilter}
            inProgressCount={inProgressGames.length}
            onDelete={deleteGame}
            onFilterChange={setGameLibraryFilter}
            onQueryChange={setGameLibraryQuery}
            onResume={resumeGame}
            query={gameLibraryQuery}
            records={libraryGameRecords}
            totalCount={gameFinderRecords.length}
          />
        </AppPageFrame>
      )}

      {activePage === 'new' && (
        <AppPageFrame
          extraActions={headerNotifications}
          onOpenMenu={() => openModalRoute('menu')}
          title="new game"
        >
          <NewGamePanel
            dailyRecord={findDailyRecord(
              gameFinderRecords,
              newGameDifficulty,
              dailyDateKey,
              newGameSize,
              newGameMode,
            )}
            dateKey={dailyDateKey}
            difficulty={newGameDifficulty}
            isFetchingPuzzle={isFetchingPuzzle}
            mode={newGameMode}
            variant={newGameVariant}
            onDateChange={setDailyDateKey}
            onDifficultyChange={setNewGameDifficulty}
            onModeChange={setNewGameMode}
            onVariantChange={setNewGameVariant}
            onSizeChange={setNewGameSize}
            onImage={() => fileInputRef.current?.click()}
            onLoadPasted={startPastedPuzzle}
            onLocal={() =>
              startGeneratedPuzzle(
                newGameDifficulty,
                false,
                newGameSize,
                newGameMode,
              )
            }
            onMountain={() => void fetchSudokuMountainPuzzle(false)}
            onMountainDaily={() => void fetchSudokuMountainPuzzle(true)}
            onPuzzleTextChange={setNewPuzzleText}
            onOpenDaily={(selectedDateKey) => {
              openDailyPuzzle(
                newGameDifficulty,
                selectedDateKey,
                newGameSize,
                newGameMode,
              )
              closeMenuModal()
              setNewGameStatus('')
            }}
            onToday={() => setDailyDateKey(todayDateKey())}
            onYesterday={() => {
              setDailyDateKey(offsetDateKey(-1))
              openDailyPuzzle(
                newGameDifficulty,
                offsetDateKey(-1),
                newGameSize,
                newGameMode,
              )
              closeMenuModal()
              setNewGameStatus('')
            }}
            puzzleText={newPuzzleText}
            puzzleSize={newGameSize}
            status={newGameStatus}
          />
        </AppPageFrame>
      )}

      {activePage === 'leaderboards' && (
        <AppPageFrame
          extraActions={headerNotifications}
          onOpenMenu={() => openModalRoute('menu')}
          title="leaderboards"
        >
          <Leaderboards
            completedGames={completedGames}
            globalScores={globalScores}
            indexMode={leaderboardFilters.mode}
            indexSize={leaderboardFilters.size}
            indexVariant={leaderboardFilters.variant}
            localScores={localLeaderboard}
            playerName={playerName}
            scope={leaderboardScope}
            scopedGlobalScores={visibleGlobalLeaderboard}
            status={leaderboardStatus}
          />
        </AppPageFrame>
      )}

      {activePage === 'challenge' && (
        <AppPageFrame
          extraActions={headerNotifications}
          onOpenMenu={() => openModalRoute('menu')}
          title="challenge"
        >
          {routeChallengeId ? (
            <ChallengeRacePanel
              activeChallengeId={activeChallengeId}
              challenge={challengeRace}
              challengeId={routeChallengeId}
              isCurrentSolved={
                Boolean(
                  activeChallengeId && activeChallengeId === routeChallengeId,
                ) && currentRecord.status === 'completed'
              }
              onContinue={goToPlay}
              onCopyLink={() => {
                if (routeChallengeId) copyChallengeLink(routeChallengeId)
              }}
              onStart={startChallengeRace}
              shareUrl={challengeShareUrl}
              status={challengeStatus}
            />
          ) : routeChallengeResults ? (
            hasConvexBackend() ? (
              <ChallengeResultsView
                anonId={playerId}
                onCopyLink={copyChallengeLink}
                onCopyLiveBattle={copyLiveBattleLink}
                onNewChallenge={() => openChallengeSetup('race')}
                onOpenChallenge={(challengeId) => {
                  void navigate({
                    to: '/challenge/$challengeId',
                    params: { challengeId },
                  })
                }}
                onOpenLiveBattle={(roomId) => {
                  void navigate({
                    to: '/battle/live/$roomId',
                    params: { roomId },
                  })
                }}
              />
            ) : (
              <section className="border border-[var(--border)] bg-[var(--input-bg)] p-5">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
                  challenge results offline
                </p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
                  Challenge results use Convex so matches can sync between
                  players.
                </p>
              </section>
            )
          ) : (
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
              {hasConvexBackend() ? (
                <ChallengeHistoryPanel
                  anonId={playerId}
                  onCopyLink={copyChallengeLink}
                  onOpenResults={() =>
                    void navigate({ to: '/challenge/results' })
                  }
                  onOpenChallenge={(challengeId) => {
                    void navigate({
                      to: '/challenge/$challengeId',
                      params: { challengeId },
                    })
                  }}
                />
              ) : (
                <section className="border border-[var(--border)] bg-[var(--input-bg)] p-5">
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
                    my challenges offline
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
                    Challenge history uses Convex so links and results can sync
                    between players.
                  </p>
                </section>
              )}
              <section className="border border-[var(--border)] bg-[var(--input-bg)]">
                <header className="border-b border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
                  [challenge-actions]
                </header>
                <div className="space-y-3 p-3">
                  {(
                    [
                      ['race', 'race', 'two-player live race with countdown'],
                      [
                        'streak',
                        'streak battle',
                        'async race with misses tracked',
                      ],
                      [
                        'live-turns',
                        'turn battle',
                        'take turns with lives and a clock',
                      ],
                      [
                        'coop',
                        'co-op',
                        'solve one shared grid together',
                      ],
                    ] as [ChallengeSetupKind, string, string][]
                  ).map(([kind, label, description]) => (
                    <button
                      type="button"
                      key={kind}
                      className={`w-full border px-4 py-3 text-left font-mono transition active:translate-y-px ${
                        kind === 'race'
                          ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
                          : 'border-[var(--border)] bg-[var(--button-bg)] text-[var(--app-text)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                      }`}
                      onClick={() => openChallengeSetup(kind)}
                    >
                      <span className="block text-xs font-black uppercase tracking-[0.16em]">
                        {label}
                      </span>
                      <span
                        className={`mt-1 block text-xs leading-relaxed ${
                          kind === 'race'
                            ? 'text-[var(--app-bg)] opacity-80'
                            : 'text-[var(--muted)]'
                        }`}
                      >
                        {description}
                      </span>
                    </button>
                  ))}
                  <p className="text-sm leading-relaxed text-[var(--muted)]">
                    Pick a challenge type first, then tune the puzzle source,
                    board, mode, variant, and difficulty.
                  </p>
                  {challengeStatus && (
                    <p className="border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.14em] text-[var(--accent)]">
                      {challengeStatus}
                    </p>
                  )}
                </div>
              </section>
            </div>
          )}
        </AppPageFrame>
      )}

      {activePage === 'live-battle' && !isLiveBattlePlay && (
        <AppPageFrame
          extraActions={headerNotifications}
          onOpenMenu={() => openModalRoute('menu')}
          title="live battle"
        >
          <LiveBattleRoomPanel
            activeRoomId={activeLiveBattleId}
            currentAnonId={playerId}
            isCurrentSolved={
              Boolean(
                activeLiveBattleId && activeLiveBattleId === routeLiveBattleId,
              ) && currentRecord.status === 'completed'
            }
            onContinue={goToPlay}
            onCopyLink={() => {
              if (routeLiveBattleId) copyLiveBattleLink(routeLiveBattleId)
            }}
            onStart={startLiveBattle}
            room={liveBattleRoom}
            roomId={routeLiveBattleId}
            shareUrl={liveBattleShareUrl}
            status={liveBattleStatus}
          />
        </AppPageFrame>
      )}

      {activePage === 'profile' && (
        <AppPageFrame
          extraActions={headerNotifications}
          onOpenMenu={() => openModalRoute('menu')}
          title={publicFriendCode ? 'player profile' : 'profile'}
        >
          {publicFriendCode ? (
            hasConvexBackend() ? (
              <PublicProfilePanel
                friendCode={publicFriendCode}
                onBack={goToProfile}
                onChallenge={(profile) => {
                  navigateToPage('challenge')
                  openChallengeSetup('race', {
                    anonId: profile.anonId,
                    friendCode: profile.friendCode,
                    name: profile.name,
                  })
                }}
                viewerAnonId={playerId}
              />
            ) : (
              <PublicProfileOffline onBack={goToProfile} />
            )
          ) : (
            <ProfilePanel
              cloudProfile={cloudProfile}
              cloudStats={cloudStats}
              guestId={playerId}
              localStats={localProfileStats}
              onChallengeFriend={(friend) => {
                navigateToPage('challenge')
                openChallengeSetup('race', friend)
              }}
              onNameChange={updatePlayerName}
              onViewFriendProfile={(friend) =>
                openPublicProfile(friend.friendCode)
              }
              playerName={playerName}
            />
          )}
        </AppPageFrame>
      )}

      {showBoard && (
        <section className="flex h-[100dvh] min-h-[100dvh] overflow-hidden flex-col bg-[var(--workspace-bg)] font-mono lg:h-screen lg:min-h-screen">
          <AppShellHeader
            onHome={goToDashboard}
            onMenu={() => openModalRoute('menu')}
            title={`${labelCell(selected, activeSize)} · ${completion}/${activeCellCount}`}
            extraActions={
              <>
                {headerNotifications}
                <button
                  type="button"
                  aria-label="Rules"
                  title="Rules"
                  onClick={() => openModalRoute('rules')}
                  className="grid h-9 w-9 place-items-center border border-[var(--border)] bg-[var(--button-bg)] text-[var(--app-text)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] active:translate-y-px"
                >
                  <FileText size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Colorscheme"
                  title="Colorscheme"
                  onClick={() => openModalRoute('theme')}
                  className="grid h-9 w-9 place-items-center border border-[var(--border)] bg-[var(--button-bg)] text-[var(--app-text)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] active:translate-y-px"
                >
                  <Palette size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Tools"
                  title="Tools"
                  onClick={() => openModalRoute('tools')}
                  className="grid h-9 w-9 place-items-center border border-[var(--border)] bg-[var(--button-bg)] text-[var(--app-text)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] active:translate-y-px"
                >
                  <Wrench size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Hint"
                  title="Hint"
                  disabled={!hintsEnabled}
                  onClick={() => {
                    if (!hintsEnabled) return
                    resumeTimerFromActivity()
                    setHintRailOpen(true)
                    askForHint()
                  }}
                  className="grid h-9 w-9 place-items-center border border-[var(--border)] bg-[var(--button-bg)] font-mono text-sm font-bold text-[var(--accent)] transition hover:border-[var(--accent)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ?
                </button>
              </>
            }
          />
          <div
            className="grid min-h-0 w-full flex-1 overflow-hidden grid-cols-1 transition-[grid-template-columns] duration-300 ease-out lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)_var(--hint-rail-width)] lg:grid-rows-[minmax(0,1fr)]"
            style={
              {
                '--sidebar-width': sidebarOpen ? '340px' : '0px',
                '--hint-rail-width': hintRailOpen ? '360px' : '0px',
              } as CSSProperties
            }
          >
            <section
              className="column-rise relative order-2 flex min-h-0 flex-col justify-between overflow-hidden border-[var(--border)] bg-[var(--workspace-bg)] lg:border-l"
              style={{ animationDelay: '80ms' }}
            >
              <button
                type="button"
                aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
                title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
                onClick={() => {
                  setSidebarOpen((current) => {
                    setStatusLine(
                      current ? 'Sidebar hidden.' : 'Sidebar shown.',
                    )
                    return !current
                  })
                }}
                className="absolute bottom-20 left-0 z-50 hidden h-12 w-5 border-y border-r border-[var(--border)] bg-[var(--status-bg)] font-mono text-[0.65rem] font-black text-[var(--muted)] shadow-[1px_0_0_var(--app-bg)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] lg:grid lg:place-items-center"
              >
                {sidebarOpen ? '<' : '>'}
              </button>

              <div
                className={`relative grid min-h-0 flex-1 place-items-center overflow-hidden px-2 py-2 sm:px-5 sm:py-3 lg:px-8 lg:py-4 ${
                  boardObscured ? 'cursor-not-allowed' : ''
                }`}
                style={battleImpactStyle}
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-10 bg-[var(--danger)] mix-blend-screen"
                  style={battleImpactFlashStyle}
                />
                <div
                  className={`w-full max-w-[min(64dvh,calc(100dvh-276px),820px,100%)] transition duration-200 sm:max-w-[min(76vh,calc(100vh-176px),820px,100%)] ${
                    timerPaused
                      ? 'scale-[0.98] blur-md brightness-50'
                      : liveRaceLost
                        ? 'scale-[0.98] brightness-50'
                        : ''
                  }`}
                  aria-hidden={boardObscured}
                >
                  <section
                    className="board-settle grid aspect-square border-4 border-[var(--grid-line)] bg-[var(--grid-line)]"
                    style={{
                      gridTemplateColumns: `repeat(${activeConfig.size}, minmax(0, 1fr))`,
                    }}
                    aria-label={`${activeSize} Sudoku board`}
                  >
                    {grid.map((value, index) => {
                      const opponentNames = liveOpponentCursors.get(index) ?? []
                      const hasOpponentCursor = opponentNames.length > 0
                      return (
                        <button
                          type="button"
                          key={labelCell(index, activeSize)}
                          aria-label={`${labelCell(index, activeSize)} ${value || 'empty'}${
                            hasOpponentCursor
                              ? ` opponent ${opponentNames.join(', ')}`
                              : ''
                          }`}
                          onClick={(event) => {
                            resumeTimerFromActivity()
                            setSelected(index)
                            event.currentTarget.blur()
                          }}
                          className={cellClassName(
                            index,
                            selected,
                            grid,
                            givens,
                            visibleConflicts,
                            hint,
                            highlightDigit,
                            visualCells,
                            cellColors[index],
                            activeConfig,
                            hasOpponentCursor,
                          )}
                          style={
                            cellColors[index] !== null
                              ? ({
                                  '--cell-user-color':
                                    CELL_COLORS[cellColors[index] ?? 0],
                                } as CSSProperties)
                              : undefined
                          }
                        >
                          {hasOpponentCursor && (
                            <span className="pointer-events-none absolute top-1 right-1 z-20 bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] px-1 font-mono text-[0.48rem] font-black uppercase leading-tight tracking-[0.08em] text-[var(--accent)]">
                              {opponentCursorLabel(opponentNames)}
                            </span>
                          )}
                          {!value && cornerMarks[index].length > 0 && (
                            <span
                              className={`absolute left-[8%] top-[7%] flex gap-[0.18em] font-mono text-[clamp(0.46rem,1.25vw,0.82rem)] font-black leading-none ${
                                visualCells?.has(index) ||
                                index === selected ||
                                hintFocusCells(hint).includes(index)
                                  ? 'text-[var(--app-bg)]'
                                  : 'text-[var(--accent-2)]'
                              }`}
                            >
                              {cornerMarks[index].map((mark) => (
                                <span key={mark}>{mark}</span>
                              ))}
                            </span>
                          )}
                          {value ? (
                            <span className="text-[clamp(1.32rem,6.25vw,3.9rem)] leading-none sm:text-[clamp(1.55rem,7vw,3.9rem)]">
                              {value}
                            </span>
                          ) : (
                            <span
                              className={`flex h-[70%] w-[72%] flex-wrap content-center items-center justify-center gap-x-[0.08em] gap-y-0 self-center justify-self-center font-mono text-[clamp(0.82rem,3.6vw,1.6rem)] font-medium leading-[0.92] sm:text-[clamp(1rem,2.6vw,1.9rem)] ${
                                visualCells?.has(index) ||
                                index === selected ||
                                hintFocusCells(hint).includes(index)
                                  ? 'text-[var(--app-bg)]'
                                  : 'text-[var(--note)]'
                              }`}
                            >
                              {notes[index].map((note, noteIndex) => (
                                <span
                                  key={note}
                                  className={
                                    visualCells?.has(index) ||
                                    index === selected ||
                                    hintFocusCells(hint).includes(index)
                                      ? 'text-[var(--app-bg)]'
                                      : noteIndex % 2 === 0
                                        ? 'text-[var(--accent)]'
                                        : 'text-[var(--danger)]'
                                  }
                                >
                                  {note}
                                </span>
                              ))}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </section>
                </div>
                {boardObscured && (
                  <div className="absolute inset-0 z-20 grid place-items-center bg-black/30 px-4">
                    {liveRaceLost ? (
                      <RaceLostOverlay
                        winnerName={liveRaceWinner?.player ?? 'your opponent'}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={toggleTimerPaused}
                        className="border border-[var(--accent)] bg-[var(--status-bg)] px-5 py-4 font-mono text-sm font-black uppercase tracking-[0.18em] text-[var(--accent)] shadow-[0_0_0_1px_var(--app-bg)] transition hover:bg-[var(--accent)] hover:text-[var(--app-bg)]"
                      >
                        {timerPauseReason === 'auto'
                          ? 'auto-paused · resume'
                          : 'timer paused · resume'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <ToolModeBar
                activeColor={activeColor}
                colors={CELL_COLORS}
                onColorChange={(index) => {
                  setActiveColor(index)
                  setToolMode('color')
                  applyColor(index)
                }}
                onColorClear={() => {
                  setToolMode('color')
                  applyColor(null)
                }}
                onModeChange={chooseToolMode}
                toolMode={toolMode}
              />

              <NumberPad
                activeColorValue={CELL_COLORS[activeColor]}
                digits={activeDigits}
                elapsedMs={elapsedMs}
                notesEnabled={notesEnabled}
                noteMode={noteMode || toolMode === 'center'}
                onDigit={(digit) => {
                  resumeTimerFromActivity()
                  if (toolMode === 'color')
                    applyColor((digit - 1) % CELL_COLORS.length)
                  else if (toolMode === 'corner') toggleCornerMark(digit)
                  else if ((noteMode || toolMode === 'center') && notesEnabled)
                    toggleNote(digit)
                  else setCell(digit)
                }}
                onErase={() => {
                  resumeTimerFromActivity()
                  if (toolMode === 'color') applyColor(null)
                  else if (toolMode === 'corner')
                    clearCornerMarksAcrossSelection()
                  else if ((noteMode || toolMode === 'center') && notesEnabled)
                    clearNotesAcrossBlock()
                  else setCell(0)
                }}
                onToggleNotes={() => {
                  resumeTimerFromActivity()
                  if (notesEnabled) {
                    setNoteMode((current) => {
                      const next = !current
                      setToolMode(next ? 'center' : 'digit')
                      return next
                    })
                  }
                }}
                onToggleTimer={toggleTimerPaused}
                timerEnabled={timerEnabled}
                timerPaused={timerPaused}
                toolMode={toolMode}
              />

              <StatusLine
                cellLabel={labelCell(selected, activeSize)}
                challengeMistakes={
                  activeChallengeKind === 'streak'
                    ? challengeMistakes
                    : undefined
                }
                compact={compactStatus}
                completion={completion}
                cellCount={activeCellCount}
                elapsedMs={elapsedMs}
                message={statusLine}
                mode={editorMode}
                noteMode={noteMode}
                onToggleNotes={() => {
                  resumeTimerFromActivity()
                  setNoteMode((current) => {
                    const next = !current
                    setToolMode(next ? 'center' : 'digit')
                    return next
                  })
                }}
                onToggleTimer={toggleTimerPaused}
                timerEnabled={timerEnabled}
                timerPaused={timerPaused}
              />
            </section>

            <aside
              aria-hidden={!sidebarOpen}
              className={`column-rise order-1 hidden min-h-0 overflow-hidden border-[var(--border)] bg-[var(--sidebar-bg)] transition-opacity duration-200 lg:block ${
                sidebarOpen
                  ? 'opacity-100'
                  : 'lg:pointer-events-none lg:opacity-0'
              }`}
            >
              <div className="flex h-full min-h-0 w-full flex-col gap-3 overflow-y-auto p-3 lg:w-[340px]">
                <input
                  ref={fileInputRef}
                  className="hidden"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0]
                    if (file) void importImage(file)
                    event.currentTarget.value = ''
                  }}
                />
                <Panel title="session">
                  <dl className="space-y-1 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <dt className="uppercase tracking-[0.14em] text-[var(--muted)]">
                        grid
                      </dt>
                      <dd className="font-bold uppercase tracking-[0.12em] text-[var(--app-text)]">
                        {activeSize}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="uppercase tracking-[0.14em] text-[var(--muted)]">
                        rules
                      </dt>
                      <dd className="font-bold uppercase tracking-[0.12em] text-[var(--app-text)]">
                        {modeLabel(activeMode)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="uppercase tracking-[0.14em] text-[var(--muted)]">
                        conflicts
                      </dt>
                      <dd
                        className={`font-bold uppercase tracking-[0.12em] ${
                          visibleConflicts.size > 0 && activeMode !== 'no-check'
                            ? 'text-[var(--danger)]'
                            : 'text-[var(--app-text)]'
                        }`}
                      >
                        {activeMode === 'no-check'
                          ? 'hidden'
                          : visibleConflicts.size}
                      </dd>
                    </div>
                  </dl>
                </Panel>
                {activeLiveBattleId && (
                  <Panel title="live battle">
                    <LiveBattlePresencePanel
                      cellCount={activeCellCount}
                      currentAnonId={playerId}
                      puzzleSize={activeSize}
                      room={liveBattleRoom}
                    />
                  </Panel>
                )}
                {isCompetitiveBattlePlay && (
                  <Panel title="battle">
                    <BattleSidebarPanel
                      currentAnonId={playerId}
                      liveRaceLost={liveRaceLost}
                      room={activeLiveBattleRoom}
                    />
                  </Panel>
                )}
                <Panel title="timer">
                  <div className="space-y-3 font-mono">
                    <div className="flex items-center justify-between gap-3 border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2">
                      <span className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-[var(--muted)]">
                        clock
                      </span>
                      <span className="text-sm font-black uppercase tracking-[0.12em] text-[var(--accent)]">
                        {timerEnabled ? formatDuration(elapsedMs) : 'zen'}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={
                        !timerEnabled || !pauseEnabled || isSolved || liveRaceLost
                      }
                      onClick={toggleTimerPaused}
                      className={`flex w-full items-center justify-center gap-2 border px-3 py-2.5 text-xs font-black uppercase tracking-[0.16em] transition active:translate-y-px ${
                        !timerEnabled || !pauseEnabled || isSolved || liveRaceLost
                          ? 'cursor-not-allowed border-[var(--border)] bg-[var(--button-bg)] text-[var(--muted)] opacity-50'
                          : timerPaused
                            ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
                            : 'border-[var(--border)] bg-[var(--button-bg)] text-[var(--app-text)] hover:border-[var(--accent)]'
                      }`}
                    >
                      {timerPaused ? <Play size={14} /> : <Pause size={14} />}
                      {timerPaused ? 'resume' : 'pause'}
                    </button>
                    <p className="text-xs leading-relaxed text-[var(--muted)]">
                      Pausing hides the grid until play resumes.
                    </p>
                  </div>
                </Panel>
                {showSidebarTools && (
                  <Panel
                    collapsed={!toolsPanelOpen}
                    onToggle={() => setToolsPanelOpen((current) => !current)}
                    title="tools"
                  >
                    <ToolModeBar
                      activeColor={activeColor}
                      colors={CELL_COLORS}
                      layout="panel"
                      onColorChange={(index) => {
                        setActiveColor(index)
                        setToolMode('color')
                        applyColor(index)
                      }}
                      onColorClear={() => {
                        setToolMode('color')
                        applyColor(null)
                      }}
                      onModeChange={chooseToolMode}
                      toolMode={toolMode}
                    />
                  </Panel>
                )}
              </div>
            </aside>

            <aside
              aria-hidden={!hintRailOpen}
              className={`column-rise order-3 border-[var(--border)] bg-[var(--sidebar-bg)] transition-opacity duration-200 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:max-h-[80vh] max-lg:border-t lg:min-h-0 lg:overflow-hidden lg:border-l ${
                hintRailOpen
                  ? 'opacity-100'
                  : 'pointer-events-none opacity-0 max-lg:hidden'
              }`}
              style={{ animationDelay: '160ms' }}
            >
              <div className="h-full w-full lg:w-[360px]">
                <HintRail
                  applyHint={applyHint}
                  askForHint={askForHint}
                  clearHints={clearHintState}
                  conflicts={visibleConflicts.size}
                  hint={hint}
                  hintMode={hintMode}
                  onClose={() => setHintRailOpen(false)}
                />
              </div>
            </aside>
          </div>
        </section>
      )}

      {review && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-black/70 p-4">
          <div className="grid max-h-[94vh] w-full max-w-5xl gap-4 overflow-auto border border-[var(--border)] bg-[var(--panel-bg)] p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div>
              <div className="grid aspect-square grid-cols-9 border-4 border-[var(--grid-line)] bg-[var(--grid-line)]">
                {review.map((cell, index) => (
                  <button
                    type="button"
                    key={labelCell(index)}
                    onClick={() => setReviewSelected(index)}
                    className={`relative grid aspect-square place-items-center border border-[var(--grid-line)] text-2xl font-black ${
                      reviewSelected === index
                        ? 'bg-[var(--cell-selected)] text-[var(--app-bg)]'
                        : cell.confidence < 65 && cell.value
                          ? 'bg-[var(--cell-conflict)] text-[var(--app-bg)]'
                          : 'bg-[var(--cell-bg)] text-[var(--given)]'
                    } ${index % 3 === 0 ? 'border-l-4' : ''} ${
                      Math.floor(index / 9) % 3 === 0 ? 'border-t-4' : ''
                    }`}
                  >
                    {cell.value || ''}
                    {cell.value > 0 && (
                      <span className="absolute bottom-1 right-1 font-mono text-[10px] text-[var(--muted)]">
                        {Math.round(cell.confidence)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
                  Review import
                </p>
                <h2 className="text-base font-black">Check the givens</h2>
              </div>
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt="Uploaded puzzle"
                  className="aspect-square w-full border border-[var(--border)] object-cover"
                />
              )}
              <p className="text-sm text-[var(--muted)]">
                Use h/j/k/l or arrows to move. Type 1-9 to set a given, x or
                Backspace to clear.
              </p>
              <div className="mt-auto flex gap-2">
                <button
                  type="button"
                  className="flex-1 border border-[var(--border)] bg-[var(--accent)] px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-bg)]"
                  onClick={acceptReview}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="border border-[var(--border)] px-4 py-3 text-xs font-bold uppercase tracking-[0.16em]"
                  onClick={() => {
                    setReview(null)
                    setImageUrl(null)
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {leaderPending && (
        <div className="pointer-events-none fixed bottom-12 right-3 z-20">
          <div className="relative w-60 border border-[var(--border)] bg-[var(--panel-bg)]">
            <span className="absolute -top-[7px] left-3 bg-[var(--app-bg)] px-1.5 font-mono text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
              leader
            </span>
            <div className="flex flex-col gap-1 px-3 py-3 font-mono text-xs">
              {LEADER_BINDINGS.map(([leaderKey, leaderLabel]) => (
                <div key={leaderKey} className="flex items-center gap-2.5">
                  <span className="w-4 shrink-0 text-center font-bold text-[var(--accent)]">
                    {leaderKey}
                  </span>
                  <span className="text-[var(--border)]">→</span>
                  <span className="truncate text-[var(--app-text)]">
                    {leaderLabel}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {commandMode && (
        // biome-ignore lint/a11y/noStaticElementInteractions: This backdrop closes the modal when clicking outside the dialog.
        <div
          role="presentation"
          className="fixed inset-0 z-30 flex justify-center bg-black/70 px-4 pt-[16vh]"
          onMouseDown={(event) => {
            if (event.target !== event.currentTarget) return
            setCommandMode(null)
            setCommandValue('')
            setStatusLine('Command cancelled.')
          }}
        >
          <form
            className="relative h-fit w-full max-w-xl border border-[var(--border)] bg-[var(--panel-bg)] font-mono"
            onSubmit={(event) => {
              event.preventDefault()
              if (commandMode === 'search') {
                const digit = Number(commandValue.slice(0, 1))
                if (digit >= 1 && digit <= activeConfig.size) jumpToDigit(digit)
                setCommandMode(null)
                setCommandValue('')
              } else {
                executeCommand(
                  selectedCommandSuggestion?.command ?? commandValue,
                )
              }
            }}
          >
            <span className="absolute -top-[7px] left-1/2 -translate-x-1/2 bg-[var(--app-bg)] px-2 font-mono text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
              {commandMode === 'command' ? 'cmdline' : 'search'}
            </span>
            <div className="flex items-center gap-2.5 px-4 py-3.5 text-sm">
              <span className="shrink-0 font-bold text-[var(--accent)]">
                {commandMode === 'command' ? ':' : '/'}
              </span>
              <input
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-[var(--app-text)] outline-none placeholder:text-[var(--muted)]"
                placeholder={
                  commandMode === 'command'
                    ? 'hint, notes, prune, clear-notes, import, solve...'
                    : `type 1-${activeConfig.size}`
                }
                value={commandValue}
                onChange={(event) => {
                  setCommandValue(event.target.value)
                  setCommandCursor(0)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setCommandMode(null)
                    setCommandValue('')
                    setStatusLine('Command cancelled.')
                  }

                  if (event.key === 'Enter') {
                    event.preventDefault()
                    if (commandMode === 'search') {
                      const digit = Number(commandValue.slice(0, 1))
                      if (digit >= 1 && digit <= activeConfig.size)
                        jumpToDigit(digit)
                      setCommandMode(null)
                      setCommandValue('')
                    } else {
                      executeCommand(
                        selectedCommandSuggestion?.command ?? commandValue,
                      )
                    }
                    return
                  }

                  if (commandMode === 'command' && event.key === 'ArrowDown') {
                    event.preventDefault()
                    setCommandCursor((current) =>
                      Math.min(
                        current + 1,
                        Math.max(0, commandSuggestions.length - 1),
                      ),
                    )
                    return
                  }

                  if (commandMode === 'command' && event.key === 'ArrowUp') {
                    event.preventDefault()
                    setCommandCursor((current) => Math.max(0, current - 1))
                    return
                  }

                  if (commandMode === 'search') {
                    const digit = Number(event.key)
                    if (digit >= 1 && digit <= activeConfig.size) {
                      event.preventDefault()
                      jumpToDigit(digit)
                      setCommandMode(null)
                      setCommandValue('')
                    }
                  }
                }}
              />
            </div>
            {commandMode === 'command' && (
              <div className="border-t border-[var(--border)] bg-[var(--input-bg)] p-2">
                {commandSuggestions.slice(0, 8).map((suggestion) => (
                  <button
                    type="button"
                    key={suggestion.command}
                    onClick={() => executeCommand(suggestion.command)}
                    className={`grid w-full grid-cols-[minmax(0,160px)_minmax(0,1fr)] gap-3 px-2 py-1.5 text-left text-xs ${
                      selectedCommandSuggestion?.command === suggestion.command
                        ? 'bg-[var(--accent)] text-[var(--app-bg)]'
                        : 'text-[var(--app-text)] hover:bg-[var(--panel-soft)]'
                    }`}
                  >
                    <span className="truncate font-black uppercase tracking-[0.12em]">
                      :{suggestion.command}
                    </span>
                    <span
                      className={`truncate ${
                        selectedCommandSuggestion?.command ===
                        suggestion.command
                          ? 'text-[var(--app-bg)]'
                          : 'text-[var(--muted)]'
                      }`}
                    >
                      {suggestion.description}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </form>
        </div>
      )}

      {gamePickerOpen && (
        // biome-ignore lint/a11y/noStaticElementInteractions: This backdrop closes the picker when clicking outside the dialog.
        <div
          role="presentation"
          className="fixed inset-0 z-30 flex justify-center bg-black/70 px-4 pt-[10vh]"
          onMouseDown={(event) => {
            if (event.target !== event.currentTarget) return
            closeGamePicker()
            setStatusLine('Closed puzzle picker.')
          }}
        >
          <section className="h-fit w-full max-w-5xl border border-[var(--border)] bg-[var(--panel-bg)] font-mono shadow-2xl shadow-black/40">
            <header className="flex h-9 items-center justify-between border-b border-[var(--border)] bg-[var(--status-bg)] px-3">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
                [puzzle-picker]
              </span>
              <span className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                cmd+p · j/k · enter · esc
              </span>
            </header>
            <div className="p-3">
              <GameFinder
                activeGameId={activeGame.id}
                cursor={gameCursor}
                onCursorChange={setGameCursor}
                onDelete={deleteGame}
                onQueryChange={(value) => {
                  setGameQuery(value)
                  setGameCursor(0)
                }}
                onResume={resumeGame}
                query={gameQuery}
                records={filteredGameRecords}
                selectedRecord={selectedGameRecord}
              />
            </div>
          </section>
        </div>
      )}

      {challengeSetupOpen && (
        <TuiModal
          footer="esc closes · create copies the link"
          onClose={() => setChallengeSetupOpen(false)}
          title={`new-${challengeSetupLabel(challengeKind).replace(/\s+/g, '-')}`}
          wide
        >
          <ChallengeSetupPanel
            anonId={playerId}
            difficulty={challengeDifficulty}
            kind={challengeKind}
            mode={challengeMode}
            onCreate={createConfiguredChallenge}
            onCreateCurrent={() => {
              if (isLiveChallengeSetup(challengeKind)) {
                createLiveBattleRoom(liveBattleKindFromSetup(challengeKind))
                return
              }
              createRaceChallenge({
                challengeKind: asyncChallengeKindFromSetup(challengeKind),
                difficulty: activeGame.difficulty,
                playMode: activeMode,
                puzzle: activeGame.puzzle,
                puzzleSize: activeSize,
                source: activeGame.source,
                variantId,
              })
            }}
            onDifficultyChange={setChallengeDifficulty}
            onModeChange={setChallengeMode}
            onRecipientChange={setChallengeRecipient}
            onRecipientClear={() => setChallengeRecipient(null)}
            onSizeChange={setChallengeSize}
            onSourceChange={setChallengeSource}
            onTurnLivesChange={setChallengeTurnLives}
            onTurnSecondsChange={setChallengeTurnSeconds}
            onVariantChange={setChallengeVariant}
            puzzleSize={challengeSize}
            recipient={challengeRecipient}
            source={challengeSource}
            status={challengeStatus}
            turnLives={challengeTurnLives}
            turnSeconds={challengeTurnSeconds}
            variant={challengeVariant}
          />
        </TuiModal>
      )}

      {activeMenuModal && (
        <TuiModal
          title={modalTitle(activeMenuModal)}
          narrow={activeMenuModal === 'menu'}
          wide={activeMenuModal === 'theme' || activeMenuModal === 'tools'}
          onClose={closeMenuModal}
        >
          {activeMenuModal === 'menu' && (
            <div className="flex flex-col gap-0.5">
              <MenuItem
                label="home"
                onClick={() => {
                  closeMenuModal()
                  goToDashboard()
                }}
              >
                <Home size={15} />
              </MenuItem>
              <MenuItem
                label="new game"
                onClick={() => {
                  if (activePage !== 'play') closeMenuModal()
                  openNewGame()
                }}
              >
                <Plus size={15} />
              </MenuItem>
              <MenuItem
                label="puzzle library"
                onClick={() => {
                  closeMenuModal()
                  openGameLibrary()
                }}
              >
                <History size={15} />
              </MenuItem>
              <MenuItem
                label="leaderboards"
                onClick={() => {
                  closeMenuModal()
                  openLeaderboards()
                }}
              >
                <Trophy size={15} />
              </MenuItem>
              <MenuItem
                label="challenges"
                onClick={() => {
                  closeMenuModal()
                  void navigate({ to: '/challenge' })
                }}
              >
                <Swords size={15} />
              </MenuItem>
              <MenuItem
                label="profile"
                onClick={() => {
                  closeMenuModal()
                  goToProfile()
                }}
              >
                <UserRound size={15} />
              </MenuItem>
              <div className="my-1 border-t border-[var(--border)]" />
              <MenuItem
                label="tools"
                hint=":tools"
                onClick={() => openModalRoute('tools')}
              >
                <Wrench size={15} />
              </MenuItem>
              <MenuItem
                label="theme"
                hint=":theme"
                onClick={() => openModalRoute('theme')}
              >
                <Palette size={15} />
              </MenuItem>
              <MenuItem
                label="settings"
                onClick={() => openModalRoute('settings')}
              >
                <Settings size={15} />
              </MenuItem>
              <MenuItem
                label="commands"
                hint=":"
                onClick={() => openModalRoute('commands')}
              >
                <Terminal size={15} />
              </MenuItem>
            </div>
          )}
          {activeMenuModal === 'new' && (
            <NewGamePanel
              dailyRecord={findDailyRecord(
                gameFinderRecords,
                newGameDifficulty,
                dailyDateKey,
                newGameSize,
                newGameMode,
              )}
              dateKey={dailyDateKey}
              difficulty={newGameDifficulty}
              isFetchingPuzzle={isFetchingPuzzle}
              mode={newGameMode}
              variant={newGameVariant}
              onDateChange={setDailyDateKey}
              onDifficultyChange={setNewGameDifficulty}
              onModeChange={setNewGameMode}
              onVariantChange={setNewGameVariant}
              onSizeChange={setNewGameSize}
              onImage={() => fileInputRef.current?.click()}
              onLoadPasted={startPastedPuzzle}
              onLocal={() =>
                startGeneratedPuzzle(
                  newGameDifficulty,
                  false,
                  newGameSize,
                  newGameMode,
                  newGameVariant,
                )
              }
              onMountain={() => void fetchSudokuMountainPuzzle(false)}
              onMountainDaily={() => void fetchSudokuMountainPuzzle(true)}
              onPuzzleTextChange={setNewPuzzleText}
              onOpenDaily={(selectedDateKey) => {
                openDailyPuzzle(
                  newGameDifficulty,
                  selectedDateKey,
                  newGameSize,
                  newGameMode,
                )
                closeMenuModal()
                setNewGameStatus('')
              }}
              onToday={() => setDailyDateKey(todayDateKey())}
              onYesterday={() => {
                setDailyDateKey(offsetDateKey(-1))
                openDailyPuzzle(
                  newGameDifficulty,
                  offsetDateKey(-1),
                  newGameSize,
                  newGameMode,
                )
                closeMenuModal()
                setNewGameStatus('')
              }}
              puzzleText={newPuzzleText}
              puzzleSize={newGameSize}
              status={newGameStatus}
            />
          )}

          {activeMenuModal === 'settings' && (
            <div className="space-y-5">
              <section className="border border-[var(--border)] bg-[var(--input-bg)] p-3">
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
                  leaderboard identity
                </p>
                <label className="mt-3 flex items-center gap-3 border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2">
                  <span className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                    player
                  </span>
                  <input
                    className="min-w-0 flex-1 bg-transparent font-mono text-sm text-[var(--app-text)] outline-none placeholder:text-[var(--muted)]"
                    maxLength={32}
                    placeholder="anonymous"
                    value={playerName}
                    onChange={(event) => updatePlayerName(event.target.value)}
                  />
                </label>
              </section>
            </div>
          )}

          {activeMenuModal === 'theme' && (
            <div className="space-y-4">
              <section className="border border-[var(--border)] bg-[var(--input-bg)] p-3">
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
                  :colorscheme
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {CODE_THEMES.map((theme) => (
                    <button
                      type="button"
                      key={theme.id}
                      className={`border p-3 text-left font-mono transition ${
                        themeId === theme.id
                          ? 'border-[var(--accent)] bg-[var(--panel-soft)] text-[var(--accent)]'
                          : 'border-[var(--border)] bg-[var(--button-bg)] hover:border-[var(--accent-2)]'
                      }`}
                      onClick={() => setThemeId(theme.id)}
                    >
                      <span className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.16em]">
                        <span>{theme.name}</span>
                        <span>{themeId === theme.id ? '[active]' : ''}</span>
                      </span>
                      <span className="mt-3 flex gap-1">
                        {theme.swatches.map((swatch) => (
                          <span
                            key={swatch}
                            className="h-5 flex-1 border border-black/40"
                            style={{ backgroundColor: swatch }}
                          />
                        ))}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeMenuModal === 'tools' && (
            <div className="space-y-4">
              <section className="border border-[var(--border)] bg-[var(--input-bg)] p-3">
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
                  tool mode
                </p>
                <div className="mt-3">
                  <ToolModeBar
                    activeColor={activeColor}
                    colors={CELL_COLORS}
                    layout="panel"
                    onColorChange={(index) => {
                      setActiveColor(index)
                      setToolMode('color')
                      applyColor(index)
                    }}
                    onColorClear={() => {
                      setToolMode('color')
                      applyColor(null)
                    }}
                    onModeChange={chooseToolMode}
                    toolMode={toolMode}
                  />
                </div>
              </section>

              <section className="grid gap-2 sm:grid-cols-2">
                {[
                  ['hint', '?', () => askForHint(), !hintsEnabled],
                  ['check board', ':check', runCheck, false],
                  ['rules', ':rules', () => openModalRoute('rules'), false],
                  ['copy puzzle link', ':share', copyPuzzleLink, false],
                  ['copy state link', ':share-state', copyStateLink, false],
                  ['undo', 'u', undo, !history.length],
                  ['redo', 'C-r', redo, !future.length],
                  [
                    'clear centre notes',
                    ':clear-notes',
                    clearNotesAcrossBlock,
                    false,
                  ],
                  [
                    'clear corners',
                    'x in corners',
                    clearCornerMarksAcrossSelection,
                    false,
                  ],
                  [
                    'clear colour',
                    ':color clear',
                    () => applyColor(null),
                    false,
                  ],
                  [
                    timerPaused ? 'resume timer' : 'pause timer',
                    'Shift+p',
                    toggleTimerPaused,
                    !timerEnabled || !pauseEnabled || isSolved,
                  ],
                  ['reset entries', ':reset', resetPuzzle, false],
                  ['clear puzzle', ':clear', clearAll, false],
                ].map(([label, hint, action, disabled]) => (
                  <button
                    type="button"
                    key={String(label)}
                    disabled={Boolean(disabled)}
                    onClick={() => {
                      ;(action as () => void)()
                    }}
                    className="flex items-center justify-between gap-3 border border-[var(--border)] bg-[var(--button-bg)] px-3 py-2.5 font-mono text-xs uppercase tracking-[0.14em] text-[var(--app-text)] transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span>{String(label)}</span>
                    <span className="text-[var(--muted)]">{String(hint)}</span>
                  </button>
                ))}
              </section>
            </div>
          )}

          {activeMenuModal === 'commands' && (
            <div className="space-y-4 font-mono">
              <section className="border border-[var(--border)] bg-[var(--input-bg)] p-3">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--accent)]">
                  mode keys
                </p>
                <div className="mt-3 grid gap-2 text-sm text-[var(--muted)] sm:grid-cols-4">
                  {[
                    ['z', 'Digit'],
                    ['m', 'Centre'],
                    ['a', 'Corners'],
                    ['c', 'Colour'],
                  ].map(([key, label]) => (
                    <p
                      key={key}
                      className="border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2"
                    >
                      <span className="mr-2 font-black text-[var(--accent)]">
                        {key}
                      </span>
                      {label}
                    </p>
                  ))}
                </div>
              </section>
              <div className="grid gap-x-8 gap-y-0.5 text-sm sm:grid-cols-2">
                {[
                  [':menu', 'open menu'],
                  [':dashboard', 'open start screen'],
                  [':notes', 'fill candidates'],
                  [':new', 'open new game menu'],
                  [':daily', 'open today daily URL'],
                  [':yesterday', 'open yesterday daily URL'],
                  [':games', 'open puzzle log'],
                  [':scores', 'open leaderboards'],
                  [':profile', 'open player profile'],
                  [':tools', 'open tool palette'],
                  [':theme', 'open colorscheme picker'],
                  [':pause', 'pause puzzle timer'],
                  [':resume', 'resume puzzle timer'],
                  [':check', 'check visible conflicts'],
                  [':rules', 'open puzzle rules'],
                  [':share', 'copy puzzle link'],
                  [':share-state', 'copy current board state'],
                  [':row / :col', 'select current unit'],
                  [':box / :all', 'select box / board'],
                  [':color 1', 'colour selected cells'],
                  [':color clear', 'clear selection colour'],
                  [':anti-knight', 'variant checks'],
                  [':diagonal', 'variant checks'],
                  [':noh', 'clear hint/search highlights'],
                  [':nohint', 'turn hints off'],
                  [':prune', 'remove impossible notes'],
                  [':clear-notes', 'clear all notes'],
                  [':settings', 'open global settings'],
                  [':import', 'open image import'],
                  ['cmd+m', 'open menu'],
                  ['cmd+p', 'open puzzle finder'],
                  ['Shift+p', 'pause / resume timer'],
                  ['Shift+1-9', 'corner notes'],
                  ['/5', 'highlight 5s'],
                  ['f5', 'jump to next 5'],
                  ['w / b', 'next / previous empty'],
                  ['Alt+1-6', 'quick colour selection'],
                  ['v', 'visual selection'],
                  ['{ / }', 'previous / next box'],
                  ['H J K L', 'jump one box in direction'],
                  ['gg / G', 'first / last cell'],
                  ['C-d / C-u', 'jump 3 rows down / up'],
                  ['u / C-r', 'undo / redo'],
                  ['SPC', 'leader menu (e h n g l p i s t c m)'],
                ].map(([key, value]) => (
                  <div key={key} className="flex items-baseline gap-2.5 py-1">
                    <span className="w-28 shrink-0 whitespace-nowrap font-bold text-[var(--accent)]">
                      {key}
                    </span>
                    <span className="text-[var(--border)]">→</span>
                    <span className="text-[var(--app-text)]">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeMenuModal === 'rules' && (
            <RulesPanel
              onCopyLink={copyPuzzleLink}
              onVariantChange={chooseVariant}
              puzzleSize={activeSize}
              source={activeGame.source}
              variantId={variantId}
            />
          )}
        </TuiModal>
      )}

      {showSolved && (
        <SolvedModal
          completion={completion}
          difficulty={activeGame.difficulty}
          elapsedMs={elapsedMs}
          hintUses={hintUses}
          mistakes={challengeMistakes}
          needsName={liveRaceLostResult ? false : needsSolvedNamePrompt}
          opponentName={liveRaceWon ? liveRaceOpponent?.player : undefined}
          outcome={
            liveRaceWon
              ? 'race-win'
              : liveRaceLostResult
                ? 'race-loss'
                : 'solved'
          }
          pauseCount={manualPauseCount}
          winnerElapsedMs={liveRaceWinnerElapsedMs}
          winnerName={liveRaceLostResult ? liveRaceWinner?.player : undefined}
          onNameChange={updatePlayerName}
          onNameConfirm={() => {
            if (!isCustomPlayerName(playerName)) {
              setLeaderboardStatus('Choose a leaderboard handle first.')
              return
            }
            setSolvedNamePromptGameId(null)
          }}
          source={activeGame.source}
          playerName={playerName}
          onLeaderboards={() => {
            setSolvedDismissed(true)
            navigateToPage('leaderboards')
          }}
          onNewGame={() => {
            setSolvedDismissed(true)
            openNewGame()
          }}
          onChallengeAgain={
            liveRaceFinished && activeLiveBattleRoom
              ? () => {
                  setSolvedDismissed(true)
                  createLiveBattleRoom('race', {
                    difficulty: activeLiveBattleRoom.difficulty,
                    playMode: activeLiveBattleRoom.playMode,
                    puzzle: activeLiveBattleRoom.puzzle,
                    puzzleSize: activeLiveBattleRoom.puzzleSize,
                    source: activeLiveBattleRoom.source,
                    variantId: activeLiveBattleRoom.variantId,
                  })
                }
              : undefined
          }
          onClose={() => setSolvedDismissed(true)}
        />
      )}
    </main>
  )
}

// Touch number entry — mobile/tablet only; desktop uses the keyboard.
function NumberPad({
  activeColorValue,
  digits,
  elapsedMs,
  notesEnabled,
  noteMode,
  onDigit,
  onErase,
  onToggleNotes,
  onToggleTimer,
  timerEnabled,
  timerPaused,
  toolMode,
}: {
  activeColorValue: string
  digits: number[]
  elapsedMs: number
  notesEnabled: boolean
  noteMode: boolean
  onDigit: (digit: number) => void
  onErase: () => void
  onToggleNotes: () => void
  onToggleTimer: () => void
  timerEnabled: boolean
  timerPaused: boolean
  toolMode: ToolMode
}) {
  return (
    <div className="shrink-0 border-t border-[var(--border)] bg-[var(--status-bg)] p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] lg:hidden">
      <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border border-[var(--border)] bg-[var(--input-bg)] px-2 py-1.5 font-mono text-[0.64rem] uppercase tracking-[0.14em] text-[var(--muted)]">
        <span>
          mode{' '}
          <span className="text-[var(--accent)]">
            {toolModeLabel(toolMode)}
          </span>
        </span>
        <button
          type="button"
          disabled={!timerEnabled}
          onClick={onToggleTimer}
          className={`flex items-center gap-1.5 border border-[var(--border)] px-2 py-1 font-bold uppercase tracking-[0.12em] ${
            !timerEnabled
              ? 'opacity-50'
              : timerPaused
                ? 'bg-[var(--accent)] text-[var(--app-bg)]'
                : 'bg-[var(--button-bg)] text-[var(--app-text)]'
          }`}
        >
          {timerPaused ? <Play size={12} /> : <Pause size={12} />}
          {timerEnabled ? formatDuration(elapsedMs) : 'zen'}
        </button>
      </div>
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${digits.length}, minmax(0, 1fr))`,
        }}
      >
        {digits.map((digit) => (
          <button
            type="button"
            key={digit}
            onClick={() => onDigit(digit)}
            className="grid aspect-square place-items-center border border-[var(--border)] bg-[var(--button-bg)] font-mono text-lg font-bold text-[var(--app-text)] transition active:translate-y-px active:bg-[var(--panel-soft)]"
          >
            {digit}
          </button>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-1">
        <button
          type="button"
          disabled={!notesEnabled}
          onClick={onToggleNotes}
          className={`border px-3 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.16em] transition active:translate-y-px ${
            !notesEnabled
              ? 'cursor-not-allowed border-[var(--border)] bg-[var(--button-bg)] text-[var(--muted)] opacity-50'
              : noteMode
                ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
                : 'border-[var(--border)] bg-[var(--button-bg)] text-[var(--muted)]'
          }`}
        >
          centre {noteMode ? 'on' : 'off'}
        </button>
        <div className="flex items-center justify-center gap-1.5 border border-[var(--border)] bg-[var(--input-bg)] px-2 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
          colour
          <span
            className="h-4 w-6 border border-[var(--border)]"
            style={{ backgroundColor: activeColorValue }}
          />
        </div>
        <button
          type="button"
          onClick={onErase}
          className="border border-[var(--border)] bg-[var(--button-bg)] px-3 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-text)] transition active:translate-y-px"
        >
          erase
        </button>
      </div>
    </div>
  )
}

function RulesPanel({
  onCopyLink,
  onVariantChange,
  puzzleSize,
  source,
  variantId,
}: {
  onCopyLink: () => void
  onVariantChange: (variantId: VariantId) => void
  puzzleSize: PuzzleSize
  source: string
  variantId: VariantId
}) {
  return (
    <div className="space-y-4 font-mono">
      <section className="border border-[var(--border)] bg-[var(--input-bg)] p-3">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--accent)]">
          {source}
        </p>
        <div className="mt-3 flex items-center justify-between gap-3 border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2">
          <span className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-[var(--muted)]">
            active check
          </span>
          <span className="text-xs font-black uppercase tracking-[0.14em] text-[var(--accent)]">
            {VARIANTS[variantId].label}
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
          {puzzleRules(puzzleSize, variantId)}
        </p>
      </section>
      <section className="border border-[var(--border)] bg-[var(--input-bg)] p-3">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--accent)]">
          variant checks
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(Object.keys(VARIANTS) as VariantId[]).map((id) => (
            <button
              type="button"
              key={id}
              onClick={() => onVariantChange(id)}
              className={`border p-3 text-left text-xs font-black uppercase tracking-[0.14em] transition ${
                variantId === id
                  ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
                  : 'border-[var(--border)] bg-[var(--button-bg)] text-[var(--muted)] hover:border-[var(--accent)]'
              }`}
            >
              {VARIANTS[id].label}
            </button>
          ))}
        </div>
      </section>
      <section className="border border-[var(--border)] bg-[var(--input-bg)] p-3">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--accent)]">
          tools
        </p>
        <div className="mt-3 grid gap-2 text-sm text-[var(--muted)] sm:grid-cols-2">
          {[
            ['v', 'visual selection'],
            ['z', 'digit tool'],
            ['m', 'notes'],
            ['a', 'corners'],
            ['c', 'colour'],
            [':check', 'conflict check'],
          ].map(([key, label]) => (
            <p key={key} className="flex gap-2">
              <span className="w-16 shrink-0 font-black text-[var(--accent)]">
                {key}
              </span>
              <span>{label}</span>
            </p>
          ))}
        </div>
      </section>
      <button
        type="button"
        onClick={onCopyLink}
        className="w-full border border-[var(--accent)] bg-[var(--accent)] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-[var(--app-bg)] transition hover:brightness-110"
      >
        copy puzzle link
      </button>
    </div>
  )
}

function ToolModeBar({
  activeColor,
  colors,
  layout = 'bar',
  onColorChange,
  onColorClear,
  onModeChange,
  toolMode,
}: {
  activeColor: number
  colors: readonly string[]
  layout?: 'bar' | 'panel'
  onColorChange: (index: number) => void
  onColorClear: () => void
  onModeChange: (mode: ToolMode) => void
  toolMode: ToolMode
}) {
  const modes: [ToolMode, string, string][] = [
    ['digit', 'z', 'digit'],
    ['center', 'm', 'centre'],
    ['corner', 'a', 'corners'],
    ['color', 'c', 'colour'],
  ]

  const modeButton = (mode: ToolMode, key: string, label: string) => (
    <button
      type="button"
      key={mode}
      onClick={() => onModeChange(mode)}
      className={`border px-2.5 py-1.5 text-[0.64rem] font-black uppercase tracking-[0.14em] transition ${
        toolMode === mode
          ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
          : 'border-[var(--border)] bg-[var(--button-bg)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--app-text)]'
      }`}
    >
      <span className="text-[0.58rem] opacity-70">{key}</span> {label}
    </button>
  )

  const colorButton = (color: string, index: number) => (
    <button
      type="button"
      key={color}
      aria-label={`Colour ${index + 1}`}
      onClick={() => onColorChange(index)}
      className={`h-6 w-full border transition ${
        toolMode === 'color' && activeColor === index
          ? 'border-[var(--app-text)]'
          : 'border-[var(--border)]'
      }`}
      style={{ backgroundColor: color }}
    />
  )

  const clearButton = (
    <button
      type="button"
      aria-label="Clear colour from selected cells"
      onClick={onColorClear}
      className="grid h-6 w-full place-items-center border border-[var(--border)] bg-[var(--button-bg)] text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--app-text)]"
      title="clear colour"
    >
      <Eraser className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  )

  if (layout === 'panel') {
    return (
      <div className="font-mono">
        <div className="grid grid-cols-2 gap-1.5">
          {modes.map(([mode, key, label]) => modeButton(mode, key, label))}
        </div>
        <p className="mt-3 mb-1.5 text-[0.6rem] uppercase tracking-[0.2em] text-[var(--muted)]">
          colour
        </p>
        <div className="grid grid-cols-7 gap-1">
          {colors.map((color, index) => colorButton(color, index))}
          {clearButton}
        </div>
        <p className="mt-2 text-[0.65rem] leading-relaxed text-[var(--muted)]">
          Use the eraser swatch or press x in colour mode to remove colour from
          the selected cell. Backspace clears the cell completely.
        </p>
      </div>
    )
  }

  return (
    <div className="shrink-0 border-t border-[var(--border)] bg-[var(--status-bg)] px-2 py-1.5 font-mono lg:hidden">
      <div className="flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex shrink-0 gap-1">
          {modes.map(([mode, key, label]) => modeButton(mode, key, label))}
        </div>
        <div className="flex shrink-0 gap-1">
          {colors.map((color, index) => (
            <div key={color} className="h-6 w-6 shrink-0">
              {colorButton(color, index)}
            </div>
          ))}
          <div className="h-6 w-6 shrink-0">{clearButton}</div>
        </div>
      </div>
    </div>
  )
}

function RaceLostOverlay({ winnerName }: { winnerName: string }) {
  return (
    <div className="relative overflow-hidden border border-[var(--danger)] bg-[var(--status-bg)] px-6 py-5 text-center font-mono shadow-[0_0_0_1px_var(--app-bg)]">
      <CelebrationStrip tone="lost" />
      <div className="relative">
        <p className="text-[0.65rem] font-black uppercase tracking-[0.28em] text-[var(--muted)]">
          race result
        </p>
        <p className="mt-2 text-3xl font-black uppercase tracking-[0.18em] text-[var(--danger)]">
          you lost
        </p>
        <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[var(--app-text)]">
          {winnerName} finished first
        </p>
        <p className="mt-1 text-[0.65rem] uppercase tracking-[0.14em] text-[var(--muted)]">
          board locked · start another run from the menu
        </p>
      </div>
    </div>
  )
}

function CelebrationStrip({ tone }: { tone: 'solved' | 'win' | 'lost' }) {
  const cells =
    tone === 'lost'
      ? [
          ['lost', 'LOST'],
          ['try', 'TRY'],
          ['again', 'AGAIN'],
          ['next', 'NEXT'],
          ['run', 'RUN'],
        ]
      : tone === 'win'
        ? [
            ['win', 'WIN'],
            ['gg', 'GG'],
            ['fast', 'FAST'],
            ['clear', 'CLEAR'],
            ['vim', 'VIM'],
          ]
        : [
            ['done', 'DONE'],
            ['clear', 'CLEAR'],
            ['nice', 'NICE'],
            ['solved', 'SOLVED'],
            ['vim', 'VIM'],
          ]

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 grid grid-cols-5 opacity-20"
    >
      {cells.map(([key, cell]) => (
        <span
          key={`${tone}-${key}`}
          className={`grid place-items-center border-r border-[var(--border)] text-[0.62rem] font-black uppercase tracking-[0.2em] ${
            tone === 'lost'
              ? 'text-[var(--danger)]'
              : 'text-[var(--accent)]'
          }`}
        >
          {cell}
        </span>
      ))}
    </div>
  )
}

function SolvedModal({
  completion,
  difficulty,
  elapsedMs,
  hintUses,
  mistakes,
  needsName,
  opponentName,
  outcome = 'solved',
  pauseCount,
  winnerElapsedMs,
  winnerName,
  onChallengeAgain,
  onLeaderboards,
  onNewGame,
  onNameChange,
  onNameConfirm,
  onClose,
  playerName,
  source,
}: {
  completion: number
  difficulty?: PuzzleDifficulty | 'custom'
  elapsedMs: number
  hintUses: number
  mistakes: number
  needsName: boolean
  opponentName?: string
  outcome?: 'solved' | 'race-win' | 'race-loss'
  pauseCount: number
  winnerElapsedMs?: number
  winnerName?: string
  onChallengeAgain?: () => void
  onLeaderboards: () => void
  onNewGame: () => void
  onNameChange: (value: string) => void
  onNameConfirm: () => void
  onClose: () => void
  playerName: string
  source: string
}) {
  const actions: [key: string, label: string, run: () => void][] = []
  if (onChallengeAgain) {
    actions.push(['click', 'challenge again', onChallengeAgain])
  }
  actions.push(
    ['click', 'new game', onNewGame],
    ['click', 'leaderboards', onLeaderboards],
    ['esc', 'close', onClose],
  )
  const playerNameValue =
    needsName && !isCustomPlayerName(playerName) ? '' : playerName
  const isRaceWin = outcome === 'race-win'
  const isRaceLoss = outcome === 'race-loss'
  const isRaceResult = isRaceWin || isRaceLoss
  const displayTime =
    isRaceResult && winnerElapsedMs !== undefined ? winnerElapsedMs : elapsedMs
  const resultTitle = isRaceLoss
    ? `${winnerName ?? 'Player'} won`
    : isRaceWin
      ? 'race won'
      : 'puzzle solved'

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: This backdrop closes the solved dialog when clicking outside the panel.
    <div
      role="presentation"
      className="fixed inset-0 z-40 grid place-items-center bg-black/80 p-4 font-mono"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="w-full max-w-4xl border border-[var(--accent)] bg-[var(--panel-bg)]">
        <div className="relative overflow-hidden border-b border-[var(--border)] px-6 py-8">
          <CelebrationStrip
            tone={isRaceLoss ? 'lost' : isRaceWin ? 'win' : 'solved'}
          />
          <div className="relative flex flex-col items-center gap-3">
            <span
              className={`text-5xl leading-none ${
                isRaceLoss ? 'text-[var(--danger)]' : 'text-[var(--accent)]'
              }`}
            >
              {isRaceLoss ? 'x' : '✓'}
            </span>
            <h2 className="text-xs font-black uppercase tracking-[0.34em] text-[var(--app-text)]">
              {resultTitle}
            </h2>
            <p
              className={`text-4xl font-black ${
                isRaceLoss ? 'text-[var(--danger)]' : 'text-[var(--accent)]'
              }`}
            >
              {formatDuration(displayTime)}
            </p>
            <p className="text-center text-[0.7rem] uppercase tracking-[0.16em] text-[var(--muted)]">
              {isRaceLoss
                ? 'race finished'
                : isRaceWin
                  ? `you beat ${opponentName ?? 'your opponent'}`
                  : source}
              {difficulty ? ` · ${difficulty}` : ''}
            </p>
          </div>
        </div>
        {!isRaceResult && (
          <div className="grid grid-cols-2 gap-2 border-b border-[var(--border)] bg-[var(--input-bg)] p-3 sm:grid-cols-4">
            <SolvedMetric label="filled" value={String(completion)} />
            <SolvedMetric label="hints" value={String(hintUses)} />
            <SolvedMetric label="pauses" value={String(pauseCount)} />
            <SolvedMetric label="misses" value={String(mistakes)} />
          </div>
        )}
        {needsName && (
          <div className="border-b border-[var(--border)] bg-[var(--input-bg)] p-3">
            <label className="block">
              <span className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
                leaderboard handle
              </span>
              <input
                autoFocus
                className="mt-2 w-full border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-sm text-[var(--app-text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
                maxLength={32}
                placeholder="anonymous"
                value={playerNameValue}
                onChange={(event) => onNameChange(event.target.value)}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    onNameConfirm()
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="mt-3 w-full border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 font-mono text-xs font-black uppercase tracking-[0.16em] text-[var(--app-bg)] transition active:translate-y-px"
              onClick={onNameConfirm}
            >
              save handle
            </button>
          </div>
        )}
        <div className="flex flex-col p-2 sm:grid sm:grid-cols-2">
          {actions.map(([key, label, run]) => (
            <button
              type="button"
              key={`${key}-${label}`}
              onClick={run}
              className="group flex items-center gap-3 px-3 py-2 text-left text-sm transition hover:bg-[var(--panel-soft)]"
            >
              <span className="w-9 shrink-0 text-xs font-bold text-[var(--accent)]">
                {key}
              </span>
              <span className="text-[var(--border)]">→</span>
              <span className="lowercase tracking-[0.08em] text-[var(--app-text)] group-hover:text-[var(--accent)]">
                {label}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function SolvedMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--border)] bg-[var(--status-bg)] px-2 py-2 text-center">
      <p className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 font-mono text-lg font-black text-[var(--accent)]">
        {value}
      </p>
    </div>
  )
}

function NewGameSection({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  return (
    <section className="relative border border-[var(--border)] bg-[var(--input-bg)] p-4">
      <span className="absolute -top-[7px] left-3 bg-[var(--workspace-bg)] px-1.5 font-mono text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
        {title}
      </span>
      {children}
    </section>
  )
}

function NewGameField({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-[var(--muted)]">
        {label}
      </p>
      {children}
    </div>
  )
}

function NewGamePanel({
  dailyRecord,
  dateKey,
  difficulty,
  isFetchingPuzzle,
  mode,
  variant,
  onDateChange,
  onDifficultyChange,
  onModeChange,
  onVariantChange,
  onImage,
  onLoadPasted,
  onLocal,
  onMountain,
  onMountainDaily,
  onOpenDaily,
  onPuzzleTextChange,
  onSizeChange,
  onToday,
  onYesterday,
  puzzleText,
  puzzleSize,
  status,
}: {
  dailyRecord: GameRecord | null
  dateKey: string
  difficulty: PuzzleDifficulty
  isFetchingPuzzle: boolean
  mode: PlayMode
  variant: VariantId
  onDateChange: (dateKey: string) => void
  onDifficultyChange: (difficulty: PuzzleDifficulty) => void
  onModeChange: (mode: PlayMode) => void
  onVariantChange: (variant: VariantId) => void
  onImage: () => void
  onLoadPasted: () => void
  onLocal: () => void
  onMountain: () => void
  onMountainDaily: () => void
  onOpenDaily: (dateKey: string) => void
  onPuzzleTextChange: (value: string) => void
  onSizeChange: (puzzleSize: PuzzleSize) => void
  onToday: () => void
  onYesterday: () => void
  puzzleText: string
  puzzleSize: PuzzleSize
  status: string
}) {
  const dailyGrid = useMemo(
    () =>
      generatePuzzle(
        difficulty,
        dailySeed(difficulty, 'vimdoku', dateKey, puzzleSize, mode),
        puzzleSize,
      ),
    [dateKey, difficulty, mode, puzzleSize],
  )
  const dateLabel = formatDailyDate(dateKey)
  const canGoNext = dateKey < todayDateKey()
  const dailyCompleted = dailyRecord?.status === 'completed'
  const cellCount = boardConfigFor(puzzleSize).cellCount

  return (
    <div className="space-y-4">
      <NewGameSection title="play a daily">
        <form
          className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start"
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            const selectedDateKey = String(form.get('daily-date') ?? dateKey)
            onOpenDaily(
              isValidDateKey(selectedDateKey) ? selectedDateKey : dateKey,
            )
          }}
        >
          <div className="min-w-0 space-y-3">
            {dailyCompleted && (
              <div className="border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-bg)]">
                completed{' '}
                {dailyRecord?.completedAt
                  ? `· ${formatGameDate(dailyRecord.completedAt)}`
                  : ''}
              </div>
            )}
            <NewGameField label="board">
              <div className="grid grid-cols-2 gap-2">
                {PUZZLE_SIZES.map((option) => (
                  <button
                    type="button"
                    key={option}
                    className={`border px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.16em] transition ${
                      puzzleSize === option
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
                        : 'border-[var(--border)] bg-[var(--button-bg)] text-[var(--muted)] hover:border-[var(--accent-2)] hover:text-[var(--app-text)]'
                    }`}
                    onClick={() => onSizeChange(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </NewGameField>
            <NewGameField label="mode">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PLAY_MODES.map((option) => (
                  <button
                    type="button"
                    key={option}
                    className={`border px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.16em] transition ${
                      mode === option
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
                        : 'border-[var(--border)] bg-[var(--button-bg)] text-[var(--muted)] hover:border-[var(--accent-2)] hover:text-[var(--app-text)]'
                    }`}
                    onClick={() => onModeChange(option)}
                  >
                    {modeLabel(option)}
                  </button>
                ))}
              </div>
            </NewGameField>
            <NewGameField label="difficulty">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {NEW_GAME_DIFFICULTIES.map((option) => (
                  <button
                    type="button"
                    key={option}
                    className={`border px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.16em] transition ${
                      difficulty === option
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
                        : 'border-[var(--border)] bg-[var(--button-bg)] text-[var(--muted)] hover:border-[var(--accent-2)] hover:text-[var(--app-text)]'
                    }`}
                    onClick={() => onDifficultyChange(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </NewGameField>
            <NewGameField label="variant">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(Object.keys(VARIANTS) as VariantId[]).map((option) => (
                  <button
                    type="button"
                    key={option}
                    className={`border px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.14em] transition ${
                      variant === option
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
                        : 'border-[var(--border)] bg-[var(--button-bg)] text-[var(--muted)] hover:border-[var(--accent-2)] hover:text-[var(--app-text)]'
                    }`}
                    onClick={() => onVariantChange(option)}
                  >
                    {VARIANTS[option].label}
                  </button>
                ))}
              </div>
            </NewGameField>
            <NewGameField label="date">
              <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
                <button
                  type="button"
                  className="border border-[var(--border)] bg-[var(--button-bg)] px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.14em] hover:border-[var(--accent)]"
                  onClick={() => onDateChange(shiftDateKey(dateKey, -1))}
                >
                  prev
                </button>
                <label className="flex items-center gap-2 border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2">
                  <span className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                    date
                  </span>
                  <input
                    className="min-w-0 flex-1 bg-transparent font-mono text-sm text-[var(--app-text)] outline-none"
                    max={todayDateKey()}
                    name="daily-date"
                    type="date"
                    value={dateKey}
                    onChange={(event) => {
                      if (isValidDateKey(event.target.value)) {
                        onDateChange(event.target.value)
                      }
                    }}
                  />
                </label>
                <button
                  type="button"
                  disabled={!canGoNext}
                  className="border border-[var(--border)] bg-[var(--button-bg)] px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.14em] hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => onDateChange(shiftDateKey(dateKey, 1))}
                >
                  next
                </button>
                <button
                  type="button"
                  className="border border-[var(--border)] bg-[var(--button-bg)] px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.14em] hover:border-[var(--accent)]"
                  onClick={onToday}
                >
                  today
                </button>
              </div>
            </NewGameField>

            <div className="grid gap-2 border border-[var(--border)] bg-[var(--status-bg)] p-3 font-mono text-xs uppercase tracking-[0.14em] sm:grid-cols-3">
              <DailyMeta
                label="daily"
                value={`${puzzleSize} / ${modeLabel(mode)} / ${difficulty} / ${dateLabel}`}
              />
              <DailyMeta
                label="status"
                value={
                  dailyRecord
                    ? dailyRecord.status === 'completed'
                      ? 'completed'
                      : 'in progress'
                    : 'not started'
                }
                tone={
                  dailyCompleted ? 'done' : dailyRecord ? 'active' : 'default'
                }
              />
              <DailyMeta
                label="progress"
                value={
                  dailyRecord
                    ? `${dailyRecord.completion}/${cellCount} · ${formatDuration(dailyRecord.elapsedMs)}`
                    : `0/${cellCount}`
                }
              />
            </div>

            <button
              type="submit"
              className={`w-full border px-4 py-3 font-mono text-xs font-bold uppercase tracking-[0.16em] ${
                dailyCompleted
                  ? 'border-[var(--accent)] bg-[var(--button-bg)] text-[var(--accent)]'
                  : 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
              }`}
            >
              {dailyCompleted
                ? 'review completed daily'
                : dailyRecord
                  ? 'resume daily'
                  : 'play daily'}
            </button>
          </div>

          <button
            type="submit"
            className={`relative border bg-[var(--button-bg)] p-3 transition hover:border-[var(--accent)] hover:bg-[var(--panel-soft)] ${
              dailyCompleted
                ? 'border-[var(--accent)]'
                : 'border-[var(--border)]'
            }`}
          >
            {dailyCompleted && (
              <span className="absolute right-2 top-2 z-10 border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 font-mono text-[0.6rem] font-bold uppercase tracking-[0.14em] text-[var(--app-bg)]">
                solved
              </span>
            )}
            <PuzzlePreview
              grid={dailyGrid}
              givens={dailyGrid.map((value) => value !== 0)}
            />
          </button>
        </form>
      </NewGameSection>

      <NewGameSection title="generate a puzzle">
        <div className="grid gap-2 sm:grid-cols-2">
          <NewGameAction
            command=":new local"
            description="Generate a fresh unique puzzle without leaving the app."
            onClick={onLocal}
          />
          <NewGameAction
            command=":new yesterday"
            description="Reopen the previous daily by date."
            onClick={onYesterday}
          />
          <NewGameAction
            command=":new mountain"
            description="Fetch a free public API puzzle from Sudoku Mountain."
            disabled={isFetchingPuzzle}
            onClick={onMountain}
          />
          <NewGameAction
            command=":new mountain-daily"
            description="Use the public API with a stable daily seed."
            disabled={isFetchingPuzzle}
            onClick={onMountainDaily}
          />
        </div>
      </NewGameSection>

      <NewGameSection title="import">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
            paste a grid, or import a photo
          </p>
          <button
            type="button"
            className="shrink-0 border border-[var(--border)] px-2 py-1 font-mono text-xs uppercase tracking-[0.12em] hover:border-[var(--accent)]"
            onClick={onImage}
          >
            image
          </button>
        </div>
        <textarea
          className="mt-3 h-20 w-full resize-none border border-[var(--border)] bg-[var(--status-bg)] p-2 font-mono text-sm text-[var(--app-text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
          placeholder="Paste 36 or 81 chars: 0 or . for blanks"
          value={puzzleText}
          onChange={(event) => onPuzzleTextChange(event.target.value)}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-[var(--muted)]">
            Newspaper dailies can come in here by paste or photo; automated
            scraping is intentionally not wired in.
          </p>
          <button
            type="button"
            className="shrink-0 border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.14em] text-[var(--app-bg)]"
            onClick={onLoadPasted}
          >
            load
          </button>
        </div>
      </NewGameSection>

      {status && (
        <p className="border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.14em] text-[var(--accent)]">
          {status}
        </p>
      )}
    </div>
  )
}

function NewGameAction({
  command,
  description,
  disabled = false,
  onClick,
}: {
  command: string
  description: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="group flex items-start gap-3 border border-[var(--border)] bg-[var(--button-bg)] p-3 text-left transition hover:border-[var(--accent)] hover:bg-[var(--panel-soft)] disabled:cursor-wait disabled:opacity-60"
      onClick={onClick}
    >
      <span className="mt-0.5 shrink-0 font-mono text-sm text-[var(--border)] transition group-hover:text-[var(--accent)]">
        →
      </span>
      <span className="min-w-0">
        <span className="block font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
          {command}
        </span>
        <span className="mt-1 block text-sm text-[var(--muted)]">
          {description}
        </span>
      </span>
    </button>
  )
}

function DailyMeta({
  label,
  tone = 'default',
  value,
}: {
  label: string
  tone?: 'default' | 'active' | 'done'
  value: string
}) {
  const toneClass =
    tone === 'done'
      ? 'text-[var(--accent)]'
      : tone === 'active'
        ? 'text-[var(--accent-2)]'
        : 'text-[var(--app-text)]'

  return (
    <div>
      <p className="text-[0.62rem] text-[var(--muted)]">{label}</p>
      <p className={`mt-1 ${toneClass}`}>{value}</p>
    </div>
  )
}

function DashboardPage({
  difficulty,
  localStats,
  mode,
  notifications,
  onDifficultyChange,
  onModeChange,
  onPlay,
  onSelect,
  onSizeChange,
  puzzleSize,
}: {
  difficulty: PuzzleDifficulty
  localStats: ProfileStats
  mode: PlayMode
  notifications?: ReactNode
  onDifficultyChange: (difficulty: PuzzleDifficulty) => void
  onModeChange: (mode: PlayMode) => void
  onPlay: () => void
  onSelect: (key: string) => void
  onSizeChange: (puzzleSize: PuzzleSize) => void
  puzzleSize: PuzzleSize
}) {
  const dailyDifficulties: PuzzleDifficulty[] = ['easy', 'medium', 'hard']
  // Generation is CPU-heavy — run it after first paint so the splash is instant.
  const [dailyGrids, setDailyGrids] = useState<Record<string, Grid> | null>(
    null,
  )

  useEffect(() => {
    const timer = setTimeout(() => {
      setDailyGrids({
        easy: generatePuzzle(
          'easy',
          dailySeed('easy', 'vimdoku', todayDateKey(), puzzleSize, mode),
          puzzleSize,
        ),
        medium: generatePuzzle(
          'medium',
          dailySeed('medium', 'vimdoku', todayDateKey(), puzzleSize, mode),
          puzzleSize,
        ),
        hard: generatePuzzle(
          'hard',
          dailySeed('hard', 'vimdoku', todayDateKey(), puzzleSize, mode),
          puzzleSize,
        ),
      })
    }, 0)
    return () => clearTimeout(timer)
  }, [mode, puzzleSize])

  const grid = dailyGrids?.[difficulty] ?? emptyGrid(puzzleSize)

  return (
    <section className="flex min-h-screen flex-col bg-[var(--app-bg)] font-mono lg:h-screen lg:overflow-y-auto">
      {notifications && (
        <div className="fixed right-3 top-3 z-30">{notifications}</div>
      )}
      <div className="grid flex-1 place-items-center px-4 py-10">
        <div className="w-full max-w-4xl">
          <pre className="overflow-hidden text-[0.4rem] leading-none text-[var(--accent)] sm:text-[0.62rem] md:text-[0.78rem]">
            {VIMDOKU_BANNER}
          </pre>
          <p className="mt-5 text-[0.7rem] uppercase tracking-[0.3em] text-[var(--muted)]">
            a vim-first sudoku
          </p>

          <div className="mt-6 grid gap-2 sm:grid-cols-3">
            <StreakTile
              label="daily streak"
              value={String(localStats.dailyStreak)}
              accent={localStats.completedToday}
            />
            <StreakTile
              label="best streak"
              value={String(localStats.bestDailyStreak)}
            />
            <StreakTile
              label="today"
              value={localStats.completedToday ? 'done' : 'open'}
              accent={!localStats.completedToday}
            />
          </div>

          <div className="mt-9 grid gap-4 md:grid-cols-2 md:items-start">
            <div className="relative border border-[var(--border)] bg-[var(--panel-bg)] p-3 md:order-2">
              <span className="absolute -top-[7px] left-3 bg-[var(--app-bg)] px-1.5 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                today
              </span>
              <div className="mb-2 grid grid-cols-2 gap-1.5">
                {PUZZLE_SIZES.map((option) => (
                  <button
                    type="button"
                    key={option}
                    onClick={() => onSizeChange(option)}
                    className={`border px-2 py-1.5 text-[0.68rem] font-bold uppercase tracking-[0.14em] transition ${
                      puzzleSize === option
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
                        : 'border-[var(--border)] bg-[var(--button-bg)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--app-text)]'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <div className="mb-2 grid grid-cols-2 gap-1.5">
                {PLAY_MODES.map((option) => (
                  <button
                    type="button"
                    key={option}
                    onClick={() => onModeChange(option)}
                    className={`border px-2 py-1.5 text-[0.68rem] font-bold uppercase tracking-[0.14em] transition ${
                      mode === option
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
                        : 'border-[var(--border)] bg-[var(--button-bg)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--app-text)]'
                    }`}
                  >
                    {modeLabel(option)}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {dailyDifficulties.map((option, index) => (
                  <button
                    type="button"
                    key={option}
                    onClick={() => onDifficultyChange(option)}
                    className={`flex items-center justify-center gap-1.5 border px-2 py-1.5 text-[0.68rem] font-bold uppercase tracking-[0.14em] transition ${
                      difficulty === option
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
                        : 'border-[var(--border)] bg-[var(--button-bg)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--app-text)]'
                    }`}
                  >
                    {option}
                    <span
                      className={
                        difficulty === option
                          ? 'text-[var(--app-bg)]'
                          : 'text-[var(--border)]'
                      }
                    >
                      {index + 1}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={onPlay}
                className="group mt-3 block w-full border border-[var(--border)] bg-[var(--input-bg)] p-3 transition hover:border-[var(--accent)] hover:bg-[var(--panel-soft)]"
              >
                <PuzzlePreview
                  grid={grid}
                  givens={grid.map((value) => value !== 0)}
                />
              </button>
              <p className="mt-3 text-center text-[0.7rem] uppercase tracking-[0.14em] text-[var(--muted)]">
                <span className="text-[var(--accent)]">↵</span> play{' '}
                {modeLabel(mode)} {difficulty} daily
              </p>
            </div>

            <div className="relative border border-[var(--border)] bg-[var(--panel-bg)] md:order-1">
              <span className="absolute -top-[7px] left-3 bg-[var(--app-bg)] px-1.5 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                menu
              </span>
              {DASHBOARD_ACTIONS.map(([actionKey, actionLabel]) => (
                <button
                  type="button"
                  key={actionKey}
                  onClick={() => onSelect(actionKey)}
                  className="group grid w-full grid-cols-[32px_24px_minmax(0,1fr)] items-center border-b border-[var(--border)] px-3 py-2.5 text-left last:border-b-0 hover:bg-[var(--panel-soft)]"
                >
                  <span className="text-center text-xs font-bold text-[var(--accent)]">
                    {actionKey}
                  </span>
                  <span className="text-[var(--border)]">→</span>
                  <span className="truncate text-sm lowercase tracking-[0.08em] text-[var(--app-text)] group-hover:text-[var(--accent)]">
                    {actionLabel}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <p className="mt-5 text-xs text-[var(--muted)]">
            <span className="text-[var(--accent)]">1-3</span> switch difficulty
            <span className="mx-2 text-[var(--border)]">·</span>
            <span className="text-[var(--accent)]">6/9</span> grid
            <span className="mx-2 text-[var(--border)]">·</span>
            <span className="text-[var(--accent)]">↵</span> play
            <span className="mx-2 text-[var(--border)]">·</span>
            <span className="text-[var(--accent)]">esc</span> skip
          </p>
        </div>
      </div>
    </section>
  )
}

function StreakTile({
  accent = false,
  label,
  value,
}: {
  accent?: boolean
  label: string
  value: string
}) {
  return (
    <div className="border border-[var(--border)] bg-[var(--panel-bg)] px-3 py-2 font-mono">
      <p className="text-[0.58rem] uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-black uppercase tracking-[0.12em] ${
          accent ? 'text-[var(--accent)]' : 'text-[var(--app-text)]'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

// One canonical header for every page: brand (→ home) + burger.
// Pages can inject contextual buttons via `extraActions`.
function AppShellHeader({
  extraActions,
  onHome,
  onMenu,
  title,
}: {
  extraActions?: ReactNode
  onHome: () => void
  onMenu: () => void
  title?: string
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--status-bg)] px-3 py-2">
      <div className="flex min-w-0 items-baseline gap-2 font-mono">
        <button
          type="button"
          onClick={onHome}
          aria-label="Home"
          className="shrink-0 text-sm font-bold uppercase tracking-[0.18em] text-[var(--accent)] transition hover:brightness-125"
        >
          vimdoku
        </button>
        {title && (
          <>
            <span className="shrink-0 text-[var(--border)]">/</span>
            <span className="truncate text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
              {title}
            </span>
          </>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {extraActions}
        <button
          type="button"
          aria-label="Open menu"
          onClick={onMenu}
          className="grid h-9 w-9 place-items-center border border-[var(--border)] bg-[var(--button-bg)] text-[var(--app-text)] transition hover:border-[var(--accent)] active:translate-y-px"
        >
          <Menu size={18} />
        </button>
      </div>
    </header>
  )
}

function AppPageFrame({
  children,
  extraActions,
  onOpenMenu,
  title,
}: {
  children: ReactNode
  extraActions?: ReactNode
  onOpenMenu: () => void
  title?: string
}) {
  const navigate = useNavigate()
  return (
    <section className="flex min-h-screen flex-col bg-[var(--workspace-bg)] font-mono lg:h-screen">
      <AppShellHeader
        extraActions={extraActions}
        onHome={() => void navigate({ to: '/' })}
        onMenu={onOpenMenu}
        title={title}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </div>
    </section>
  )
}

function NotificationsButton({
  onOpenChallenge,
  recipientAnonId,
}: {
  onOpenChallenge: (challengeId: string) => void
  recipientAnonId: string
}) {
  const [open, setOpen] = useState(false)
  const rows = useQuery(listNotificationsRef as FunctionReference<'query'>, {
    limit: 12,
    recipientAnonId,
  }) as NotificationRow[] | undefined
  const unreadCount = useQuery(
    unreadNotificationsRef as FunctionReference<'query'>,
    { recipientAnonId },
  ) as number | undefined
  const markRead = useMutation(
    markNotificationReadRef as FunctionReference<'mutation'>,
  ) as (args: {
    notificationId: string
    recipientAnonId: string
  }) => Promise<string | null>
  const markAllRead = useMutation(
    markAllNotificationsReadRef as FunctionReference<'mutation'>,
  ) as (args: { recipientAnonId: string }) => Promise<number>
  const notifications = rows ?? []
  const hasUnread = (unreadCount ?? 0) > 0

  async function openNotification(row: NotificationRow) {
    await markRead({
      notificationId: row._id,
      recipientAnonId,
    }).catch(() => undefined)
    setOpen(false)
    if (row.challengeId) onOpenChallenge(row.challengeId)
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notifications"
        title="Notifications"
        onClick={() => setOpen((current) => !current)}
        className={`relative grid h-9 w-9 place-items-center border bg-[var(--button-bg)] text-[var(--app-text)] transition active:translate-y-px ${
          hasUnread
            ? 'border-[var(--accent)] text-[var(--accent)]'
            : 'border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
        }`}
      >
        <Bell size={16} />
        {hasUnread && (
          <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center border border-[var(--app-bg)] bg-[var(--accent)] px-1 font-mono text-[0.55rem] font-black leading-none text-[var(--app-bg)]">
            {Math.min(unreadCount ?? 0, 9)}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-[min(92vw,360px)] border border-[var(--border)] bg-[var(--panel-bg)] shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
          <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-[var(--accent)]">
              [notifications]
            </span>
            <button
              type="button"
              disabled={!hasUnread}
              className="text-[0.62rem] font-black uppercase tracking-[0.14em] text-[var(--muted)] transition hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => {
                void markAllRead({ recipientAnonId })
              }}
            >
              mark read
            </button>
          </header>
          {rows === undefined ? (
            <p className="p-3 font-mono text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
              loading inbox...
            </p>
          ) : notifications.length === 0 ? (
            <p className="p-3 text-sm leading-relaxed text-[var(--muted)]">
              No notifications yet.
            </p>
          ) : (
            <div className="max-h-[420px] divide-y divide-[var(--border)] overflow-y-auto">
              {notifications.map((row) => (
                <button
                  type="button"
                  key={row._id}
                  className="grid w-full grid-cols-[6px_minmax(0,1fr)] gap-3 p-3 text-left transition hover:bg-[var(--panel-soft)]"
                  onClick={() => void openNotification(row)}
                >
                  <span
                    className={`mt-1 h-2 w-2 ${
                      row.readAt ? 'bg-[var(--border)]' : 'bg-[var(--accent)]'
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-xs font-black uppercase tracking-[0.16em] text-[var(--app-text)]">
                      {row.body}
                    </span>
                    <span className="mt-1 block font-mono text-[0.65rem] uppercase tracking-[0.12em] text-[var(--muted)]">
                      {formatGameDate(row.createdAt)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  active = false,
  children,
  disabled = false,
  hint,
  label,
  onClick,
}: {
  active?: boolean
  children: ReactNode
  disabled?: boolean
  hint?: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className={`flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left font-mono text-xs lowercase tracking-[0.1em] transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:active:translate-y-0 ${
        active
          ? 'bg-[var(--accent)] text-[var(--app-bg)]'
          : 'text-[var(--app-text)] hover:bg-[var(--panel-soft)]'
      }`}
      onClick={onClick}
    >
      <span className="grid h-4 w-4 shrink-0 place-items-center">
        {children}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {hint && (
        <span
          className={`shrink-0 ${active ? 'text-[var(--app-bg)]' : 'text-[var(--muted)]'}`}
        >
          {hint}
        </span>
      )}
    </button>
  )
}

function HintRail({
  applyHint,
  askForHint,
  clearHints,
  conflicts,
  hint,
  hintMode,
  onClose,
}: {
  applyHint: () => void
  askForHint: (mode?: HintMode) => void
  clearHints: (closeRail?: boolean) => void
  conflicts: number
  hint: Hint | null
  hintMode: HintMode
  onClose: () => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col font-mono">
      <header className="flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--status-bg)] px-4 text-[var(--status-text)]">
        <span className="text-xs uppercase tracking-[0.16em]">
          [hint-engine]
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]"
            onClick={() => clearHints(true)}
          >
            off
          </button>
          <button
            type="button"
            className="border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]"
            onClick={onClose}
          >
            close
          </button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <div className="grid grid-cols-3 gap-2">
          {(['nudge', 'explain', 'show'] as HintMode[]).map((mode) => (
            <button
              type="button"
              key={mode}
              className={`border px-2 py-2 text-xs font-bold capitalize ${
                hintMode === mode
                  ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
                  : 'border-[var(--border)] bg-[var(--button-bg)]'
              }`}
              onClick={() => askForHint(mode)}
            >
              {mode}
            </button>
          ))}
        </div>

        <section className="min-h-40 border border-[var(--border)] bg-[var(--input-bg)] p-3 text-sm text-[var(--app-text)]">
          {hint ? (
            <div className="space-y-3">
              {'technique' in hint && (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
                    {hint.technique}
                  </p>
                  {'values' in hint && (
                    <span className="border border-[var(--border)] bg-[var(--status-bg)] px-2 py-1 text-[0.62rem] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                      remove {hint.values.join('/')}
                    </span>
                  )}
                </div>
              )}
              <p className="font-sans leading-relaxed">
                {hintText(hint, hintMode)}
              </p>
              {'cells' in hint && (
                <p className="border-l-2 border-[var(--accent)] pl-3 font-mono text-xs leading-relaxed text-[var(--muted)]">
                  Highlighted cells are the candidate pattern and affected
                  cells. Use your notes to remove the marked candidate; no digit
                  is placed.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {'cell' in hint && hintMode === 'show' && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--status-text)]"
                    onClick={applyHint}
                  >
                    <Check size={16} />
                    Place {hint.value}
                  </button>
                )}
                <button
                  type="button"
                  className="border border-[var(--border)] bg-[var(--button-bg)] px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--app-text)]"
                  onClick={() => clearHints()}
                >
                  clear hint
                </button>
              </div>
            </div>
          ) : (
            <p className="font-sans leading-relaxed">
              Press ? or choose a hint depth. Nudge keeps the answer hidden;
              explain names the technique; show can place the value.
            </p>
          )}
        </section>

        {conflicts > 0 && (
          <p className="flex gap-2 border border-[var(--danger)] bg-[var(--input-bg)] p-3 text-sm font-bold text-[var(--danger)]">
            <AlertCircle size={16} />
            {conflicts} conflicting cells need attention.
          </p>
        )}

        <section className="mt-auto border border-[var(--border)] bg-[var(--panel-bg)] p-3 text-xs text-[var(--muted)]">
          <p className="text-[var(--accent)]">keys</p>
          <div className="mt-2 grid grid-cols-[70px_minmax(0,1fr)] gap-y-1">
            <span>?</span>
            <span>request current hint mode</span>
            <span>:hint</span>
            <span>open hint from command line</span>
            <span>:noh</span>
            <span>clear hint highlights</span>
            <span>:nohint</span>
            <span>turn hints off</span>
            <span>Esc</span>
            <span>clear hints</span>
          </div>
        </section>
      </div>
    </div>
  )
}

function GameLibrary({
  activeGameId,
  completedCount,
  filter,
  inProgressCount,
  onDelete,
  onFilterChange,
  onQueryChange,
  onResume,
  query,
  records,
  totalCount,
}: {
  activeGameId: string
  completedCount: number
  filter: GameLibraryFilter
  inProgressCount: number
  onDelete: (id: string) => void
  onFilterChange: (filter: GameLibraryFilter) => void
  onQueryChange: (value: string) => void
  onResume: (record: GameRecord) => void
  query: string
  records: GameRecord[]
  totalCount: number
}) {
  const [visibleCount, setVisibleCount] = useState(80)
  const visibleRecords = records.slice(0, visibleCount)
  const filters: [GameLibraryFilter, string, number][] = [
    ['all', 'all', totalCount],
    ['in-progress', 'active', inProgressCount],
    ['completed', 'done', completedCount],
  ]

  return (
    <div className="space-y-3">
      <section className="grid grid-cols-3 gap-px border border-[var(--border)] bg-[var(--border)]">
        <ArchiveStat label="total" value={String(totalCount)} />
        <ArchiveStat label="in progress" value={String(inProgressCount)} />
        <ArchiveStat label="completed" value={String(completedCount)} />
      </section>

      <section className="border border-[var(--border)] bg-[var(--panel-bg)]">
        <div className="grid gap-2 border-b border-[var(--border)] bg-[var(--status-bg)] p-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <label className="flex min-w-0 items-center gap-2 border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2">
            <Search size={16} className="shrink-0 text-[var(--accent)]" />
            <input
              className="min-w-0 flex-1 bg-transparent font-mono text-sm text-[var(--app-text)] outline-none placeholder:text-[var(--muted)]"
              placeholder="filter by source, difficulty, status"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
            />
          </label>
          <div className="flex gap-1 overflow-x-auto">
            {filters.map(([filterId, label, count]) => (
              <button
                type="button"
                key={filterId}
                className={`shrink-0 border px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] ${
                  filter === filterId
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
                    : 'border-[var(--border)] bg-[var(--button-bg)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--app-text)]'
                }`}
                onClick={() => onFilterChange(filterId)}
              >
                {label} <span className="opacity-70">{count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-[var(--border)]">
          {visibleRecords.length === 0 ? (
            <p className="p-5 text-sm text-[var(--muted)]">
              No saved puzzles match this view.
            </p>
          ) : (
            visibleRecords.map((record) => (
              <article
                key={record.id}
                className="grid gap-4 bg-[var(--input-bg)] p-3 md:grid-cols-[128px_minmax(0,1fr)_auto] md:items-start"
              >
                <PuzzlePreview grid={record.grid} givens={record.givens} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-mono text-sm font-bold uppercase tracking-[0.14em] text-[var(--app-text)]">
                      {record.source}
                      {` / ${record.puzzleSize}`}
                      {` / ${modeLabel(record.playMode)}`}
                      {record.difficulty ? ` / ${record.difficulty}` : ''}
                    </h2>
                    <span
                      className={`border px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.14em] ${
                        record.status === 'completed'
                          ? 'border-[var(--border)] text-[var(--muted)]'
                          : 'border-[var(--accent-2)] text-[var(--accent-2)]'
                      }`}
                    >
                      {record.status === 'completed' ? 'done' : 'active'}
                    </span>
                    {record.id === activeGameId && (
                      <span className="border border-[var(--accent)] px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
                        current
                      </span>
                    )}
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                    <span>
                      <span className="text-[var(--app-text)]">
                        {record.completion}/{cellCountFor(record)}
                      </span>{' '}
                      filled
                    </span>
                    <span className="text-[var(--border)]">·</span>
                    <span className="text-[var(--app-text)]">
                      {formatDuration(record.elapsedMs)}
                    </span>
                    <span className="text-[var(--border)]">·</span>
                    <span>
                      updated{' '}
                      <span className="text-[var(--app-text)]">
                        {formatGameDate(record.updatedAt)}
                      </span>
                    </span>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 md:w-36 md:grid-cols-1">
                  <button
                    type="button"
                    className="border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.14em] text-[var(--app-bg)]"
                    onClick={() => onResume(record)}
                  >
                    {record.status === 'completed' ? 'open' : 'resume'}
                  </button>
                  {record.id === activeGameId ? (
                    <span className="border border-[var(--border)] px-3 py-2 text-center font-mono text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                      loaded
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="border border-[var(--border)] px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.14em] text-[var(--danger)] hover:border-[var(--danger)]"
                      onClick={() => onDelete(record.id)}
                    >
                      delete
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
        </div>

        {records.length > visibleRecords.length && (
          <button
            type="button"
            className="w-full border-t border-[var(--border)] bg-[var(--button-bg)] px-3 py-3 font-mono text-xs font-bold uppercase tracking-[0.16em] text-[var(--accent)] hover:bg-[var(--panel-soft)]"
            onClick={() => setVisibleCount((count) => count + 80)}
          >
            show next {Math.min(80, records.length - visibleRecords.length)}{' '}
            puzzles
          </button>
        )}
      </section>
    </div>
  )
}

function ArchiveStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--input-bg)] p-4">
      <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-2 font-mono text-2xl font-black text-[var(--app-text)]">
        {value}
      </p>
    </div>
  )
}

function GameFinder({
  activeGameId,
  cursor,
  onCursorChange,
  onDelete,
  onQueryChange,
  onResume,
  query,
  records,
  selectedRecord,
}: {
  activeGameId: string
  cursor: number
  onCursorChange: (value: number | ((current: number) => number)) => void
  onDelete: (id: string) => void
  onQueryChange: (value: string) => void
  onResume: (record: GameRecord) => void
  query: string
  records: GameRecord[]
  selectedRecord: GameRecord | null
}) {
  const selectedIndex = Math.min(cursor, Math.max(0, records.length - 1))
  const moveCursor = (delta: 1 | -1) => {
    onCursorChange((current) => {
      if (records.length === 0) return 0
      return (current + delta + records.length) % records.length
    })
  }

  return (
    <div
      role="listbox"
      tabIndex={-1}
      className="space-y-3"
      onKeyDown={(event) => {
        if (event.key === 'j' || event.key === 'ArrowDown') {
          event.preventDefault()
          moveCursor(1)
        } else if (event.key === 'k' || event.key === 'ArrowUp') {
          event.preventDefault()
          moveCursor(-1)
        } else if (event.key === 'Enter' && selectedRecord) {
          event.preventDefault()
          onResume(selectedRecord)
        }
      }}
    >
      <label className="flex items-center gap-2 border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2">
        <Search size={16} className="shrink-0 text-[var(--accent)]" />
        <input
          autoFocus
          className="min-w-0 flex-1 bg-transparent font-mono text-sm text-[var(--accent)] outline-none placeholder:text-[var(--muted)]"
          placeholder="filter puzzles"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <span className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
          {records.length} match{records.length === 1 ? '' : 'es'}
        </span>
      </label>

      {/* Telescope layout: results list (left) + live preview (right).
          The body is a fixed height and every box inside has a stable
          footprint, so moving the cursor never reflows anything. */}
      <div className="grid h-[56vh] grid-cols-[minmax(0,1fr)_300px] gap-3">
        <div className="min-h-0 overflow-y-auto border border-[var(--border)] bg-[var(--input-bg)]">
          {records.length === 0 ? (
            <p className="p-4 text-sm text-[var(--muted)]">No puzzles match.</p>
          ) : (
            records.map((record, index) => {
              const isSelected = index === selectedIndex
              const isCurrent = record.id === activeGameId
              return (
                <button
                  type="button"
                  key={record.id}
                  className={`grid w-full grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2 border-b border-[var(--border)] px-3 py-2 text-left font-mono last:border-b-0 ${
                    isSelected
                      ? 'bg-[var(--accent)] text-[var(--app-bg)]'
                      : 'bg-[var(--button-bg)] text-[var(--app-text)] hover:bg-[var(--panel-soft)]'
                  }`}
                  onClick={() => onResume(record)}
                  onMouseEnter={() => onCursorChange(index)}
                >
                  <span className="text-xs font-bold">
                    {isSelected ? '>' : ''}
                  </span>
                  <span className="min-w-0 truncate text-xs uppercase tracking-[0.16em]">
                    {record.source}
                    {` / ${record.puzzleSize}`}
                    {` / ${modeLabel(record.playMode)}`}
                    {record.difficulty ? ` / ${record.difficulty}` : ''}
                    {isCurrent ? ' / current' : ''}
                  </span>
                  <span
                    className={`text-xs uppercase tracking-[0.16em] ${
                      isSelected
                        ? 'text-[var(--app-bg)]'
                        : 'text-[var(--muted)]'
                    }`}
                  >
                    {record.status === 'completed'
                      ? formatDuration(record.elapsedMs)
                      : `${record.completion}/${cellCountFor(record)} · ${formatDuration(record.elapsedMs)}`}
                  </span>
                </button>
              )
            })
          )}
        </div>

        <div className="flex min-h-0 flex-col border border-[var(--border)] bg-[var(--input-bg)]">
          {selectedRecord ? (
            <>
              <div className="border-b border-[var(--border)] p-3">
                <PuzzlePreview
                  grid={selectedRecord.grid}
                  givens={selectedRecord.givens}
                />
              </div>
              <dl className="flex-1 space-y-1.5 overflow-y-auto p-3 font-mono text-xs">
                <PreviewRow label="source" value={selectedRecord.source} />
                <PreviewRow label="size" value={selectedRecord.puzzleSize} />
                <PreviewRow
                  label="mode"
                  value={modeLabel(selectedRecord.playMode)}
                />
                {selectedRecord.difficulty && (
                  <PreviewRow
                    label="difficulty"
                    value={selectedRecord.difficulty}
                  />
                )}
                <PreviewRow
                  label="status"
                  value={
                    selectedRecord.status === 'completed'
                      ? 'completed'
                      : 'in progress'
                  }
                />
                <PreviewRow
                  label="filled"
                  value={`${selectedRecord.completion}/${cellCountFor(selectedRecord)}`}
                />
                <PreviewRow
                  label="time"
                  value={formatDuration(selectedRecord.elapsedMs)}
                />
                <PreviewRow
                  label="updated"
                  value={formatGameDate(selectedRecord.updatedAt)}
                />
              </dl>
              {/* Fixed-height action slot: a button when deletable, an
                  equal-sized label for the current puzzle. Never shifts. */}
              <div className="border-t border-[var(--border)] p-2">
                {selectedRecord.id === activeGameId ? (
                  <span className="block border border-[var(--border)] px-3 py-1.5 text-center font-mono text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                    current puzzle
                  </span>
                ) : (
                  <button
                    type="button"
                    className="block w-full border border-[var(--border)] px-3 py-1.5 text-center font-mono text-xs uppercase tracking-[0.16em] text-[var(--danger)] transition hover:border-[var(--danger)]"
                    onClick={() => onDelete(selectedRecord.id)}
                  >
                    delete puzzle
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="p-4 text-sm text-[var(--muted)]">
              No puzzle selected.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

type LeaderboardScope = {
  size: PuzzleSize
  mode: PlayMode
  variant: VariantId
  difficulty: PuzzleDifficulty
}

type LeaderboardFilters = Omit<LeaderboardScope, 'difficulty'>

const DEFAULT_LEADERBOARD_FILTERS: LeaderboardFilters = {
  size: '9x9',
  mode: 'classic',
  variant: 'classic',
}

function Leaderboards({
  completedGames,
  globalScores,
  indexMode,
  indexSize,
  indexVariant,
  localScores,
  playerName,
  scope,
  scopedGlobalScores,
  status,
}: {
  completedGames: GameRecord[]
  globalScores: LeaderboardEntry[]
  indexMode: PlayMode
  indexSize: PuzzleSize
  indexVariant: VariantId
  localScores: GameRecord[]
  playerName: string
  scope: LeaderboardScope | null
  scopedGlobalScores: LeaderboardEntry[]
  status: string
}) {
  if (scope) {
    return (
      <LeaderboardsDetail
        globalScores={scopedGlobalScores}
        localScores={localScores}
        scope={scope}
        status={status}
      />
    )
  }
  return (
    <LeaderboardsIndex
      completedGames={completedGames}
      globalScores={globalScores}
      indexMode={indexMode}
      indexSize={indexSize}
      indexVariant={indexVariant}
      playerName={playerName}
    />
  )
}

type LeaderboardComboEntry = {
  id: string
  player: string
  source: string
  difficulty?: string
  elapsedMs: number
}

function LeaderboardsIndex({
  completedGames,
  globalScores,
  indexMode,
  indexSize,
  indexVariant,
  playerName,
}: {
  completedGames: GameRecord[]
  globalScores: LeaderboardEntry[]
  indexMode: PlayMode
  indexSize: PuzzleSize
  indexVariant: VariantId
  playerName: string
}) {
  const navigate = useNavigate()
  const localPlayer = isCustomPlayerName(playerName) ? playerName : 'you'
  const navigateToFilters = useCallback(
    (nextFilters: LeaderboardFilters) => {
      void navigate({
        to: leaderboardFiltersPath(nextFilters),
      })
    },
    [navigate],
  )

  const combos = useMemo(
    () =>
      LEADERBOARD_DIFFICULTIES.map((difficulty) => {
        const scope: LeaderboardScope = {
          size: indexSize,
          mode: indexMode,
          variant: indexVariant,
          difficulty,
        }
        const localTop: LeaderboardComboEntry[] = completedGames
          .filter(
            (record) =>
              (record.puzzleSize ?? '9x9') === indexSize &&
              (record.playMode ?? 'classic') === indexMode &&
              (record.variantId ?? 'classic') === indexVariant &&
              record.difficulty === difficulty &&
              record.elapsedMs > 0,
          )
          .map((record) => ({
            id: `local-${record.id}`,
            player: localPlayer,
            source: record.source,
            difficulty: record.difficulty,
            elapsedMs: record.elapsedMs,
          }))
        const globalTop: LeaderboardComboEntry[] = globalScores
          .filter(
            (score) =>
              leaderboardEntryMatches(
                score,
                indexSize,
                indexMode,
                indexVariant,
              ) && score.difficulty === difficulty,
          )
          .map((score) => ({
            id: `global-${score.id}`,
            player: score.player,
            source: score.source,
            difficulty: score.difficulty,
            elapsedMs: score.elapsedMs,
          }))
        const top = [...localTop, ...globalTop]
          .sort((a, b) => a.elapsedMs - b.elapsedMs)
          .slice(0, 10)
        return { scope, top }
      }),
    [
      completedGames,
      globalScores,
      indexMode,
      indexSize,
      indexVariant,
      localPlayer,
    ],
  )

  return (
    <div className="space-y-3">
      <section className="flex flex-wrap items-center justify-between gap-3 border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2">
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-[var(--muted)]">
          <span className="text-[var(--accent)]">{indexSize}</span>
          <span className="mx-1.5 text-[var(--border)]">·</span>
          <span className="text-[var(--app-text)]">{modeLabel(indexMode)}</span>
          {indexVariant !== 'classic' && (
            <>
              <span className="mx-1.5 text-[var(--border)]">·</span>
              <span className="text-[var(--app-text)]">
                {leaderboardVariantLabel(indexVariant)}
              </span>
            </>
          )}
        </p>
        <div className="grid w-full gap-2 sm:grid-cols-3 xl:w-[520px]">
          <ChallengeSelectField
            value={indexSize}
            label="size"
            hideLabel
            onChange={(value) =>
              navigateToFilters({
                size: value as PuzzleSize,
                mode: indexMode,
                variant: indexVariant,
              })
            }
            options={PUZZLE_SIZES.map((value) => ({ label: value, value }))}
          />
          <ChallengeSelectField
            value={indexMode}
            label="mode"
            hideLabel
            onChange={(value) =>
              navigateToFilters({
                size: indexSize,
                mode: value as PlayMode,
                variant: indexVariant,
              })
            }
            options={LEADERBOARD_PLAY_MODES.map((value) => ({
              label: modeLabel(value),
              value,
            }))}
          />
          <ChallengeSelectField
            value={indexVariant}
            label="variant"
            hideLabel
            onChange={(value) =>
              navigateToFilters({
                size: indexSize,
                mode: indexMode,
                variant: value as VariantId,
              })
            }
            options={(Object.keys(VARIANTS) as VariantId[]).map((value) => ({
              label: leaderboardVariantLabel(value),
              value,
            }))}
          />
        </div>
      </section>
      <div className="grid gap-3 lg:grid-cols-2">
        {combos.map(({ scope: combo, top }) => {
          const hasEntries = top.length > 0
          return (
            <button
              type="button"
              key={`${combo.size}-${combo.mode}-${combo.variant}-${combo.difficulty}`}
              onClick={() =>
                void navigate({
                  to: leaderboardScopePath(combo),
                })
              }
              className={`group flex flex-col gap-4 border border-[var(--border)] bg-[var(--input-bg)] p-4 text-left transition hover:border-[var(--accent)] hover:bg-[var(--panel-soft)] ${
                hasEntries ? 'min-h-64' : ''
              }`}
            >
              <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-[0.7rem] uppercase tracking-[0.14em]">
                <span className="font-black text-[var(--accent)]">
                  {combo.size}
                </span>
                <span className="text-[var(--border)]">·</span>
                <span className="font-bold text-[var(--app-text)]">
                  {modeLabel(combo.mode)}
                </span>
                {combo.variant !== 'classic' && (
                  <>
                    <span className="text-[var(--border)]">·</span>
                    <span className="text-[var(--muted)]">
                      {leaderboardVariantLabel(combo.variant)}
                    </span>
                  </>
                )}
                <span className="text-[var(--border)]">·</span>
                <span className="font-bold text-[var(--accent-2)]">
                  {combo.difficulty}
                </span>
              </header>
              {!hasEntries ? (
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                  no entries yet
                </p>
              ) : (
                <ol className="grid gap-1 font-mono text-xs">
                  {top.map((entry, index) => (
                    <li
                      key={entry.id}
                      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-2"
                    >
                      <span className="text-[var(--muted)]">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="min-w-0 truncate">
                        <span className="font-bold uppercase tracking-[0.1em] text-[var(--app-text)]">
                          {entry.player}
                        </span>
                        <span className="mx-1.5 text-[var(--border)]">·</span>
                        <span className="text-[var(--muted)]">
                          {entry.source}
                        </span>
                      </span>
                      <span className="font-bold text-[var(--accent)]">
                        {formatDuration(entry.elapsedMs)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function LeaderboardsDetail({
  globalScores,
  localScores,
  scope,
  status,
}: {
  globalScores: LeaderboardEntry[]
  localScores: GameRecord[]
  scope: LeaderboardScope
  status: string
}) {
  const navigate = useNavigate()
  const scopeLabel = leaderboardScopeLabel(scope)

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-3 border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.14em]">
        <button
          type="button"
          onClick={() =>
            void navigate({
              to: leaderboardFiltersPath(scope),
            })
          }
          className="border border-[var(--border)] bg-[var(--button-bg)] px-2 py-1 font-bold text-[var(--accent)] transition hover:border-[var(--accent)] hover:bg-[var(--panel-soft)]"
        >
          ← all boards
        </button>
        <span className="text-[var(--app-text)]">{scopeLabel}</span>
      </header>
      <div className="grid gap-3 lg:grid-cols-2">
        <LeaderboardPanel
          title="local best"
          empty={`No completed ${scopeLabel} local games yet.`}
        >
          {localScores.map((record, index) => (
            <LeaderboardRow
              key={record.id}
              rank={index + 1}
              primary={cleanLeaderboardSource(record.source, scope)}
              secondary={formatLeaderboardDate(
                record.completedAt ?? record.updatedAt,
              )}
              time={formatDuration(record.elapsedMs)}
            />
          ))}
        </LeaderboardPanel>

        <LeaderboardPanel
          title="global best"
          empty={status || `No global ${scopeLabel} scores loaded.`}
        >
          {globalScores.map((score, index) => (
            <LeaderboardRow
              key={score.id}
              rank={index + 1}
              primary={score.player}
              secondary={cleanLeaderboardSource(score.source, scope)}
              time={formatDuration(score.elapsedMs)}
            />
          ))}
        </LeaderboardPanel>
      </div>
    </div>
  )
}

function ChallengeSetupPanel({
  anonId,
  difficulty,
  kind,
  mode,
  onCreate,
  onCreateCurrent,
  onDifficultyChange,
  onModeChange,
  onRecipientChange,
  onRecipientClear,
  onSizeChange,
  onSourceChange,
  onTurnLivesChange,
  onTurnSecondsChange,
  onVariantChange,
  puzzleSize,
  recipient,
  source,
  status,
  turnLives,
  turnSeconds,
  variant,
}: {
  anonId: string
  difficulty: PuzzleDifficulty
  kind: ChallengeSetupKind
  mode: PlayMode
  onCreate: () => void
  onCreateCurrent: () => void
  onDifficultyChange: (difficulty: PuzzleDifficulty) => void
  onModeChange: (mode: PlayMode) => void
  onRecipientChange: (friend: FriendSummary | null) => void
  onRecipientClear: () => void
  onSizeChange: (puzzleSize: PuzzleSize) => void
  onSourceChange: (source: ChallengePuzzleSource) => void
  onTurnLivesChange: (lives: number) => void
  onTurnSecondsChange: (seconds: number) => void
  onVariantChange: (variant: VariantId) => void
  puzzleSize: PuzzleSize
  recipient: FriendSummary | null
  source: ChallengePuzzleSource
  status: string
  turnLives: number
  turnSeconds: number
  variant: VariantId
}) {
  const isLive = isLiveChallengeSetup(kind)
  const isTurnBattle = kind === 'live-turns'
  const sources: [ChallengePuzzleSource, string, string][] = [
    ['daily', 'daily', 'stable puzzle for today'],
    ['generated', 'generated', 'fresh random puzzle'],
    ['current', 'current', 'use loaded board'],
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="pb-6">
        <section className="space-y-3">
          <div className="border-b border-[var(--border)] pb-3">
            <p className="font-mono text-xs font-black uppercase tracking-[0.18em] text-[var(--accent)]">
              {challengeSetupLabel(kind)}
            </p>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              {challengeSetupDescription(kind)}
            </p>
          </div>

          {isLive ? (
            <ChallengeReadOnlyField
              label="target"
              value="Live room link"
              helper="Copy the invite link after the room is created."
            />
          ) : hasConvexBackend() ? (
            <ChallengeTargetSelect
              anonId={anonId}
              onRecipientChange={onRecipientChange}
              onRecipientClear={onRecipientClear}
              recipient={recipient}
            />
          ) : (
            <ChallengeReadOnlyField
              label="target"
              value="Open link"
              helper="Direct friend targets are unavailable right now. You can still create an open challenge link."
            />
          )}

          <ChallengeSelectField
            label="puzzle source"
            value={source}
            onChange={(value) => onSourceChange(value as ChallengePuzzleSource)}
            options={sources.map(([value, label, description]) => ({
              description,
              label,
              value,
            }))}
          />

          {source !== 'current' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <ChallengeSelectField
                label="board"
                value={puzzleSize}
                onChange={(value) => onSizeChange(value as PuzzleSize)}
                options={PUZZLE_SIZES.map((value) => ({ label: value, value }))}
              />
              <ChallengeSelectField
                label="mode"
                value={mode}
                onChange={(value) => onModeChange(value as PlayMode)}
                options={PLAY_MODES.map((value) => ({
                  label: modeLabel(value),
                  value,
                }))}
              />
              <ChallengeSelectField
                label="difficulty"
                value={difficulty}
                onChange={(value) =>
                  onDifficultyChange(value as PuzzleDifficulty)
                }
                options={NEW_GAME_DIFFICULTIES.map((value) => ({
                  label: value,
                  value,
                }))}
              />
              <ChallengeSelectField
                label="variant"
                value={variant}
                onChange={(value) => onVariantChange(value as VariantId)}
                options={(Object.keys(VARIANTS) as VariantId[]).map(
                  (value) => ({
                    label: VARIANTS[value].label,
                    value,
                  }),
                )}
              />
            </div>
          )}

          {isTurnBattle && (
            <div className="grid gap-3 border-t border-[var(--border)] pt-3 sm:grid-cols-2">
              <ChallengeRangeField
                label="turn timer"
                max={60}
                min={8}
                name="turn-seconds"
                suffix="s"
                value={turnSeconds}
                onChange={onTurnSecondsChange}
              />
              <ChallengeRangeField
                label="lives"
                max={9}
                min={1}
                name="turn-lives"
                value={turnLives}
                onChange={onTurnLivesChange}
              />
            </div>
          )}

          {status && (
            <p className="border-t border-[var(--border)] pt-3 font-mono text-xs uppercase tracking-[0.14em] text-[var(--accent)]">
              {status}
            </p>
          )}
        </section>
      </div>

      <div className="sticky bottom-0 z-10 -mx-3 -mb-3 flex flex-col gap-2 border-t border-[var(--border)] bg-[var(--status-bg)] p-3 sm:flex-row sm:items-center">
        <button
          type="button"
          className="border border-[var(--accent)] bg-[var(--accent)] px-4 py-2.5 font-mono text-xs font-black uppercase tracking-[0.16em] text-[var(--app-bg)] sm:min-w-72"
          onClick={onCreate}
        >
          {!isLive && recipient
            ? `send ${challengeSetupLabel(kind)}`
            : `create ${challengeSetupLabel(kind)} link`}
        </button>
        {source !== 'current' && (
          <button
            type="button"
            className="px-2 py-2 font-mono text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)] transition hover:text-[var(--accent)] sm:ml-auto"
            onClick={onCreateCurrent}
          >
            use current puzzle
          </button>
        )}
      </div>
    </div>
  )
}

function ChallengeSelectField({
  hideLabel = false,
  label,
  onChange,
  options,
  value,
}: {
  hideLabel?: boolean
  label: string
  onChange: (value: string) => void
  options: { description?: string; label: string; value: string }[]
  value: string
}) {
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )
  const selected = options[selectedIndex] ?? options[0]

  return (
    <div className="grid gap-1.5 font-mono">
      <p
        className={`text-[0.65rem] uppercase tracking-[0.18em] text-[var(--muted)] ${
          hideLabel ? 'sr-only' : ''
        }`}
      >
        {label}
      </p>
      <SelectPrimitive.Root value={value} onValueChange={onChange}>
        <SelectPrimitive.Trigger
          aria-label={label}
          className="group grid min-h-10 grid-cols-[minmax(0,1fr)_2rem] items-center border border-[var(--border)] bg-[var(--button-bg)] text-left transition hover:border-[var(--accent)] data-[state=open]:border-[var(--accent)]"
        >
          <SelectPrimitive.Value asChild>
            <span className="min-w-0 truncate px-3 py-2 text-sm font-bold uppercase tracking-[0.08em] text-[var(--app-text)]">
              {selected?.label ?? value}
            </span>
          </SelectPrimitive.Value>
          <SelectPrimitive.Icon asChild>
            <ChevronDown
              aria-hidden="true"
              className="place-self-center text-[var(--muted)] transition group-data-[state=open]:rotate-180 group-data-[state=open]:text-[var(--accent)]"
              size={16}
            />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            className="z-[60] max-h-64 w-[var(--radix-select-trigger-width)] overflow-hidden border border-[var(--accent)] bg-[var(--panel-bg)] font-mono shadow-[0_10px_24px_rgba(0,0,0,0.35)]"
            collisionPadding={12}
            position="popper"
            sideOffset={4}
          >
            <SelectPrimitive.Viewport>
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  className="group grid cursor-pointer gap-1 px-3 py-2 text-left outline-none transition data-[highlighted]:bg-[var(--status-bg)] data-[highlighted]:text-[var(--accent)] data-[state=checked]:bg-[var(--accent)] data-[state=checked]:text-[var(--app-bg)]"
                >
                  <SelectPrimitive.ItemText>
                    <span className="block truncate text-xs font-black uppercase tracking-[0.14em]">
                      {option.label}
                    </span>
                    {option.description && (
                      <span className="block text-xs leading-5 text-[var(--muted)] group-data-[state=checked]:text-[var(--app-bg)]">
                        {option.description}
                      </span>
                    )}
                  </SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
      {selected?.description && (
        <p className="text-xs leading-5 text-[var(--muted)]">
          {selected.description}
        </p>
      )}
    </div>
  )
}

function ChallengeReadOnlyField({
  helper,
  label,
  value,
}: {
  helper: string
  label: string
  value: string
}) {
  return (
    <div className="grid gap-1.5 font-mono">
      <p className="text-[0.65rem] uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
      </p>
      <div className="min-h-10 border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 text-sm font-bold uppercase tracking-[0.08em] text-[var(--app-text)]">
        {value}
      </div>
      <p className="text-xs leading-5 text-[var(--muted)]">{helper}</p>
    </div>
  )
}

function ChallengeRangeField({
  label,
  max,
  min,
  name,
  onChange,
  suffix = '',
  value,
}: {
  label: string
  max: number
  min: number
  name: string
  onChange: (value: number) => void
  suffix?: string
  value: number
}) {
  return (
    <label className="grid gap-1.5 font-mono">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[0.65rem] uppercase tracking-[0.18em] text-[var(--muted)]">
          {label}
        </span>
        <span className="text-sm font-black text-[var(--accent)] tabular-nums">
          {value}
          {suffix}
        </span>
      </span>
      <input
        className="h-10 w-full accent-[var(--accent)]"
        max={max}
        min={min}
        name={name}
        step={1}
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function ChallengeTargetSelect({
  anonId,
  onRecipientChange,
  onRecipientClear,
  recipient,
}: {
  anonId: string
  onRecipientChange: (friend: FriendSummary | null) => void
  onRecipientClear: () => void
  recipient: FriendSummary | null
}) {
  const rows = useQuery(listFriendsRef as FunctionReference<'query'>, {
    anonId,
  }) as FriendshipRow[] | undefined
  const friends = rows?.filter((row) => row.status === 'accepted') ?? []
  const options = [
    {
      description: 'Anyone with the link can join.',
      label: 'Open challenge link',
      value: 'open',
    },
    ...friends.map((row) => ({
      description: row.friend.friendCode || 'friend',
      label: row.friend.name,
      value: row.friend.anonId,
    })),
  ]

  return (
    <div className="grid gap-1.5">
      <ChallengeSelectField
        label="target"
        value={recipient?.anonId ?? 'open'}
        onChange={(value) => {
          if (value === 'open') {
            onRecipientClear()
            return
          }
          const row = friends.find(
            (friendship) => friendship.friend.anonId === value,
          )
          onRecipientChange(row?.friend ?? null)
        }}
        options={options}
      />
      {rows === undefined && (
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
          loading friends...
        </p>
      )}
      {rows !== undefined && friends.length === 0 && (
        <p className="font-mono text-xs leading-5 text-[var(--muted)]">
          Add a friend from your profile before sending a direct challenge.
        </p>
      )}
    </div>
  )
}

function ChallengeRacePanel({
  activeChallengeId,
  challenge,
  challengeId,
  isCurrentSolved,
  onContinue,
  onCopyLink,
  onStart,
  shareUrl,
  status,
}: {
  activeChallengeId: string | null
  challenge: ChallengeRace | null
  challengeId: string | null
  isCurrentSolved: boolean
  onContinue: () => void
  onCopyLink: () => void
  onStart: (challenge: ChallengeRace) => void
  shareUrl: string
  status: string
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')

  useEffect(() => {
    if (copyState !== 'copied') return
    const timer = window.setTimeout(() => setCopyState('idle'), 1800)
    return () => window.clearTimeout(timer)
  }, [copyState])

  if (!hasConvexBackend()) {
    return (
      <section className="border border-[var(--border)] bg-[var(--input-bg)] p-5">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
          challenge backend offline
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          Challenge links use Convex so both players can see the same lobby and
          submit results. Set `VITE_CONVEX_URL` to enable this mode.
        </p>
      </section>
    )
  }

  if (!challengeId) {
    return (
      <section className="border border-[var(--border)] bg-[var(--input-bg)] p-5 text-sm text-[var(--muted)]">
        No challenge selected.
      </section>
    )
  }

  if (!challenge) {
    return (
      <section className="border border-[var(--border)] bg-[var(--input-bg)] p-5">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
          loading challenge
        </p>
        <p className="mt-3 text-sm text-[var(--muted)]">
          {status || `Looking up ${challengeId}...`}
        </p>
      </section>
    )
  }

  const completedAttempts = challenge.attempts.filter(
    (attempt) => attempt.status === 'completed',
  )
  const leader = completedAttempts[0] ?? null
  const modeName = challengeKindLabel(challenge.challengeKind)
  const isActiveRace = activeChallengeId === challenge.challengeId
  const isClosed = challenge.status === 'closed'
  const actionLabel = isClosed
    ? `${modeName} closed`
    : isCurrentSolved
    ? 'result submitted'
    : isActiveRace
      ? `continue ${modeName}`
      : `start ${modeName}`

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="border border-[var(--border)] bg-[var(--input-bg)]">
        <header className="grid gap-3 border-b border-[var(--border)] bg-[var(--status-bg)] p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="min-w-0">
            <p className="font-mono text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
              {modeName} link
            </p>
            <h2 className="mt-1 truncate font-mono text-xl font-black uppercase tracking-[0.12em] text-[var(--app-text)]">
              {challenge.challengeId}
            </h2>
          </div>
          <button
            type="button"
            className="border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 font-mono text-xs font-black uppercase tracking-[0.16em] text-[var(--app-bg)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isClosed || isCurrentSolved}
            onClick={() => {
              if (isClosed) return
              if (isActiveRace) onContinue()
              else onStart(challenge)
            }}
          >
            {actionLabel}
          </button>
        </header>

        <div className="p-3">
          <div className="min-w-0 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <ChallengeMeta label="created by" value={challenge.creatorName} />
              <ChallengeMeta
                label="target"
                value={challenge.recipientName ?? 'open link'}
              />
              <ChallengeMeta label="challenge" value={modeName} />
              <ChallengeMeta label="grid" value={challenge.puzzleSize} />
              <ChallengeMeta
                label="rules"
                value={modeLabel(challenge.playMode)}
              />
              <ChallengeMeta
                label="difficulty"
                value={challenge.difficulty ?? 'custom'}
              />
            </div>
            <div className="border border-[var(--border)] bg-[var(--panel-bg)] p-3">
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--muted)]">
                share
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <code className="min-w-0 truncate border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs text-[var(--app-text)]">
                  {shareUrl ||
                    `${window.location.origin}${challengePath(challenge.challengeId)}`}
                </code>
                <button
                  type="button"
                  aria-live="polite"
                  className={`min-w-24 border px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.14em] transition ${
                    copyState === 'copied'
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
                      : 'border-[var(--border)] bg-[var(--button-bg)] hover:border-[var(--accent)]'
                  }`}
                  onClick={() => {
                    onCopyLink()
                    setCopyState('copied')
                  }}
                >
                  {copyState === 'copied' ? 'copied' : 'copy'}
                </button>
              </div>
              <p
                className={`mt-2 font-mono text-[0.65rem] uppercase tracking-[0.14em] transition-opacity ${
                  copyState === 'copied'
                    ? 'text-[var(--accent)] opacity-100'
                    : 'text-[var(--muted)] opacity-0'
                }`}
              >
                link copied to clipboard
              </p>
            </div>
            <p className="text-sm leading-relaxed text-[var(--muted)]">
              {isClosed
                ? 'This legacy race is closed. The preserved result is still visible here, but the link no longer accepts new attempts.'
                : challenge.challengeKind === 'streak'
                ? 'Both players solve this exact puzzle. Bad entries count against your streak score, then time breaks ties.'
                : 'Both players solve this exact puzzle. The race starts when each player presses start, and fastest completed time wins.'}
            </p>
          </div>
        </div>
      </section>

      <section className="border border-[var(--border)] bg-[var(--input-bg)]">
        <header className="border-b border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
          [
          {challenge.challengeKind === 'streak' ? 'streak-board' : 'race-board'}
          ]
        </header>
        {challenge.attempts.length === 0 ? (
          <p className="p-4 text-sm leading-relaxed text-[var(--muted)]">
            No attempts yet. Start the challenge, then send the link.
          </p>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {challenge.attempts.map((attempt, index) => (
              <div
                key={`${attempt.anonId}-${attempt.recordId}`}
                className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 font-mono"
              >
                <span className="text-xs font-black text-[var(--accent)]">
                  {attempt.status === 'completed' ? index + 1 : '...'}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[var(--app-text)]">
                    {attempt.player}
                    {leader?.recordId === attempt.recordId ? ' / leader' : ''}
                  </p>
                  <p className="text-[0.65rem] uppercase tracking-[0.14em] text-[var(--muted)]">
                    {attempt.status === 'completed'
                      ? challenge.challengeKind === 'streak'
                        ? `${attempt.mistakes} misses · ${formatGameDate(attempt.completedAt ?? attempt.updatedAt)}`
                        : `finished ${formatGameDate(attempt.completedAt ?? attempt.updatedAt)}`
                      : `${attempt.completion}/${boardConfigFor(challenge.puzzleSize).cellCount} filled`}
                  </p>
                </div>
                <span className="text-sm font-black text-[var(--app-text)]">
                  {attempt.status === 'completed'
                    ? formatDuration(attempt.elapsedMs)
                    : 'racing'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function LiveBattleRoomPanel({
  activeRoomId,
  currentAnonId,
  isCurrentSolved,
  onContinue,
  onCopyLink,
  onStart,
  room,
  roomId,
  shareUrl,
  status,
}: {
  activeRoomId: string | null
  currentAnonId: string
  isCurrentSolved: boolean
  onContinue: () => void
  onCopyLink: () => void
  onStart: (room: LiveBattleRoom) => void
  room: LiveBattleRoom | null
  roomId: string | null
  shareUrl: string
  status: string
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (copyState !== 'copied') return
    const timer = window.setTimeout(() => setCopyState('idle'), 1800)
    return () => window.clearTimeout(timer)
  }, [copyState])

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [])

  if (!hasConvexBackend()) {
    return (
      <section className="border border-[var(--border)] bg-[var(--input-bg)] p-5">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
          live backend offline
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          Live battles use Convex subscriptions for presence and progress. Set
          `VITE_CONVEX_URL` to enable this mode.
        </p>
      </section>
    )
  }

  if (!roomId) {
    return (
      <section className="border border-[var(--border)] bg-[var(--input-bg)] p-5 text-sm text-[var(--muted)]">
        No live room selected.
      </section>
    )
  }

  if (!room) {
    return (
      <section className="border border-[var(--border)] bg-[var(--input-bg)] p-5">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
          loading live room
        </p>
        <p className="mt-3 text-sm text-[var(--muted)]">
          {status || `Looking up ${roomId}...`}
        </p>
      </section>
    )
  }

  const isActiveRoom = activeRoomId === room.roomId
  const roomLabel =
    room.battleKind === 'turns'
      ? 'turn battle'
      : room.battleKind === 'coop'
        ? 'co-op'
        : 'live race'
  const cellCount = boardConfigFor(room.puzzleSize).cellCount
  const now = nowMs
  const me =
    room.presence.find((player) => player.anonId === currentAnonId) ?? null
  const opponents = room.presence.filter(
    (player) => player.anonId !== currentAnonId,
  )
  const onlineOpponents = opponents.filter(
    (player) => now - player.lastSeenAt < 8000,
  )
  const currentTurnPlayer = room.turnAnonId
    ? room.presence.find((player) => player.anonId === room.turnAnonId)
    : null
  const winner = room.winnerAnonId
    ? room.presence.find((player) => player.anonId === room.winnerAnonId)
    : null
  const raceCountdownMs =
    room.battleKind === 'race' && room.raceStartsAt
      ? Math.max(0, room.raceStartsAt - now)
      : null
  const canStartRace =
    room.battleKind !== 'race' ||
    room.status === 'live' ||
    (typeof raceCountdownMs === 'number' && raceCountdownMs <= 0)
  const actionLabel =
    room.battleKind === 'race' && room.status === 'finished'
      ? winner?.anonId === currentAnonId
        ? 'you won'
        : 'race finished'
      : room.battleKind === 'coop' && room.status === 'finished'
        ? 'co-op solved'
      : isCurrentSolved
        ? 'finished'
        : isActiveRoom
          ? `continue ${roomLabel}`
          : room.battleKind === 'race' && room.status === 'waiting'
            ? typeof raceCountdownMs === 'number'
              ? `starts in ${Math.max(1, Math.ceil(raceCountdownMs / 1000))}`
              : 'ready / waiting'
            : `join ${roomLabel}`
  const actionDisabled =
    isCurrentSolved ||
    room.status === 'finished' ||
    (room.battleKind === 'race' && !isActiveRoom && !canStartRace)

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="border border-[var(--border)] bg-[var(--input-bg)]">
        <header className="grid gap-3 border-b border-[var(--border)] bg-[var(--status-bg)] p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="min-w-0">
            <p className="font-mono text-[0.65rem] font-black uppercase tracking-[0.2em] text-[var(--accent)]">
              [
              {room.battleKind === 'turns'
                ? 'turn-battle-room'
                : room.battleKind === 'coop'
                  ? 'coop-room'
                : 'live-race-room'}
              ]
            </p>
            <h2 className="mt-1 truncate font-mono text-xl font-black uppercase tracking-[0.12em] text-[var(--app-text)]">
              {room.roomId}
            </h2>
            <p className="mt-2 font-mono text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
              {onlineOpponents.length > 0
                ? `${onlineOpponents.length} opponent${onlineOpponents.length === 1 ? '' : 's'} online`
                : 'waiting for opponent'}
              {me ? ` · you are ${me.status}` : ' · joining presence'}
              {room.battleKind === 'race' &&
              typeof raceCountdownMs === 'number' &&
              room.status === 'waiting'
                ? ` · starts in ${Math.max(1, Math.ceil(raceCountdownMs / 1000))}s`
                : ''}
              {room.battleKind === 'race' &&
              room.status === 'finished' &&
              winner
                ? ` · ${winner.player} finished first`
                : ''}
              {room.battleKind === 'turns' && currentTurnPlayer
                ? ` · turn: ${currentTurnPlayer.player}`
                : ''}
            </p>
          </div>
          <button
            type="button"
            className="border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 font-mono text-xs font-black uppercase tracking-[0.16em] text-[var(--app-bg)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={actionDisabled}
            onClick={() => {
              if (isActiveRoom) onContinue()
              else onStart(room)
            }}
          >
            {actionLabel}
          </button>
        </header>

        <div className="p-3">
          <div className="min-w-0 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <ChallengeMeta label="created by" value={room.creatorName} />
              <ChallengeMeta label="state" value={room.status} />
              <ChallengeMeta label="grid" value={room.puzzleSize} />
              <ChallengeMeta label="mode" value={modeLabel(room.playMode)} />
              <ChallengeMeta
                label="battle"
                value={
                  room.battleKind === 'turns'
                    ? `turns / ${room.turnSeconds}s / ${room.turnLives} lives`
                    : room.battleKind === 'coop'
                      ? 'shared grid'
                    : '2-player race'
                }
              />
              <ChallengeMeta
                label="difficulty"
                value={room.difficulty ?? 'custom'}
              />
              <ChallengeMeta
                label="variant"
                value={VARIANTS[room.variantId].label}
              />
            </div>
            <div className="border border-[var(--border)] bg-[var(--panel-bg)] p-3">
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--muted)]">
                invite link
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <code className="min-w-0 truncate border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs text-[var(--app-text)]">
                  {shareUrl ||
                    `${window.location.origin}${liveBattlePath(room.roomId)}`}
                </code>
                <button
                  type="button"
                  aria-live="polite"
                  className={`min-w-24 border px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.14em] transition ${
                    copyState === 'copied'
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
                      : 'border-[var(--border)] bg-[var(--button-bg)] hover:border-[var(--accent)]'
                  }`}
                  onClick={() => {
                    onCopyLink()
                    setCopyState('copied')
                  }}
                >
                  {copyState === 'copied' ? 'copied' : 'copy'}
                </button>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-[var(--muted)]">
              {room.battleKind === 'race'
                ? 'This race has two seats. Once both players are present, a short countdown starts and the first completed grid wins.'
                : room.battleKind === 'coop'
                  ? 'Everyone in this room edits the same grid. Entries sync through live presence so you can solve together.'
                : 'This is a live room. You should appear in presence as ready within a few seconds. Open the invite in another device, another browser, or an incognito window to see a second player.'}
            </p>
          </div>
        </div>
      </section>

      <section className="border border-[var(--border)] bg-[var(--input-bg)]">
        <header className="border-b border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
          [presence]
        </header>
        {room.presence.length === 0 ? (
          <p className="p-4 text-sm leading-relaxed text-[var(--muted)]">
            Waiting for presence heartbeat...
          </p>
        ) : (
          <div>
            <div className="border-b border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-[var(--muted)]">
              {me
                ? 'you are visible in this live room'
                : 'joining live presence...'}
              {opponents.length === 0 ? ' · no opponents yet' : ''}
            </div>
            <div className="divide-y divide-[var(--border)]">
              {room.presence.map((player, index) => {
                const online = now - player.lastSeenAt < 8000
                const percent = Math.round(
                  (player.completion / cellCount) * 100,
                )
                const isMe = player.anonId === currentAnonId
                return (
                  <div
                    key={player.anonId}
                    className={`grid gap-2 px-3 py-3 font-mono ${
                      room.turnAnonId === player.anonId
                        ? 'bg-[var(--cell-peer)] text-[var(--app-bg)]'
                        : ''
                    }`}
                  >
                    <div className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-baseline gap-2">
                      <span className="text-xs font-black text-[var(--accent)]">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black uppercase tracking-[0.08em] text-[var(--app-text)]">
                          {player.player}
                          {isMe ? ' / you' : ''}
                        </p>
                        <p className="text-[0.65rem] uppercase tracking-[0.14em] text-[var(--muted)]">
                          {online ? 'online' : 'away'} · {player.status}
                          {room.turnAnonId === player.anonId ? ' · turn' : ''}
                          {typeof player.selectedCell === 'number'
                            ? ` · ${labelCell(player.selectedCell, room.puzzleSize)}`
                            : ''}
                        </p>
                      </div>
                      <span className="text-sm font-black text-[var(--accent)]">
                        {formatDuration(player.elapsedMs)}
                      </span>
                    </div>
                    <div className="h-2 border border-[var(--border)] bg-[var(--status-bg)]">
                      <div
                        className="h-full bg-[var(--accent)] transition-all"
                        style={{ width: `${Math.min(100, percent)}%` }}
                      />
                    </div>
                    <p className="text-[0.65rem] uppercase tracking-[0.14em] text-[var(--muted)]">
                      {player.completion}/{cellCount} filled
                      {player.mistakes > 0
                        ? ` · ${player.mistakes} misses`
                        : ''}
                      {room.battleKind === 'turns'
                        ? ` · ${player.lives ?? room.turnLives} lives`
                        : ''}
                    </p>
                  </div>
                )
              })}
            </div>
            {opponents.length === 0 && (
              <p className="border-t border-[var(--border)] p-3 text-sm leading-relaxed text-[var(--muted)]">
                Send the invite link to a friend, or open it in an incognito
                window to test a second guest identity. A normal duplicate tab
                uses the same local guest id, so it updates your row instead of
                creating another player.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

function BattleSidebarPanel({
  currentAnonId,
  liveRaceLost,
  room,
}: {
  currentAnonId: string
  liveRaceLost: boolean
  room: LiveBattleRoom | null
}) {
  if (!room) {
    return (
      <p className="font-mono text-xs leading-relaxed text-[var(--muted)]">
        Waiting for battle state...
      </p>
    )
  }

  const winner = room.winnerAnonId
    ? room.presence.find((player) => player.anonId === room.winnerAnonId)
    : null
  const currentTurn = room.turnAnonId
    ? room.presence.find((player) => player.anonId === room.turnAnonId)
    : null
  const isMyTurn = room.turnAnonId === currentAnonId

  const headline =
    room.battleKind === 'race'
      ? room.status === 'finished'
        ? liveRaceLost
          ? 'you lost'
          : winner?.anonId === currentAnonId
            ? 'you won'
            : 'race finished'
        : room.raceStartsAt
          ? 'countdown running'
          : 'waiting for rival'
      : room.status === 'finished'
        ? 'battle finished'
        : isMyTurn
          ? 'your turn'
          : currentTurn
            ? `${currentTurn.player}'s turn`
            : 'waiting for turn'

  return (
    <div className="space-y-3 font-mono">
      <div
        className={`border px-3 py-3 ${
          liveRaceLost
            ? 'border-[var(--danger)] bg-[var(--status-bg)]'
            : 'border-[var(--border)] bg-[var(--status-bg)]'
        }`}
      >
        <p
          className={`text-xs font-black uppercase tracking-[0.16em] ${
            liveRaceLost ? 'text-[var(--danger)]' : 'text-[var(--accent)]'
          }`}
        >
          {headline}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
          {room.battleKind === 'race'
            ? room.status === 'finished'
              ? `${winner?.player ?? 'Someone'} finished first. The race board is final.`
              : 'First completed grid wins. Mouse tools stay hidden so the room stays focused.'
            : 'Enter one correct digit when your turn is active. Mistakes cost lives.'}
        </p>
      </div>

      <dl className="space-y-1 text-xs">
        <div className="flex items-center justify-between gap-3">
          <dt className="uppercase tracking-[0.14em] text-[var(--muted)]">
            mode
          </dt>
          <dd className="font-bold uppercase tracking-[0.12em] text-[var(--app-text)]">
            {room.battleKind === 'turns' ? 'turn battle' : 'race'}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="uppercase tracking-[0.14em] text-[var(--muted)]">
            players
          </dt>
          <dd className="font-bold uppercase tracking-[0.12em] text-[var(--app-text)]">
            {room.presence.length}
          </dd>
        </div>
        {room.battleKind === 'turns' && (
          <>
            <div className="flex items-center justify-between gap-3">
              <dt className="uppercase tracking-[0.14em] text-[var(--muted)]">
                turn
              </dt>
              <dd className="font-bold uppercase tracking-[0.12em] text-[var(--app-text)]">
                {currentTurn?.player ?? '--'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="uppercase tracking-[0.14em] text-[var(--muted)]">
                lives
              </dt>
              <dd className="font-bold uppercase tracking-[0.12em] text-[var(--app-text)]">
                {room.turnLives}
              </dd>
            </div>
          </>
        )}
      </dl>
    </div>
  )
}

function LiveBattlePresencePanel({
  cellCount,
  currentAnonId,
  puzzleSize,
  room,
}: {
  cellCount: number
  currentAnonId: string
  puzzleSize: PuzzleSize
  room: LiveBattleRoom | null
}) {
  const now = Date.now()

  if (!room) {
    return (
      <p className="font-mono text-xs leading-relaxed text-[var(--muted)]">
        Connecting to live room...
      </p>
    )
  }

  const opponents = room.presence.filter(
    (player) => player.anonId !== currentAnonId,
  )
  const currentTurn = room.turnAnonId
    ? room.presence.find((player) => player.anonId === room.turnAnonId)
    : null
  const winner = room.winnerAnonId
    ? room.presence.find((player) => player.anonId === room.winnerAnonId)
    : null
  const remainingMs = room.turnEndsAt ? Math.max(0, room.turnEndsAt - now) : 0
  const raceCountdownMs = room.raceStartsAt
    ? Math.max(0, room.raceStartsAt - now)
    : 0

  return (
    <div className="space-y-2 font-mono">
      <div className="border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 text-[0.65rem] uppercase tracking-[0.14em] text-[var(--muted)]">
        {room.status === 'finished' && winner
          ? winner.anonId === currentAnonId
            ? 'race finished · you won'
            : `race finished · ${winner.player} won`
          : room.status === 'finished' && room.battleKind === 'coop'
            ? 'co-op solved'
          : room.battleKind === 'turns'
            ? currentTurn
              ? `${currentTurn.anonId === currentAnonId ? 'your' : currentTurn.player} turn · ${Math.ceil(remainingMs / 1000)}s`
              : 'waiting to assign turn'
            : room.battleKind === 'coop'
              ? opponents.length === 0
                ? 'waiting for collaborators'
                : `${opponents.length} collaborator${opponents.length === 1 ? '' : 's'}`
            : room.status === 'waiting' && room.raceStartsAt
              ? `race starts in ${Math.max(1, Math.ceil(raceCountdownMs / 1000))}s`
              : opponents.length === 0
                ? 'waiting for opponent'
                : `${opponents.length} opponent${opponents.length === 1 ? '' : 's'}`}
      </div>
      <div className="space-y-2">
        {room.presence.map((player) => {
          const online = now - player.lastSeenAt < 8000
          const percent = Math.round((player.completion / cellCount) * 100)
          const hasTurn = room.turnAnonId === player.anonId
          return (
            <div
              key={player.anonId}
              className={`border p-2 ${
                hasTurn
                  ? 'border-[var(--accent)] bg-[var(--cell-peer)]'
                  : 'border-[var(--border)] bg-[var(--panel-bg)]'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-xs font-black uppercase tracking-[0.12em] text-[var(--app-text)]">
                  {player.player}
                  {player.anonId === currentAnonId ? ' / you' : ''}
                </p>
                <span className="text-[0.65rem] text-[var(--accent)]">
                  {room.battleKind === 'turns'
                    ? `${player.lives ?? room.turnLives} lives`
                    : formatDuration(player.elapsedMs)}
                </span>
              </div>
              <p className="mt-1 text-[0.62rem] uppercase tracking-[0.14em] text-[var(--muted)]">
                {online ? 'online' : 'away'} · {player.status}
                {hasTurn ? ' · turn' : ''}
                {typeof player.selectedCell === 'number'
                  ? ` · ${labelCell(player.selectedCell, puzzleSize)}`
                  : ''}
              </p>
              <div className="mt-2 h-1.5 border border-[var(--border)] bg-[var(--status-bg)]">
                <div
                  className="h-full bg-[var(--accent)] transition-all"
                  style={{ width: `${Math.min(100, percent)}%` }}
                />
              </div>
              <p className="mt-1 text-[0.62rem] uppercase tracking-[0.14em] text-[var(--muted)]">
                {player.completion}/{cellCount}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ChallengeMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--border)] bg-[var(--panel-bg)] p-3">
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-sm font-black uppercase tracking-[0.12em] text-[var(--app-text)]">
        {value}
      </p>
    </div>
  )
}

function LeaderboardPanel({
  children,
  empty,
  title,
}: {
  children: ReactNode
  empty: string
  title: string
}) {
  const hasRows = Array.isArray(children)
    ? children.length > 0
    : Boolean(children)

  return (
    <section className="min-h-[420px] border border-[var(--border)] bg-[var(--input-bg)]">
      <header className="border-b border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
        [{title}]
      </header>
      <div className="max-h-[56vh] overflow-y-auto">
        {hasRows ? (
          children
        ) : (
          <p className="p-4 text-sm leading-relaxed text-[var(--muted)]">
            {empty}
          </p>
        )}
      </div>
    </section>
  )
}

function LeaderboardRow({
  primary,
  rank,
  secondary,
  time,
}: {
  primary: string
  rank: number
  secondary: string
  time: string
}) {
  return (
    <div className="grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--border)] px-3 py-2 font-mono last:border-b-0">
      <span className="text-xs font-bold text-[var(--accent)]">
        {String(rank).padStart(2, '0')}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs uppercase tracking-[0.16em] text-[var(--app-text)]">
          {primary}
        </span>
        <span className="mt-1 block truncate text-[0.68rem] uppercase tracking-[0.14em] text-[var(--muted)]">
          {secondary}
        </span>
      </span>
      <span className="border border-[var(--border)] bg-[var(--status-bg)] px-2 py-1 text-xs font-bold text-[var(--status-text)]">
        {time}
      </span>
    </div>
  )
}

type ProfileStats = {
  averageElapsedMs?: number
  bestElapsedMs?: number
  completedCount: number
  currentStreak: number
  dailyCompletedCount: number
  dailyStreak: number
  bestDailyStreak: number
  completedToday: boolean
  inProgressCount: number
  lastCompletedAt?: string
  lastDailyDate?: string
  syncedGames: number
}

function ProfilePanel({
  cloudProfile,
  cloudStats,
  guestId,
  localStats,
  onChallengeFriend,
  onNameChange,
  onViewFriendProfile,
  playerName,
}: {
  cloudProfile: CloudProfile | null
  cloudStats: CloudStats | null
  guestId: string
  localStats: ProfileStats
  onChallengeFriend: (friend: FriendSummary) => void
  onNameChange: (value: string) => void
  onViewFriendProfile: (friend: FriendSummary) => void
  playerName: string
}) {
  const isCloud = Boolean(cloudStats)
  const syncedCompleted = cloudStats?.completedCount ?? 0
  const completedCount = Math.max(localStats.completedCount, syncedCompleted)
  const joined = cloudProfile?.createdAt
    ? formatGameDate(cloudProfile.createdAt)
    : 'local guest'

  return (
    <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
      <section className="border border-[var(--border)] bg-[var(--input-bg)]">
        <header className="border-b border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
          [identity]
        </header>
        <div className="space-y-4 p-4">
          <div className="grid aspect-square w-20 place-items-center border border-[var(--accent)] bg-[var(--panel-soft)] font-mono text-3xl font-black text-[var(--accent)]">
            {playerName.trim().slice(0, 1).toUpperCase() || 'A'}
          </div>
          <label className="block">
            <span className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
              handle
            </span>
            <input
              className="mt-2 w-full border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-sm text-[var(--app-text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
              maxLength={32}
              placeholder="anonymous"
              value={playerName}
              onChange={(event) => onNameChange(event.target.value)}
            />
          </label>
          {hasConvexBackend() && <AuthControls />}
          <ProfileMeta label="player id" value={shortGuestId(guestId)} />
          <ProfileMeta
            label="friend code"
            value={cloudProfile?.friendCode ?? 'sign in to claim'}
          />
          <ProfileMeta label="joined" value={joined} />
          <ProfileMeta
            label="sync"
            value={isCloud ? 'convex live' : 'local first'}
            accent={isCloud}
          />
        </div>
      </section>

      <section className="border border-[var(--border)] bg-[var(--input-bg)]">
        <header className="border-b border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
          [personal stats]
        </header>
        <div className="grid grid-cols-2 gap-px bg-[var(--border)] lg:grid-cols-3">
          <ProfileStat label="completed" value={String(completedCount)} />
          <ProfileStat label="daily streak" value={`${localStats.dailyStreak}d`} />
          <ProfileStat
            label="best streak"
            value={`${localStats.bestDailyStreak}d`}
          />
          <ProfileStat
            label="best"
            value={
              localStats.bestElapsedMs
                ? formatDuration(localStats.bestElapsedMs)
                : '--'
            }
          />
          <ProfileStat
            label="average"
            value={
              localStats.averageElapsedMs
                ? formatDuration(localStats.averageElapsedMs)
                : '--'
            }
          />
          <ProfileStat
            label="synced"
            value={`${syncedCompleted}/${completedCount}`}
          />
        </div>
        <div className="border-t border-[var(--border)] p-4 font-mono text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
          today:{' '}
          <span className="text-[var(--app-text)]">
            {localStats.completedToday ? 'completed' : 'open'}
          </span>
          <span className="mx-2 text-[var(--border)]">·</span>
          last completion:{' '}
          <span className="text-[var(--app-text)]">
            {localStats.lastCompletedAt
              ? formatGameDate(localStats.lastCompletedAt)
              : 'none yet'}
          </span>
          {cloudStats && syncedCompleted < completedCount && (
            <span className="ml-3 text-[var(--accent)]">
              syncing {syncedCompleted}/{completedCount} completions
            </span>
          )}
        </div>
      </section>

      <div className="lg:col-span-2">
        {hasConvexBackend() && cloudProfile?.authSubject ? (
          <FriendsPanel
            anonId={guestId}
            friendCode={cloudProfile?.friendCode ?? ''}
            onChallengeFriend={onChallengeFriend}
            onViewProfile={onViewFriendProfile}
          />
        ) : hasConvexBackend() ? (
          <section className="border border-[var(--border)] bg-[var(--input-bg)] p-4">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
              [friends locked]
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              Sign in to claim your profile, keep friends across devices, and
              submit named scores.
            </p>
          </section>
        ) : (
          <section className="border border-[var(--border)] bg-[var(--input-bg)] p-4">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
              [friends offline]
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              Friends use the Convex backend so guest codes and requests can
              sync between browsers.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}

function PublicProfileOffline({ onBack }: { onBack: () => void }) {
  return (
    <section className="border border-[var(--border)] bg-[var(--input-bg)] p-5">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
        [public profile offline]
      </p>
      <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
        Public profiles use the Convex backend so stats and recent solves can
        sync between players.
      </p>
      <button
        type="button"
        className="mt-4 border border-[var(--border)] bg-[var(--button-bg)] px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-text)] hover:border-[var(--accent)]"
        onClick={onBack}
      >
        back
      </button>
    </section>
  )
}

function AuthControls() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const { signIn, signOut } = useAuthActions()
  const [flow, setFlow] = useState<'signIn' | 'signUp'>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email.trim() || !password) {
      setStatus('email and password required')
      return
    }

    setStatus(flow === 'signUp' ? 'creating account...' : 'signing in...')
    try {
      await signIn('password', {
        email: email.trim(),
        flow,
        password,
      })
      setPassword('')
      setStatus(flow === 'signUp' ? 'account linked' : 'signed in')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'auth failed')
    }
  }

  async function handleSignOut() {
    setStatus('signing out...')
    try {
      await signOut()
      setStatus('signed out')
    } catch {
      setStatus('could not sign out')
    }
  }

  if (isLoading) {
    return (
      <div className="border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
        auth loading
      </div>
    )
  }

  if (isAuthenticated) {
    return (
      <div className="space-y-2 border border-[var(--border)] bg-[var(--panel-bg)] p-3 font-mono">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-[var(--accent)]">
            account linked
          </span>
          <button
            type="button"
            className="border border-[var(--border)] bg-[var(--button-bg)] px-2 py-1 text-[0.65rem] font-black uppercase tracking-[0.14em] text-[var(--app-text)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            onClick={() => void handleSignOut()}
          >
            sign out
          </button>
        </div>
        {status && (
          <p className="text-[0.68rem] uppercase tracking-[0.12em] text-[var(--muted)]">
            {status}
          </p>
        )}
      </div>
    )
  }

  return (
    <form
      className="space-y-2 border border-[var(--border)] bg-[var(--panel-bg)] p-3 font-mono"
      onSubmit={(event) => void submitAuth(event)}
    >
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={`border px-2 py-1 text-[0.65rem] font-black uppercase tracking-[0.14em] ${
            flow === 'signIn'
              ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
              : 'border-[var(--border)] bg-[var(--button-bg)] text-[var(--app-text)]'
          }`}
          onClick={() => setFlow('signIn')}
        >
          sign in
        </button>
        <button
          type="button"
          className={`border px-2 py-1 text-[0.65rem] font-black uppercase tracking-[0.14em] ${
            flow === 'signUp'
              ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
              : 'border-[var(--border)] bg-[var(--button-bg)] text-[var(--app-text)]'
          }`}
          onClick={() => setFlow('signUp')}
        >
          sign up
        </button>
      </div>
      <input
        autoComplete="email"
        className="w-full border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 text-xs text-[var(--app-text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
        inputMode="email"
        placeholder="email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <input
        autoComplete={flow === 'signUp' ? 'new-password' : 'current-password'}
        className="w-full border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 text-xs text-[var(--app-text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
        placeholder="password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <button
        type="submit"
        className="w-full border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--app-bg)]"
      >
        {flow === 'signUp' ? 'create account' : 'sign in'}
      </button>
      {status && (
        <p className="text-[0.68rem] uppercase tracking-[0.12em] text-[var(--muted)]">
          {status}
        </p>
      )}
    </form>
  )
}

function ProfileMeta({
  accent = false,
  label,
  value,
}: {
  accent?: boolean
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.14em]">
      <span className="text-[var(--muted)]">{label}</span>
      <span
        className={accent ? 'text-[var(--accent)]' : 'text-[var(--app-text)]'}
      >
        {value}
      </span>
    </div>
  )
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
  )
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="uppercase tracking-[0.16em] text-[var(--muted)]">
        {label}
      </dt>
      <dd className="truncate text-right text-[var(--app-text)]">{value}</dd>
    </div>
  )
}

// A real mini board — digits sized in cqw so they fit the preview at any width.
function PuzzlePreview({ grid, givens }: { grid: Grid; givens: boolean[] }) {
  const config = boardConfigFor(puzzleSizeFromGrid(grid))
  return (
    <div
      className="@container mx-auto grid aspect-square w-full max-w-[300px] border-2 border-[var(--grid-line)] bg-[var(--grid-line)]"
      style={{ gridTemplateColumns: `repeat(${config.size}, minmax(0, 1fr))` }}
    >
      {grid.map((value, index) => {
        const row = Math.floor(index / config.size)
        const col = index % config.size
        return (
          <div
            key={labelCell(index, config.puzzleSize)}
            className={[
              'grid aspect-square place-items-center border border-[var(--grid-line)] bg-[var(--cell-bg)] font-bold leading-none',
              config.size === 6 ? 'text-[8cqw]' : 'text-[6.5cqw]',
              col % config.boxCols === 0 ? 'border-l-2' : '',
              row % config.boxRows === 0 ? 'border-t-2' : '',
              givens[index] ? 'text-[var(--given)]' : 'text-[var(--entry)]',
            ].join(' ')}
          >
            {value || ''}
          </div>
        )
      })}
    </div>
  )
}

function TuiModal({
  children,
  footer = 'q / esc closes menu',
  narrow = false,
  onClose,
  title,
  wide = false,
}: {
  children: ReactNode
  footer?: string
  narrow?: boolean
  onClose: () => void
  title: string
  wide?: boolean
}) {
  return (
    <TuiDialog
      footer={footer}
      narrow={narrow}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      open
      title={title}
      wide={wide}
    >
      {children}
    </TuiDialog>
  )
}

function Panel({
  children,
  collapsed = false,
  onToggle,
  title,
}: {
  children: React.ReactNode
  collapsed?: boolean
  onToggle?: () => void
  title?: string
}) {
  return (
    <section className="relative border border-[var(--border)] bg-[var(--panel-bg)] p-4">
      {title &&
        (onToggle ? (
          <button
            type="button"
            aria-expanded={!collapsed}
            onClick={onToggle}
            className="absolute -top-[7px] left-3 bg-[var(--sidebar-bg)] px-1.5 font-mono text-[0.65rem] font-bold uppercase leading-none tracking-[0.2em] text-[var(--accent)] transition hover:brightness-125"
          >
            {collapsed ? '+' : '-'} {title}
          </button>
        ) : (
          <span className="absolute -top-[7px] left-3 bg-[var(--sidebar-bg)] px-1.5 font-mono text-[0.65rem] font-bold uppercase leading-none tracking-[0.2em] text-[var(--accent)]">
            {title}
          </span>
        ))}
      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-200 ${
          collapsed ? 'max-h-0 opacity-0' : 'max-h-96 opacity-100'
        }`}
      >
        {children}
      </div>
    </section>
  )
}

function StatusLine({
  cellLabel,
  cellCount,
  challengeMistakes,
  compact,
  completion,
  elapsedMs,
  message,
  mode,
  noteMode,
  onToggleNotes,
  onToggleTimer,
  timerEnabled,
  timerPaused,
}: {
  cellLabel: string
  cellCount: number
  challengeMistakes?: number
  compact: boolean
  completion: number
  elapsedMs: number
  message: string
  mode: EditorMode
  noteMode: boolean
  onToggleNotes: () => void
  onToggleTimer: () => void
  timerEnabled: boolean
  timerPaused: boolean
}) {
  const percent = Math.round((completion / cellCount) * 100)
  const modeBg =
    mode === 'visual'
      ? 'var(--cell-search)'
      : mode === 'color'
        ? 'var(--cell-hint)'
        : mode === 'corner'
          ? 'var(--accent-2)'
          : mode === 'annotate'
            ? 'var(--accent-2)'
            : 'var(--accent)'

  // Lualine-style sections: A=mode, B=context, C=message, X=keys, Y=stats, Z=done.
  const section =
    'flex h-full shrink-0 items-center whitespace-nowrap px-3 font-bold uppercase tracking-[0.16em]'

  return (
    <div
      data-testid="status-line"
      className="flex h-8 shrink-0 select-none items-stretch overflow-hidden border-t border-[var(--border)] bg-[var(--status-bg)] font-mono text-xs"
    >
      <div
        className={section}
        style={{ background: modeBg, color: 'var(--app-bg)' }}
      >
        {editorModeLabel(mode)}
      </div>
      <Wedge direction="right" tip={modeBg} field="var(--panel-soft)" />

      <div
        className={`${section} gap-3`}
        style={{ background: 'var(--panel-soft)', color: 'var(--app-text)' }}
      >
        <span>{cellLabel}</span>
        <button
          type="button"
          title="Toggle centre notes (n)"
          onClick={onToggleNotes}
          className="uppercase tracking-[0.16em] transition hover:brightness-150"
          style={{ color: noteMode ? 'var(--accent-2)' : 'var(--muted)' }}
        >
          centre {noteMode ? 'on' : 'off'}
        </button>
      </div>
      <Wedge
        direction="right"
        tip="var(--panel-soft)"
        field="var(--status-bg)"
      />

      <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
        <span className="text-[var(--accent)]">{'›'}</span>
        <span className="truncate text-[var(--muted)]">{message}</span>
      </div>

      {!compact && (
        <div className="flex h-full shrink-0 items-center gap-2 px-3 text-[var(--muted)]">
          <span className="text-[var(--accent)]">hjkl</span>
          <span className="text-[var(--border)]">│</span>
          <span>
            <span className="text-[var(--accent)]">:</span>cmd
          </span>
          <span className="text-[var(--border)]">│</span>
          <span>
            <span className="text-[var(--accent)]">/</span>find
          </span>
        </div>
      )}
      <Wedge
        direction="left"
        tip="var(--panel-soft)"
        field="var(--status-bg)"
      />

      <div
        className={`${section} gap-3`}
        style={{ background: 'var(--panel-soft)', color: 'var(--app-text)' }}
      >
        {!compact && (
          <span>
            {completion}/{cellCount}
          </span>
        )}
        {challengeMistakes !== undefined && (
          <span className="text-[var(--accent-2)]">
            {challengeMistakes} miss
          </span>
        )}
        <button
          type="button"
          title={
            timerEnabled
              ? timerPaused
                ? 'Resume timer'
                : 'Pause timer'
              : 'Zen mode does not track time'
          }
          onClick={onToggleTimer}
          disabled={!timerEnabled}
          className={`inline-flex items-center gap-1.5 uppercase tracking-[0.14em] transition hover:brightness-150 ${
            !timerEnabled
              ? 'cursor-not-allowed text-[var(--muted)] opacity-60'
              : timerPaused
                ? 'text-[var(--accent)]'
                : 'text-[var(--muted)]'
          }`}
        >
          {timerEnabled &&
            (timerPaused ? <Play size={13} /> : <Pause size={13} />)}
          <span>{timerEnabled ? formatDuration(elapsedMs) : 'zen'}</span>
        </button>
      </div>
      <Wedge direction="left" tip="var(--accent)" field="var(--panel-soft)" />

      <div
        className={section}
        style={{ background: 'var(--accent)', color: 'var(--app-bg)' }}
      >
        {percent}%
      </div>
    </div>
  )
}

function useScreenImpact() {
  const [frame, setFrame] = useState({ flash: 0, x: 0, y: 0 })
  const animationRef = useRef<number | null>(null)
  const decayRef = useRef(0.8)
  const flashRef = useRef(0)
  const intensityRef = useRef(0)
  const reducedMotionRef = useRef(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotionRef.current = media.matches

    function onChange() {
      reducedMotionRef.current = media.matches
    }

    media.addEventListener('change', onChange)
    return () => {
      media.removeEventListener('change', onChange)
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  const tick = useCallback(() => {
    intensityRef.current *= decayRef.current
    flashRef.current *= 0.84

    if (intensityRef.current < 0.35) intensityRef.current = 0
    if (flashRef.current < 0.015) flashRef.current = 0

    if (intensityRef.current === 0 && flashRef.current === 0) {
      animationRef.current = null
      setFrame({ flash: 0, x: 0, y: 0 })
      return
    }

    const intensity = intensityRef.current
    setFrame({
      flash: flashRef.current,
      x: (Math.random() - 0.5) * intensity * 2,
      y: (Math.random() - 0.5) * intensity * 2,
    })
    animationRef.current = window.requestAnimationFrame(tick)
  }, [])

  const triggerImpact = useCallback(
    (intensity = 8, flash = 0.25, decay = 0.82) => {
      if (reducedMotionRef.current) return

      intensityRef.current = Math.max(intensityRef.current, intensity)
      flashRef.current = Math.max(flashRef.current, flash)
      decayRef.current = decay

      if (animationRef.current === null) {
        animationRef.current = window.requestAnimationFrame(tick)
      }
    },
    [tick],
  )

  const impactStyle = useMemo<CSSProperties>(
    () => ({
      transform:
        frame.x === 0 && frame.y === 0
          ? undefined
          : `translate3d(${frame.x.toFixed(2)}px, ${frame.y.toFixed(2)}px, 0)`,
      willChange: frame.x === 0 && frame.y === 0 ? undefined : 'transform',
    }),
    [frame.x, frame.y],
  )

  const flashStyle = useMemo<CSSProperties>(
    () => ({
      opacity: frame.flash,
      transition: frame.flash === 0 ? 'opacity 120ms ease-out' : undefined,
    }),
    [frame.flash],
  )

  return { flashStyle, impactStyle, triggerImpact }
}

function Wedge({
  direction,
  field,
  tip,
}: {
  direction: 'left' | 'right'
  field: string
  tip: string
}) {
  return (
    <div
      aria-hidden="true"
      className="relative h-full w-[11px] shrink-0"
      style={{ background: field }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: tip,
          clipPath:
            direction === 'right'
              ? 'polygon(0 0, 0 100%, 100% 50%)'
              : 'polygon(100% 0, 100% 100%, 0 50%)',
        }}
      />
    </div>
  )
}

function modalTitle(modal: Exclude<MenuModal, null>) {
  if (modal === 'menu') return 'menu'
  if (modal === 'new') return 'new-game'
  if (modal === 'settings') return 'settings'
  if (modal === 'rules') return 'rules'
  if (modal === 'theme') return 'colorscheme'
  if (modal === 'tools') return 'tools'
  return 'commands'
}

function modalFromPath(pathname: string): MenuModal {
  if (pathname === '/settings') return 'settings'
  if (pathname === '/commands') return 'commands'
  return null
}

function pageFromPath(pathname: string): PageRoute {
  if (pathname === '/') return 'dashboard'
  if (pathname === '/new') return 'new'
  if (pathname === '/games') return 'games'
  if (pathname === '/leaderboards' || pathname.startsWith('/leaderboards/'))
    return 'leaderboards'
  if (pathname === '/challenge' || pathname === '/challenge/results')
    return 'challenge'
  if (challengeIdFromPath(pathname)) return 'challenge'
  if (liveBattleIdFromPath(pathname)) return 'live-battle'
  if (pathname === '/profile') return 'profile'
  if (publicFriendCodeFromPath(pathname)) return 'profile'
  return 'play'
}

const LEADERBOARD_DIFFICULTIES: PuzzleDifficulty[] = [
  'easy',
  'medium',
  'hard',
  'expert',
]

function leaderboardScopeFromPath(pathname: string): {
  size: PuzzleSize
  mode: PlayMode
  variant: VariantId
  difficulty: PuzzleDifficulty
} | null {
  const route = parseLeaderboardRoute(pathname)
  if (!route?.difficulty) return null
  return {
    ...route.filters,
    difficulty: route.difficulty,
  }
}

function leaderboardFiltersFromPath(
  pathname: string,
): LeaderboardFilters | null {
  return parseLeaderboardRoute(pathname)?.filters ?? null
}

function parseLeaderboardRoute(pathname: string): {
  filters: LeaderboardFilters
  difficulty?: PuzzleDifficulty
} | null {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] !== 'leaderboards' || parts.length < 2 || parts.length > 5)
    return null

  const [, size, ...segments] = parts
  if (!PUZZLE_SIZES.includes(size as PuzzleSize)) return null

  let mode: PlayMode = 'classic'
  let variant: VariantId = 'classic'
  let difficulty: PuzzleDifficulty | undefined

  for (const segment of segments) {
    if (segment === 'classic') continue
    if (LEADERBOARD_DIFFICULTIES.includes(segment as PuzzleDifficulty)) {
      if (difficulty) return null
      difficulty = segment as PuzzleDifficulty
      continue
    }
    if (LEADERBOARD_PLAY_MODES.includes(segment as PlayMode)) {
      if (mode !== 'classic') return null
      mode = segment as PlayMode
      continue
    }
    if (segment in VARIANTS) {
      if (variant !== 'classic') return null
      variant = segment as VariantId
      continue
    }
    return null
  }

  return {
    filters: {
      size: size as PuzzleSize,
      mode,
      variant,
    },
    difficulty,
  }
}

function leaderboardFiltersPath(filters: LeaderboardFilters) {
  const parts: string[] = ['/leaderboards', filters.size]
  if (filters.mode !== 'classic') parts.push(filters.mode)
  if (filters.variant !== 'classic') parts.push(filters.variant)
  return parts.join('/')
}

function leaderboardScopePath(scope: LeaderboardScope) {
  return `${leaderboardFiltersPath(scope)}/${scope.difficulty}`
}

function leaderboardScopeLabel(scope: LeaderboardScope) {
  return [
    scope.size,
    modeLabel(scope.mode),
    scope.variant === 'classic' ? null : leaderboardVariantLabel(scope.variant),
    scope.difficulty,
  ]
    .filter(Boolean)
    .join(' / ')
}

function leaderboardVariantLabel(variant: VariantId) {
  return variant === 'classic' ? 'Standard' : VARIANTS[variant].label
}

function cleanLeaderboardSource(source: string, scope: LeaderboardScope) {
  const escapedSize = escapeRegExp(scope.size)
  const escapedMode = escapeRegExp(scope.mode)
  const escapedVariant = escapeRegExp(scope.variant)
  const escapedDifficulty = escapeRegExp(scope.difficulty)

  return (
    source
      .replace(new RegExp(`\\b${escapedSize}\\b`, 'gi'), '')
      .replace(new RegExp(`\\b${escapedMode}\\b`, 'gi'), '')
      .replace(new RegExp(`\\b${escapedVariant}\\b`, 'gi'), '')
      .replace(new RegExp(`\\b${escapedDifficulty}\\b`, 'gi'), '')
      .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_, year, month, day) =>
        formatLeaderboardDate(`${year}-${month}-${day}`),
      )
      .replace(/\s*\/\s*/g, ' / ')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+·\s+/g, ' · ')
      .replace(/^[\s/·-]+|[\s/·-]+$/g, '')
      .trim() || 'vimdoku'
  )
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function formatLeaderboardDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const date = match
    ? new Date(
        Date.UTC(
          Number(match[1]),
          Number(match[2]) - 1,
          Number(match[3]),
        ),
      )
    : new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const day = date.getUTCDate()
  const month = date.toLocaleString(undefined, {
    month: 'short',
    timeZone: 'UTC',
  })
  const year = String(date.getUTCFullYear()).slice(-2)
  return `${day}${ordinalSuffix(day)} ${month} ${year}`
}

function ordinalSuffix(day: number) {
  if (day % 100 >= 11 && day % 100 <= 13) return 'th'
  if (day % 10 === 1) return 'st'
  if (day % 10 === 2) return 'nd'
  if (day % 10 === 3) return 'rd'
  return 'th'
}

function publicFriendCodeFromPath(pathname: string) {
  const match = pathname.match(/^\/u\/([^/]+)$/)
  if (!match) return null
  return compactFriendCode(decodeURIComponent(match[1]))
}

function sharedPuzzlePayloadFromPath(pathname: string) {
  const match = pathname.match(/^\/p\/([^/]+)$/)
  return match?.[1] ?? null
}

function puzzleRules(puzzleSize: PuzzleSize, variantId: VariantId = 'classic') {
  return `${VARIANTS[variantId].rules} This puzzle uses a ${puzzleSize} grid with digits ${boardConfigFor(
    puzzleSize,
  ).digits.join(', ')}.`
}

function generatePuzzleForVariant(
  difficulty: PuzzleDifficulty,
  seed: number,
  puzzleSize: PuzzleSize,
  variantId: VariantId,
) {
  if (variantId === 'classic')
    return generatePuzzle(difficulty, seed, puzzleSize)

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const puzzle = generatePuzzle(difficulty, seed + attempt * 7919, puzzleSize)
    const solution = solveGrid(puzzle, puzzleSize)
    if (
      solution &&
      checkVariant(solution, puzzleSize, variantId).length === 0
    ) {
      return puzzle
    }
  }

  return generatePuzzle(difficulty, seed, puzzleSize)
}

function toolModeMessage(mode: ToolMode) {
  if (mode === 'digit') return 'Digit tool.'
  if (mode === 'center') return 'Centre notes tool.'
  if (mode === 'corner') return 'Corner notes tool.'
  return 'Colour tool. Press 1-6 or Alt+number.'
}

function toolModeLabel(mode: ToolMode) {
  if (mode === 'center') return 'centre'
  if (mode === 'corner') return 'corners'
  if (mode === 'color') return 'colour'
  return 'digit'
}

function isLiveChallengeSetup(kind: ChallengeSetupKind) {
  return (
    kind === 'race' ||
    kind === 'live-race' ||
    kind === 'live-turns' ||
    kind === 'coop'
  )
}

function asyncChallengeKindFromSetup(kind: ChallengeSetupKind): ChallengeKind {
  return kind === 'streak' ? 'streak' : 'race'
}

function liveBattleKindFromSetup(kind: ChallengeSetupKind): LiveBattleKind {
  if (kind === 'coop') return 'coop'
  return kind === 'live-turns' ? 'turns' : 'race'
}

function challengeSetupLabel(kind: ChallengeSetupKind) {
  if (kind === 'streak') return 'streak battle'
  if (kind === 'coop') return 'co-op'
  if (kind === 'live-race') return 'live race'
  if (kind === 'live-turns') return 'turn battle'
  return 'race'
}

function challengeSetupDescription(kind: ChallengeSetupKind) {
  if (kind === 'streak')
    return 'Async race where bad entries count against the result.'
  if (kind === 'live-race')
    return 'A shared room where players race the same puzzle with presence.'
  if (kind === 'live-turns')
    return 'A shared room where players alternate entries against a turn clock.'
  if (kind === 'coop')
    return 'A shared room where everyone works on the same synced grid.'
  return 'Two-player live race with presence and a synchronized start.'
}

function editorModeLabel(mode: EditorMode) {
  if (mode === 'annotate') return 'centre'
  if (mode === 'corner') return 'corners'
  if (mode === 'color') return 'colour'
  return mode
}

function compactFriendCode(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return compact.startsWith('VIM')
    ? `VIM-${compact.slice(3, 9)}`
    : `VIM-${compact.slice(0, 6)}`
}

function hintText(hint: Hint, mode: HintMode) {
  if (!('technique' in hint)) return hint.message
  if (mode === 'nudge') return hint.nudge
  if (mode === 'explain') return `${hint.message} ${hint.detail}`
  return hint.message
}

function hintFocusCells(hint: Hint | null): number[] {
  if (!hint) return []
  if ('cells' in hint) return hint.cells
  if ('cell' in hint) return [hint.cell]
  return []
}

function cellClassName(
  index: number,
  selected: number,
  grid: Grid,
  givens: boolean[],
  conflicts: Set<number>,
  hint: Hint | null,
  highlightDigit: number | null,
  visualCells: Set<number> | null,
  cellColor: number | null,
  config: BoardConfig,
  hasOpponentCursor = false,
) {
  const row = Math.floor(index / config.size)
  const col = index % config.size
  const sameRow = row === Math.floor(selected / config.size)
  const sameCol = col === selected % config.size
  const selectedValue = grid[selected]
  const sameValue =
    selectedValue > 0 && index !== selected && grid[index] === selectedValue
  const searchMatch =
    highlightDigit !== null &&
    index !== selected &&
    grid[index] === highlightDigit
  const isHint = hintFocusCells(hint).includes(index)
  const inVisualBlock = visualCells?.has(index) ?? false

  // Every state below paints a bright background, so cell text must
  // flip to the dark app color or it disappears into the highlight.
  const brightBg =
    index === selected ||
    conflicts.has(index) ||
    inVisualBlock ||
    isHint ||
    searchMatch ||
    sameValue ||
    cellColor !== null

  return [
    'relative grid aspect-square place-items-center border border-[var(--grid-line)] font-black outline-none transition focus-visible:outline-none focus-visible:outline-offset-0',
    col % config.boxCols === 0 ? 'border-l-4' : '',
    row % config.boxRows === 0 ? 'border-t-4' : '',
    inVisualBlock
      ? 'bg-[var(--cell-search)]'
      : index === selected
        ? 'bg-[var(--cell-selected)]'
        : conflicts.has(index)
          ? 'bg-[var(--cell-conflict)]'
          : isHint
            ? 'bg-[var(--cell-hint)]'
            : searchMatch
              ? 'bg-[var(--cell-search)]'
              : sameValue
                ? 'bg-[var(--cell-same)]'
                : hasOpponentCursor
                  ? 'bg-[color-mix(in_srgb,var(--accent)_12%,var(--cell-bg))]'
                  : cellColor !== null
                    ? 'bg-[var(--cell-user-color)]'
                    : sameRow || sameCol
                      ? 'bg-[var(--cell-peer)]'
                      : 'bg-[var(--cell-bg)]',
    brightBg
      ? 'text-[var(--app-bg)]'
      : givens[index]
        ? 'text-[var(--given)]'
        : 'text-[var(--entry)]',
  ].join(' ')
}

function opponentCursorLabel(names: string[]) {
  if (names.length === 0) return ''
  const initials = names.map((name) => playerInitials(name))
  if (initials.length <= 2) return initials.join('/')
  return `${initials.slice(0, 2).join('/')}+${initials.length - 2}`
}

function playerInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}

function filterGameRecords(records: GameRecord[], query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)

  if (terms.length === 0) return records

  return records.filter((record) => {
    const haystack = [
      record.source,
      record.puzzleSize,
      record.playMode,
      record.difficulty,
      record.status,
      `${record.completion}/${cellCountFor(record)}`,
      formatGameDate(record.startedAt),
      formatGameDate(record.updatedAt),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return terms.every((term) => haystack.includes(term))
  })
}

function filterCommandSuggestions(query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return COMMAND_SUGGESTIONS
  return COMMAND_SUGGESTIONS.filter((suggestion) => {
    const haystack = `${suggestion.command} ${suggestion.description} ${
      suggestion.keywords ?? ''
    }`.toLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
}

function cellCountFor(record: GameRecord) {
  return boardConfigFor(record.puzzleSize).cellCount
}

function buildLocalStats(records: GameRecord[]): ProfileStats {
  const completed = records.filter((record) => record.status === 'completed')
  const timed = completed.filter((record) => record.elapsedMs > 0)
  const dailyStats = buildDailyStreakStats(completed)
  const totalElapsedMs = timed.reduce(
    (total, record) => total + record.elapsedMs,
    0,
  )
  const bestElapsedMs =
    timed.length > 0
      ? Math.min(...timed.map((record) => record.elapsedMs))
      : undefined

  return {
    averageElapsedMs:
      timed.length > 0 ? Math.round(totalElapsedMs / timed.length) : undefined,
    bestElapsedMs,
    completedCount: completed.length,
    currentStreak: countCompletionStreak(
      completed.map((record) => record.completedAt ?? record.updatedAt),
    ),
    dailyCompletedCount: dailyStats.completedCount,
    dailyStreak: dailyStats.current,
    bestDailyStreak: dailyStats.best,
    completedToday: dailyStats.completedToday,
    inProgressCount: records.filter((record) => record.status === 'in-progress')
      .length,
    lastCompletedAt: completed[0]?.completedAt ?? completed[0]?.updatedAt,
    lastDailyDate: dailyStats.lastDate,
    syncedGames: records.length,
  }
}

function buildDailyStreakStats(records: GameRecord[]) {
  const days = new Set(
    records
      .map(dailyDateForRecord)
      .filter((dateKey): dateKey is string => Boolean(dateKey)),
  )
  const sortedDays = [...days].sort()
  const today = todayDateKey()
  const completedToday = days.has(today)
  let cursor = completedToday ? today : shiftDateKey(today, -1)
  let current = 0
  while (days.has(cursor)) {
    current += 1
    cursor = shiftDateKey(cursor, -1)
  }

  let best = 0
  let run = 0
  let previous: string | null = null
  for (const day of sortedDays) {
    run = previous && shiftDateKey(previous, 1) === day ? run + 1 : 1
    best = Math.max(best, run)
    previous = day
  }

  return {
    best,
    completedCount: days.size,
    completedToday,
    current,
    lastDate: sortedDays.at(-1),
  }
}

function dailyDateForRecord(record: GameRecord) {
  if (!record.id.startsWith('daily-vimdoku-')) return null
  const match = record.id.match(/(\d{4}-\d{2}-\d{2})$/)
  return match?.[1] ?? null
}

function countCompletionStreak(values: string[]) {
  const days = new Set(
    values
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()))
      .map((date) => date.toISOString().slice(0, 10)),
  )

  let streak = 0
  const cursor = new Date()
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return streak
}

function formatGameDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(date)
}

function formatDuration(value: number) {
  const totalSeconds = Math.max(0, Math.floor(value / 1000))
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600)

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
  }

  return `${minutes}:${seconds}`
}

function loadTheme(): ThemeId {
  const stored = localStorage.getItem(THEME_KEY)
  return CODE_THEMES.some((theme) => theme.id === stored)
    ? (stored as ThemeId)
    : CODE_THEMES[0].id
}

function loadPausedGameId() {
  return localStorage.getItem(TIMER_PAUSED_GAME_KEY)
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function isCustomPlayerName(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ''
  return Boolean(trimmed && trimmed.toLowerCase() !== 'anonymous')
}

function digitFromKeyEvent(event: KeyboardEvent) {
  if (/^[1-9]$/.test(event.key)) return Number(event.key)
  if (/^Digit[1-9]$/.test(event.code))
    return Number(event.code.replace('Digit', ''))
  if (/^Numpad[1-9]$/.test(event.code))
    return Number(event.code.replace('Numpad', ''))
  return Number.NaN
}

async function recognizeSudokuImage(
  file: File,
  onProgress: (done: number, total: number) => void,
): Promise<ReviewCell[]> {
  const image = await loadImage(file)
  const worker = await Tesseract.createWorker('eng')

  await worker.setParameters({
    tessedit_char_whitelist: '123456789',
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_CHAR,
  })

  const cells: ReviewCell[] = []
  try {
    for (let index = 0; index < 81; index += 1) {
      const canvas = cropCell(image, index)
      const result = await worker.recognize(canvas)
      const text = result.data.text.replace(/\D/g, '').slice(0, 1)
      const value = text ? Number(text) : 0
      cells.push({ value, confidence: value ? result.data.confidence : 0 })
      onProgress(index + 1, 81)
    }
  } finally {
    await worker.terminate()
  }

  return cells
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The image could not be loaded.'))
    image.src = URL.createObjectURL(file)
  })
}

function cropCell(image: HTMLImageElement, index: number): HTMLCanvasElement {
  const size = Math.min(image.naturalWidth, image.naturalHeight)
  const offsetX = (image.naturalWidth - size) / 2
  const offsetY = (image.naturalHeight - size) / 2
  const cellSize = size / 9
  const row = Math.floor(index / 9)
  const col = index % 9
  const padding = cellSize * 0.18
  const sourceX = offsetX + col * cellSize + padding
  const sourceY = offsetY + row * cellSize + padding
  const sourceSize = cellSize - padding * 2
  const canvas = document.createElement('canvas')
  const outputSize = 96
  canvas.width = outputSize
  canvas.height = outputSize
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return canvas

  context.fillStyle = 'white'
  context.fillRect(0, 0, outputSize, outputSize)
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    10,
    10,
    outputSize - 20,
    outputSize - 20,
  )

  const data = context.getImageData(0, 0, outputSize, outputSize)
  for (let i = 0; i < data.data.length; i += 4) {
    const gray =
      data.data[i] * 0.299 + data.data[i + 1] * 0.587 + data.data[i + 2] * 0.114
    const value = gray < 150 ? 0 : 255
    data.data[i] = value
    data.data[i + 1] = value
    data.data[i + 2] = value
  }
  context.putImageData(data, 0, 0)

  return canvas
}

export default App

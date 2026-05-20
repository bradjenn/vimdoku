import {
  AlertCircle,
  Command,
  Check,
  Eraser,
  History,
  Home,
  ImageUp,
  Lightbulb,
  Menu,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Search,
  Settings,
  Swords,
  Terminal,
  Trophy,
  Undo2,
  UserRound,
} from 'lucide-react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import type { FunctionReference } from 'convex/server';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import Tesseract from 'tesseract.js';
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
} from './sudoku';
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
} from './daily';
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
} from './storage';
import {
  PLAYER_NAME_KEY,
  fetchGlobalLeaderboard,
  hasGlobalLeaderboard,
  submitGlobalScore,
  type LeaderboardEntry,
} from './leaderboard';
import { ChallengeBridge } from './ChallengeBridge';
import { ChallengeHistoryPanel } from './ChallengeHistoryPanel';
import { FriendsPanel, type FriendSummary } from './FriendsPanel';
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
} from './challenges';
import { ConvexBridge, type CloudProfile, type CloudStats } from './ConvexBridge';
import { hasConvexBackend } from './convexClient';
import { getOrCreateGuestId, shortGuestId } from './identity';
import { PublicProfilePanel } from './PublicProfilePanel';
import {
  PLAY_MODES,
  modeLabel,
  modePolicy,
  type PlayMode,
} from './playModes';
import { TuiDialog } from './ui';

type ReviewCell = {
  value: number;
  confidence: number;
};

type EditorMode = 'normal' | 'annotate' | 'visual';
type HintMode = 'nudge' | 'explain' | 'show';
type CommandMode = 'command' | 'search';
type MenuModal = 'menu' | 'settings' | 'commands' | 'new' | null;
type RouteModal = 'menu' | 'settings' | 'commands';
type PageRoute =
  | 'dashboard'
  | 'play'
  | 'new'
  | 'games'
  | 'leaderboards'
  | 'challenge'
  | 'profile';
type GameLibraryFilter = 'all' | 'in-progress' | 'completed';
type ChallengePuzzleSource = 'daily' | 'generated' | 'current';
type ThemeId = (typeof DARK_THEMES)[number]['id'];
type FriendshipRow = {
  direction: 'incoming' | 'outgoing';
  friend: FriendSummary;
  friendshipId: string;
  status: 'pending' | 'accepted';
};

const THEME_KEY = 'vimdoku-theme-v1';
const TIMER_PAUSED_GAME_KEY = 'vimdoku-paused-game-v1';
const NEW_GAME_DIFFICULTIES: PuzzleDifficulty[] = ['easy', 'medium', 'hard', 'expert'];
const PUZZLE_SIZES: PuzzleSize[] = ['9x9', '6x6'];
const listFriendsRef = makeFunctionReference<
  'query',
  { anonId: string },
  FriendshipRow[]
>('friends:list');

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
  ['m', 'menu'],
];

// alpha-nvim style startup splash — ANSI Shadow font, same as LazyVim's logo.
const VIMDOKU_BANNER = [
  '██╗   ██╗██╗███╗   ███╗██████╗  ██████╗ ██╗  ██╗██╗   ██╗',
  '██║   ██║██║████╗ ████║██╔══██╗██╔═══██╗██║ ██╔╝██║   ██║',
  '██║   ██║██║██╔████╔██║██║  ██║██║   ██║█████╔╝ ██║   ██║',
  '╚██╗ ██╔╝██║██║╚██╔╝██║██║  ██║██║   ██║██╔═██╗ ██║   ██║',
  ' ╚████╔╝ ██║██║ ╚═╝ ██║██████╔╝╚██████╔╝██║  ██╗╚██████╔╝',
  '  ╚═══╝  ╚═╝╚═╝     ╚═╝╚═════╝  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ',
].join('\n');

const DASHBOARD_ACTIONS: [key: string, label: string][] = [
  ['n', 'new game'],
  ['c', 'continue'],
  ['g', 'puzzle log'],
  ['l', 'leaderboards'],
  ['r', 'challenge'],
  ['p', 'profile'],
  ['s', 'settings'],
];

const ROUTE_MODAL_PATHS: Record<RouteModal, string> = {
  commands: '/commands',
  menu: '/menu',
  settings: '/settings',
};

const DARK_THEMES = [
  {
    id: 'tokyonight',
    name: 'Tokyo Night',
    swatches: ['#1a1b26', '#7aa2f7', '#bb9af7'],
    vars: {
      '--app-bg': '#0c0e14',
      '--app-text': '#c0caf5',
      '--workspace-bg': '#1a1b26',
      '--sidebar-bg': '#16161e',
      '--panel-bg': '#1a1b26',
      '--panel-soft': '#292e42',
      '--cell-bg': '#1a1b26',
      '--cell-peer': '#292e42',
      '--cell-selected': '#7aa2f7',
      '--cell-same': '#2ac3de',
      '--cell-search': '#ff9e64',
      '--cell-hint': '#bb9af7',
      '--cell-conflict': '#f7768e',
      '--grid-line': '#0c0e14',
      '--border': '#414868',
      '--muted': '#737aa2',
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
      '--app-bg': '#1d2021',
      '--app-text': '#ebdbb2',
      '--workspace-bg': '#282828',
      '--sidebar-bg': '#1d2021',
      '--panel-bg': '#32302f',
      '--panel-soft': '#3c3836',
      '--cell-bg': '#282828',
      '--cell-peer': '#3c3836',
      '--cell-selected': '#b8bb26',
      '--cell-same': '#83a598',
      '--cell-search': '#fe8019',
      '--cell-hint': '#8ec07c',
      '--cell-conflict': '#fb4934',
      '--grid-line': '#1d2021',
      '--border': '#665c54',
      '--muted': '#a89984',
      '--accent': '#fabd2f',
      '--accent-2': '#83a598',
      '--danger': '#fb4934',
      '--button-bg': '#282828',
      '--input-bg': '#1d2021',
      '--note': '#d5c4a1',
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
      '--app-bg': '#16161d',
      '--app-text': '#dcd7ba',
      '--workspace-bg': '#1f1f28',
      '--sidebar-bg': '#181820',
      '--panel-bg': '#2a2a37',
      '--panel-soft': '#363646',
      '--cell-bg': '#1f1f28',
      '--cell-peer': '#2a2a37',
      '--cell-selected': '#98bb6c',
      '--cell-same': '#7fb4ca',
      '--cell-search': '#ffa066',
      '--cell-hint': '#7e9cd8',
      '--cell-conflict': '#e46876',
      '--grid-line': '#16161d',
      '--border': '#54546d',
      '--muted': '#727169',
      '--accent': '#98bb6c',
      '--accent-2': '#7e9cd8',
      '--danger': '#e46876',
      '--button-bg': '#1f1f28',
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
      '--app-bg': '#11111b',
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
      '--border': '#585b70',
      '--muted': '#a6adc8',
      '--accent': '#cba6f7',
      '--accent-2': '#89b4fa',
      '--danger': '#f38ba8',
      '--button-bg': '#1e1e2e',
      '--input-bg': '#11111b',
      '--note': '#bac2de',
      '--given': '#cdd6f4',
      '--entry': '#89dceb',
      '--status-bg': '#11111b',
      '--status-text': '#cdd6f4',
    },
  },
] as const;

function App() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const routeModal = modalFromPath(pathname);
  const activePage = pageFromPath(pathname);
  const publicFriendCode = useMemo(() => publicFriendCodeFromPath(pathname), [pathname]);
  const dailyRoute = useMemo(() => parseDailyRoute(pathname), [pathname]);
  const routeChallengeId = useMemo(() => challengeIdFromPath(pathname), [pathname]);
  const showDashboard = activePage === 'dashboard';
  const showBoard = activePage === 'play';
  const [grid, setGrid] = useState<Grid>(() => loadLegacySnapshot()?.grid ?? STARTER_GRID);
  const [notes, setNotes] = useState<Notes>(() => loadLegacySnapshot()?.notes ?? EMPTY_NOTES);
  const [givens, setGivens] = useState<boolean[]>(
    () => loadLegacySnapshot()?.givens ?? STARTER_GRID.map(Boolean),
  );
  const [selected, setSelected] = useState(0);
  const [noteMode, setNoteMode] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [visualAnchor, setVisualAnchor] = useState<number | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [hint, setHint] = useState<Hint | null>(null);
  const [hintMode, setHintMode] = useState<HintMode>('explain');
  const [review, setReview] = useState<ReviewCell[] | null>(null);
  const [reviewSelected, setReviewSelected] = useState(0);
  const [ocrStatus, setOcrStatus] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [commandMode, setCommandMode] = useState<CommandMode | null>(null);
  const [commandValue, setCommandValue] = useState('');
  const [statusLine, setStatusLine] = useState('Ready. Press : for commands.');
  const [highlightDigit, setHighlightDigit] = useState<number | null>(null);
  const [themeId, setThemeId] = useState<ThemeId>(() => loadTheme());
  const [menuModal, setMenuModal] = useState<MenuModal>(null);
  const [gamePickerOpen, setGamePickerOpen] = useState(false);
  const [gameQuery, setGameQuery] = useState('');
  const [gameLibraryQuery, setGameLibraryQuery] = useState('');
  const [gameLibraryFilter, setGameLibraryFilter] =
    useState<GameLibraryFilter>('all');
  const [gameCursor, setGameCursor] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [timerPaused, setTimerPaused] = useState(false);
  const [activeGame, setActiveGame] = useState<GameMeta>(() =>
    loadInitialGameMeta(),
  );
  const [gameRecords, setGameRecords] = useState<GameRecord[]>(() =>
    loadLegacyGameRecords(),
  );
  const [globalScores, setGlobalScores] = useState<LeaderboardEntry[]>([]);
  const [leaderboardStatus, setLeaderboardStatus] = useState('');
  const [challengeRace, setChallengeRace] = useState<ChallengeRace | null>(null);
  const [challengeStatus, setChallengeStatus] = useState('');
  const [challengeShareUrl, setChallengeShareUrl] = useState('');
  const [challengeSetupOpen, setChallengeSetupOpen] = useState(false);
  const [challengeRecipient, setChallengeRecipient] = useState<FriendSummary | null>(
    null,
  );
  const [challengeMistakes, setChallengeMistakes] = useState(0);
  const [challengeCreateRequest, setChallengeCreateRequest] =
    useState<ChallengeCreateRequest | null>(null);
  const [cloudProfile, setCloudProfile] = useState<CloudProfile | null>(null);
  const [cloudStats, setCloudStats] = useState<CloudStats | null>(null);
  const [guestId] = useState(() => getOrCreateGuestId());
  const [playerName, setPlayerName] = useState(
    () => localStorage.getItem(PLAYER_NAME_KEY) || 'anonymous',
  );
  const [storageReady, setStorageReady] = useState(false);
  const [newGameDifficulty, setNewGameDifficulty] =
    useState<PuzzleDifficulty>('medium');
  const [newGameMode, setNewGameMode] = useState<PlayMode>('classic');
  const [newGameSize, setNewGameSize] = useState<PuzzleSize>('9x9');
  const [dailyDateKey, setDailyDateKey] = useState(() => todayDateKey());
  const [dashboardDifficulty, setDashboardDifficulty] =
    useState<PuzzleDifficulty>('easy');
  const [dashboardMode, setDashboardMode] = useState<PlayMode>('classic');
  const [dashboardSize, setDashboardSize] = useState<PuzzleSize>('9x9');
  const [challengeDifficulty, setChallengeDifficulty] =
    useState<PuzzleDifficulty>('medium');
  const [challengeKind, setChallengeKind] = useState<ChallengeKind>('race');
  const [challengeMode, setChallengeMode] = useState<PlayMode>('classic');
  const [challengeSize, setChallengeSize] = useState<PuzzleSize>('9x9');
  const [challengeSource, setChallengeSource] =
    useState<ChallengePuzzleSource>('daily');
  const [leaderboardMode, setLeaderboardMode] = useState<PlayMode>('classic');
  const [leaderboardSize, setLeaderboardSize] = useState<PuzzleSize>('9x9');
  const [solvedDismissed, setSolvedDismissed] = useState(false);
  const [solvedNamePromptGameId, setSolvedNamePromptGameId] = useState<string | null>(
    null,
  );
  const [newPuzzleText, setNewPuzzleText] = useState('');
  const [newGameStatus, setNewGameStatus] = useState('');
  const [isFetchingPuzzle, setIsFetchingPuzzle] = useState(false);
  const [hintRailOpen, setHintRailOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [leaderPending, setLeaderPending] = useState(false);
  const [compactStatus, setCompactStatus] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 640px)').matches,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingKeyRef = useRef('');
  const submittedScoreIdsRef = useRef(new Set<string>());
  const previousPageRef = useRef(activePage);
  const activeMenuModal = routeModal ?? menuModal;
  const hasCustomPlayerName = isCustomPlayerName(playerName);
  const activeSize = activeGame.puzzleSize ?? puzzleSizeFromGrid(grid);
  const activeMode = activeGame.playMode ?? 'classic';
  const activeChallengeId = challengeIdFromGameId(activeGame.id);
  const activeChallengeKind = challengeKindFromGameId(activeGame.id);
  const activeConfig = boardConfigFor(activeSize);
  const activeDigits = activeConfig.digits;
  const activeCellCount = activeConfig.cellCount;
  const {
    flashStyle: battleImpactFlashStyle,
    impactStyle: battleImpactStyle,
    triggerImpact: triggerBattleImpact,
  } = useScreenImpact();
  const policy = useMemo(() => modePolicy(activeMode), [activeMode]);
  const { notesEnabled, hintsEnabled, pauseEnabled, timerEnabled, scoreEnabled } = policy;

  const updatePlayerName = useCallback((value: string) => {
    setPlayerName(value);
  }, []);

  const goToDashboard = useCallback(() => {
    void navigate({ to: '/' });
  }, [navigate]);

  const goToPlay = useCallback(() => {
    void navigate({ to: '/play' });
  }, [navigate]);

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
        });
        return;
      }
      if (playMode === 'classic') {
        void navigate({
          to: '/play/daily/$size/$difficulty/$date',
          params: { date: dateKey, difficulty, size: puzzleSize },
        });
        return;
      }
      void navigate({
        to: '/play/daily/$size/$mode/$difficulty/$date',
        params: { date: dateKey, difficulty, mode: playMode, size: puzzleSize },
      });
    },
    [navigate, newGameMode, newGameSize],
  );

  const goToProfile = useCallback(() => {
    setStatusLine('Opened profile.');
    void navigate({ to: '/profile' });
  }, [navigate]);

  const openPublicProfile = useCallback(
    (friendCode: string) => {
      const compactCode = compactFriendCode(friendCode);
      setStatusLine(`Opened ${compactCode} profile.`);
      void navigate({ to: `/u/${encodeURIComponent(compactCode)}` });
    },
    [navigate],
  );

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
                ? routeChallengeId
                  ? challengePath(routeChallengeId)
                  : '/challenge'
                : '/profile';
      void navigate({ to: path });
    },
    [navigate, routeChallengeId],
  );

  const openModalRoute = useCallback(
    (modal: RouteModal) => {
      setGamePickerOpen(false);
      if (modal === 'commands') setCommandMode(null);
      const path = ROUTE_MODAL_PATHS[modal];
      if (pathname !== path) {
        void navigate({ to: path });
      }
    },
    [navigate, pathname],
  );

  const openNewGame = useCallback(() => {
    setGamePickerOpen(false);
    setCommandMode(null);
    if (activePage === 'play') {
      setMenuModal('new');
      if (routeModal) {
        void navigate({ to: '/play' });
      }
      setStatusLine('Opened new game menu.');
      return;
    }
    void navigate({ to: '/new' });
    setStatusLine('Opened new game page.');
  }, [activePage, navigate, routeModal]);

  const openChallengeSetup = useCallback((friend?: FriendSummary | null) => {
    setChallengeRecipient(friend ?? null);
    setChallengeSetupOpen(true);
    setChallengeStatus(
      friend ? `Creating direct challenge for ${friend.name}.` : '',
    );
  }, []);

  const closeMenuModal = useCallback(() => {
    setMenuModal(null);
    if (routeModal) goToPlay();
  }, [goToPlay, routeModal]);

  const conflicts = useMemo(() => findConflicts(grid, activeSize), [activeSize, grid]);
  const visibleConflicts = policy.hidesConflicts ? new Set<number>() : conflicts;
  const solved = useMemo(() => solveGrid(grid, activeSize), [activeSize, grid]);
  const completion = grid.filter(Boolean).length;
  const isSolved = Boolean(
    solved && grid.every((value, index) => value === solved[index]),
  );
  const showSolved =
    isSolved &&
    showBoard &&
    !activeMenuModal &&
    !commandMode &&
    !gamePickerOpen &&
    !review &&
    !solvedDismissed;
  const currentRecord = useMemo(
    () => createGameRecord(activeGame, grid, notes, givens, isSolved, elapsedMs),
    [activeGame, elapsedMs, givens, grid, isSolved, notes],
  );
  const needsSolvedNamePrompt =
    scoreEnabled &&
    (!hasCustomPlayerName || solvedNamePromptGameId === currentRecord.id);
  const trackedGameRecords = useMemo(
    () => upsertGameRecord(gameRecords, currentRecord),
    [currentRecord, gameRecords],
  );
  const inProgressGames = useMemo(
    () =>
      trackedGameRecords
        .filter((record) => record.status === 'in-progress')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [trackedGameRecords],
  );
  const completedGames = useMemo(
    () =>
      trackedGameRecords
        .filter((record) => record.status === 'completed')
        .sort((a, b) =>
          (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt),
        ),
    [trackedGameRecords],
  );
  const localLeaderboard = useMemo(
    () =>
      completedGames
        .filter((record) => record.puzzleSize === leaderboardSize)
        .filter((record) => record.playMode === leaderboardMode)
        .filter((record) => record.elapsedMs > 0)
        .sort((a, b) => a.elapsedMs - b.elapsedMs)
        .slice(0, 25),
    [completedGames, leaderboardMode, leaderboardSize],
  );
  const localProfileStats = useMemo(
    () => buildLocalStats(trackedGameRecords),
    [trackedGameRecords],
  );
  const gameFinderRecords = useMemo(
    () => [...inProgressGames, ...completedGames],
    [completedGames, inProgressGames],
  );
  const filteredGameRecords = useMemo(
    () => filterGameRecords(gameFinderRecords, gameQuery),
    [gameFinderRecords, gameQuery],
  );
  const libraryGameRecords = useMemo(() => {
    const scopedRecords =
      gameLibraryFilter === 'all'
        ? gameFinderRecords
        : gameFinderRecords.filter((record) => record.status === gameLibraryFilter);
    return filterGameRecords(scopedRecords, gameLibraryQuery);
  }, [gameFinderRecords, gameLibraryFilter, gameLibraryQuery]);
  const selectedGameRecord =
    filteredGameRecords[Math.min(gameCursor, Math.max(0, filteredGameRecords.length - 1))] ??
    null;
  const editorMode: EditorMode =
    visualAnchor !== null
      ? 'visual'
      : notesEnabled && (shiftHeld || noteMode)
        ? 'annotate'
        : 'normal';

  const resumeTimerFromActivity = useCallback(() => {
    if (!timerPaused || isSolved) return;
    setTimerPaused(false);
    setStatusLine('Timer resumed.');
  }, [isSolved, timerPaused]);

  const toggleTimerPaused = useCallback(() => {
    if (!timerEnabled) {
      setStatusLine('Zen mode does not track time.');
      return;
    }
    if (!pauseEnabled) {
      setStatusLine('Timer pause is disabled in speedrun.');
      return;
    }
    if (isSolved) {
      setStatusLine('Solved puzzles keep their final time.');
      return;
    }
    setTimerPaused((current) => !current);
    setStatusLine(timerPaused ? 'Timer resumed.' : 'Timer paused.');
  }, [isSolved, pauseEnabled, timerEnabled, timerPaused]);

  useEffect(() => {
    if (previousPageRef.current !== activePage && activePage === 'play') {
      resumeTimerFromActivity();
    }
    previousPageRef.current = activePage;
  }, [activePage, resumeTimerFromActivity]);

  // The visual selection is the rectangle spanning the anchor and the
  // (moving) cursor; null whenever visual mode is off.
  const visualCells = useMemo(() => {
    if (visualAnchor === null) return null;
    const size = activeConfig.size;
    const r1 = Math.min(Math.floor(visualAnchor / size), Math.floor(selected / size));
    const r2 = Math.max(Math.floor(visualAnchor / size), Math.floor(selected / size));
    const c1 = Math.min(visualAnchor % size, selected % size);
    const c2 = Math.max(visualAnchor % size, selected % size);
    const cells = new Set<number>();
    for (let row = r1; row <= r2; row += 1) {
      for (let col = c1; col <= c2; col += 1) cells.add(row * size + col);
    }
    return cells;
  }, [activeConfig.size, visualAnchor, selected]);
  const activeTheme = useMemo(
    () => DARK_THEMES.find((theme) => theme.id === themeId) ?? DARK_THEMES[0],
    [themeId],
  );
  const themeStyle = activeTheme.vars as CSSProperties;

  // Mirror theme vars onto :root so Radix-portaled dialogs inherit them.
  useEffect(() => {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(activeTheme.vars)) {
      root.style.setProperty(key, value);
    }
  }, [activeTheme]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, themeId);
  }, [themeId]);

  useEffect(() => {
    localStorage.setItem(PLAYER_NAME_KEY, playerName.trim() || 'anonymous');
  }, [playerName]);

  useEffect(() => {
    let cancelled = false;

    void loadStoredState()
      .then((stored) => {
        if (cancelled) return;
        setGrid(stored.snapshot.grid);
        setNotes(stored.snapshot.notes);
        setGivens(stored.snapshot.givens);
        setActiveGame(stored.activeGame);
        setGameRecords(stored.records);
        setElapsedMs(
          stored.records.find((record) => record.id === stored.activeGame.id)
            ?.elapsedMs ?? 0,
        );
        setTimerPaused(loadPausedGameId() === stored.activeGame.id);
      })
      .finally(() => {
        if (!cancelled) setStorageReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    if (timerPaused) {
      localStorage.setItem(TIMER_PAUSED_GAME_KEY, activeGame.id);
    } else if (loadPausedGameId() === activeGame.id) {
      localStorage.removeItem(TIMER_PAUSED_GAME_KEY);
    }
  }, [activeGame.id, storageReady, timerPaused]);

  useEffect(() => {
    if (!storageReady) return;
    void saveStoredState(
      { grid, notes, givens },
      activeGame,
      trackedGameRecords,
    ).catch(() => {
      setStatusLine('Could not save puzzle history.');
    });
  }, [activeGame, givens, grid, notes, storageReady, trackedGameRecords]);

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
      return;
    }

    function isVisible() {
      return document.visibilityState === 'visible';
    }

    if (!isVisible()) return;
    const timer = window.setInterval(() => {
      if (isVisible()) setElapsedMs((current) => current + 1000);
    }, 1000);

    return () => window.clearInterval(timer);
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
  ]);

  useEffect(() => {
    if (activePage !== 'leaderboards') return;
    if (hasConvexBackend()) return;
    if (!hasGlobalLeaderboard()) return;

    void fetchGlobalLeaderboard(leaderboardSize, leaderboardMode)
      .then((scores) => {
        setGlobalScores(scores);
        setLeaderboardStatus('');
      })
      .catch(() => {
        setLeaderboardStatus('Could not load global leaderboard.');
      });
  }, [activePage, leaderboardMode, leaderboardSize]);

  useEffect(() => {
    if (!routeChallengeId) return;
    setChallengeRace(null);
    setChallengeShareUrl(`${window.location.origin}${challengePath(routeChallengeId)}`);
    setChallengeStatus('Loading challenge...');
  }, [routeChallengeId]);

  useEffect(() => {
    if (!showSolved) {
      if (solvedNamePromptGameId) setSolvedNamePromptGameId(null);
      return;
    }
    if (
      scoreEnabled &&
      !hasCustomPlayerName &&
      solvedNamePromptGameId !== currentRecord.id
    ) {
      setSolvedNamePromptGameId(currentRecord.id);
    }
  }, [
    currentRecord.id,
    hasCustomPlayerName,
    scoreEnabled,
    showSolved,
    solvedNamePromptGameId,
  ]);

  useEffect(() => {
    if (!showSolved || !currentRecord.completedAt) return;
    if (hasConvexBackend()) return;
    if (!hasCustomPlayerName) return;
    if (!scoreEnabled) return;
    if (solvedNamePromptGameId === currentRecord.id) return;
    if (submittedScoreIdsRef.current.has(currentRecord.id)) return;
    submittedScoreIdsRef.current.add(currentRecord.id);
    void submitGlobalScore(currentRecord).catch(() => {
      setLeaderboardStatus('Could not submit global score.');
    });
  }, [
    currentRecord,
    hasCustomPlayerName,
    scoreEnabled,
    showSolved,
    solvedNamePromptGameId,
  ]);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 640px)');
    const sync = () => setCompactStatus(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Shift') setShiftHeld(true);
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.key === 'Shift') setShiftHeld(false);
    }
    // Releasing Shift outside the window never fires keyup, so clear on blur.
    function onBlur() {
      setShiftHeld(false);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const pushHistory = useCallback(() => {
    setHistory((current) => [...current.slice(-49), { grid, notes, givens }]);
    setFuture([]);
  }, [givens, grid, notes]);

  const moveSelection = useCallback((deltaRow: number, deltaCol: number) => {
    resumeTimerFromActivity();
    setSelected((index) => {
      const row = Math.max(0, Math.min(activeConfig.size - 1, Math.floor(index / activeConfig.size) + deltaRow));
      const col = Math.max(0, Math.min(activeConfig.size - 1, (index % activeConfig.size) + deltaCol));
      return row * activeConfig.size + col;
    });
  }, [activeConfig.size, resumeTimerFromActivity]);

  // Jump to the same relative cell in an adjacent box ({ and }).
  const moveBox = useCallback((delta: number) => {
    resumeTimerFromActivity();
    setSelected((index) => {
      const boxesPerRow = activeConfig.size / activeConfig.boxCols;
      const boxCount = boxesPerRow * (activeConfig.size / activeConfig.boxRows);
      const row = Math.floor(index / activeConfig.size);
      const col = index % activeConfig.size;
      const box =
        Math.floor(row / activeConfig.boxRows) * boxesPerRow +
        Math.floor(col / activeConfig.boxCols);
      const nextBox = Math.max(0, Math.min(boxCount - 1, box + delta));
      const within = (row % activeConfig.boxRows) * activeConfig.boxCols + (col % activeConfig.boxCols);
      const nextRow =
        Math.floor(nextBox / boxesPerRow) * activeConfig.boxRows +
        Math.floor(within / activeConfig.boxCols);
      const nextCol = (nextBox % boxesPerRow) * activeConfig.boxCols + (within % activeConfig.boxCols);
      return nextRow * activeConfig.size + nextCol;
    });
  }, [activeConfig, resumeTimerFromActivity]);

  const setCell = useCallback(
    (value: number) => {
      if (givens[selected]) return;
      resumeTimerFromActivity();
      pushHistory();
      if (
        activeChallengeKind === 'streak' &&
        value !== 0 &&
        grid[selected] !== value &&
        solved?.[selected] !== value
      ) {
        setChallengeMistakes((count) => count + 1);
        setStatusLine('Streak battle: bad entry recorded.');
        triggerBattleImpact(12, 0.34, 0.78);
      }
      setGrid((current) => {
        const next = [...current];
        next[selected] = value;
        return next;
      });
      setNotes((current) =>
        value === 0 ? current : removeRelatedNotes(current, selected, value, activeSize),
      );
      setHint(null);
    },
    [
      activeChallengeKind,
      activeSize,
      givens,
      grid,
      pushHistory,
      resumeTimerFromActivity,
      selected,
      solved,
      triggerBattleImpact,
    ],
  );

  const toggleNote = useCallback(
    (value: number) => {
      if (!notesEnabled) {
        setStatusLine('Notes are disabled in speedrun.');
        return;
      }
      if (givens[selected] || grid[selected] !== 0) return;
      resumeTimerFromActivity();
      pushHistory();
      setNotes((current) => {
        const next = cloneNotes(current);
        next[selected] = next[selected].includes(value)
          ? next[selected].filter((note) => note !== value)
          : [...next[selected], value].sort();
        return next;
      });
      setHint(null);
    },
    [givens, grid, notesEnabled, pushHistory, resumeTimerFromActivity, selected],
  );

  const toggleNoteAcrossBlock = useCallback(
    (value: number) => {
      if (!notesEnabled) {
        setStatusLine('Notes are disabled in speedrun.');
        return;
      }
      if (!visualCells) return;
      resumeTimerFromActivity();
      // Notes only live on empty, non-given cells.
      const eligible = [...visualCells].filter(
        (index) => grid[index] === 0 && !givens[index],
      );
      if (eligible.length === 0) {
        setStatusLine('No empty cells in the selection.');
        return;
      }
      // Group toggle: clear the note only when every cell already has it.
      const allHave = eligible.every((index) => notes[index].includes(value));
      pushHistory();
      setNotes((current) => {
        const next = cloneNotes(current);
        for (const index of eligible) {
          if (allHave) {
            next[index] = next[index].filter((note) => note !== value);
          } else if (!next[index].includes(value)) {
            next[index] = [...next[index], value].sort();
          }
        }
        return next;
      });
      setHint(null);
      setStatusLine(
        `${allHave ? 'Removed' : 'Annotated'} ${value} ${
          allHave ? 'from' : 'on'
        } ${eligible.length} cell${eligible.length === 1 ? '' : 's'}.`,
      );
    },
    [givens, grid, notes, notesEnabled, pushHistory, resumeTimerFromActivity, visualCells],
  );

  const clearNotesAcrossBlock = useCallback(() => {
    if (!notesEnabled) return;
    if (!visualCells) return;
    resumeTimerFromActivity();
    pushHistory();
    setNotes((current) => {
      const next = cloneNotes(current);
      for (const index of visualCells) next[index] = [];
      return next;
    });
    setHint(null);
    setStatusLine(`Cleared notes in ${visualCells.size} cells.`);
  }, [notesEnabled, pushHistory, resumeTimerFromActivity, visualCells]);

  const undo = useCallback(() => {
    if (!history.length) {
      setStatusLine('Nothing to undo.');
      return;
    }
    resumeTimerFromActivity();
    const previous = history[history.length - 1];
    setFuture((current) => [...current.slice(-49), { grid, notes, givens }]);
    setHistory((current) => current.slice(0, -1));
    setGrid(previous.grid);
    setNotes(previous.notes);
    setGivens(previous.givens);
    setHint(null);
    setStatusLine('Undid last change.');
  }, [givens, grid, history, notes, resumeTimerFromActivity]);

  const redo = useCallback(() => {
    if (!future.length) {
      setStatusLine('Nothing to redo.');
      return;
    }
    resumeTimerFromActivity();
    const next = future[future.length - 1];
    setHistory((current) => [...current.slice(-49), { grid, notes, givens }]);
    setFuture((current) => current.slice(0, -1));
    setGrid(next.grid);
    setNotes(next.notes);
    setGivens(next.givens);
    setHint(null);
    setStatusLine('Redid change.');
  }, [future, givens, grid, notes, resumeTimerFromActivity]);

  const askForHint = useCallback((mode: HintMode = hintMode) => {
    if (!hintsEnabled) {
      setStatusLine('Hints are disabled in speedrun.');
      return;
    }
    const next = nextHint(grid, activeSize);
    setHintMode(mode);
    setHint(next);
    if ('cell' in next && mode !== 'nudge') setSelected(next.cell);
  }, [activeSize, grid, hintMode, hintsEnabled]);

  const clearHintState = useCallback((closeRail = false) => {
    setHint(null);
    setHighlightDigit(null);
    if (closeRail) setHintRailOpen(false);
    setStatusLine(closeRail ? 'Hints off.' : 'Cleared hints and highlights.');
  }, []);

  const applyHint = useCallback(() => {
    if (!hint || !('cell' in hint) || givens[hint.cell]) return;
    resumeTimerFromActivity();
    pushHistory();
    setGrid((current) => {
      const next = [...current];
      next[hint.cell] = hint.value;
      return next;
    });
    setNotes((current) => removeRelatedNotes(current, hint.cell, hint.value, activeSize));
    setHint(null);
  }, [activeSize, givens, hint, pushHistory, resumeTimerFromActivity]);

  const resetPuzzle = useCallback(() => {
    resumeTimerFromActivity();
    pushHistory();
    setGrid((current) => current.map((value, index) => (givens[index] ? value : 0)));
    setNotes(emptyNotes(activeSize));
    setHint(null);
  }, [activeSize, givens, pushHistory, resumeTimerFromActivity]);

  const clearAll = useCallback(() => {
    setGameRecords((current) => upsertGameRecord(current, currentRecord));
    pushHistory();
    setGrid(emptyGrid(activeSize));
    setNotes(emptyNotes(activeSize));
    setGivens(Array(activeCellCount).fill(false));
    setHint(null);
    setElapsedMs(0);
    setTimerPaused(false);
    setChallengeMistakes(0);
    setActiveGame(createGameMeta(emptyGrid(activeSize), 'blank', 'custom', activeSize, activeMode));
    goToPlay();
  }, [activeCellCount, activeMode, activeSize, currentRecord, goToPlay, pushHistory]);

  const startNewPuzzle = useCallback((
    nextGrid: Grid,
    message = 'Started new puzzle.',
    source = 'custom',
    difficulty?: PuzzleDifficulty | 'custom',
    puzzleSize: PuzzleSize = puzzleSizeFromGrid(nextGrid),
    playMode: PlayMode = newGameMode,
    meta = createGameMeta(nextGrid, source, difficulty, puzzleSize, playMode),
    navigateToPlay = true,
  ) => {
    setGameRecords((current) => upsertGameRecord(current, currentRecord));
    setGrid(nextGrid);
    setNotes(emptyNotes(meta.puzzleSize));
    setGivens(nextGrid.map(Boolean));
    setHistory([]);
    setFuture([]);
    setSolvedDismissed(false);
    setHint(null);
    setHighlightDigit(null);
    setElapsedMs(0);
    setTimerPaused(false);
    setChallengeMistakes(0);
    setNoteMode(false);
    setActiveGame(meta);
    const firstEmpty = nextGrid.indexOf(0);
    setSelected(firstEmpty >= 0 ? firstEmpty : 0);
    setStatusLine(message);
    if (navigateToPlay) goToPlay();
  }, [currentRecord, goToPlay, newGameMode]);

  const loadGameRecord = useCallback((
    record: GameRecord,
    message: string,
    navigateToPlay = true,
  ) => {
    setGameRecords((current) => upsertGameRecord(current, currentRecord));
    setGrid(record.grid);
    setNotes(record.notes);
    setGivens(record.givens);
    setElapsedMs(record.elapsedMs);
    setChallengeMistakes(0);
    setActiveGame({
      id: record.id,
      puzzle: record.puzzle,
      source: record.source,
      difficulty: record.difficulty,
      startedAt: record.startedAt,
      puzzleSize: record.puzzleSize,
      playMode: record.playMode,
    });
    setHistory([]);
    setFuture([]);
    setSolvedDismissed(record.status === 'completed');
    setHint(null);
    setHighlightDigit(null);
    setGamePickerOpen(false);
    setGameQuery('');
    setGameCursor(0);
    setTimerPaused(false);
    setNoteMode(false);
    const firstEmpty = record.grid.indexOf(0);
    setSelected(firstEmpty >= 0 ? firstEmpty : 0);
    setStatusLine(message);
    if (navigateToPlay) goToPlay();
  }, [currentRecord, goToPlay]);

  const startGeneratedPuzzle = useCallback(
    (
      difficulty = newGameDifficulty,
      daily = false,
      puzzleSize: PuzzleSize = newGameSize,
      playMode: PlayMode = newGameMode,
    ) => {
      if (daily) {
        openDailyPuzzle(difficulty, todayDateKey(), puzzleSize, playMode);
        closeMenuModal();
        setNewGameStatus('');
        return;
      }
      const seed = daily ? dailySeed(difficulty) : Date.now();
      const nextPuzzle = generatePuzzle(difficulty, seed, puzzleSize);
      startNewPuzzle(
        nextPuzzle,
        `Generated a ${puzzleSize} ${playMode} ${difficulty} puzzle.`,
        'local generated',
        difficulty,
        puzzleSize,
        playMode,
      );
      closeMenuModal();
      setNewGameStatus('');
    },
    [closeMenuModal, newGameDifficulty, newGameMode, newGameSize, openDailyPuzzle, startNewPuzzle],
  );

  const fetchSudokuMountainPuzzle = useCallback(
    async (daily = false) => {
      if (newGameSize === '6x6') {
        const nextPuzzle = generatePuzzle(
          newGameDifficulty,
          daily
            ? dailySeed(newGameDifficulty, 'vimdoku', todayDateKey(), '6x6', newGameMode)
            : Date.now(),
          '6x6',
        );
        startNewPuzzle(
          nextPuzzle,
          daily
            ? `Started today's 6x6 ${newGameDifficulty} daily.`
            : `Generated a 6x6 ${newGameDifficulty} puzzle.`,
          daily ? 'vimdoku daily' : 'local generated',
          newGameDifficulty,
          '6x6',
          newGameMode,
        );
        closeMenuModal();
        setNewGameStatus('');
        return;
      }

      setIsFetchingPuzzle(true);
      setNewGameStatus('Fetching Sudoku Mountain...');

      try {
        const params = new URLSearchParams({
          mode: 'classic',
          difficulty: newGameDifficulty,
        });
        if (daily) {
          params.set('seed', String(dailySeed(newGameDifficulty, 'mountain', todayDateKey(), '9x9', newGameMode)));
        }

        const response = await fetch(
          `https://api.sudokumountain.com/v1/generate?${params.toString()}`,
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = (await response.json()) as { puzzle?: string; seed?: number };
        if (!data.puzzle || data.puzzle.replace(/[^0-9.]/g, '').length < 81) {
          throw new Error('Unexpected puzzle payload');
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
        );
        closeMenuModal();
        setNewGameStatus('');
      } catch {
        startNewPuzzle(
          generatePuzzle(
            newGameDifficulty,
            daily ? dailySeed(newGameDifficulty, 'vimdoku', todayDateKey(), '9x9', newGameMode) : Date.now(),
            '9x9',
          ),
          'Could not reach Sudoku Mountain. Generated a local puzzle instead.',
          'local generated',
          newGameDifficulty,
          '9x9',
          newGameMode,
        );
        closeMenuModal();
        setNewGameStatus('');
      } finally {
        setIsFetchingPuzzle(false);
      }
    },
    [closeMenuModal, newGameDifficulty, newGameMode, newGameSize, startNewPuzzle],
  );

  const startPastedPuzzle = useCallback(() => {
    const pastedSize = puzzleSizeFromGrid(newPuzzleText);
    const nextPuzzle = parseGrid(newPuzzleText, pastedSize);
    const givensCount = nextPuzzle.filter(Boolean).length;

    if (givensCount === 0) {
      setNewGameStatus('Paste a 36- or 81-character grid first.');
      return;
    }

    if (!solveGrid(nextPuzzle, pastedSize)) {
      setNewGameStatus('That grid has a conflict or no solution.');
      return;
    }

    startNewPuzzle(
      nextPuzzle,
      `Loaded pasted ${pastedSize} ${newGameMode} puzzle.`,
      'pasted grid',
      'custom',
      pastedSize,
      newGameMode,
    );
    setNewPuzzleText('');
    setNewGameStatus('');
    closeMenuModal();
  }, [closeMenuModal, newGameMode, newPuzzleText, startNewPuzzle]);

  const resumeGame = useCallback((record: GameRecord) => {
    closeMenuModal();
    loadGameRecord(
      record,
      record.status === 'completed' ? 'Opened completed puzzle.' : 'Resumed puzzle.',
    );
  }, [closeMenuModal, loadGameRecord]);

  useEffect(() => {
    if (!storageReady || !dailyRoute) return;
      if (pathname !== dailyPath(dailyRoute)) {
      if (dailyRoute.puzzleSize === '9x9' && dailyRoute.playMode === 'classic') {
        void navigate({
          to: '/play/daily/$difficulty/$date',
          params: { date: dailyRoute.dateKey, difficulty: dailyRoute.difficulty },
          replace: true,
        });
      } else if (dailyRoute.playMode === 'classic') {
        void navigate({
          to: '/play/daily/$size/$difficulty/$date',
          params: {
            date: dailyRoute.dateKey,
            difficulty: dailyRoute.difficulty,
            size: dailyRoute.puzzleSize,
          },
          replace: true,
        });
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
        });
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
    );
    const dailyMeta = createDailyGameMeta(
      nextPuzzle,
      dailyRoute.difficulty,
      dailyRoute.dateKey,
      dailyRoute.puzzleSize,
      dailyRoute.playMode,
    );
    if (activeGame.id === dailyMeta.id) return;

    const savedDaily = trackedGameRecords.find(
      (record) => record.id === dailyMeta.id,
    );
    const label = `${dailyRoute.dateKey} ${dailyRoute.puzzleSize} ${dailyRoute.playMode} ${dailyRoute.difficulty} daily`;

    const timer = window.setTimeout(() => {
      if (savedDaily) {
        loadGameRecord(savedDaily, `Loaded ${label}.`, false);
        return;
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
      );
    }, 0);

    return () => window.clearTimeout(timer);
  }, [
    activeGame.id,
    dailyRoute,
    loadGameRecord,
    navigate,
    pathname,
    startNewPuzzle,
    storageReady,
    trackedGameRecords,
  ]);

  const deleteGame = useCallback((id: string) => {
    setGameRecords((current) => current.filter((record) => record.id !== id));
    setStatusLine('Removed puzzle from history.');
  }, []);

  const openCommand = useCallback((mode: CommandMode) => {
    setCommandMode(mode);
    setCommandValue('');
    setStatusLine(mode === 'command' ? 'Command mode' : 'Search digit');
  }, []);

  const openGamePicker = useCallback(() => {
    setGameQuery('');
    setGameCursor(0);
    setGamePickerOpen(true);
    setStatusLine('Opened puzzle picker.');
  }, []);

  const closeGamePicker = useCallback(() => {
    setGamePickerOpen(false);
    setGameQuery('');
    setGameCursor(0);
  }, []);

  const openGameLibrary = useCallback(() => {
    closeGamePicker();
    void navigate({ to: '/games' });
    setStatusLine('Opened puzzle library.');
  }, [closeGamePicker, navigate]);

  const openLeaderboards = useCallback(() => {
    setLeaderboardStatus(
      hasConvexBackend()
        ? 'Connecting to live Convex leaderboard...'
        : hasGlobalLeaderboard()
        ? 'Loading global leaderboard...'
        : 'Set VITE_LEADERBOARD_ENDPOINT to enable global scores.',
    );
    void navigate({ to: '/leaderboards' });
    setStatusLine('Opened leaderboards.');
  }, [navigate]);

  const copyChallengeLink = useCallback((challengeId: string) => {
    const url = `${window.location.origin}${challengePath(challengeId)}`;
    setChallengeShareUrl(url);
    void navigator.clipboard?.writeText(url).catch(() => {
      setChallengeStatus('Challenge link is ready. Copy it from the lobby.');
    });
    setStatusLine('Challenge link copied.');
    return url;
  }, []);

  const createRaceChallenge = useCallback((template?: {
    challengeKind?: ChallengeKind;
    difficulty?: PuzzleDifficulty | 'custom';
    playMode: PlayMode;
    puzzle: string;
    puzzleSize: PuzzleSize;
    source: string;
  }) => {
    if (!hasConvexBackend()) {
      setChallengeStatus('Challenge links need the Convex backend.');
      setStatusLine('Challenge links need the Convex backend.');
      return;
    }

    const raceTemplate = template ?? {
      difficulty: activeGame.difficulty,
      playMode: activeMode,
      puzzle: activeGame.puzzle,
      puzzleSize: activeSize,
      source: activeGame.source,
    };
    const nextChallengeKind = raceTemplate.challengeKind ?? challengeKind;
    const challengeId = makeChallengeId(nextChallengeKind);
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
    };
    setChallengeCreateRequest(request);
    setChallengeStatus(`Creating ${challengeKindLabel(nextChallengeKind)} link...`);
    setChallengeSetupOpen(false);
    closeMenuModal();
    void navigate({ to: '/challenge/$challengeId', params: { challengeId } });
  }, [
    activeGame,
    activeMode,
    activeSize,
    challengeKind,
    challengeRecipient,
    closeMenuModal,
    navigate,
    playerName,
  ]);

  const createConfiguredRaceChallenge = useCallback(() => {
    if (challengeSource === 'current') {
      createRaceChallenge();
      return;
    }

    const dateKey = todayDateKey();
    const seed =
      challengeSource === 'daily'
        ? dailySeed(
            challengeDifficulty,
            'vimdoku',
            dateKey,
            challengeSize,
            challengeMode,
          )
        : Date.now();
    const puzzleGrid = generatePuzzle(challengeDifficulty, seed, challengeSize);
    createRaceChallenge({
      challengeKind,
      difficulty: challengeDifficulty,
      playMode: challengeMode,
      puzzle: gridToString(puzzleGrid, challengeSize),
      puzzleSize: challengeSize,
      source:
        challengeSource === 'daily'
          ? `vimdoku ${challengeSize} ${modeLabel(challengeMode)} daily ${dateKey}`
          : `generated ${challengeSize} ${modeLabel(challengeMode)} ${challengeDifficulty} challenge`,
    });
  }, [
    challengeKind,
    challengeDifficulty,
    challengeMode,
    challengeSize,
    challengeSource,
    createRaceChallenge,
  ]);

  const handleChallengeCreated = useCallback(
    (challengeId: string, requestId: string) => {
      setChallengeCreateRequest((current) =>
        current?.requestId === requestId ? null : current,
      );
      copyChallengeLink(challengeId);
      setChallengeStatus(
        challengeRecipient
          ? `Direct challenge sent to ${challengeRecipient.name}. Link copied too.`
          : 'Challenge link copied. Send it to a friend.',
      );
    },
    [challengeRecipient, copyChallengeLink],
  );

  const startChallengeRace = useCallback((challenge: ChallengeRace) => {
    const puzzleGrid = parseGrid(challenge.puzzle, challenge.puzzleSize);
    startNewPuzzle(
      puzzleGrid,
      `Started ${challengeKindLabel(challenge.challengeKind)} ${challenge.challengeId}.`,
      `challenge ${challengeKindLabel(challenge.challengeKind)} ${challenge.challengeId}`,
      challenge.difficulty,
      challenge.puzzleSize,
      challenge.playMode,
      createChallengeGameMeta(challenge),
    );
    setChallengeStatus(
      challenge.challengeKind === 'streak'
        ? 'Streak battle started. Bad entries count against you.'
        : 'Race started. The clock is live.',
    );
  }, [startNewPuzzle]);

  const dashboardSelect = useCallback(
    (key: string) => {
      if (key === 'n') openNewGame();
      else if (key === 'g') openGameLibrary();
      else if (key === 'l') openLeaderboards();
      else if (key === 'r') navigateToPage('challenge');
      else if (key === 'p') goToProfile();
      else if (key === 's') openModalRoute('settings');
      else goToPlay();
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
  );

  const jumpToNextEmpty = useCallback((direction: 1 | -1) => {
    resumeTimerFromActivity();
    setSelected((index) => {
      for (let step = 1; step <= activeCellCount; step += 1) {
        const next = (index + step * direction + activeCellCount * 2) % activeCellCount;
        if (grid[next] === 0) return next;
      }
      return index;
    });
  }, [activeCellCount, grid, resumeTimerFromActivity]);

  const jumpToDigit = useCallback(
    (digit: number, direction: 1 | -1 = 1) => {
      resumeTimerFromActivity();
    setHighlightDigit(digit);
    setSelected((index) => {
      for (let step = 1; step <= activeCellCount; step += 1) {
        const next = (index + step * direction + activeCellCount * 2) % activeCellCount;
        if (grid[next] === digit) return next;
      }
      return index;
      });
      setStatusLine(`Highlighting ${digit}. Press Esc to clear.`);
    },
    [activeCellCount, grid, resumeTimerFromActivity],
  );

  const fillAllCandidates = useCallback(() => {
    if (!notesEnabled) {
      setStatusLine('Notes are disabled in speedrun.');
      return;
    }
    resumeTimerFromActivity();
    pushHistory();
    setNotes(candidatesAsNotes(grid, activeSize));
    setStatusLine('Annotated every empty cell with current candidates.');
  }, [activeSize, grid, notesEnabled, pushHistory, resumeTimerFromActivity]);

  const pruneNotes = useCallback(() => {
    if (!notesEnabled) {
      setStatusLine('Notes are disabled in speedrun.');
      return;
    }
    resumeTimerFromActivity();
    pushHistory();
    setNotes((current) => pruneImpossibleNotes(grid, current, activeSize));
    setStatusLine('Removed impossible annotations.');
  }, [activeSize, grid, notesEnabled, pushHistory, resumeTimerFromActivity]);

  const clearNotes = useCallback(() => {
    resumeTimerFromActivity();
    pushHistory();
    setNotes(emptyNotes(activeSize));
    setStatusLine('Cleared annotations.');
  }, [activeSize, pushHistory, resumeTimerFromActivity]);

  const placeSolution = useCallback(() => {
    const solution = solveGrid(grid, activeSize);
    if (!solution) {
      setStatusLine('No valid solution from the current board.');
      return;
    }
    resumeTimerFromActivity();
    pushHistory();
    setGrid(solution);
    setNotes(emptyNotes(activeSize));
    setStatusLine('Solved the board.');
  }, [activeSize, grid, pushHistory, resumeTimerFromActivity]);

  const executeCommand = useCallback(
    (rawCommand: string) => {
      const command = rawCommand.trim().toLowerCase();
      setCommandMode(null);
      setCommandValue('');

      if (!command) {
        setStatusLine('Ready.');
        return;
      }

      if (['hint', 'h'].includes(command)) {
        askForHint();
      } else if (['pause', 'timer-pause'].includes(command)) {
        if (!timerPaused) toggleTimerPaused();
      } else if (['resume', 'timer-resume', 'play'].includes(command)) {
        if (timerPaused) toggleTimerPaused();
      } else if (['notes', 'candidates', 'annotate'].includes(command)) {
        fillAllCandidates();
      } else if (['prune', 'prune-notes'].includes(command)) {
        pruneNotes();
      } else if (['clear-notes', 'cn'].includes(command)) {
        clearNotes();
      } else if (['noh', 'nohlsearch', 'clear-hints', 'clear-hint'].includes(command)) {
        clearHintState();
      } else if (['hints-off', 'hint-off', 'nohint', 'nohints'].includes(command)) {
        clearHintState(true);
      } else if (['reset'].includes(command)) {
        resetPuzzle();
        setStatusLine('Reset player entries.');
      } else if (['menu', 'm'].includes(command)) {
        openModalRoute('menu');
        setStatusLine('Opened menu.');
      } else if (['dashboard', 'start', 'home'].includes(command)) {
        goToDashboard();
        setStatusLine('Opened dashboard.');
      } else if (['new', 'new-game'].includes(command)) {
        openNewGame();
      } else if (['daily', 'today'].includes(command)) {
        openDailyPuzzle(newGameDifficulty, todayDateKey(), newGameSize, newGameMode);
        setStatusLine(`Opening today's ${newGameSize} ${newGameMode} ${newGameDifficulty} daily.`);
      } else if (['yesterday', 'daily-yesterday'].includes(command)) {
        openDailyPuzzle(newGameDifficulty, offsetDateKey(-1), newGameSize, newGameMode);
        setStatusLine(`Opening yesterday's ${newGameSize} ${newGameMode} ${newGameDifficulty} daily.`);
      } else if (['games', 'history', 'ls'].includes(command)) {
        openGameLibrary();
      } else if (['leaderboard', 'leaderboards', 'scores', 'lb'].includes(command)) {
        openLeaderboards();
      } else if (['challenge', 'race', 'versus', 'vs'].includes(command)) {
        navigateToPage('challenge');
      } else if (['profile', 'me', 'account'].includes(command)) {
        goToProfile();
      } else if (['clear', 'blank'].includes(command)) {
        clearAll();
        setStatusLine('Started a blank board.');
      } else if (['import', 'image'].includes(command)) {
        fileInputRef.current?.click();
        setStatusLine('Choose a puzzle image to import.');
      } else if (['settings', 'theme', 'colorscheme'].includes(command)) {
        openModalRoute('settings');
        setStatusLine('Opened settings.');
      } else if (['solve'].includes(command)) {
        placeSolution();
      } else if (command.startsWith('/')) {
        const digit = Number(command.slice(1, 2));
        if (digit >= 1 && digit <= activeConfig.size) jumpToDigit(digit);
      } else {
        setStatusLine(`Unknown command: ${rawCommand}`);
      }
    },
    [
      activeConfig.size,
      askForHint,
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
      timerPaused,
      toggleTimerPaused,
    ],
  );

  useEffect(() => {
    if (!showDashboard) return;

    function onDashboardKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if (key === 'escape') {
        event.preventDefault();
        goToPlay();
        return;
      }
      if (key === 'enter') {
        event.preventDefault();
        startGeneratedPuzzle(dashboardDifficulty, true, dashboardSize, dashboardMode);
        return;
      }
      if (key === '1' || key === '2' || key === '3') {
        event.preventDefault();
        setDashboardDifficulty(
          key === '1' ? 'easy' : key === '2' ? 'medium' : 'hard',
        );
        return;
      }
      if (key === '6' || key === '9') {
        event.preventDefault();
        setDashboardSize(key === '6' ? '6x6' : '9x9');
        return;
      }
      if (DASHBOARD_ACTIONS.some(([actionKey]) => actionKey === key)) {
        event.preventDefault();
        dashboardSelect(key);
      }
    }

    window.addEventListener('keydown', onDashboardKeyDown);
    return () => window.removeEventListener('keydown', onDashboardKeyDown);
  }, [
    dashboardDifficulty,
    dashboardMode,
    dashboardSize,
    dashboardSelect,
    goToPlay,
    showDashboard,
    startGeneratedPuzzle,
  ]);

  useEffect(() => {
    if (!showSolved) return;

    function onSolvedKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === 'escape' || key === 'q') {
        event.preventDefault();
        setSolvedDismissed(true);
        return;
      }
      if (key === 'n') {
        event.preventDefault();
        setSolvedDismissed(true);
        openNewGame();
        return;
      }
      if (key === 'g') {
        event.preventDefault();
        setSolvedDismissed(true);
        navigateToPage('games');
        return;
      }
      if (key === 'l') {
        event.preventDefault();
        setSolvedDismissed(true);
        navigateToPage('leaderboards');
      }
    }

    window.addEventListener('keydown', onSolvedKeyDown);
    return () => window.removeEventListener('keydown', onSolvedKeyDown);
  }, [navigateToPage, openNewGame, showSolved]);

  useEffect(() => {
    if (!activeMenuModal) return;

    function onModalKeyDown(event: KeyboardEvent) {
      if (
        event.key === 'Escape' ||
        (event.key.toLowerCase() === 'q' && !isTypingTarget(event.target))
      ) {
        event.preventDefault();
        closeMenuModal();
      }
    }

    window.addEventListener('keydown', onModalKeyDown);
    return () => window.removeEventListener('keydown', onModalKeyDown);
  }, [activeMenuModal, closeMenuModal]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (review) return;
      if (showSolved) return;
      if (
        showBoard &&
        !activeMenuModal &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'p'
      ) {
        event.preventDefault();
        pendingKeyRef.current = '';
        setVisualAnchor(null);
        setCommandMode(null);
        setCommandValue('');
        openGamePicker();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'm') {
        event.preventDefault();
        pendingKeyRef.current = '';
        setVisualAnchor(null);
        setCommandMode(null);
        setCommandValue('');
        if (activeMenuModal === 'menu') closeMenuModal();
        else openModalRoute('menu');
        return;
      }
      if (gamePickerOpen) {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeGamePicker();
          setStatusLine('Closed puzzle picker.');
        }
        return;
      }
      if (!showBoard) return;
      if (activeMenuModal) return;
      if (commandMode) return;
      if (isTypingTarget(event.target)) return;

      if (event.ctrlKey && !event.metaKey) {
        const ctrlKey = event.key.toLowerCase();
        if (ctrlKey === 'r') {
          event.preventDefault();
          redo();
          return;
        }
        if (ctrlKey === 'd') {
          event.preventDefault();
          moveSelection(3, 0);
          return;
        }
        if (ctrlKey === 'u') {
          event.preventDefault();
          moveSelection(-3, 0);
          return;
        }
      }

      if (visualAnchor !== null) {
        const visualKey = event.key.toLowerCase();
        if (event.key === 'Escape' || visualKey === 'v') {
          event.preventDefault();
          pendingKeyRef.current = '';
          setVisualAnchor(null);
          setStatusLine('Visual mode off.');
          return;
        }
        const visualDigit = digitFromKeyEvent(event);
        if (visualDigit >= 1 && visualDigit <= activeConfig.size) {
          event.preventDefault();
          toggleNoteAcrossBlock(visualDigit);
          return;
        }
        if (['0', 'backspace', 'delete', 'x'].includes(visualKey)) {
          event.preventDefault();
          clearNotesAcrossBlock();
          return;
        }
        // Movement keys fall through to the normal handler below so the
        // cursor — and therefore the selection rectangle — keeps moving.
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenuModal();
        pendingKeyRef.current = '';
        setLeaderPending(false);
        clearHintState();
        return;
      }

      // Leader sequences — Space is leader, LazyVim-style.
      if (pendingKeyRef.current === 'leader') {
        pendingKeyRef.current = '';
        setLeaderPending(false);
        const leaderKey = event.key.toLowerCase();
        event.preventDefault();
        if (leaderKey === 'e') {
          setSidebarOpen((current) => {
            setStatusLine(current ? 'Sidebar hidden.' : 'Sidebar shown.');
            return !current;
          });
        } else if (leaderKey === 'h') {
          setHintRailOpen((current) => {
            setStatusLine(current ? 'Hint engine hidden.' : 'Hint engine shown.');
            return !current;
          });
        } else if (leaderKey === 'n') {
          openNewGame();
        } else if (leaderKey === 'g') {
          openGamePicker();
        } else if (leaderKey === 'l') {
          openLeaderboards();
        } else if (leaderKey === 'p') {
          goToProfile();
        } else if (leaderKey === 'i') {
          fileInputRef.current?.click();
          setStatusLine('Choose a puzzle image to import.');
        } else if (leaderKey === 's') {
          openModalRoute('settings');
        } else if (leaderKey === 'm') {
          openModalRoute('menu');
        } else {
          setStatusLine('Leader cancelled.');
        }
        return;
      }

      if (event.key === ' ') {
        event.preventDefault();
        pendingKeyRef.current = 'leader';
        setLeaderPending(true);
        return;
      }

      if (event.key === ':') {
        event.preventDefault();
        pendingKeyRef.current = '';
        openCommand('command');
        return;
      }

      if (event.key === '/') {
        event.preventDefault();
        pendingKeyRef.current = '';
        openCommand('search');
        return;
      }

      const numeric = digitFromKeyEvent(event);
      if (pendingKeyRef.current === 'f' && numeric >= 1 && numeric <= activeConfig.size) {
        event.preventDefault();
        pendingKeyRef.current = '';
        jumpToDigit(numeric);
        return;
      }

      if (numeric >= 1 && numeric <= activeConfig.size) {
        event.preventDefault();
        if (event.shiftKey || noteMode) {
          toggleNote(numeric);
        } else {
          setCell(numeric);
        }
        return;
      }

      if (event.key === 'G') {
        event.preventDefault();
        pendingKeyRef.current = '';
        setSelected(activeCellCount - 1);
        setStatusLine('Jumped to the last cell.');
        return;
      }

      const key = event.key.toLowerCase();
      if (pendingKeyRef.current === 'g') {
        pendingKeyRef.current = '';
        if (key === 'g') {
          event.preventDefault();
          setSelected(0);
          setStatusLine('Jumped to the first cell.');
          return;
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
      };

      // Shift+hjkl jumps a whole box in that direction.
      if (event.shiftKey && ['h', 'j', 'k', 'l'].includes(key)) {
        event.preventDefault();
        const [deltaRow, deltaCol] = movement[key];
        moveSelection(deltaRow * activeConfig.boxRows, deltaCol * activeConfig.boxCols);
        return;
      }

      if (movement[key]) {
        event.preventDefault();
        moveSelection(...movement[key]);
        return;
      }

      if (['0', 'backspace', 'delete', 'x'].includes(key)) {
        event.preventDefault();
        setCell(0);
      } else if (key === 'n') {
        event.preventDefault();
        if (notesEnabled) setNoteMode((current) => !current);
        else setStatusLine('Notes are disabled in speedrun.');
      } else if (key === 'u') {
        event.preventDefault();
        undo();
      } else if (key === '?') {
        event.preventDefault();
        if (hintsEnabled) {
          setHintRailOpen(true);
          askForHint();
        } else {
          setStatusLine('Hints are disabled in speedrun.');
        }
      } else if (key === 'w') {
        event.preventDefault();
        pendingKeyRef.current = '';
        jumpToNextEmpty(1);
      } else if (key === 'b') {
        event.preventDefault();
        pendingKeyRef.current = '';
        jumpToNextEmpty(-1);
      } else if (key === 'g') {
        event.preventDefault();
        pendingKeyRef.current = 'g';
        setStatusLine('g...');
      } else if (key === 'f') {
        event.preventDefault();
        pendingKeyRef.current = 'f';
        setStatusLine('f...');
      } else if (key === 'v') {
        event.preventDefault();
        pendingKeyRef.current = '';
        setVisualAnchor(selected);
        setStatusLine(`VISUAL — 1-${activeConfig.size} annotates the block, x clears, Esc exits.`);
      } else if (key === '}') {
        event.preventDefault();
        pendingKeyRef.current = '';
        moveBox(1);
      } else if (key === '{') {
        event.preventDefault();
        pendingKeyRef.current = '';
        moveBox(-1);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeCellCount,
    activeConfig,
    askForHint,
    clearHintState,
    closeMenuModal,
    commandMode,
    closeGamePicker,
    gamePickerOpen,
    hintsEnabled,
    jumpToDigit,
    jumpToNextEmpty,
    goToProfile,
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
    toggleNote,
    toggleNoteAcrossBlock,
    clearNotesAcrossBlock,
    undo,
    visualAnchor,
  ]);

  useEffect(() => {
    if (!review) return;

    function onReviewKeyDown(event: KeyboardEvent) {
      const numeric = digitFromKeyEvent(event);
      if (numeric >= 1 && numeric <= 9) {
        event.preventDefault();
        setReview((current) =>
          current?.map((cell, index) =>
            index === reviewSelected ? { ...cell, value: numeric } : cell,
          ) ?? null,
        );
        setReviewSelected((index) => Math.min(80, index + 1));
        return;
      }

      const key = event.key.toLowerCase();
      if (['0', 'backspace', 'delete', 'x'].includes(key)) {
        event.preventDefault();
        setReview((current) =>
          current?.map((cell, index) =>
            index === reviewSelected ? { ...cell, value: 0 } : cell,
          ) ?? null,
        );
        return;
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
      };

      if (movement[key]) {
        event.preventDefault();
        setReviewSelected((index) => {
          const [deltaRow, deltaCol] = movement[key];
          const row = Math.max(0, Math.min(8, Math.floor(index / 9) + deltaRow));
          const col = Math.max(0, Math.min(8, (index % 9) + deltaCol));
          return row * 9 + col;
        });
      }
    }

    window.addEventListener('keydown', onReviewKeyDown);
    return () => window.removeEventListener('keydown', onReviewKeyDown);
  }, [review, reviewSelected]);

  async function importImage(file: File) {
    setReview(null);
    setImageUrl(URL.createObjectURL(file));
    setOcrStatus('Preparing image');

    try {
      const cells = await recognizeSudokuImage(file, (done, total) => {
        setOcrStatus(`Reading cells ${done}/${total}`);
      });
      setReview(cells);
      setReviewSelected(0);
      setOcrStatus('');
    } catch (error) {
      setOcrStatus(error instanceof Error ? error.message : 'Could not read image');
    }
  }

  function acceptReview() {
    if (!review) return;
    startNewPuzzle(
      review.map((cell) => cell.value),
      'Loaded image import.',
      'image import',
      'custom',
      '9x9',
      newGameMode,
    );
    setReview(null);
    setImageUrl(null);
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
            leaderboardMode={leaderboardMode}
            leaderboardOpen={activePage === 'leaderboards'}
            leaderboardSize={leaderboardSize}
            onProfile={setCloudProfile}
            onScores={setGlobalScores}
            onStats={setCloudStats}
            onStatus={setLeaderboardStatus}
            playerName={playerName}
            scoreRecordId={showSolved ? currentRecord.id : null}
            scoreSubmissionsEnabled={
              hasCustomPlayerName &&
              scoreEnabled &&
              solvedNamePromptGameId !== currentRecord.id
            }
          />
          <ChallengeBridge
            activeChallengeId={activeChallengeId}
            challengeId={routeChallengeId}
            createRequest={challengeCreateRequest}
            currentRecord={currentRecord}
            currentMistakes={challengeMistakes}
            onChallenge={(nextChallenge) => {
              setChallengeRace(nextChallenge);
              setChallengeStatus(
                nextChallenge
                  ? ''
                  : routeChallengeId
                    ? 'Challenge not found.'
                    : '',
              );
            }}
            onCreateResult={handleChallengeCreated}
            onStatus={setChallengeStatus}
            playerName={playerName}
          />
        </>
      )}
      {showDashboard && (
        <DashboardPage
          difficulty={dashboardDifficulty}
          mode={dashboardMode}
          onModeChange={setDashboardMode}
          onSizeChange={setDashboardSize}
          onDifficultyChange={setDashboardDifficulty}
          onPlay={() =>
            startGeneratedPuzzle(dashboardDifficulty, true, dashboardSize, dashboardMode)
          }
          onSelect={dashboardSelect}
          puzzleSize={dashboardSize}
        />
      )}

      {activePage === 'games' && (
        <AppPageFrame
          activePage="games"
          onNavigate={navigateToPage}
          subtitle="archive · filter · resume"
          title="Puzzle Log"
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
          activePage="new"
          onNavigate={navigateToPage}
          subtitle="daily · generated · import"
          title="New Game"
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
            onDateChange={setDailyDateKey}
            onDifficultyChange={setNewGameDifficulty}
            onModeChange={setNewGameMode}
            onSizeChange={setNewGameSize}
            onImage={() => fileInputRef.current?.click()}
            onLoadPasted={startPastedPuzzle}
            onLocal={() =>
              startGeneratedPuzzle(newGameDifficulty, false, newGameSize, newGameMode)
            }
            onMountain={() => void fetchSudokuMountainPuzzle(false)}
            onMountainDaily={() => void fetchSudokuMountainPuzzle(true)}
            onPuzzleTextChange={setNewPuzzleText}
            onOpenDaily={(selectedDateKey) => {
              openDailyPuzzle(newGameDifficulty, selectedDateKey, newGameSize, newGameMode);
              closeMenuModal();
              setNewGameStatus('');
            }}
            onToday={() => setDailyDateKey(todayDateKey())}
            onYesterday={() => {
              setDailyDateKey(offsetDateKey(-1));
              openDailyPuzzle(newGameDifficulty, offsetDateKey(-1), newGameSize, newGameMode);
              closeMenuModal();
              setNewGameStatus('');
            }}
            puzzleText={newPuzzleText}
            puzzleSize={newGameSize}
            status={newGameStatus}
          />
        </AppPageFrame>
      )}

      {activePage === 'leaderboards' && (
        <AppPageFrame
          activePage="leaderboards"
          onNavigate={navigateToPage}
          subtitle={
            hasConvexBackend()
              ? 'live Convex leaderboard'
              : 'local best times · global endpoint optional'
          }
          title="Leaderboards"
        >
          <Leaderboards
            globalScores={globalScores}
            localScores={localLeaderboard}
            onModeChange={setLeaderboardMode}
            onSizeChange={setLeaderboardSize}
            playMode={leaderboardMode}
            puzzleSize={leaderboardSize}
            status={leaderboardStatus}
          />
        </AppPageFrame>
      )}

      {activePage === 'challenge' && (
        <AppPageFrame
          activePage="challenge"
          onNavigate={navigateToPage}
          subtitle={
            routeChallengeId
              ? 'share link · same puzzle · compare results'
              : 'choose rules · create link · challenge friends'
          }
          title="Challenges"
        >
          {routeChallengeId ? (
            <ChallengeRacePanel
              activeChallengeId={activeChallengeId}
              challenge={challengeRace}
              challengeId={routeChallengeId}
              isCurrentSolved={
                Boolean(activeChallengeId && activeChallengeId === routeChallengeId) &&
                currentRecord.status === 'completed'
              }
              onContinue={goToPlay}
              onCopyLink={() => {
                if (routeChallengeId) copyChallengeLink(routeChallengeId);
              }}
              onStart={startChallengeRace}
              shareUrl={challengeShareUrl}
              status={challengeStatus}
            />
              ) : (
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
              {hasConvexBackend() ? (
                <ChallengeHistoryPanel
                  onCopyLink={copyChallengeLink}
                  onOpenChallenge={(challengeId) => {
                    void navigate({
                      to: '/challenge/$challengeId',
                      params: { challengeId },
                    });
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
                  <button
                    type="button"
                    className="w-full border border-[var(--accent)] bg-[var(--accent)] px-4 py-3 font-mono text-xs font-black uppercase tracking-[0.16em] text-[var(--app-bg)] transition active:translate-y-px"
                    onClick={() => openChallengeSetup()}
                  >
                    new challenge
                  </button>
                  <p className="text-sm leading-relaxed text-[var(--muted)]">
                    Create a race or streak battle link, then send it to a friend.
                    Results collect here.
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

      {activePage === 'profile' && (
        <AppPageFrame
          activePage="profile"
          onNavigate={navigateToPage}
          subtitle={
            publicFriendCode ? 'public stats · recent solves' : 'identity · progress · sync'
          }
          title={publicFriendCode ? 'Player Profile' : 'Profile'}
        >
          {publicFriendCode ? (
            hasConvexBackend() ? (
              <PublicProfilePanel
                friendCode={publicFriendCode}
                onBack={goToProfile}
                onChallenge={(profile) => {
                  navigateToPage('challenge');
                  openChallengeSetup({
                    anonId: profile.anonId,
                    friendCode: profile.friendCode,
                    name: profile.name,
                  });
                }}
              />
            ) : (
              <PublicProfileOffline onBack={goToProfile} />
            )
          ) : (
            <ProfilePanel
              cloudProfile={cloudProfile}
              cloudStats={cloudStats}
              guestId={guestId}
              localStats={localProfileStats}
              onChallengeFriend={(friend) => {
                navigateToPage('challenge');
                openChallengeSetup(friend);
              }}
              onNameChange={updatePlayerName}
              onViewFriendProfile={(friend) => openPublicProfile(friend.friendCode)}
              playerName={playerName}
            />
          )}
        </AppPageFrame>
      )}

      {showBoard && (
        <div
        className="grid min-h-screen w-full grid-cols-1 transition-[grid-template-columns] duration-300 ease-out lg:h-screen lg:min-h-0 lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)_var(--hint-rail-width)]"
        style={
          {
            '--sidebar-width': sidebarOpen ? '340px' : '0px',
            '--hint-rail-width': hintRailOpen ? '360px' : '0px',
          } as CSSProperties
        }
      >
        <section
          className="column-rise order-2 flex min-h-screen flex-col justify-between border-[var(--border)] bg-[var(--workspace-bg)] lg:min-h-0 lg:border-l"
          style={{ animationDelay: '80ms' }}
        >
          <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--status-bg)] px-3 py-2.5 lg:hidden">
            <div className="flex min-w-0 items-baseline gap-2 font-mono">
              <button
                type="button"
                aria-label="Home"
                onClick={goToDashboard}
                className="shrink-0 text-sm font-bold uppercase tracking-[0.16em] text-[var(--accent)] transition hover:brightness-125"
              >
                vimdoku
              </button>
              <span className="truncate text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                {labelCell(selected, activeSize)} · {completion}/{activeCellCount}
              </span>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                aria-label="Hint"
                disabled={!hintsEnabled}
                onClick={() => {
                  if (!hintsEnabled) return;
                  resumeTimerFromActivity();
                  setHintRailOpen(true);
                  askForHint();
                }}
                className="grid h-9 w-9 place-items-center border border-[var(--border)] bg-[var(--button-bg)] font-mono text-sm font-bold text-[var(--accent)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
              >
                ?
              </button>
              <button
                type="button"
                aria-label="Open menu"
                onClick={() => openModalRoute('menu')}
                className="grid h-9 w-9 place-items-center border border-[var(--border)] bg-[var(--button-bg)] text-[var(--app-text)] active:translate-y-px"
              >
                <Menu size={18} />
              </button>
            </div>
          </header>

          <div
            className="relative grid min-h-0 place-items-center overflow-hidden px-3 py-3 sm:px-5 lg:flex-1 lg:px-8 lg:py-4"
            style={battleImpactStyle}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-10 bg-[var(--danger)] mix-blend-screen"
              style={battleImpactFlashStyle}
            />
            <div className="w-full max-w-[min(76vh,calc(100vh-176px),820px,100%)]">
              <section
                className="board-settle grid aspect-square border-4 border-[var(--grid-line)] bg-[var(--grid-line)]"
                style={{ gridTemplateColumns: `repeat(${activeConfig.size}, minmax(0, 1fr))` }}
                aria-label={`${activeSize} Sudoku board`}
              >
                {grid.map((value, index) => (
                  <button
                    type="button"
                    key={labelCell(index, activeSize)}
                    aria-label={`${labelCell(index, activeSize)} ${value || 'empty'}`}
                    onClick={() => {
                      resumeTimerFromActivity();
                      setSelected(index);
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
                      activeConfig,
                    )}
                  >
                    {value ? (
                      <span className="text-[clamp(1.55rem,7vw,3.9rem)] leading-none">
                        {value}
                      </span>
                    ) : (
                      <span
                        className={`flex h-full w-full flex-wrap content-start items-start gap-x-[10%] gap-y-[3%] px-[12%] py-[10%] font-mono text-[clamp(0.58rem,1.75vw,1.1rem)] font-bold leading-none ${
                          index === selected ||
                          (hint && 'cell' in hint && hint.cell === index)
                            ? 'text-[var(--app-bg)]'
                            : 'text-[var(--note)]'
                        }`}
                      >
                        {notes[index].map((note) => (
                          <span key={note}>{note}</span>
                        ))}
                      </span>
                    )}
                  </button>
                ))}
              </section>
            </div>
          </div>

          <NumberPad
            digits={activeDigits}
            notesEnabled={notesEnabled}
            noteMode={noteMode}
            onDigit={(digit) => {
              resumeTimerFromActivity();
              if (noteMode && notesEnabled) toggleNote(digit);
              else setCell(digit);
            }}
            onErase={() => {
              resumeTimerFromActivity();
              setCell(0);
            }}
            onToggleNotes={() => {
              resumeTimerFromActivity();
              if (notesEnabled) setNoteMode((current) => !current);
            }}
          />

          <div className="flex-1 lg:hidden" aria-hidden="true" />

          <StatusLine
            cellLabel={labelCell(selected, activeSize)}
            challengeMistakes={
              activeChallengeKind === 'streak' ? challengeMistakes : undefined
            }
            compact={compactStatus}
            completion={completion}
            cellCount={activeCellCount}
            elapsedMs={elapsedMs}
            message={statusLine}
            mode={editorMode}
            noteMode={noteMode}
            onToggleNotes={() => {
              resumeTimerFromActivity();
              setNoteMode((current) => !current);
            }}
            onToggleTimer={toggleTimerPaused}
            timerEnabled={timerEnabled}
            timerPaused={timerPaused}
          />

        </section>

        <aside
          aria-hidden={!sidebarOpen}
          className={`column-rise order-1 hidden min-h-0 overflow-hidden border-[var(--border)] bg-[var(--sidebar-bg)] transition-opacity duration-200 lg:block lg:h-screen ${
            sidebarOpen ? 'opacity-100' : 'lg:pointer-events-none lg:opacity-0'
          }`}
        >
          <div className="flex h-full min-h-0 w-full flex-col gap-3 overflow-y-auto p-3 lg:w-[340px]">
          <section className="flex items-center justify-between gap-3 border border-[var(--border)] bg-[var(--panel-bg)] px-4 py-3">
            <button
              type="button"
              aria-label="Home"
              onClick={goToDashboard}
              className="group text-left transition"
            >
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
                Vim-first sudoku
              </p>
              <h1 className="text-2xl font-black tracking-normal group-hover:text-[var(--accent)]">
                Vimdoku
              </h1>
            </button>
            <button
              type="button"
              aria-label="Open menu"
              title="Menu"
              className="grid h-10 w-10 shrink-0 place-items-center border border-[var(--border)] bg-[var(--button-bg)] text-[var(--app-text)] transition hover:border-[var(--accent)] hover:bg-[var(--panel-soft)] active:translate-y-px"
              onClick={() => openModalRoute('menu')}
            >
              <Menu size={18} />
            </button>
          </section>
          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void importImage(file);
              event.currentTarget.value = '';
            }}
          />
          <Panel title="puzzle log">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate font-mono text-sm text-[var(--app-text)]">
                {activeGame.source}
              </p>
              <button
                type="button"
                className="shrink-0 border border-[var(--border)] bg-[var(--button-bg)] px-2 py-1.5 font-mono text-xs font-bold uppercase tracking-[0.14em] hover:border-[var(--accent)]"
                onClick={openGameLibrary}
              >
                open
              </button>
            </div>
            <p className="mt-3 border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
              <span className="text-[var(--accent)]">{inProgressGames.length}</span>{' '}
              active /{' '}
              <span className="text-[var(--accent)]">{completedGames.length}</span>{' '}
              done /{' '}
              <span className="text-[var(--accent)]">{formatDuration(elapsedMs)}</span>
            </p>
          </Panel>
          <Panel title="session">
            <div className="grid grid-cols-2 gap-2">
              <SessionMeta label="cell" value={labelCell(selected, activeSize)} />
              <SessionMeta label="filled" value={`${completion}/${activeCellCount}`} />
              <SessionMeta label="grid" value={activeSize} />
              <SessionMeta label="rules" value={modeLabel(activeMode)} accent={activeMode !== 'classic'} />
              <SessionMeta label="mode" value={editorMode} accent={editorMode !== 'normal'} />
              <SessionMeta
                label="timer"
                value={timerPaused ? 'paused' : formatDuration(elapsedMs)}
                accent={timerPaused}
              />
            </div>

            <div className="mt-3 border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.14em]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--muted)]">notes</span>
                <span className={noteMode ? 'text-[var(--accent)]' : 'text-[var(--app-text)]'}>
                  {noteMode ? 'on' : 'off'}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <span className="text-[var(--muted)]">conflicts</span>
                <span className={visibleConflicts.size > 0 ? 'text-[var(--danger)]' : 'text-[var(--app-text)]'}>
                  {activeMode === 'no-check' ? 'hidden' : visibleConflicts.size}
                </span>
              </div>
            </div>

            <div className="mt-4 grid gap-1.5 font-mono text-xs">
              {[
                ['?', 'hint'],
                [':', 'command line'],
                ['cmd+p', 'puzzle picker'],
                [':notes', 'fill candidates'],
                [':prune', 'remove bad notes'],
                [':clear-notes', 'clear annotations'],
              ].map(([key, value]) => (
                <div
                  key={key}
                  className="grid grid-cols-[104px_minmax(0,1fr)] gap-2 border border-[var(--border)] bg-[var(--button-bg)] px-2.5 py-1.5"
                >
                  <span className="whitespace-nowrap text-[0.68rem] font-bold text-[var(--accent)]">
                    {key}
                  </span>
                  <span className="truncate uppercase tracking-[0.12em] text-[var(--muted)]">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
          </div>
        </aside>

        <aside
          aria-hidden={!hintRailOpen}
          className={`column-rise order-3 border-[var(--border)] bg-[var(--sidebar-bg)] transition-opacity duration-200 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:max-h-[80vh] max-lg:border-t lg:h-screen lg:min-h-0 lg:overflow-hidden lg:border-l ${
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
                    setReview(null);
                    setImageUrl(null);
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
                  <span className="truncate text-[var(--app-text)]">{leaderLabel}</span>
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
            if (event.target !== event.currentTarget) return;
            setCommandMode(null);
            setCommandValue('');
            setStatusLine('Command cancelled.');
          }}
        >
          <form
            className="relative h-fit w-full max-w-xl border border-[var(--border)] bg-[var(--panel-bg)] font-mono"
            onSubmit={(event) => {
              event.preventDefault();
              if (commandMode === 'search') {
                const digit = Number(commandValue.slice(0, 1));
                if (digit >= 1 && digit <= activeConfig.size) jumpToDigit(digit);
                setCommandMode(null);
                setCommandValue('');
              } else {
                executeCommand(commandValue);
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
                onChange={(event) => setCommandValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setCommandMode(null);
                    setCommandValue('');
                    setStatusLine('Command cancelled.');
                  }

                  if (event.key === 'Enter') {
                    event.preventDefault();
                    if (commandMode === 'search') {
                      const digit = Number(commandValue.slice(0, 1));
                      if (digit >= 1 && digit <= activeConfig.size) jumpToDigit(digit);
                      setCommandMode(null);
                      setCommandValue('');
                    } else {
                      executeCommand(commandValue);
                    }
                    return;
                  }

                  if (commandMode === 'search') {
                    const digit = Number(event.key);
                    if (digit >= 1 && digit <= activeConfig.size) {
                      event.preventDefault();
                      jumpToDigit(digit);
                      setCommandMode(null);
                      setCommandValue('');
                    }
                  }
                }}
              />
            </div>
          </form>
        </div>
      )}

      {gamePickerOpen && (
        // biome-ignore lint/a11y/noStaticElementInteractions: This backdrop closes the picker when clicking outside the dialog.
        <div
          role="presentation"
          className="fixed inset-0 z-30 flex justify-center bg-black/70 px-4 pt-[10vh]"
          onMouseDown={(event) => {
            if (event.target !== event.currentTarget) return;
            closeGamePicker();
            setStatusLine('Closed puzzle picker.');
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
                  setGameQuery(value);
                  setGameCursor(0);
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
          title="new-challenge"
          wide
        >
          <ChallengeSetupPanel
            currentGame={activeGame}
            difficulty={challengeDifficulty}
            kind={challengeKind}
            mode={challengeMode}
            onCreate={createConfiguredRaceChallenge}
            onCreateCurrent={() => createRaceChallenge()}
            onDifficultyChange={setChallengeDifficulty}
            onKindChange={setChallengeKind}
            onModeChange={setChallengeMode}
            onRecipientChange={setChallengeRecipient}
            onRecipientClear={() => setChallengeRecipient(null)}
            onSizeChange={setChallengeSize}
            onSourceChange={setChallengeSource}
            puzzleSize={challengeSize}
            recipient={challengeRecipient}
            source={challengeSource}
            status={challengeStatus}
          />
        </TuiModal>
      )}

      {activeMenuModal && (
        <TuiModal
          title={modalTitle(activeMenuModal)}
          narrow={activeMenuModal === 'menu'}
          onClose={closeMenuModal}
        >
          {activeMenuModal === 'menu' && (
            <div className="flex flex-col gap-0.5">
              <MenuItem
                label="home"
                onClick={() => {
                  closeMenuModal();
                  goToDashboard();
                }}
              >
                <Home size={15} />
              </MenuItem>
              <MenuItem label="new game" onClick={openNewGame}>
                <Plus size={15} />
              </MenuItem>
              <MenuItem label="puzzle library" onClick={openGameLibrary}>
                <History size={15} />
              </MenuItem>
              <MenuItem label="leaderboards" onClick={openLeaderboards}>
                <Trophy size={15} />
              </MenuItem>
              <MenuItem
                label="challenges"
                onClick={() => {
                  closeMenuModal();
                  void navigate({ to: '/challenge' });
                }}
              >
                <Swords size={15} />
              </MenuItem>
              <MenuItem label="profile" onClick={goToProfile}>
                <UserRound size={15} />
              </MenuItem>
              <MenuItem
                label="import image"
                onClick={() => {
                  closeMenuModal();
                  fileInputRef.current?.click();
                }}
              >
                <ImageUp size={15} />
              </MenuItem>
              <div className="my-1 border-t border-[var(--border)]" />
              <MenuItem
                label="hint"
                hint="?"
                onClick={() => {
                  closeMenuModal();
                  askForHint();
                }}
              >
                <Lightbulb size={15} />
              </MenuItem>
              <MenuItem
                label="undo"
                hint="u"
                disabled={!history.length}
                onClick={() => {
                  closeMenuModal();
                  undo();
                }}
              >
                <Undo2 size={15} />
              </MenuItem>
              <MenuItem
                label="redo"
                hint="C-r"
                disabled={!future.length}
                onClick={() => {
                  closeMenuModal();
                  redo();
                }}
              >
                <Redo2 size={15} />
              </MenuItem>
              <MenuItem
                label="reset entries"
                onClick={() => {
                  closeMenuModal();
                  resetPuzzle();
                }}
              >
                <RotateCcw size={15} />
              </MenuItem>
              <MenuItem
                label="clear puzzle"
                onClick={() => {
                  closeMenuModal();
                  clearAll();
                }}
              >
                <Eraser size={15} />
              </MenuItem>
              <div className="my-1 border-t border-[var(--border)]" />
              <MenuItem
                label="commands"
                hint=":"
                onClick={() => openModalRoute('commands')}
              >
                <Terminal size={15} />
              </MenuItem>
              <MenuItem label="settings" onClick={() => openModalRoute('settings')}>
                <Settings size={15} />
              </MenuItem>
              <MenuItem
                label="hint engine"
                hint={hintRailOpen ? 'on' : 'off'}
                active={hintRailOpen}
                onClick={() => {
                  closeMenuModal();
                  setHintRailOpen((current) => !current);
                }}
              >
                <Command size={15} />
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
            onDateChange={setDailyDateKey}
            onDifficultyChange={setNewGameDifficulty}
            onModeChange={setNewGameMode}
            onSizeChange={setNewGameSize}
              onImage={() => fileInputRef.current?.click()}
              onLoadPasted={startPastedPuzzle}
              onLocal={() =>
                startGeneratedPuzzle(newGameDifficulty, false, newGameSize, newGameMode)
              }
              onMountain={() => void fetchSudokuMountainPuzzle(false)}
              onMountainDaily={() => void fetchSudokuMountainPuzzle(true)}
              onPuzzleTextChange={setNewPuzzleText}
              onOpenDaily={(selectedDateKey) => {
                openDailyPuzzle(newGameDifficulty, selectedDateKey, newGameSize, newGameMode);
                closeMenuModal();
                setNewGameStatus('');
              }}
              onToday={() => setDailyDateKey(todayDateKey())}
              onYesterday={() => {
                setDailyDateKey(offsetDateKey(-1));
                openDailyPuzzle(newGameDifficulty, offsetDateKey(-1), newGameSize, newGameMode);
                closeMenuModal();
                setNewGameStatus('');
              }}
            puzzleText={newPuzzleText}
            puzzleSize={newGameSize}
            status={newGameStatus}
            />
          )}

          {activeMenuModal === 'settings' && (
            <div className="space-y-5">
              <section>
                <p className="mb-2 font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
                  colorscheme
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {DARK_THEMES.map((theme) => (
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

              <section className="border border-[var(--border)] bg-[var(--input-bg)] p-3">
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
                  puzzle input
                </p>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Upload a straight puzzle photo. OCR guesses the givens, then opens
                  a keyboard-editable review grid.
                </p>
                <button
                  type="button"
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 border border-[var(--border)] bg-[var(--cell-search)] px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-bg)]"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImageUp size={18} />
                  Upload puzzle
                </button>
                {ocrStatus && (
                  <p className="mt-3 font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
                    {ocrStatus}
                  </p>
                )}
              </section>
            </div>
          )}

          {activeMenuModal === 'commands' && (
            <div className="grid gap-x-8 gap-y-0.5 font-mono text-sm sm:grid-cols-2">
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
                [':pause', 'pause puzzle timer'],
                [':resume', 'resume puzzle timer'],
                [':noh', 'clear hint/search highlights'],
                [':nohint', 'turn hints off'],
                [':prune', 'remove impossible notes'],
                [':clear-notes', 'clear all notes'],
                [':settings', 'open global settings'],
                [':import', 'open image import'],
                ['cmd+m', 'open menu'],
                ['cmd+p', 'open puzzle finder'],
                ['/5', 'highlight 5s'],
                ['f5', 'jump to next 5'],
                ['w / b', 'next / previous empty'],
                ['{ / }', 'previous / next box'],
                ['H J K L', 'jump one box in direction'],
                ['gg / G', 'first / last cell'],
                ['C-d / C-u', 'jump 3 rows down / up'],
                ['u / C-r', 'undo / redo'],
                ['SPC', 'leader menu (e h n g l i s m)'],
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
          )}
        </TuiModal>
      )}

      {showSolved && (
        <SolvedModal
          difficulty={activeGame.difficulty}
          elapsedMs={elapsedMs}
          needsName={needsSolvedNamePrompt}
          onNameChange={updatePlayerName}
          onNameConfirm={() => {
            if (!isCustomPlayerName(playerName)) {
              setLeaderboardStatus('Choose a leaderboard handle first.');
              return;
            }
            setSolvedNamePromptGameId(null);
          }}
          source={activeGame.source}
          playerName={playerName}
          onLeaderboards={() => {
            setSolvedDismissed(true);
            navigateToPage('leaderboards');
          }}
          onNewGame={() => {
            setSolvedDismissed(true);
            openNewGame();
          }}
          onPuzzleLog={() => {
            setSolvedDismissed(true);
            navigateToPage('games');
          }}
          onReview={() => setSolvedDismissed(true)}
        />
      )}

    </main>
  );
}

// Touch number entry — mobile/tablet only; desktop uses the keyboard.
function NumberPad({
  digits,
  notesEnabled,
  noteMode,
  onDigit,
  onErase,
  onToggleNotes,
}: {
  digits: number[];
  notesEnabled: boolean;
  noteMode: boolean;
  onDigit: (digit: number) => void;
  onErase: () => void;
  onToggleNotes: () => void;
}) {
  return (
    <div className="shrink-0 border-t border-[var(--border)] bg-[var(--status-bg)] p-2 lg:hidden">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${digits.length}, minmax(0, 1fr))` }}
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
      <div className="mt-1 grid grid-cols-2 gap-1">
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
          notes {noteMode ? 'on' : 'off'}
        </button>
        <button
          type="button"
          onClick={onErase}
          className="border border-[var(--border)] bg-[var(--button-bg)] px-3 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-text)] transition active:translate-y-px"
        >
          erase
        </button>
      </div>
    </div>
  );
}

function SolvedModal({
  difficulty,
  elapsedMs,
  needsName,
  onLeaderboards,
  onNewGame,
  onNameChange,
  onNameConfirm,
  onPuzzleLog,
  onReview,
  playerName,
  source,
}: {
  difficulty?: PuzzleDifficulty | 'custom';
  elapsedMs: number;
  needsName: boolean;
  onLeaderboards: () => void;
  onNewGame: () => void;
  onNameChange: (value: string) => void;
  onNameConfirm: () => void;
  onPuzzleLog: () => void;
  onReview: () => void;
  playerName: string;
  source: string;
}) {
  const actions: [key: string, label: string, run: () => void][] = [
    ['n', 'new game', onNewGame],
    ['g', 'puzzle log', onPuzzleLog],
    ['l', 'leaderboards', onLeaderboards],
    ['esc', 'review board', onReview],
  ];
  const playerNameValue =
    needsName && !isCustomPlayerName(playerName) ? '' : playerName;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: This backdrop returns to review when clicking outside the solved dialog.
    <div
      role="presentation"
      className="fixed inset-0 z-40 grid place-items-center bg-black/80 p-4 font-mono"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onReview();
      }}
    >
      <section className="w-full max-w-md border border-[var(--accent)] bg-[var(--panel-bg)]">
        <div className="flex flex-col items-center gap-3 border-b border-[var(--border)] px-6 py-8">
          <span className="text-5xl leading-none text-[var(--accent)]">✓</span>
          <h2 className="text-xs font-black uppercase tracking-[0.34em] text-[var(--app-text)]">
            puzzle solved
          </h2>
          <p className="text-4xl font-black text-[var(--accent)]">
            {formatDuration(elapsedMs)}
          </p>
          <p className="text-[0.7rem] uppercase tracking-[0.16em] text-[var(--muted)]">
            {source}
            {difficulty ? ` · ${difficulty}` : ''}
          </p>
        </div>
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
                  event.stopPropagation();
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onNameConfirm();
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
        <div className="flex flex-col p-2">
          {actions.map(([key, label, run]) => (
            <button
              type="button"
              key={key}
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
  );
}

function NewGameSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="relative border border-[var(--border)] bg-[var(--input-bg)] p-4">
      <span className="absolute -top-[7px] left-3 bg-[var(--workspace-bg)] px-1.5 font-mono text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
        {title}
      </span>
      {children}
    </section>
  );
}

function NewGameField({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-[var(--muted)]">
        {label}
      </p>
      {children}
    </div>
  );
}

function NewGamePanel({
  dailyRecord,
  dateKey,
  difficulty,
  isFetchingPuzzle,
  mode,
  onDateChange,
  onDifficultyChange,
  onModeChange,
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
  dailyRecord: GameRecord | null;
  dateKey: string;
  difficulty: PuzzleDifficulty;
  isFetchingPuzzle: boolean;
  mode: PlayMode;
  onDateChange: (dateKey: string) => void;
  onDifficultyChange: (difficulty: PuzzleDifficulty) => void;
  onModeChange: (mode: PlayMode) => void;
  onImage: () => void;
  onLoadPasted: () => void;
  onLocal: () => void;
  onMountain: () => void;
  onMountainDaily: () => void;
  onOpenDaily: (dateKey: string) => void;
  onPuzzleTextChange: (value: string) => void;
  onSizeChange: (puzzleSize: PuzzleSize) => void;
  onToday: () => void;
  onYesterday: () => void;
  puzzleText: string;
  puzzleSize: PuzzleSize;
  status: string;
}) {
  const dailyGrid = useMemo(
    () =>
      generatePuzzle(
        difficulty,
        dailySeed(difficulty, 'vimdoku', dateKey, puzzleSize, mode),
        puzzleSize,
      ),
    [dateKey, difficulty, mode, puzzleSize],
  );
  const dateLabel = formatDailyDate(dateKey);
  const canGoNext = dateKey < todayDateKey();
  const dailyCompleted = dailyRecord?.status === 'completed';
  const cellCount = boardConfigFor(puzzleSize).cellCount;

  return (
    <div className="space-y-4">
      <NewGameSection title="play a daily">
        <form
          className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const selectedDateKey = String(form.get('daily-date') ?? dateKey);
            onOpenDaily(
              isValidDateKey(selectedDateKey) ? selectedDateKey : dateKey,
            );
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
                        onDateChange(event.target.value);
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
                tone={dailyCompleted ? 'done' : dailyRecord ? 'active' : 'default'}
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
              dailyCompleted ? 'border-[var(--accent)]' : 'border-[var(--border)]'
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
  );
}

function NewGameAction({
  command,
  description,
  disabled = false,
  onClick,
}: {
  command: string;
  description: string;
  disabled?: boolean;
  onClick: () => void;
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
  );
}

function DailyMeta({
  label,
  tone = 'default',
  value,
}: {
  label: string;
  tone?: 'default' | 'active' | 'done';
  value: string;
}) {
  const toneClass =
    tone === 'done'
      ? 'text-[var(--accent)]'
      : tone === 'active'
        ? 'text-[var(--accent-2)]'
        : 'text-[var(--app-text)]';

  return (
    <div>
      <p className="text-[0.62rem] text-[var(--muted)]">{label}</p>
      <p className={`mt-1 ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}

function DashboardPage({
  difficulty,
  mode,
  onDifficultyChange,
  onModeChange,
  onPlay,
  onSelect,
  onSizeChange,
  puzzleSize,
}: {
  difficulty: PuzzleDifficulty;
  mode: PlayMode;
  onDifficultyChange: (difficulty: PuzzleDifficulty) => void;
  onModeChange: (mode: PlayMode) => void;
  onPlay: () => void;
  onSelect: (key: string) => void;
  onSizeChange: (puzzleSize: PuzzleSize) => void;
  puzzleSize: PuzzleSize;
}) {
  const dailyDifficulties: PuzzleDifficulty[] = ['easy', 'medium', 'hard'];
  // Generation is CPU-heavy — run it after first paint so the splash is instant.
  const [dailyGrids, setDailyGrids] = useState<Record<string, Grid> | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDailyGrids({
        easy: generatePuzzle('easy', dailySeed('easy', 'vimdoku', todayDateKey(), puzzleSize, mode), puzzleSize),
        medium: generatePuzzle('medium', dailySeed('medium', 'vimdoku', todayDateKey(), puzzleSize, mode), puzzleSize),
        hard: generatePuzzle('hard', dailySeed('hard', 'vimdoku', todayDateKey(), puzzleSize, mode), puzzleSize),
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [mode, puzzleSize]);

  const grid = dailyGrids?.[difficulty] ?? emptyGrid(puzzleSize);

  return (
    <section className="flex min-h-screen flex-col bg-[var(--app-bg)] font-mono lg:h-screen lg:overflow-y-auto">
      <div className="grid flex-1 place-items-center px-4 py-10">
        <div className="w-full max-w-4xl">
          <pre className="overflow-hidden text-[0.4rem] leading-none text-[var(--accent)] sm:text-[0.62rem] md:text-[0.78rem]">
            {VIMDOKU_BANNER}
          </pre>
          <p className="mt-5 text-[0.7rem] uppercase tracking-[0.3em] text-[var(--muted)]">
            a vim-first sudoku
          </p>

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
  );
}

function AppPageFrame({
  activePage,
  children,
  onNavigate,
  subtitle,
  title,
}: {
  activePage: PageRoute;
  children: ReactNode;
  onNavigate: (page: PageRoute) => void;
  subtitle: string;
  title: string;
}) {
  const navItems: [PageRoute, string][] = [
    ['dashboard', 'home'],
    ['play', 'play'],
    ['games', 'puzzles'],
    ['leaderboards', 'scores'],
    ['challenge', 'challenge'],
    ['profile', 'profile'],
  ];

  return (
    <section className="flex min-h-screen flex-col bg-[var(--workspace-bg)] font-mono lg:h-screen">
      <header className="grid h-auto shrink-0 gap-2 border-b border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 md:h-11 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="truncate text-sm font-black uppercase tracking-[0.18em] text-[var(--app-text)]">
            {title}
          </h1>
          <span className="hidden truncate text-xs uppercase tracking-[0.14em] text-[var(--muted)] sm:inline">
            {subtitle}
          </span>
        </div>
        <nav className="flex min-w-0 gap-1 overflow-x-auto">
          {navItems.map(([page, label]) => (
            <button
              type="button"
              key={page}
              className={`shrink-0 border px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.14em] transition ${
                activePage === page
                  ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
                  : 'border-[var(--border)] bg-[var(--button-bg)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--app-text)]'
              }`}
              onClick={() => onNavigate(page)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </div>
    </section>
  );
}

function MenuItem({
  active = false,
  children,
  disabled = false,
  hint,
  label,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  hint?: string;
  label: string;
  onClick: () => void;
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
      <span className="grid h-4 w-4 shrink-0 place-items-center">{children}</span>
      <span className="flex-1 truncate">{label}</span>
      {hint && (
        <span
          className={`shrink-0 ${active ? 'text-[var(--app-bg)]' : 'text-[var(--muted)]'}`}
        >
          {hint}
        </span>
      )}
    </button>
  );
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
  applyHint: () => void;
  askForHint: (mode?: HintMode) => void;
  clearHints: (closeRail?: boolean) => void;
  conflicts: number;
  hint: Hint | null;
  hintMode: HintMode;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col font-mono">
      <header className="flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--status-bg)] px-4 text-[var(--status-text)]">
        <span className="text-xs uppercase tracking-[0.16em]">[hint-engine]</span>
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
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
                  {hint.technique}
                </p>
              )}
              <p className="font-sans leading-relaxed">{hintText(hint, hintMode)}</p>
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
  );
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
  activeGameId: string;
  completedCount: number;
  filter: GameLibraryFilter;
  inProgressCount: number;
  onDelete: (id: string) => void;
  onFilterChange: (filter: GameLibraryFilter) => void;
  onQueryChange: (value: string) => void;
  onResume: (record: GameRecord) => void;
  query: string;
  records: GameRecord[];
  totalCount: number;
}) {
  const [visibleCount, setVisibleCount] = useState(80);
  const visibleRecords = records.slice(0, visibleCount);
  const filters: [GameLibraryFilter, string, number][] = [
    ['all', 'all', totalCount],
    ['in-progress', 'active', inProgressCount],
    ['completed', 'done', completedCount],
  ];

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
            show next {Math.min(80, records.length - visibleRecords.length)} puzzles
          </button>
        )}
      </section>
    </div>
  );
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
  );
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
  activeGameId: string;
  cursor: number;
  onCursorChange: (value: number | ((current: number) => number)) => void;
  onDelete: (id: string) => void;
  onQueryChange: (value: string) => void;
  onResume: (record: GameRecord) => void;
  query: string;
  records: GameRecord[];
  selectedRecord: GameRecord | null;
}) {
  const selectedIndex = Math.min(cursor, Math.max(0, records.length - 1));
  const moveCursor = (delta: 1 | -1) => {
    onCursorChange((current) => {
      if (records.length === 0) return 0;
      return (current + delta + records.length) % records.length;
    });
  };

  return (
    <div
      role="listbox"
      tabIndex={-1}
      className="space-y-3"
      onKeyDown={(event) => {
        if (event.key === 'j' || event.key === 'ArrowDown') {
          event.preventDefault();
          moveCursor(1);
        } else if (event.key === 'k' || event.key === 'ArrowUp') {
          event.preventDefault();
          moveCursor(-1);
        } else if (event.key === 'Enter' && selectedRecord) {
          event.preventDefault();
          onResume(selectedRecord);
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
              const isSelected = index === selectedIndex;
              const isCurrent = record.id === activeGameId;
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
                      isSelected ? 'text-[var(--app-bg)]' : 'text-[var(--muted)]'
                    }`}
                  >
                    {record.status === 'completed'
                      ? formatDuration(record.elapsedMs)
                      : `${record.completion}/${cellCountFor(record)} · ${formatDuration(record.elapsedMs)}`}
                  </span>
                </button>
              );
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
                <PreviewRow label="mode" value={modeLabel(selectedRecord.playMode)} />
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
  );
}

function Leaderboards({
  globalScores,
  localScores,
  onModeChange,
  onSizeChange,
  playMode,
  puzzleSize,
  status,
}: {
  globalScores: LeaderboardEntry[];
  localScores: GameRecord[];
  onModeChange: (mode: PlayMode) => void;
  onSizeChange: (puzzleSize: PuzzleSize) => void;
  playMode: PlayMode;
  puzzleSize: PuzzleSize;
  status: string;
}) {
  return (
    <div className="space-y-3">
      <section className="flex flex-wrap items-center justify-between gap-2 border border-[var(--border)] bg-[var(--status-bg)] p-2">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
          board size
        </p>
        <div className="flex gap-1">
          {PUZZLE_SIZES.map((option) => (
            <button
              type="button"
              key={option}
              className={`border px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.16em] ${
                puzzleSize === option
                  ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
                  : 'border-[var(--border)] bg-[var(--button-bg)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--app-text)]'
              }`}
              onClick={() => onSizeChange(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {PLAY_MODES.map((option) => (
            <button
              type="button"
              key={option}
              className={`border px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.16em] ${
                playMode === option
                  ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
                  : 'border-[var(--border)] bg-[var(--button-bg)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--app-text)]'
              }`}
              onClick={() => onModeChange(option)}
            >
              {modeLabel(option)}
            </button>
          ))}
        </div>
      </section>
      <div className="grid gap-3 lg:grid-cols-2">
        <LeaderboardPanel
          title={`local best / ${puzzleSize} / ${modeLabel(playMode)}`}
          empty={`No completed ${puzzleSize} ${modeLabel(playMode)} local games yet.`}
        >
          {localScores.map((record, index) => (
            <LeaderboardRow
              key={record.id}
              rank={index + 1}
              primary={`${record.source}${record.difficulty ? ` / ${record.difficulty}` : ''}`}
              secondary={formatGameDate(record.completedAt ?? record.updatedAt)}
              time={formatDuration(record.elapsedMs)}
            />
          ))}
        </LeaderboardPanel>

        <LeaderboardPanel
          title={`global best / ${puzzleSize} / ${modeLabel(playMode)}`}
          empty={status || `No global ${puzzleSize} ${modeLabel(playMode)} scores loaded.`}
        >
          {globalScores.map((score, index) => (
            <LeaderboardRow
              key={score.id}
              rank={index + 1}
              primary={score.player}
              secondary={`${score.source}${score.difficulty ? ` / ${score.difficulty}` : ''}`}
              time={formatDuration(score.elapsedMs)}
            />
          ))}
        </LeaderboardPanel>
      </div>
    </div>
  );
}

function ChallengeSetupPanel({
  currentGame,
  difficulty,
  kind,
  mode,
  onCreate,
  onCreateCurrent,
  onDifficultyChange,
  onKindChange,
  onModeChange,
  onRecipientChange,
  onRecipientClear,
  onSizeChange,
  onSourceChange,
  puzzleSize,
  recipient,
  source,
  status,
}: {
  currentGame: GameMeta;
  difficulty: PuzzleDifficulty;
  kind: ChallengeKind;
  mode: PlayMode;
  onCreate: () => void;
  onCreateCurrent: () => void;
  onDifficultyChange: (difficulty: PuzzleDifficulty) => void;
  onKindChange: (kind: ChallengeKind) => void;
  onModeChange: (mode: PlayMode) => void;
  onRecipientChange: (friend: FriendSummary | null) => void;
  onRecipientClear: () => void;
  onSizeChange: (puzzleSize: PuzzleSize) => void;
  onSourceChange: (source: ChallengePuzzleSource) => void;
  puzzleSize: PuzzleSize;
  recipient: FriendSummary | null;
  source: ChallengePuzzleSource;
  status: string;
}) {
  const previewGrid = useMemo(() => {
    if (source === 'current') {
      return parseGrid(currentGame.puzzle, currentGame.puzzleSize);
    }
    return generatePuzzle(
      difficulty,
      dailySeed(
        difficulty,
        source === 'daily' ? 'vimdoku-preview' : 'generated-preview',
        todayDateKey(),
        puzzleSize,
        mode,
      ),
      puzzleSize,
    );
  }, [currentGame, difficulty, mode, puzzleSize, source]);
  const activeSize = source === 'current' ? currentGame.puzzleSize : puzzleSize;
  const activeMode = source === 'current' ? currentGame.playMode : mode;
  const activeDifficulty =
    source === 'current' ? currentGame.difficulty ?? 'custom' : difficulty;
  const sources: [ChallengePuzzleSource, string, string][] = [
    ['daily', 'daily', 'stable puzzle for today'],
    ['generated', 'generated', 'fresh random puzzle'],
    ['current', 'current', 'use loaded board'],
  ];
  const challengeKinds: [ChallengeKind, string, string][] = [
    ['race', 'race', 'fastest clean finish wins'],
    ['streak', 'streak battle', 'bad entries break ties before time'],
  ];

  return (
    <div className="flex flex-col">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="border border-[var(--border)] bg-[var(--input-bg)]">
        <div className="space-y-3 p-3">
          {hasConvexBackend() ? (
            <ChallengeTargetPicker
              onRecipientChange={onRecipientChange}
              onRecipientClear={onRecipientClear}
              recipient={recipient}
            />
          ) : (
            <NewGameField label="target">
              <div className="border border-[var(--border)] bg-[var(--status-bg)] p-3 font-mono text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                open link only · friend targets need Convex
              </div>
            </NewGameField>
          )}

          <NewGameField label="challenge mode">
            <div className="grid gap-2 md:grid-cols-2">
              {challengeKinds.map(([kindId, label, description]) => (
                <button
                  type="button"
                  key={kindId}
                  className={`border p-3 text-left font-mono transition ${
                    kind === kindId
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
                      : 'border-[var(--border)] bg-[var(--button-bg)] text-[var(--app-text)] hover:border-[var(--accent)]'
                  }`}
                  onClick={() => onKindChange(kindId)}
                >
                  <span className="block text-xs font-black uppercase tracking-[0.16em]">
                    {label}
                  </span>
                  <span
                    className={`mt-2 block text-xs leading-relaxed ${
                      kind === kindId
                        ? 'text-[var(--app-bg)] opacity-80'
                        : 'text-[var(--muted)]'
                    }`}
                  >
                    {description}
                  </span>
                </button>
              ))}
            </div>
          </NewGameField>

          <NewGameField label="puzzle source">
            <div className="grid gap-2 md:grid-cols-3">
              {sources.map(([sourceId, label, description]) => (
                <button
                  type="button"
                  key={sourceId}
                  className={`border p-3 text-left font-mono transition ${
                    source === sourceId
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
                      : 'border-[var(--border)] bg-[var(--button-bg)] text-[var(--app-text)] hover:border-[var(--accent)]'
                  }`}
                  onClick={() => onSourceChange(sourceId)}
                >
                  <span className="block text-xs font-black uppercase tracking-[0.16em]">
                    {label}
                  </span>
                  <span
                    className={`mt-2 block text-xs leading-relaxed ${
                      source === sourceId
                        ? 'text-[var(--app-bg)] opacity-80'
                        : 'text-[var(--muted)]'
                    }`}
                  >
                    {description}
                  </span>
                </button>
              ))}
            </div>
          </NewGameField>

          {source !== 'current' && (
            <>
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
            </>
          )}

          {status && (
            <p className="border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.14em] text-[var(--accent)]">
              {status}
            </p>
          )}
        </div>
      </section>

      <section className="border border-[var(--border)] bg-[var(--input-bg)]">
        <header className="border-b border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
          [challenge-preview]
        </header>
        <div className="space-y-3 p-3">
          <PuzzlePreview
            grid={previewGrid}
            givens={previewGrid.map((value) => value !== 0)}
          />
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
            <span className="font-bold text-[var(--accent)]">
              {challengeKindLabel(kind)}
            </span>
            {recipient && (
              <>
                <span className="text-[var(--border)]">·</span>
                <span className="text-[var(--app-text)]">{recipient.name}</span>
              </>
            )}
            <span className="text-[var(--border)]">·</span>
            <span>{source}</span>
            <span className="text-[var(--border)]">·</span>
            <span>{activeSize}</span>
            <span className="text-[var(--border)]">·</span>
            <span>{modeLabel(activeMode)}</span>
            <span className="text-[var(--border)]">·</span>
            <span>{activeDifficulty}</span>
            <span className="text-[var(--border)]">·</span>
            <span className="text-[var(--app-text)]">
              {previewGrid.filter(Boolean).length}/
              {boardConfigFor(activeSize).cellCount}
            </span>
            <span>filled</span>
          </p>
        </div>
      </section>
      </div>

      <div className="sticky bottom-0 z-10 -mx-3 -mb-3 mt-3 flex flex-col gap-2 border-t border-[var(--border)] bg-[var(--status-bg)] p-3 sm:flex-row">
        <button
          type="button"
          className="border border-[var(--accent)] bg-[var(--accent)] px-4 py-3 font-mono text-xs font-black uppercase tracking-[0.16em] text-[var(--app-bg)] sm:flex-1"
          onClick={onCreate}
        >
          {recipient
            ? `send ${challengeKindLabel(kind)}`
            : `create ${challengeKindLabel(kind)} link`}
        </button>
        {source !== 'current' && (
          <button
            type="button"
            className="border border-[var(--border)] bg-[var(--button-bg)] px-4 py-3 font-mono text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--app-text)] sm:flex-1"
            onClick={onCreateCurrent}
          >
            challenge current puzzle
          </button>
        )}
      </div>
    </div>
  );
}

function ChallengeTargetPicker({
  onRecipientChange,
  onRecipientClear,
  recipient,
}: {
  onRecipientChange: (friend: FriendSummary | null) => void;
  onRecipientClear: () => void;
  recipient: FriendSummary | null;
}) {
  const anonId = useMemo(() => getOrCreateGuestId(), []);
  const rows = useQuery(listFriendsRef as FunctionReference<'query'>, {
    anonId,
  }) as FriendshipRow[] | undefined;
  const friends = rows?.filter((row) => row.status === 'accepted') ?? [];

  return (
    <NewGameField label="target">
      <div className="grid gap-2">
        <button
          type="button"
          className={`border p-3 text-left font-mono transition ${
            recipient === null
              ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
              : 'border-[var(--border)] bg-[var(--button-bg)] text-[var(--app-text)] hover:border-[var(--accent)]'
          }`}
          onClick={onRecipientClear}
        >
          <span className="block text-xs font-black uppercase tracking-[0.16em]">
            open challenge link
          </span>
          <span
            className={`mt-2 block text-xs leading-relaxed ${
              recipient === null ? 'text-[var(--app-bg)] opacity-80' : 'text-[var(--muted)]'
            }`}
          >
            anyone with the link can join
          </span>
        </button>

        {rows === undefined ? (
          <div className="border border-[var(--border)] bg-[var(--status-bg)] p-3 font-mono text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
            loading friends...
          </div>
        ) : friends.length === 0 ? (
          <div className="border border-[var(--border)] bg-[var(--status-bg)] p-3 font-mono text-xs leading-relaxed text-[var(--muted)]">
            Add a friend from your profile before sending a direct challenge.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {friends.map((row) => {
              const selected = recipient?.anonId === row.friend.anonId;
              return (
                <button
                  type="button"
                  key={row.friend.anonId}
                  className={`border p-3 text-left font-mono transition ${
                    selected
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
                      : 'border-[var(--border)] bg-[var(--button-bg)] text-[var(--app-text)] hover:border-[var(--accent)]'
                  }`}
                  onClick={() => onRecipientChange(row.friend)}
                >
                  <span className="block truncate text-xs font-black uppercase tracking-[0.16em]">
                    {row.friend.name}
                  </span>
                  <span
                    className={`mt-2 block text-[0.65rem] uppercase tracking-[0.14em] ${
                      selected ? 'text-[var(--app-bg)] opacity-80' : 'text-[var(--muted)]'
                    }`}
                  >
                    {row.friend.friendCode || 'friend'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </NewGameField>
  );
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
  activeChallengeId: string | null;
  challenge: ChallengeRace | null;
  challengeId: string | null;
  isCurrentSolved: boolean;
  onContinue: () => void;
  onCopyLink: () => void;
  onStart: (challenge: ChallengeRace) => void;
  shareUrl: string;
  status: string;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  useEffect(() => {
    if (copyState !== 'copied') return;
    const timer = window.setTimeout(() => setCopyState('idle'), 1800);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  if (!hasConvexBackend()) {
    return (
      <section className="border border-[var(--border)] bg-[var(--input-bg)] p-5">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
          challenge backend offline
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          Challenge links use Convex so both players can see the same lobby
          and submit results. Set `VITE_CONVEX_URL` to enable this mode.
        </p>
      </section>
    );
  }

  if (!challengeId) {
    return (
      <section className="border border-[var(--border)] bg-[var(--input-bg)] p-5 text-sm text-[var(--muted)]">
        No challenge selected.
      </section>
    );
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
    );
  }

  const puzzleGrid = parseGrid(challenge.puzzle, challenge.puzzleSize);
  const completedAttempts = challenge.attempts.filter(
    (attempt) => attempt.status === 'completed',
  );
  const leader = completedAttempts[0] ?? null;
  const modeName = challengeKindLabel(challenge.challengeKind);
  const isActiveRace = activeChallengeId === challenge.challengeId;
  const actionLabel = isCurrentSolved
    ? 'result submitted'
    : isActiveRace
      ? `continue ${modeName}`
      : `start ${modeName}`;

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
            disabled={isCurrentSolved}
            onClick={() => {
              if (isActiveRace) onContinue();
              else onStart(challenge);
            }}
          >
            {actionLabel}
          </button>
        </header>

        <div className="grid gap-4 p-3 md:grid-cols-[220px_minmax(0,1fr)]">
          <PuzzlePreview
            grid={puzzleGrid}
            givens={puzzleGrid.map((value) => value !== 0)}
          />
          <div className="min-w-0 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <ChallengeMeta label="created by" value={challenge.creatorName} />
              <ChallengeMeta
                label="target"
                value={challenge.recipientName ?? 'open link'}
              />
              <ChallengeMeta label="challenge" value={modeName} />
              <ChallengeMeta label="grid" value={challenge.puzzleSize} />
              <ChallengeMeta label="rules" value={modeLabel(challenge.playMode)} />
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
                  {shareUrl || `${window.location.origin}${challengePath(challenge.challengeId)}`}
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
                    onCopyLink();
                    setCopyState('copied');
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
              {challenge.challengeKind === 'streak'
                ? 'Both players solve this exact puzzle. Bad entries count against your streak score, then time breaks ties.'
                : 'Both players solve this exact puzzle. The race starts when each player presses start, and fastest completed time wins.'}
            </p>
          </div>
        </div>
      </section>

      <section className="border border-[var(--border)] bg-[var(--input-bg)]">
        <header className="border-b border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
          [{challenge.challengeKind === 'streak' ? 'streak-board' : 'race-board'}]
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
  );
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
  );
}

function LeaderboardPanel({
  children,
  empty,
  title,
}: {
  children: ReactNode;
  empty: string;
  title: string;
}) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <section className="min-h-[420px] border border-[var(--border)] bg-[var(--input-bg)]">
      <header className="border-b border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
        [{title}]
      </header>
      <div className="max-h-[56vh] overflow-y-auto">
        {hasRows ? (
          children
        ) : (
          <p className="p-4 text-sm leading-relaxed text-[var(--muted)]">{empty}</p>
        )}
      </div>
    </section>
  );
}

function LeaderboardRow({
  primary,
  rank,
  secondary,
  time,
}: {
  primary: string;
  rank: number;
  secondary: string;
  time: string;
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
  );
}

type ProfileStats = {
  averageElapsedMs?: number;
  bestElapsedMs?: number;
  completedCount: number;
  currentStreak: number;
  inProgressCount: number;
  lastCompletedAt?: string;
  syncedGames: number;
};

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
  cloudProfile: CloudProfile | null;
  cloudStats: CloudStats | null;
  guestId: string;
  localStats: ProfileStats;
  onChallengeFriend: (friend: FriendSummary) => void;
  onNameChange: (value: string) => void;
  onViewFriendProfile: (friend: FriendSummary) => void;
  playerName: string;
}) {
  const isCloud = Boolean(cloudStats);
  const syncedCompleted = cloudStats?.completedCount ?? 0;
  const completedCount = Math.max(localStats.completedCount, syncedCompleted);
  const joined = cloudProfile?.createdAt
    ? formatGameDate(cloudProfile.createdAt)
    : 'local guest';

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
          <ProfileMeta label="guest id" value={shortGuestId(guestId)} />
          <ProfileMeta label="friend code" value={cloudProfile?.friendCode ?? 'syncing'} />
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
          <ProfileStat label="in progress" value={String(localStats.inProgressCount)} />
          <ProfileStat label="streak" value={`${localStats.currentStreak}d`} />
          <ProfileStat
            label="best"
            value={
              localStats.bestElapsedMs ? formatDuration(localStats.bestElapsedMs) : '--'
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
        {hasConvexBackend() ? (
          <FriendsPanel
            friendCode={cloudProfile?.friendCode ?? ''}
            onChallengeFriend={onChallengeFriend}
            onViewProfile={onViewFriendProfile}
          />
        ) : (
          <section className="border border-[var(--border)] bg-[var(--input-bg)] p-4">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
              [friends offline]
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              Friends use the Convex backend so guest codes and requests can sync
              between browsers.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function PublicProfileOffline({ onBack }: { onBack: () => void }) {
  return (
    <section className="border border-[var(--border)] bg-[var(--input-bg)] p-5">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
        [public profile offline]
      </p>
      <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
        Public profiles use the Convex backend so stats and recent solves can sync
        between players.
      </p>
      <button
        type="button"
        className="mt-4 border border-[var(--border)] bg-[var(--button-bg)] px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-text)] hover:border-[var(--accent)]"
        onClick={onBack}
      >
        back
      </button>
    </section>
  );
}

function ProfileMeta({
  accent = false,
  label,
  value,
}: {
  accent?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono text-xs uppercase tracking-[0.14em]">
      <span className="text-[var(--muted)]">{label}</span>
      <span className={accent ? 'text-[var(--accent)]' : 'text-[var(--app-text)]'}>
        {value}
      </span>
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

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="uppercase tracking-[0.16em] text-[var(--muted)]">
        {label}
      </dt>
      <dd className="truncate text-right text-[var(--app-text)]">{value}</dd>
    </div>
  );
}

// A real mini board — digits sized in cqw so they fit the preview at any width.
function PuzzlePreview({
  grid,
  givens,
}: {
  grid: Grid;
  givens: boolean[];
}) {
  const config = boardConfigFor(puzzleSizeFromGrid(grid));
  return (
    <div
      className="@container mx-auto grid aspect-square w-full max-w-[300px] border-2 border-[var(--grid-line)] bg-[var(--grid-line)]"
      style={{ gridTemplateColumns: `repeat(${config.size}, minmax(0, 1fr))` }}
    >
      {grid.map((value, index) => {
        const row = Math.floor(index / config.size);
        const col = index % config.size;
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
        );
      })}
    </div>
  );
}

function TuiModal({
  children,
  footer = 'q / esc closes menu',
  narrow = false,
  onClose,
  title,
  wide = false,
}: {
  children: ReactNode;
  footer?: string;
  narrow?: boolean;
  onClose: () => void;
  title: string;
  wide?: boolean;
}) {
  return (
    <TuiDialog
      footer={footer}
      narrow={narrow}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
      title={title}
      wide={wide}
    >
      {children}
    </TuiDialog>
  );
}

function Panel({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <section className="relative border border-[var(--border)] bg-[var(--panel-bg)] p-4">
      {title && (
        <span className="absolute -top-[7px] left-3 bg-[var(--sidebar-bg)] px-1.5 font-mono text-[0.65rem] font-bold uppercase leading-none tracking-[0.2em] text-[var(--accent)]">
          {title}
        </span>
      )}
      {children}
    </section>
  );
}

function SessionMeta({
  accent = false,
  label,
  value,
}: {
  accent?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="border border-[var(--border)] bg-[var(--input-bg)] p-2 font-mono">
      <p className="text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
        {label}
      </p>
      <p
        className={`mt-1 truncate text-sm font-bold uppercase tracking-[0.12em] ${
          accent ? 'text-[var(--accent)]' : 'text-[var(--app-text)]'
        }`}
      >
        {value}
      </p>
    </div>
  );
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
  cellLabel: string;
  cellCount: number;
  challengeMistakes?: number;
  compact: boolean;
  completion: number;
  elapsedMs: number;
  message: string;
  mode: EditorMode;
  noteMode: boolean;
  onToggleNotes: () => void;
  onToggleTimer: () => void;
  timerEnabled: boolean;
  timerPaused: boolean;
}) {
  const percent = Math.round((completion / cellCount) * 100);
  const modeBg =
    mode === 'visual'
      ? 'var(--cell-search)'
      : mode === 'annotate'
        ? 'var(--accent-2)'
        : 'var(--accent)';

  // Lualine-style sections: A=mode, B=context, C=message, X=keys, Y=stats, Z=done.
  const section =
    'flex h-full shrink-0 items-center whitespace-nowrap px-3 font-bold uppercase tracking-[0.16em]';

  return (
    <div
      data-testid="status-line"
      className="flex h-8 shrink-0 select-none items-stretch overflow-hidden border-t border-[var(--border)] bg-[var(--status-bg)] font-mono text-xs"
    >
      <div className={section} style={{ background: modeBg, color: 'var(--app-bg)' }}>
        {mode}
      </div>
      <Wedge direction="right" tip={modeBg} field="var(--panel-soft)" />

      <div
        className={`${section} gap-3`}
        style={{ background: 'var(--panel-soft)', color: 'var(--app-text)' }}
      >
        <span>{cellLabel}</span>
        <button
          type="button"
          title="Toggle note mode (n)"
          onClick={onToggleNotes}
          className="uppercase tracking-[0.16em] transition hover:brightness-150"
          style={{ color: noteMode ? 'var(--accent-2)' : 'var(--muted)' }}
        >
          notes {noteMode ? 'on' : 'off'}
        </button>
      </div>
      <Wedge direction="right" tip="var(--panel-soft)" field="var(--status-bg)" />

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
      <Wedge direction="left" tip="var(--panel-soft)" field="var(--status-bg)" />

      <div
        className={`${section} gap-3`}
        style={{ background: 'var(--panel-soft)', color: 'var(--app-text)' }}
      >
        {!compact && <span>{completion}/{cellCount}</span>}
        {challengeMistakes !== undefined && (
          <span className="text-[var(--accent-2)]">{challengeMistakes} miss</span>
        )}
        <button
          type="button"
          title={timerEnabled ? (timerPaused ? 'Resume timer' : 'Pause timer') : 'Zen mode does not track time'}
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
          {timerEnabled && (timerPaused ? <Play size={13} /> : <Pause size={13} />)}
          <span>{timerEnabled ? formatDuration(elapsedMs) : 'zen'}</span>
        </button>
      </div>
      <Wedge direction="left" tip="var(--accent)" field="var(--panel-soft)" />

      <div className={section} style={{ background: 'var(--accent)', color: 'var(--app-bg)' }}>
        {percent}%
      </div>
    </div>
  );
}

function useScreenImpact() {
  const [frame, setFrame] = useState({ flash: 0, x: 0, y: 0 });
  const animationRef = useRef<number | null>(null);
  const decayRef = useRef(0.8);
  const flashRef = useRef(0);
  const intensityRef = useRef(0);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = media.matches;

    function onChange() {
      reducedMotionRef.current = media.matches;
    }

    media.addEventListener('change', onChange);
    return () => {
      media.removeEventListener('change', onChange);
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const tick = useCallback(() => {
    intensityRef.current *= decayRef.current;
    flashRef.current *= 0.84;

    if (intensityRef.current < 0.35) intensityRef.current = 0;
    if (flashRef.current < 0.015) flashRef.current = 0;

    if (intensityRef.current === 0 && flashRef.current === 0) {
      animationRef.current = null;
      setFrame({ flash: 0, x: 0, y: 0 });
      return;
    }

    const intensity = intensityRef.current;
    setFrame({
      flash: flashRef.current,
      x: (Math.random() - 0.5) * intensity * 2,
      y: (Math.random() - 0.5) * intensity * 2,
    });
    animationRef.current = window.requestAnimationFrame(tick);
  }, []);

  const triggerImpact = useCallback(
    (intensity = 8, flash = 0.25, decay = 0.82) => {
      if (reducedMotionRef.current) return;

      intensityRef.current = Math.max(intensityRef.current, intensity);
      flashRef.current = Math.max(flashRef.current, flash);
      decayRef.current = decay;

      if (animationRef.current === null) {
        animationRef.current = window.requestAnimationFrame(tick);
      }
    },
    [tick],
  );

  const impactStyle = useMemo<CSSProperties>(
    () => ({
      transform:
        frame.x === 0 && frame.y === 0
          ? undefined
          : `translate3d(${frame.x.toFixed(2)}px, ${frame.y.toFixed(2)}px, 0)`,
      willChange: frame.x === 0 && frame.y === 0 ? undefined : 'transform',
    }),
    [frame.x, frame.y],
  );

  const flashStyle = useMemo<CSSProperties>(
    () => ({
      opacity: frame.flash,
      transition: frame.flash === 0 ? 'opacity 120ms ease-out' : undefined,
    }),
    [frame.flash],
  );

  return { flashStyle, impactStyle, triggerImpact };
}

function Wedge({
  direction,
  field,
  tip,
}: {
  direction: 'left' | 'right';
  field: string;
  tip: string;
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
  );
}

function modalTitle(modal: Exclude<MenuModal, null>) {
  if (modal === 'menu') return 'menu';
  if (modal === 'new') return 'new-game';
  if (modal === 'settings') return 'settings';
  return 'commands';
}

function modalFromPath(pathname: string): MenuModal {
  if (pathname === '/menu') return 'menu';
  if (pathname === '/settings') return 'settings';
  if (pathname === '/commands') return 'commands';
  return null;
}

function pageFromPath(pathname: string): PageRoute {
  if (pathname === '/') return 'dashboard';
  if (pathname === '/new') return 'new';
  if (pathname === '/games') return 'games';
  if (pathname === '/leaderboards') return 'leaderboards';
  if (pathname === '/challenge') return 'challenge';
  if (challengeIdFromPath(pathname)) return 'challenge';
  if (pathname === '/profile') return 'profile';
  if (publicFriendCodeFromPath(pathname)) return 'profile';
  return 'play';
}

function publicFriendCodeFromPath(pathname: string) {
  const match = pathname.match(/^\/u\/([^/]+)$/);
  if (!match) return null;
  return compactFriendCode(decodeURIComponent(match[1]));
}

function compactFriendCode(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return compact.startsWith('VIM')
    ? `VIM-${compact.slice(3, 9)}`
    : `VIM-${compact.slice(0, 6)}`;
}

function hintText(hint: Hint, mode: HintMode) {
  if (!('cell' in hint)) return hint.message;
  if (mode === 'nudge') return hint.nudge;
  if (mode === 'explain') return `${hint.message} ${hint.detail}`;
  return hint.message;
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
  config: BoardConfig,
) {
  const row = Math.floor(index / config.size);
  const col = index % config.size;
  const sameRow = row === Math.floor(selected / config.size);
  const sameCol = col === selected % config.size;
  const selectedValue = grid[selected];
  const sameValue =
    selectedValue > 0 && index !== selected && grid[index] === selectedValue;
  const searchMatch =
    highlightDigit !== null && index !== selected && grid[index] === highlightDigit;
  const isHint = Boolean(hint && 'cell' in hint && hint.cell === index);
  const inVisualBlock =
    index !== selected && (visualCells?.has(index) ?? false);

  // Every state below paints a bright background, so cell text must
  // flip to the dark app color or it disappears into the highlight.
  const brightBg =
    index === selected ||
    conflicts.has(index) ||
    inVisualBlock ||
    isHint ||
    searchMatch ||
    sameValue;

  return [
    'relative grid aspect-square place-items-center border border-[var(--grid-line)] font-black outline-none transition focus-visible:outline-none focus-visible:outline-offset-0',
    col % config.boxCols === 0 ? 'border-l-4' : '',
    row % config.boxRows === 0 ? 'border-t-4' : '',
    index === selected
      ? 'bg-[var(--cell-selected)]'
      : conflicts.has(index)
        ? 'bg-[var(--cell-conflict)]'
        : inVisualBlock
          ? 'bg-[var(--cell-search)]'
        : isHint
          ? 'bg-[var(--cell-hint)]'
          : searchMatch
            ? 'bg-[var(--cell-search)]'
          : sameValue
            ? 'bg-[var(--cell-same)]'
          : sameRow || sameCol
            ? 'bg-[var(--cell-peer)]'
            : 'bg-[var(--cell-bg)]',
    brightBg
      ? 'text-[var(--app-bg)]'
      : givens[index]
        ? 'text-[var(--given)]'
        : 'text-[var(--entry)]',
  ].join(' ');
}

function filterGameRecords(records: GameRecord[], query: string) {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (terms.length === 0) return records;

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
      .toLowerCase();

    return terms.every((term) => haystack.includes(term));
  });
}

function cellCountFor(record: GameRecord) {
  return boardConfigFor(record.puzzleSize).cellCount;
}

function buildLocalStats(records: GameRecord[]): ProfileStats {
  const completed = records.filter((record) => record.status === 'completed');
  const timed = completed.filter((record) => record.elapsedMs > 0);
  const totalElapsedMs = timed.reduce((total, record) => total + record.elapsedMs, 0);
  const bestElapsedMs =
    timed.length > 0 ? Math.min(...timed.map((record) => record.elapsedMs)) : undefined;

  return {
    averageElapsedMs:
      timed.length > 0 ? Math.round(totalElapsedMs / timed.length) : undefined,
    bestElapsedMs,
    completedCount: completed.length,
    currentStreak: countCompletionStreak(
      completed.map((record) => record.completedAt ?? record.updatedAt),
    ),
    inProgressCount: records.filter((record) => record.status === 'in-progress').length,
    lastCompletedAt: completed[0]?.completedAt ?? completed[0]?.updatedAt,
    syncedGames: records.length,
  };
}

function countCompletionStreak(values: string[]) {
  const days = new Set(
    values
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()))
      .map((date) => date.toISOString().slice(0, 10)),
  );

  let streak = 0;
  const cursor = new Date();
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

function formatGameDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(date);
}

function formatDuration(value: number) {
  const totalSeconds = Math.max(0, Math.floor(value / 1000));
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`;
  }

  return `${minutes}:${seconds}`;
}

function loadTheme(): ThemeId {
  const stored = localStorage.getItem(THEME_KEY);
  return DARK_THEMES.some((theme) => theme.id === stored)
    ? (stored as ThemeId)
    : DARK_THEMES[0].id;
}

function loadPausedGameId() {
  return localStorage.getItem(TIMER_PAUSED_GAME_KEY);
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function isCustomPlayerName(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  return Boolean(trimmed && trimmed.toLowerCase() !== 'anonymous');
}

function digitFromKeyEvent(event: KeyboardEvent) {
  if (/^[1-9]$/.test(event.key)) return Number(event.key);
  if (/^Digit[1-9]$/.test(event.code)) return Number(event.code.replace('Digit', ''));
  if (/^Numpad[1-9]$/.test(event.code)) return Number(event.code.replace('Numpad', ''));
  return Number.NaN;
}

async function recognizeSudokuImage(
  file: File,
  onProgress: (done: number, total: number) => void,
): Promise<ReviewCell[]> {
  const image = await loadImage(file);
  const worker = await Tesseract.createWorker('eng');

  await worker.setParameters({
    tessedit_char_whitelist: '123456789',
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_CHAR,
  });

  const cells: ReviewCell[] = [];
  try {
    for (let index = 0; index < 81; index += 1) {
      const canvas = cropCell(image, index);
      const result = await worker.recognize(canvas);
      const text = result.data.text.replace(/\D/g, '').slice(0, 1);
      const value = text ? Number(text) : 0;
      cells.push({ value, confidence: value ? result.data.confidence : 0 });
      onProgress(index + 1, 81);
    }
  } finally {
    await worker.terminate();
  }

  return cells;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The image could not be loaded.'));
    image.src = URL.createObjectURL(file);
  });
}

function cropCell(image: HTMLImageElement, index: number): HTMLCanvasElement {
  const size = Math.min(image.naturalWidth, image.naturalHeight);
  const offsetX = (image.naturalWidth - size) / 2;
  const offsetY = (image.naturalHeight - size) / 2;
  const cellSize = size / 9;
  const row = Math.floor(index / 9);
  const col = index % 9;
  const padding = cellSize * 0.18;
  const sourceX = offsetX + col * cellSize + padding;
  const sourceY = offsetY + row * cellSize + padding;
  const sourceSize = cellSize - padding * 2;
  const canvas = document.createElement('canvas');
  const outputSize = 96;
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return canvas;

  context.fillStyle = 'white';
  context.fillRect(0, 0, outputSize, outputSize);
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
  );

  const data = context.getImageData(0, 0, outputSize, outputSize);
  for (let i = 0; i < data.data.length; i += 4) {
    const gray =
      data.data[i] * 0.299 + data.data[i + 1] * 0.587 + data.data[i + 2] * 0.114;
    const value = gray < 150 ? 0 : 255;
    data.data[i] = value;
    data.data[i + 1] = value;
    data.data[i + 2] = value;
  }
  context.putImageData(data, 0, 0);

  return canvas;
}

export default App;

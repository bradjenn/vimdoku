export type PlayMode = 'classic' | 'speedrun' | 'zen' | 'no-check';

export type PlayModePolicy = {
  hintsEnabled: boolean;
  hidesConflicts: boolean;
  notesEnabled: boolean;
  pauseEnabled: boolean;
  scoreEnabled: boolean;
  timerEnabled: boolean;
};

export const PLAY_MODES: PlayMode[] = ['classic', 'speedrun', 'zen', 'no-check'];

export function modeLabel(mode: PlayMode) {
  return mode === 'no-check' ? 'no-check' : mode;
}

export function modePolicy(mode: PlayMode): PlayModePolicy {
  return {
    hintsEnabled: mode !== 'speedrun',
    hidesConflicts: mode === 'no-check',
    notesEnabled: mode !== 'speedrun',
    pauseEnabled: mode !== 'speedrun',
    scoreEnabled: mode !== 'zen',
    timerEnabled: mode !== 'zen',
  };
}

export function sanitizePlayMode(value: unknown): PlayMode {
  return value === 'speedrun' || value === 'zen' || value === 'no-check'
    ? value
    : 'classic';
}

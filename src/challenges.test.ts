import { describe, expect, it } from 'vitest';
import {
  challengeGameId,
  challengeIdFromGameId,
  challengeIdFromPath,
  challengeKindFromGameId,
  challengeKindLabel,
  challengePath,
  createChallengeGameMeta,
  makeChallengeId,
  type ChallengeRace,
} from './challenges';

describe('challenge identifiers', () => {
  it('round-trips challenge URL paths', () => {
    expect(challengePath('race-abc123')).toBe('/challenge/race-abc123');
    expect(challengeIdFromPath('/challenge/race-abc123')).toBe('race-abc123');
    expect(challengeIdFromPath('/profile')).toBeNull();
  });

  it('round-trips challenge-backed game IDs', () => {
    const gameId = challengeGameId('streak-abc123', 'streak');

    expect(gameId).toBe('challenge-streak-streak-abc123');
    expect(challengeIdFromGameId(gameId)).toBe('streak-abc123');
    expect(challengeKindFromGameId(gameId)).toBe('streak');
    expect(challengeKindFromGameId('daily-vimdoku-easy-2026-05-18')).toBeNull();
  });

  it('creates IDs with the selected kind prefix', () => {
    expect(makeChallengeId('race')).toMatch(/^race-[a-z0-9]+$/);
    expect(makeChallengeId('streak')).toMatch(/^streak-[a-z0-9]+$/);
  });

  it('labels challenge kinds for display text', () => {
    expect(challengeKindLabel('race')).toBe('race');
    expect(challengeKindLabel('streak')).toBe('streak battle');
  });
});

describe('challenge game metadata', () => {
  it('creates a playable game meta object from a challenge', () => {
    const challenge: ChallengeRace = {
      attempts: [],
      challengeId: 'race-abc123',
      challengeKind: 'race',
      createdAt: '2026-05-18T12:00:00.000Z',
      creatorName: 'Bradley',
      difficulty: 'medium',
      playMode: 'classic',
      puzzle: '0'.repeat(81),
      puzzleSize: '9x9',
      source: 'test',
      status: 'open',
      title: 'Challenge',
      variantId: 'anti-knight',
    };

    expect(createChallengeGameMeta(challenge)).toMatchObject({
      difficulty: 'medium',
      id: 'challenge-race-race-abc123',
      playMode: 'classic',
      puzzle: '0'.repeat(81),
      puzzleSize: '9x9',
      source: 'challenge race race-abc123',
      variantId: 'anti-knight',
    });
  });
});

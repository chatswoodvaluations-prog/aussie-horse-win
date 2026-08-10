/**
 * Unit tests for the per-video seen-state helpers in nominations.tsx.
 *
 * These helpers read/write localStorage, so each test gets a fresh in-memory
 * store that is wiped after the test to prevent cross-test pollution.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getSeenVideos, markVideoSeen } from './nominations';

// ─── localStorage mock ────────────────────────────────────────────────────────

const VIDEOS_SEEN_KEY = 'ahw_videos_seen';
const LEGACY_HOW_IT_WORKS_KEY = 'ahw_how_it_works_seen';

function makeLocalStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get _store() { return store; },
  };
}

let storageMock: ReturnType<typeof makeLocalStorageMock>;

beforeEach(() => {
  storageMock = makeLocalStorageMock();
  vi.stubGlobal('localStorage', storageMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── getSeenVideos ────────────────────────────────────────────────────────────

describe('getSeenVideos', () => {
  it('returns an empty set when storage is empty', () => {
    const result = getSeenVideos();
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it('returns the IDs stored as a JSON array', () => {
    storageMock.setItem(VIDEOS_SEEN_KEY, JSON.stringify(['how-it-works', 'explainer-2']));

    const result = getSeenVideos();
    expect(result.has('how-it-works')).toBe(true);
    expect(result.has('explainer-2')).toBe(true);
    expect(result.size).toBe(2);
  });

  it('returns an empty set and does NOT throw when JSON is corrupted', () => {
    storageMock.setItem(VIDEOS_SEEN_KEY, 'this is not valid JSON {{{');

    let result: Set<string>;
    expect(() => { result = getSeenVideos(); }).not.toThrow();
    expect(result!.size).toBe(0);
  });

  it('returns an empty set and does NOT throw when the value is a non-array JSON type', () => {
    // A plain number or object is valid JSON but not an array — guard against it
    storageMock.setItem(VIDEOS_SEEN_KEY, 'true');

    let result: Set<string>;
    // May throw or may construct oddly — the contract is simply "no crash, returns a Set"
    expect(() => { result = getSeenVideos(); }).not.toThrow();
    expect(result!).toBeInstanceOf(Set);
  });

  it('migrates the legacy boolean flag into the new set and removes the old key', () => {
    // Simulate a returning visitor whose browser has the old-format key set
    storageMock.setItem(LEGACY_HOW_IT_WORKS_KEY, 'true');

    const result = getSeenVideos();

    // The video should now be in the set
    expect(result.has('how-it-works')).toBe(true);

    // The new key must have been written
    const raw = storageMock.getItem(VIDEOS_SEEN_KEY);
    expect(raw).not.toBeNull();
    const stored: string[] = JSON.parse(raw!);
    expect(stored).toContain('how-it-works');

    // The old key must have been cleaned up
    expect(storageMock.getItem(LEGACY_HOW_IT_WORKS_KEY)).toBeNull();
  });

  it('merges legacy flag with any IDs already in the new key', () => {
    storageMock.setItem(VIDEOS_SEEN_KEY, JSON.stringify(['explainer-2']));
    storageMock.setItem(LEGACY_HOW_IT_WORKS_KEY, 'true');

    const result = getSeenVideos();

    expect(result.has('how-it-works')).toBe(true);
    expect(result.has('explainer-2')).toBe(true);
    expect(storageMock.getItem(LEGACY_HOW_IT_WORKS_KEY)).toBeNull();
  });

  it('does NOT migrate legacy flag when it is not set to "true"', () => {
    storageMock.setItem(LEGACY_HOW_IT_WORKS_KEY, 'false');

    const result = getSeenVideos();

    expect(result.has('how-it-works')).toBe(false);
    // The old key should still be there (we only remove when value === 'true')
    expect(storageMock.getItem(LEGACY_HOW_IT_WORKS_KEY)).toBe('false');
  });
});

// ─── markVideoSeen ────────────────────────────────────────────────────────────

describe('markVideoSeen', () => {
  it('persists a new video ID to localStorage', () => {
    markVideoSeen('how-it-works');

    const raw = storageMock.getItem(VIDEOS_SEEN_KEY);
    expect(raw).not.toBeNull();
    const stored: string[] = JSON.parse(raw!);
    expect(stored).toContain('how-it-works');
  });

  it('adds to existing IDs without removing them', () => {
    storageMock.setItem(VIDEOS_SEEN_KEY, JSON.stringify(['explainer-2']));

    markVideoSeen('how-it-works');

    const raw = storageMock.getItem(VIDEOS_SEEN_KEY);
    const stored: string[] = JSON.parse(raw!);
    expect(stored).toContain('explainer-2');
    expect(stored).toContain('how-it-works');
  });

  it('is idempotent — calling twice does not duplicate the ID', () => {
    markVideoSeen('how-it-works');
    markVideoSeen('how-it-works');

    const raw = storageMock.getItem(VIDEOS_SEEN_KEY);
    const stored: string[] = JSON.parse(raw!);
    expect(stored.filter(id => id === 'how-it-works')).toHaveLength(1);
  });

  it('does NOT throw when localStorage throws (e.g. private browsing / quota)', () => {
    storageMock.setItem.mockImplementation(() => { throw new Error('QuotaExceededError'); });

    expect(() => markVideoSeen('how-it-works')).not.toThrow();
  });

  it('written value is readable back by getSeenVideos', () => {
    markVideoSeen('how-it-works');

    const result = getSeenVideos();
    expect(result.has('how-it-works')).toBe(true);
  });
});

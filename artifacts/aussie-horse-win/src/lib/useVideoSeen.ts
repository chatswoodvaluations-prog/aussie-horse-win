import { useState } from 'react';

/**
 * Per-video seen-state helpers.
 *
 * Storage format: ahw_videos_seen → JSON array of video ID strings, e.g. ["how-it-works"]
 *
 * Migration: the old single-boolean key (ahw_how_it_works_seen === 'true') is read once
 * on first access and promoted into the new set so existing visitors don't see the banner
 * again after the upgrade.
 */
const VIDEOS_SEEN_KEY = 'ahw_videos_seen';
const LEGACY_HOW_IT_WORKS_KEY = 'ahw_how_it_works_seen';

export function getSeenVideos(): Set<string> {
  try {
    const raw = localStorage.getItem(VIDEOS_SEEN_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    const set = new Set<string>(ids);

    // One-time migration: promote the old boolean flag
    if (localStorage.getItem(LEGACY_HOW_IT_WORKS_KEY) === 'true') {
      set.add('how-it-works');
      localStorage.setItem(VIDEOS_SEEN_KEY, JSON.stringify([...set]));
      localStorage.removeItem(LEGACY_HOW_IT_WORKS_KEY);
    }

    return set;
  } catch {
    return new Set();
  }
}

export function markVideoSeen(id: string): void {
  try {
    const set = getSeenVideos();
    set.add(id);
    localStorage.setItem(VIDEOS_SEEN_KEY, JSON.stringify([...set]));
  } catch {
    // ignore — localStorage may be unavailable (e.g. private browsing)
  }
}

export function useVideoSeen(id: string): [boolean, () => void] {
  const [seen, setSeen] = useState(() => getSeenVideos().has(id));

  const markSeen = () => {
    markVideoSeen(id);
    setSeen(true);
  };

  return [seen, markSeen];
}

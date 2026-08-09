import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';

const POLL_INTERVAL_MS = 60_000;

/**
 * Returns a refetchInterval value that is active (60 s) while the app is
 * foregrounded and false (paused) while it is backgrounded or inactive.
 * This avoids wasted network traffic when the user isn't looking at the app.
 */
export function useRefreshInterval(): number | false {
  const [active, setActive] = useState(true);

  useEffect(() => {
    function handleChange(nextState: AppStateStatus) {
      setActive(nextState === 'active');
    }

    const sub = AppState.addEventListener('change', handleChange);
    return () => sub.remove();
  }, []);

  return active ? POLL_INTERVAL_MS : false;
}

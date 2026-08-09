import { useEffect, useRef, useState } from 'react';

const FAILURE_THRESHOLD = 3;

/**
 * Returns banner state for when polling has failed consecutively.
 *
 * - `showBanner`  — true after FAILURE_THRESHOLD consecutive refetch failures
 * - `dismiss`     — call to hide the banner manually (stays hidden until next auto-dismiss)
 *
 * The banner auto-dismisses (and the counter resets) on the next successful
 * fetch so punters don't need to act when connectivity recovers on its own.
 *
 * @param failureCount  The `failureCount` field from the TanStack Query result —
 *                      it increments on each failed attempt and resets to 0 on success.
 * @param isError       Whether the query is currently in an error state.
 */
export function useStaleBanner(failureCount: number, isError: boolean): {
  showBanner: boolean;
  dismiss: () => void;
} {
  const [dismissed, setDismissed] = useState(false);
  const prevIsError = useRef(isError);

  // When the query recovers (isError flips to false), auto-dismiss and clear state.
  useEffect(() => {
    if (prevIsError.current && !isError) {
      setDismissed(false);
    }
    prevIsError.current = isError;
  }, [isError]);

  // When a new wave of consecutive failures starts, un-dismiss so the banner
  // can show again (e.g. punter dismissed it, walked into a tunnel, came back
  // out, and connectivity failed again on next cycle).
  useEffect(() => {
    if (failureCount === 1) {
      // reset dismissed state at the start of a new failure streak
      setDismissed(false);
    }
  }, [failureCount]);

  const showBanner = isError && failureCount >= FAILURE_THRESHOLD && !dismissed;

  return { showBanner, dismiss: () => setDismissed(true) };
}

import { useEffect, useRef, useCallback } from 'react';

/**
 * useIdleTimer monitors user activity and fires `onIdle` after `timeout` ms
 * of inactivity. It listens for mouse, keyboard, touch and scroll events.
 *
 * @param onIdle  Callback when user becomes idle
 * @param timeout Idle timeout in milliseconds (default 5 minutes)
 * @param enabled Whether the timer is active (allows pausing when already locked)
 */
export function useIdleTimer(
  onIdle: () => void,
  timeout = 5 * 60 * 1000,
  enabled = true,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  const resetTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (enabled) {
      timerRef.current = setTimeout(() => {
        onIdleRef.current();
      }, timeout);
    }
  }, [timeout, enabled]);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    const events: (keyof WindowEventMap)[] = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
      'wheel',
    ];

    const handleActivity = () => resetTimer();

    events.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }));

    // Start the initial timer
    resetTimer();

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleActivity));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer, enabled]);
}

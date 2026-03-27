import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '../i18n/useTranslation';

interface LockScreenProps {
  onUnlock: () => void;
  /** Background image URL to display behind the lock screen. */
  backgroundUrl?: string;
}

/**
 * LockScreen displays a simplified desktop with background, time,
 * date and weekday. The user can unlock by swiping up or clicking.
 */
export const LockScreen: React.FC<LockScreenProps> = ({ onUnlock, backgroundUrl }) => {
  const { t, language } = useTranslation();
  const [now, setNow] = useState(new Date());
  const [unlocking, setUnlocking] = useState(false);

  // Swipe tracking
  const swipeRef = useRef({
    startY: 0,
    currentY: 0,
    isDragging: false,
  });
  const [dragOffset, setDragOffset] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Update clock every second
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Block ALL mouse / touch / pointer events from reaching anything below
  // the lock-screen overlay by capturing them at the document level.
  useEffect(() => {
    const blockEvent = (e: Event) => {
      // Allow events that originate from inside the lock-screen wrapper
      const wrapper = wrapperRef.current;
      if (wrapper && wrapper.contains(e.target as Node)) return;
      e.stopImmediatePropagation();
      e.preventDefault();
    };

    const events = [
      'mousedown', 'mouseup', 'mousemove', 'click', 'dblclick',
      'pointerdown', 'pointerup', 'pointermove',
      'touchstart', 'touchmove', 'touchend',
      'dragstart', 'drag', 'dragend',
      'selectstart',
    ];

    for (const evt of events) {
      document.addEventListener(evt, blockEvent, { capture: true });
    }

    return () => {
      for (const evt of events) {
        document.removeEventListener(evt, blockEvent, { capture: true });
      }
    };
  }, []);

  // Format time — large display
  const timeStr = now.toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  // Format date + weekday
  const dateStr = now.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  const triggerUnlock = useCallback(() => {
    if (unlocking) return;
    setUnlocking(true);
    // Small delay for animation to play
    setTimeout(() => onUnlock(), 500);
  }, [unlocking, onUnlock]);

  // --- Touch handlers ---
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault(); // Prevent text selection during touch drag
    const touch = e.touches[0];
    swipeRef.current = {
      startY: touch.clientY,
      currentY: touch.clientY,
      isDragging: true,
    };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const s = swipeRef.current;
    if (!s.isDragging) return;
    s.currentY = e.touches[0].clientY;
    const diff = s.startY - s.currentY;
    // Only allow upward drag
    if (diff > 0) {
      setDragOffset(Math.min(diff, window.innerHeight));
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    const s = swipeRef.current;
    s.isDragging = false;
    const diff = s.startY - s.currentY;

    // Threshold: 15% of viewport height or velocity
    if (diff > window.innerHeight * 0.15) {
      triggerUnlock();
    } else {
      setDragOffset(0);
    }
  }, [triggerUnlock]);

  // --- Mouse handlers (for desktop) ---
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault(); // Prevent text selection during drag
    swipeRef.current = {
      startY: e.clientY,
      currentY: e.clientY,
      isDragging: true,
    };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const s = swipeRef.current;
    if (!s.isDragging) return;
    s.currentY = e.clientY;
    const diff = s.startY - s.currentY;
    if (diff > 0) {
      setDragOffset(Math.min(diff, window.innerHeight));
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    const s = swipeRef.current;
    if (!s.isDragging) return;
    s.isDragging = false;
    const diff = s.startY - s.currentY;
    if (diff > window.innerHeight * 0.15) {
      triggerUnlock();
    } else {
      setDragOffset(0);
    }
  }, [triggerUnlock]);

  // Click to unlock
  const handleClick = useCallback(() => {
    // Only trigger if not a drag
    const s = swipeRef.current;
    const diff = Math.abs(s.startY - s.currentY);
    if (diff < 5) {
      triggerUnlock();
    }
  }, [triggerUnlock]);

  // Calculate visual values
  const progress = Math.min(dragOffset / (window.innerHeight * 0.4), 1);
  const translateY = unlocking ? -window.innerHeight : -dragOffset;
  const opacity = unlocking ? 0 : 1 - progress * 0.5;

  return (
    <div ref={wrapperRef}>
    <AnimatePresence>
      {!unlocking ? (
        <motion.div
          ref={containerRef}
          key="lockscreen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ y: '-100%', opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
          className="fixed inset-0 z-[500] select-none cursor-pointer"
          style={{
            transform: `translateY(${translateY}px)`,
            opacity,
            transition: swipeRef.current.isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.4s ease',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleClick}
          onDragStart={(e) => e.preventDefault()}
          onSelectCapture={(e) => e.preventDefault()}
        >
          {/* Full background image */}
          {backgroundUrl && (
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url("${backgroundUrl}")` }}
            />
          )}
          {/* Fallback solid background when no image */}
          {!backgroundUrl && <div className="absolute inset-0 bg-gray-900" />}
          {/* Darkened overlay for readability */}
          <div className="absolute inset-0 bg-black/40" />

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center justify-center h-full px-6">
            {/* Time */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.6 }}
              className="text-[96px] sm:text-[120px] md:text-[140px] font-extralight text-white leading-none tracking-tight"
              style={{
                fontVariantNumeric: 'tabular-nums',
                textShadow: '0 4px 30px rgba(0,0,0,0.3)',
              }}
            >
              {timeStr}
            </motion.div>

            {/* Date + Weekday */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="mt-2 md:mt-4 text-[20px] sm:text-[24px] md:text-[28px] font-light text-white/80 tracking-wide"
              style={{
                textShadow: '0 2px 15px rgba(0,0,0,0.3)',
              }}
            >
              {dateStr}
            </motion.div>

            {/* Swipe up hint */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.8 }}
              className="absolute bottom-16 md:bottom-20 flex flex-col items-center gap-2"
            >
              {/* Animated chevron */}
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-white/50"
                >
                  <path d="m18 15-6-6-6 6" />
                </svg>
              </motion.div>
              <span className="text-[13px] text-white/40 font-light tracking-wider">
                {t('lockScreen.hint')}
              </span>
            </motion.div>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="lockscreen-exit"
          initial={{ y: 0, opacity: 1 }}
          animate={{ y: '-100%', opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
          className="fixed inset-0 z-[500]"
        >
          {backgroundUrl && (
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url("${backgroundUrl}")` }}
            />
          )}
          {!backgroundUrl && <div className="absolute inset-0 bg-gray-900" />}
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative z-10 flex flex-col items-center justify-center h-full px-6">
            <div
              className="text-[96px] sm:text-[120px] md:text-[140px] font-extralight text-white leading-none tracking-tight"
              style={{ fontVariantNumeric: 'tabular-nums', textShadow: '0 4px 30px rgba(0,0,0,0.3)' }}
            >
              {timeStr}
            </div>
            <div
              className="mt-2 md:mt-4 text-[20px] sm:text-[24px] md:text-[28px] font-light text-white/80 tracking-wide"
              style={{ textShadow: '0 2px 15px rgba(0,0,0,0.3)' }}
            >
              {dateStr}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  );
};

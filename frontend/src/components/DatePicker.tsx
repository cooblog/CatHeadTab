import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  className?: string;
  /** When true, renders Chinese labels; otherwise English. */
  isZh?: boolean;
}

const WEEKDAYS_ZH = ['一', '二', '三', '四', '五', '六', '日'];
const WEEKDAYS_EN = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const MONTHS_ZH = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
];

const MONTHS_EN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Returns 0=Mon … 6=Sun for the first day of the given month. */
function getFirstDayOfWeek(year: number, month: number): number {
  const d = new Date(year, month, 1).getDay(); // 0=Sun
  return d === 0 ? 6 : d - 1;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${y}/${m}/${d}`;
}

function isZhLocale(): boolean {
  const lang = navigator.language || 'en';
  return lang.startsWith('zh');
}

export const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, className, isZh: isZhProp }) => {
  const isZh = isZhProp ?? isZhLocale();
  const weekdays = isZh ? WEEKDAYS_ZH : WEEKDAYS_EN;
  const months = isZh ? MONTHS_ZH : MONTHS_EN;

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  // Parse initial value or default to current month
  const parsed = value ? new Date(value) : today;
  const [viewYear, setViewYear] = useState(parsed.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed.getMonth());
  const [open, setOpen] = useState(false);

  // Position state for portal-based panel
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; width: number; dropUp: boolean }>({
    top: 0,
    left: 0,
    width: 280,
    dropUp: false,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        panelRef.current && !panelRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Calculate position when opening
  useEffect(() => {
    if (!open || !triggerRef.current) return;

    const updatePosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const shouldDropUp = spaceBelow < 360;

      setPanelPos({
        top: shouldDropUp ? rect.top + window.scrollY : rect.bottom + window.scrollY + 6,
        left: rect.left + window.scrollX,
        width: 280,
        dropUp: shouldDropUp,
      });
    };

    updatePosition();

    // Reposition on scroll / resize
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open]);

  const prevMonth = useCallback(() => {
    setViewMonth(m => {
      if (m === 0) {
        setViewYear(y => y - 1);
        return 11;
      }
      return m - 1;
    });
  }, []);

  const nextMonth = useCallback(() => {
    setViewMonth(m => {
      if (m === 11) {
        setViewYear(y => y + 1);
        return 0;
      }
      return m + 1;
    });
  }, []);

  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    onChange(todayStr);
    setOpen(false);
  };

  const clearDate = () => {
    onChange('');
    setOpen(false);
  };

  // Build calendar grid
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);

  // Previous month tail
  const prevMonthDays = getDaysInMonth(
    viewMonth === 0 ? viewYear - 1 : viewYear,
    viewMonth === 0 ? 11 : viewMonth - 1
  );

  const cells: { day: number; current: boolean; dateStr: string }[] = [];

  // Previous month cells
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const m = viewMonth === 0 ? 11 : viewMonth - 1;
    const y = viewMonth === 0 ? viewYear - 1 : viewYear;
    cells.push({ day: d, current: false, dateStr: `${y}-${pad(m + 1)}-${pad(d)}` });
  }

  // Current month cells
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, current: true, dateStr: `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}` });
  }

  // Next month cells to fill the grid (always 6 rows = 42 cells)
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const m = viewMonth === 11 ? 0 : viewMonth + 1;
    const y = viewMonth === 11 ? viewYear + 1 : viewYear;
    cells.push({ day: d, current: false, dateStr: `${y}-${pad(m + 1)}-${pad(d)}` });
  }

  return (
    <div ref={containerRef} className={`relative ${className || ''}`}>
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="glass-input text-[13px] text-left flex items-center justify-between gap-2"
      >
        <span className={value ? 'text-white' : 'text-white/40'}>
          {value ? formatDisplay(value) : (isZh ? '选择日期...' : 'Pick a date...')}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/40 shrink-0">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      </button>

      {/* Dropdown calendar – rendered via portal to escape overflow:hidden */}
      {open && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[9999]"
          style={{
            top: panelPos.dropUp ? undefined : panelPos.top,
            bottom: panelPos.dropUp ? (window.innerHeight - panelPos.top + 6) : undefined,
            left: panelPos.left,
            width: panelPos.width,
          }}
        >
          <div className="rounded-2xl border border-white/[0.15] shadow-[0_8px_40px_rgba(0,0,0,0.5)] overflow-hidden"
            style={{
              background: 'rgba(30, 32, 36, 0.92)',
              backdropFilter: 'saturate(180%) blur(40px)',
              WebkitBackdropFilter: 'saturate(180%) blur(40px)',
            }}
          >
            {/* Month/Year header */}
            <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
              <span className="text-[13px] font-semibold text-white/90">
                {isZh
                  ? `${viewYear}年 ${months[viewMonth]}`
                  : `${months[viewMonth]} ${viewYear}`
                }
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
                </button>
                <button
                  type="button"
                  onClick={nextMonth}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
                </button>
              </div>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 px-3 pb-1">
              {weekdays.map(d => (
                <div key={d} className="text-center text-[11px] text-white/30 font-medium py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 px-3 pb-2">
              {cells.map((cell, i) => {
                const isSelected = cell.dateStr === value;
                const isToday = cell.dateStr === todayStr && cell.current;

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      if (!cell.current) {
                        // Navigate to that month
                        const [y, m] = cell.dateStr.split('-').map(Number);
                        setViewYear(y);
                        setViewMonth(m - 1);
                      }
                      const [, , d] = cell.dateStr.split('-').map(Number);
                      onChange(cell.dateStr);
                      setOpen(false);
                      void d;
                    }}
                    className={`
                      relative w-full h-8 flex items-center justify-center text-[12px] rounded-lg transition-all duration-150
                      ${!cell.current ? 'text-white/20' : 'text-white/70 hover:bg-white/10 hover:text-white'}
                      ${isSelected ? '!bg-blue-500/80 !text-white font-semibold shadow-[0_0_12px_rgba(59,130,246,0.4)]' : ''}
                      ${isToday && !isSelected ? 'ring-1 ring-blue-400/50 text-blue-400 font-medium' : ''}
                    `}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={clearDate}
                className="text-[12px] text-white/40 hover:text-white/70 transition-colors"
              >
                {isZh ? '清除' : 'Clear'}
              </button>
              <button
                type="button"
                onClick={goToday}
                className="text-[12px] text-blue-400 hover:text-blue-300 font-medium transition-colors"
              >
                {isZh ? '今天' : 'Today'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useFloatingWindow } from '../hooks/useFloatingWindow';
import { useTranslation } from '../i18n/useTranslation';
import { useLayoutStore } from '../store/layoutStore';
import {
  buildCalendarMonth,
  formatLunarDate,
  getCalendarCellLabel,
  getDateKey,
  getFestivalsForDate,
  getUpcomingCalendarEvents,
  isSameDate,
  solarToLunar,
  MAX_CALENDAR_YEAR,
  MIN_CALENDAR_YEAR,
  WEEK_DAYS_EN,
  WEEK_DAYS_ZH,
  type CalendarFestival,
  type CalendarFestivalCategory,
  type UpcomingCalendarEvent,
} from '../utils/calendar';

interface CalendarDetailModalProps {
  onClose: () => void;
  onEdit?: () => void;
}

const MONTHS_ZH = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CATEGORY_TONE: Record<CalendarFestivalCategory, string> = {
  chinese: 'border-red-300/25 bg-red-500/15 text-red-100',
  international: 'border-sky-300/25 bg-sky-400/15 text-sky-100',
  solarTerm: 'border-emerald-300/25 bg-emerald-400/15 text-emerald-100',
};

const CATEGORY_DOT: Record<CalendarFestivalCategory, string> = {
  chinese: 'bg-red-300',
  international: 'bg-sky-300',
  solarTerm: 'bg-emerald-300',
};

const CATEGORY_TEXT: Record<CalendarFestivalCategory, string> = {
  chinese: 'text-red-100',
  international: 'text-sky-100',
  solarTerm: 'text-emerald-100',
};

function ChevronLeftIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6"/></svg>;
}

function ChevronRightIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 18 6-6-6-6"/></svg>;
}

function CloseIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>;
}

function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9"/>
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
    </svg>
  );
}

function TodayIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <path d="M16 2v4M8 2v4M3 10h18"/>
      <path d="M12 14h.01M8 14h.01M16 14h.01M12 18h.01M8 18h.01M16 18h.01"/>
    </svg>
  );
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
      <path d="m6 9 6 6 6-6"/>
    </svg>
  );
}

function TimerIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="10" x2="14" y1="2" y2="2"/>
      <line x1="12" x2="15" y1="14" y2="11"/>
      <circle cx="12" cy="14" r="8"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5"/>
    </svg>
  );
}

function getFestivalName(item: CalendarFestival, isZh: boolean): string {
  return isZh ? item.nameZh : item.nameEn;
}

function formatMonthTitle(year: number, monthIndex: number, isZh: boolean): string {
  const date = new Date(year, monthIndex, 1);
  return isZh
    ? `${year}年${monthIndex + 1}月`
    : date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatFullDate(date: Date, isZh: boolean): string {
  return date.toLocaleDateString(isZh ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: isZh ? 'long' : 'long',
    day: 'numeric',
    weekday: 'long',
  });
}

function formatCompactDate(date: Date, isZh: boolean): string {
  return isZh
    ? `${date.getMonth() + 1}月${date.getDate()}日`
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDaysAway(daysAway: number, isZh: boolean): string {
  if (daysAway === 0) return isZh ? '今天' : 'Today';
  if (daysAway === 1) return isZh ? '明天' : 'Tomorrow';
  if (daysAway === -1) return isZh ? '昨天' : 'Yesterday';
  if (daysAway < 0) return isZh ? `${-daysAway}天前` : `${-daysAway} days ago`;
  return isZh ? `${daysAway}天后` : `In ${daysAway} days`;
}

function FestivalBadge({ item, isZh }: { item: CalendarFestival; isZh: boolean }) {
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${CATEGORY_TONE[item.category]}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${CATEGORY_DOT[item.category]}`} />
      <span className="truncate">{getFestivalName(item, isZh)}</span>
    </span>
  );
}

function EventList({
  emptyText,
  events,
  isZh,
  onSelectDate,
}: {
  emptyText: string;
  events: UpcomingCalendarEvent[];
  isZh: boolean;
  onSelectDate: (date: Date) => void;
}) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-4 text-center text-[12px] text-white/35">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((event) => (
        <button
          type="button"
          key={event.key}
          onClick={() => onSelectDate(event.date)}
          title={isZh ? '跳转到该日期' : 'Jump to this date'}
          className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.035] px-3 py-2.5 text-left transition-colors hover:border-white/15 hover:bg-white/[0.07]"
        >
          <div className="flex h-10 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-black/25 text-white/80">
            <span className="text-[14px] font-bold leading-none">{event.date.getDate()}</span>
            <span className="mt-0.5 text-[9px] text-white/35">{event.date.getMonth() + 1}月</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${CATEGORY_DOT[event.festival.category]}`} />
              <span className="truncate text-[13px] font-semibold text-white/85">
                {getFestivalName(event.festival, isZh)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-white/38">
              <span>{formatCompactDate(event.date, isZh)}</span>
              <span>{formatDaysAway(event.daysAway, isZh)}</span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

export const CalendarDetailModal: React.FC<CalendarDetailModalProps> = ({ onClose, onEdit }) => {
  const { language } = useTranslation();
  const isZh = language === 'zh';
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(today);

  const floatingWindow = useFloatingWindow({
    defaultSize: () => {
      if (typeof window === 'undefined') return { width: 900, height: 600 };
      return {
        width: Math.min(900, Math.max(680, window.innerWidth - 180)),
        height: Math.min(600, Math.max(560, window.innerHeight - 120)),
      };
    },
    minHeight: 540,
    minWidth: 640,
    resizeHandleAriaLabel: isZh ? '调整日历窗口大小' : 'Resize calendar window',
    resizeHandleTitle: isZh ? '拖拽调整窗口大小' : 'Drag to resize',
  });

  const weekDays = isZh ? WEEK_DAYS_ZH : WEEK_DAYS_EN;
  const calendarDays = useMemo(() => (
    buildCalendarMonth(viewYear, viewMonth, today)
  ), [viewYear, viewMonth, today]);

  const selectedLunar = useMemo(() => (
    solarToLunar(selectedDate.getFullYear(), selectedDate.getMonth() + 1, selectedDate.getDate())
  ), [selectedDate]);

  const selectedFestivals = useMemo(() => (
    getFestivalsForDate(selectedDate, selectedLunar)
  ), [selectedDate, selectedLunar]);

  // Days-away labels are always relative to the real today, not the selected
  // date — a festival should only ever read "今天" when it actually is today.
  const todayStart = useMemo(() => (
    new Date(today.getFullYear(), today.getMonth(), today.getDate())
  ), [today]);

  const daysFromToday = useCallback((date: Date) => (
    Math.round((date.getTime() - todayStart.getTime()) / 86400000)
  ), [todayStart]);

  const upcomingEvents = useMemo(() => (
    getUpcomingCalendarEvents(selectedDate, 12, 140)
      .map((event) => ({ ...event, daysAway: daysFromToday(event.date) }))
  ), [selectedDate, daysFromToday]);

  const upcomingInternationalEvents = useMemo(() => (
    getUpcomingCalendarEvents(selectedDate, 30, 220)
      .filter((event) => event.festival.category === 'international')
      .slice(0, 5)
      .map((event) => ({ ...event, daysAway: daysFromToday(event.date) }))
  ), [selectedDate, daysFromToday]);

  const monthEvents = useMemo(() => (
    calendarDays
      .filter((day) => day.isCurrentMonth && day.festivals.length > 0)
      .flatMap((day) => day.festivals.map((item) => ({
        date: day.date,
        key: `${day.key}-${item.id}`,
        festival: item,
        daysAway: daysFromToday(day.date),
      })))
      .slice(0, 10)
  ), [calendarDays, daysFromToday]);

  // Year/month quick picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<'month' | 'year'>('month');
  const [pickerYear, setPickerYear] = useState(viewYear);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (pickerOpen) {
        setPickerOpen(false);
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, pickerOpen]);

  // Close picker on outside click. Capture phase, because the modal shell
  // stops mousedown propagation so a bubble-phase document listener never fires.
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [pickerOpen]);

  const togglePicker = useCallback(() => {
    setPickerOpen((open) => {
      if (!open) {
        setPickerYear(viewYear);
        setPickerMode('month');
      }
      return !open;
    });
  }, [viewYear]);

  const selectDate = useCallback((date: Date) => {
    setSelectedDate(date);
    setViewYear(date.getFullYear());
    setViewMonth(date.getMonth());
  }, []);

  const shiftMonth = useCallback((amount: number) => {
    const nextMonthDate = new Date(viewYear, viewMonth + amount, 1);
    const nextYear = nextMonthDate.getFullYear();
    const nextMonth = nextMonthDate.getMonth();
    const maxDay = new Date(nextYear, nextMonth + 1, 0).getDate();
    const nextSelected = new Date(nextYear, nextMonth, Math.min(selectedDate.getDate(), maxDay));
    setViewYear(nextYear);
    setViewMonth(nextMonth);
    setSelectedDate(nextSelected);
  }, [selectedDate, viewMonth, viewYear]);

  const goToToday = useCallback(() => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDate(today);
  }, [today]);

  // Jump straight to a year+month from the quick picker, keeping the
  // selected day-of-month clamped like shiftMonth does.
  const selectYearMonth = useCallback((year: number, monthIndex: number) => {
    const maxDay = new Date(year, monthIndex + 1, 0).getDate();
    setViewYear(year);
    setViewMonth(monthIndex);
    setSelectedDate(new Date(year, monthIndex, Math.min(selectedDate.getDate(), maxDay)));
    setPickerOpen(false);
  }, [selectedDate]);

  const addWidget = useLayoutStore((state) => state.addWidget);
  const [countdownAdded, setCountdownAdded] = useState(false);

  const addCountdownWidget = useCallback(() => {
    const eventName = selectedFestivals.length > 0
      ? getFestivalName(selectedFestivals[0], isZh)
      : formatCompactDate(selectedDate, isZh);
    addWidget('countdown', 'medium', {
      widgetType: 'countdown',
      targetDate: getDateKey(selectedDate),
      eventName,
    });
    setCountdownAdded(true);
  }, [addWidget, isZh, selectedDate, selectedFestivals]);

  useEffect(() => {
    setCountdownAdded(false);
  }, [selectedDate]);

  useEffect(() => {
    if (!countdownAdded) return;
    const timer = setTimeout(() => setCountdownAdded(false), 2000);
    return () => clearTimeout(timer);
  }, [countdownAdded]);

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-6 md:p-12"
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <div
        className="absolute inset-0 bg-black/25 backdrop-blur-[2px] animate-fadeIn"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      />

      <div
        ref={floatingWindow.shellRef}
        className={`relative bg-black/35 backdrop-blur-xl border-0 sm:border border-white/10 rounded-none sm:rounded-[1.5rem] md:rounded-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.55)] flex flex-col pointer-events-auto animate-scaleIn overflow-hidden select-none transition-all ${floatingWindow.isInteracting ? 'duration-0' : 'duration-300'} ${floatingWindow.windowClassName}`}
        style={floatingWindow.style}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          onPointerDown={floatingWindow.handleDragPointerDown}
          className="h-12 md:h-14 border-b border-white/10 flex items-center px-3 md:px-5 shrink-0 bg-white/[0.02] select-none sm:cursor-default"
        >
          <div className="flex items-center gap-2 w-auto md:w-24">
            <div className="hidden md:flex gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default"
                title={isZh ? '关闭' : 'Close'}
              >
                <svg className="w-2 h-2 text-red-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
              <div className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e]/80 border border-black/20" />
              <div className="w-3.5 h-3.5 rounded-full bg-[#27c93f]/50 border border-black/20" />
            </div>
          </div>

          <div className="flex-1 flex justify-center">
            <span className="text-[13px] font-semibold text-white/70">
              {isZh ? '日历' : 'Calendar'}
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 w-auto md:w-24">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/8 px-2.5 text-[12px] font-semibold text-white/55 transition-colors hover:bg-white/15 hover:text-white/85"
                title={isZh ? '编辑小组件' : 'Edit widget'}
              >
                <EditIcon />
                <span className="hidden sm:inline">{isZh ? '编辑' : 'Edit'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="md:hidden w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors"
              title={isZh ? '关闭' : 'Close'}
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto xl:overflow-hidden desktop-scrollbar">
          <div className="grid min-h-full grid-cols-1 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(0,1fr)_340px]">
            <main className="min-w-0 p-3 sm:p-4 md:p-5 xl:min-h-0 xl:overflow-y-auto no-scrollbar">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-white/45">{formatFullDate(selectedDate, isZh)}</div>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="text-3xl font-bold tracking-normal text-white sm:text-4xl">
                      {selectedDate.getDate()}
                    </h2>
                    <div ref={pickerRef} className="relative">
                      <button
                        type="button"
                        onClick={togglePicker}
                        title={isZh ? '快速选择年份和月份' : 'Quick-select year and month'}
                        className="inline-flex items-center gap-1 rounded-lg text-[18px] font-semibold text-white/80 transition-colors hover:text-white"
                      >
                        {formatMonthTitle(viewYear, viewMonth, isZh)}
                        <ChevronDownIcon open={pickerOpen} />
                      </button>
                      {pickerOpen && (
                        <div
                          className="absolute left-0 top-full z-30 mt-2 w-[268px] rounded-2xl border border-white/[0.15] p-3 shadow-[0_8px_40px_rgba(0,0,0,0.5)]"
                          style={{
                            background: 'rgba(30, 32, 36, 0.95)',
                            backdropFilter: 'saturate(180%) blur(40px)',
                            WebkitBackdropFilter: 'saturate(180%) blur(40px)',
                          }}
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => setPickerYear((y) => Math.max(MIN_CALENDAR_YEAR, y - (pickerMode === 'year' ? 12 : 1)))}
                              disabled={pickerYear <= MIN_CALENDAR_YEAR}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                              title={pickerMode === 'year' ? (isZh ? '前 12 年' : 'Previous 12 years') : (isZh ? '上一年' : 'Previous year')}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => setPickerMode((m) => (m === 'month' ? 'year' : 'month'))}
                              className="rounded-lg px-3 py-1 text-[13px] font-semibold text-white/90 transition-colors hover:bg-white/10"
                              title={pickerMode === 'month' ? (isZh ? '选择年份' : 'Pick a year') : (isZh ? '返回月份选择' : 'Back to months')}
                            >
                              {pickerMode === 'month'
                                ? (isZh ? `${pickerYear}年` : `${pickerYear}`)
                                : `${Math.floor(pickerYear / 12) * 12} – ${Math.floor(pickerYear / 12) * 12 + 11}`}
                            </button>
                            <button
                              type="button"
                              onClick={() => setPickerYear((y) => Math.min(MAX_CALENDAR_YEAR, y + (pickerMode === 'year' ? 12 : 1)))}
                              disabled={pickerYear >= MAX_CALENDAR_YEAR}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                              title={pickerMode === 'year' ? (isZh ? '后 12 年' : 'Next 12 years') : (isZh ? '下一年' : 'Next year')}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
                            </button>
                          </div>
                          {pickerMode === 'month' ? (
                            <div className="grid grid-cols-3 gap-1.5">
                              {(isZh ? MONTHS_ZH : MONTHS_EN).map((label, idx) => {
                                const isCurrent = pickerYear === viewYear && idx === viewMonth;
                                const isThisMonth = pickerYear === today.getFullYear() && idx === today.getMonth();
                                return (
                                  <button
                                    type="button"
                                    key={label}
                                    onClick={() => selectYearMonth(pickerYear, idx)}
                                    className={`h-9 rounded-lg text-[12px] font-semibold transition-colors ${
                                      isCurrent
                                        ? 'border border-red-300/55 bg-red-500/22 text-white'
                                        : isThisMonth
                                          ? 'bg-white/[0.08] text-white/85 ring-1 ring-white/20 hover:bg-white/15'
                                          : 'text-white/65 hover:bg-white/10 hover:text-white'
                                    }`}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="grid grid-cols-3 gap-1.5">
                              {Array.from({ length: 12 }, (_, i) => Math.floor(pickerYear / 12) * 12 + i).map((year) => {
                                const outOfRange = year < MIN_CALENDAR_YEAR || year > MAX_CALENDAR_YEAR;
                                const isCurrent = year === viewYear;
                                const isThisYear = year === today.getFullYear();
                                return (
                                  <button
                                    type="button"
                                    key={year}
                                    disabled={outOfRange}
                                    onClick={() => {
                                      setPickerYear(year);
                                      setPickerMode('month');
                                    }}
                                    className={`h-9 rounded-lg text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-25 ${
                                      isCurrent
                                        ? 'border border-red-300/55 bg-red-500/22 text-white'
                                        : isThisYear
                                          ? 'bg-white/[0.08] text-white/85 ring-1 ring-white/20 hover:bg-white/15'
                                          : 'text-white/65 hover:bg-white/10 hover:text-white'
                                    }`}
                                  >
                                    {year}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="text-[13px] text-white/42">{formatLunarDate(selectedLunar, isZh)}</span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => shiftMonth(-1)}
                    className="h-9 w-9 rounded-xl bg-white/[0.07] text-white/65 transition-colors hover:bg-white/15 hover:text-white"
                    title={isZh ? '上个月' : 'Previous month'}
                  >
                    <span className="flex h-full items-center justify-center"><ChevronLeftIcon /></span>
                  </button>
                  <button
                    type="button"
                    onClick={goToToday}
                    className="inline-flex h-9 items-center gap-2 rounded-xl bg-white/[0.07] px-3 text-[12px] font-semibold text-white/70 transition-colors hover:bg-white/15 hover:text-white"
                  >
                    <TodayIcon />
                    {isZh ? '今天' : 'Today'}
                  </button>
                  <button
                    type="button"
                    onClick={() => shiftMonth(1)}
                    className="h-9 w-9 rounded-xl bg-white/[0.07] text-white/65 transition-colors hover:bg-white/15 hover:text-white"
                    title={isZh ? '下个月' : 'Next month'}
                  >
                    <span className="flex h-full items-center justify-center"><ChevronRightIcon /></span>
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-black/18 p-2.5 sm:p-3">
                <div className="mb-2 grid grid-cols-7 gap-1 sm:gap-2">
                  {weekDays.map((day) => (
                    <div key={day} className="h-7 text-center text-[11px] font-semibold text-white/38 sm:text-[12px]">
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1 sm:gap-2">
                  {calendarDays.map((day) => {
                    const selected = isSameDate(day.date, selectedDate);
                    const label = getCalendarCellLabel(day, isZh);
                    const mainFestival = day.festivals[0];
                    return (
                      <button
                        type="button"
                        key={day.key}
                        onClick={() => selectDate(day.date)}
                        className={`group relative min-h-[46px] min-w-0 rounded-xl border p-1.5 text-left transition-all sm:min-h-[52px] sm:p-2 ${
                          selected
                            ? 'border-red-300/55 bg-red-500/22 shadow-[0_0_0_1px_rgba(252,165,165,0.15),0_14px_40px_rgba(239,68,68,0.12)]'
                            : day.isToday
                              ? 'border-white/18 bg-white/[0.08]'
                              : day.isCurrentMonth
                                ? 'border-white/[0.06] bg-white/[0.035] hover:border-white/15 hover:bg-white/[0.07]'
                                : 'border-white/[0.035] bg-white/[0.018] text-white/25 hover:bg-white/[0.04]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className={`text-[14px] font-semibold leading-none sm:text-[16px] ${
                            day.isCurrentMonth ? 'text-white/90' : 'text-white/28'
                          }`}>
                            {day.day}
                          </span>
                          {mainFestival && (
                            <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${CATEGORY_DOT[mainFestival.category]}`} />
                          )}
                        </div>
                        <div className={`mt-1.5 truncate text-[10px] font-medium sm:text-[11px] ${
                          selected
                            ? 'text-white/95'
                            : mainFestival
                              ? CATEGORY_TEXT[mainFestival.category]
                              : day.isCurrentMonth
                                ? 'text-white/38'
                                : 'text-white/18'
                        }`}>
                          {label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </main>

            <aside className="min-w-0 border-t border-white/10 bg-black/18 p-3 sm:p-5 xl:h-full xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain desktop-scrollbar xl:border-l xl:border-t-0">
              <div className="space-y-5">
                <section>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="text-[13px] font-bold text-white/85">{isZh ? '当天详情' : 'Selected Day'}</h3>
                    <span className="text-[11px] text-white/35">{getDateKey(selectedDate)}</span>
                  </div>
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
                    <div className="text-[24px] font-bold leading-none text-white">{formatCompactDate(selectedDate, isZh)}</div>
                    <div className="mt-2 text-[12px] leading-relaxed text-white/48">{formatLunarDate(selectedLunar, isZh)}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedFestivals.length > 0 ? (
                        selectedFestivals.map((item) => <FestivalBadge key={item.id} item={item} isZh={isZh} />)
                      ) : (
                        <span className="text-[12px] text-white/35">{isZh ? '暂无节日或节气' : 'No festival or solar term'}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={addCountdownWidget}
                      title={isZh ? '在桌面添加该日期的倒计时小组件' : 'Add a countdown widget for this date to the desktop'}
                      className={`mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl text-[12px] font-semibold transition-colors ${
                        countdownAdded
                          ? 'bg-[#72d565]/20 text-[#9ae88f]'
                          : 'bg-white/[0.07] text-white/70 hover:bg-white/15 hover:text-white'
                      }`}
                    >
                      {countdownAdded ? <CheckIcon /> : <TimerIcon />}
                      {countdownAdded
                        ? (isZh ? '已添加到桌面' : 'Added to desktop')
                        : (isZh ? '添加倒计时' : 'Add countdown')}
                    </button>
                  </div>
                </section>

                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[13px] font-bold text-white/85">{isZh ? '本月节日' : 'This Month'}</h3>
                    <span className="text-[11px] text-white/35">{formatMonthTitle(viewYear, viewMonth, isZh)}</span>
                  </div>
                  <EventList
                    emptyText={isZh ? '本月暂无已标记节日' : 'No marked events this month'}
                    events={monthEvents}
                    isZh={isZh}
                    onSelectDate={selectDate}
                  />
                </section>

                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[13px] font-bold text-white/85">{isZh ? '近期节日与节气' : 'Upcoming'}</h3>
                    <span className="text-[11px] text-white/35">{isZh ? '含中国农历' : 'Lunar included'}</span>
                  </div>
                  <EventList
                    emptyText={isZh ? '近期暂无节日' : 'No upcoming events'}
                    events={upcomingEvents}
                    isZh={isZh}
                    onSelectDate={selectDate}
                  />
                </section>

                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[13px] font-bold text-white/85">{isZh ? '国外节日' : 'International Holidays'}</h3>
                    <span className="text-[11px] text-white/35">{isZh ? '常见节日' : 'Popular'}</span>
                  </div>
                  <EventList
                    emptyText={isZh ? '近期暂无国外节日' : 'No international holidays soon'}
                    events={upcomingInternationalEvents}
                    isZh={isZh}
                    onSelectDate={selectDate}
                  />
                </section>
              </div>
            </aside>
          </div>
        </div>

        {floatingWindow.resizeHandle}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .animate-fadeIn { animation: fadeIn 0.25s ease-out forwards; }
        .animate-scaleIn { animation: scaleIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}} />
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
};

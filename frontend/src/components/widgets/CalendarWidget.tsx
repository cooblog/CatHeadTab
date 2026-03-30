import React, { useState, useMemo } from 'react';
import type { WidgetSize } from '../../store/layoutStore';
import { useTranslation } from '../../i18n/useTranslation';

interface CalendarWidgetProps {
  size: WidgetSize;
}

const WEEK_DAYS_EN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const WEEK_DAYS_ZH = ['日', '一', '二', '三', '四', '五', '六'];

export const CalendarWidget: React.FC<CalendarWidgetProps> = ({ size }) => {
  const { language } = useTranslation();
  const isZh = language === 'zh';
  const weekDays = isZh ? WEEK_DAYS_ZH : WEEK_DAYS_EN;

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const today = now.getDate();
  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();

  const monthLabel = useMemo(() => {
    const d = new Date(viewYear, viewMonth);
    if (isZh) {
      return `${viewYear}年${viewMonth + 1}月`;
    }
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [viewYear, viewMonth, isZh]);

  const days = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
    const cells: { day: number; type: 'prev' | 'current' | 'next' }[] = [];
    // Fill leading days from previous month
    for (let i = firstDay - 1; i >= 0; i--) {
      cells.push({ day: prevMonthDays - i, type: 'prev' });
    }
    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, type: 'current' });
    }
    // Fill trailing days from next month to complete 6 rows (42 cells)
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      cells.push({ day: d, type: 'next' });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const goToToday = () => {
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
  };

  // Small (1×2): horizontal bar — icon + date + day of week
  if (size === 'small') {
    const dayOfWeek = isZh
      ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()]
      : ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][now.getDay()];
    const monthShort = isZh
      ? `${now.getMonth() + 1}月${today}日`
      : now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
    return (
      <div className="w-full h-full flex items-center justify-center gap-2 select-none px-3">
        <span className="text-2xl font-extralight text-white leading-none">{today}</span>
        <div className="flex flex-col gap-0">
          <span className="text-[10px] font-semibold text-red-400 uppercase leading-tight">{dayOfWeek}</span>
          <span className="text-[9px] font-medium text-white/60 leading-tight">{monthShort}</span>
        </div>
      </div>
    );
  }

  // Medium (2×2): full calendar grid
  return (
    <div className="w-full h-full flex flex-col select-none px-2 py-1.5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-1 shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); prevMonth(); }}
          className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-white/15 transition-colors text-white/50 hover:text-white"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); goToToday(); }}
          className="text-[10px] font-semibold text-white/90 hover:text-white transition-colors"
        >
          {monthLabel}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); nextMonth(); }}
          className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-white/15 transition-colors text-white/50 hover:text-white"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>

      {/* Week headers */}
      <div className="grid grid-cols-7 gap-0 mb-0.5 shrink-0">
        {weekDays.map((d) => (
          <div key={d} className="text-center text-[8px] font-medium text-white/40">{d}</div>
        ))}
      </div>

      {/* Days grid — fixed 6 rows */}
      <div className="grid grid-cols-7 grid-rows-6 gap-0 flex-1 min-h-0">
        {days.map((cell, i) => (
          <div
            key={i}
            className={`text-[9px] flex items-center justify-center mx-auto rounded-full transition-colors aspect-square w-full max-w-[22px] ${
              cell.type === 'current' && cell.day === today && isCurrentMonth
                ? 'bg-red-500 text-white font-bold'
                : cell.type === 'current'
                  ? 'text-white/80 hover:bg-white/10'
                  : 'text-white/20'
            }`}
          >
            {cell.day}
          </div>
        ))}
      </div>
    </div>
  );
};

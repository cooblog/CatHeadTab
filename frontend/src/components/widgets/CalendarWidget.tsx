import React, { useMemo, useState } from 'react';
import type { WidgetSize } from '../../store/layoutStore';
import { useTranslation } from '../../i18n/useTranslation';
import {
  buildCalendarMonth,
  WEEK_DAYS_EN,
  WEEK_DAYS_ZH,
} from '../../utils/calendar';

interface CalendarWidgetProps {
  size: WidgetSize;
}

export const CalendarWidget: React.FC<CalendarWidgetProps> = ({ size }) => {
  const { language } = useTranslation();
  const isZh = language === 'zh';
  const weekDays = isZh ? WEEK_DAYS_ZH : WEEK_DAYS_EN;

  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();
  const nowDate = now.getDate();
  const [viewYear, setViewYear] = useState(nowYear);
  const [viewMonth, setViewMonth] = useState(nowMonth);

  const today = nowDate;

  const monthLabel = useMemo(() => {
    const d = new Date(viewYear, viewMonth);
    if (isZh) {
      return `${viewYear}年${viewMonth + 1}月`;
    }
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [viewYear, viewMonth, isZh]);

  const days = useMemo(() => (
    buildCalendarMonth(viewYear, viewMonth, new Date(nowYear, nowMonth, nowDate))
  ), [viewYear, viewMonth, nowYear, nowMonth, nowDate]);

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const goToToday = () => {
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
  };

  if (size === 'small') {
    const dayOfWeek = isZh
      ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()]
      : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];

    const monthText = isZh
      ? `${now.getFullYear()}年${now.getMonth() + 1}月`
      : now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const detailText = now.toLocaleDateString(isZh ? 'zh-CN' : 'en-US', {
      month: isZh ? 'numeric' : 'short',
      day: 'numeric',
    });

    return (
      <div className="w-full h-full flex items-center justify-center select-none overflow-hidden">
        <div className="flex flex-col items-center shrink-0" style={{ marginRight: '10px' }}>
          <span className="text-[38px] font-[200] text-white leading-none">{today}</span>
          <span className="text-[11px] font-semibold text-red-400 leading-none" style={{ marginTop: '4px' }}>{dayOfWeek}</span>
        </div>
        <div className="flex flex-col justify-between min-w-0" style={{ height: '42px' }}>
          <span className="text-[18px] font-semibold text-white/90 leading-none truncate">{monthText}</span>
          <span className="text-[13px] text-white/40 leading-none truncate">{detailText}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col select-none px-3 py-2 overflow-hidden">
      <div className="flex items-center justify-between mb-1.5 shrink-0">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); prevMonth(); }}
          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/15 transition-colors text-white/50 hover:text-white"
          title={isZh ? '上个月' : 'Previous month'}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goToToday(); }}
          className="text-[13px] font-semibold text-white/90 hover:text-white transition-colors truncate px-1"
          title={isZh ? '回到今天' : 'Back to today'}
        >
          {monthLabel}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); nextMonth(); }}
          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/15 transition-colors text-white/50 hover:text-white"
          title={isZh ? '下个月' : 'Next month'}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0 mb-0.5 shrink-0">
        {weekDays.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-white/40">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 grid-rows-6 gap-[1px] flex-1 min-h-0">
        {days.map((cell) => {
          return (
            <div
              key={cell.key}
              className={`min-w-0 h-full flex flex-col items-center justify-center mx-auto rounded-lg transition-colors w-full max-w-[30px] ${
                cell.isToday
                  ? 'bg-red-500 text-white font-bold'
                  : cell.isCurrentMonth
                    ? 'text-white/80 hover:bg-white/10'
                    : 'text-white/20'
              }`}
            >
              <span className="text-[13px] leading-none">{cell.day}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

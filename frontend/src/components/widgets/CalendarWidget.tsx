import React, { useState, useMemo } from 'react';
import type { WidgetSize } from '../../store/layoutStore';
import { useTranslation } from '../../i18n/useTranslation';

interface CalendarWidgetProps {
  size: WidgetSize;
}

const WEEK_DAYS_EN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const WEEK_DAYS_ZH = ['日', '一', '二', '三', '四', '五', '六'];

// ── Lunar calendar helpers ──────────────────────────────────────────

const LUNAR_INFO = [
  0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,
  0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,
  0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,
  0x06566,0x0d4a0,0x0ea50,0x16a95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,
  0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,
  0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,
  0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,
  0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,
  0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,
  0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0,
  0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,
  0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
  0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,
  0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
  0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,
  0x14b63,
];

const LUNAR_MONTHS = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const LUNAR_DAYS = [
  '初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
  '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
  '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十',
];

const HEAVENLY_STEMS = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const EARTHLY_BRANCHES = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const ZODIAC_ANIMALS = ['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪'];

function lunarYearDays(y: number): number {
  let sum = 348;
  for (let i = 0x8000; i > 0x8; i >>= 1) {
    sum += (LUNAR_INFO[y - 1900] & i) ? 1 : 0;
  }
  return sum + leapDays(y);
}

function leapMonth(y: number): number {
  return LUNAR_INFO[y - 1900] & 0xf;
}

function leapDays(y: number): number {
  if (leapMonth(y)) {
    return (LUNAR_INFO[y - 1900] & 0x10000) ? 30 : 29;
  }
  return 0;
}

function monthDays(y: number, m: number): number {
  return (LUNAR_INFO[y - 1900] & (0x10000 >> m)) ? 30 : 29;
}

interface LunarDate {
  year: number;
  month: number;
  day: number;
  isLeap: boolean;
  monthStr: string;
  dayStr: string;
  ganzhi: string;
  zodiac: string;
}

function solarToLunar(solarYear: number, solarMonth: number, solarDay: number): LunarDate {
  const baseDate = new Date(1900, 0, 31);
  const objDate = new Date(solarYear, solarMonth - 1, solarDay);
  let offset = Math.floor((objDate.getTime() - baseDate.getTime()) / 86400000);

  let lunarYear = 1900;
  let temp = 0;
  for (lunarYear = 1900; lunarYear < 2101 && offset > 0; lunarYear++) {
    temp = lunarYearDays(lunarYear);
    offset -= temp;
  }
  if (offset < 0) {
    offset += temp;
    lunarYear--;
  }

  const leap = leapMonth(lunarYear);
  let isLeap = false;
  let lunarMonth = 1;

  for (lunarMonth = 1; lunarMonth < 13 && offset > 0; lunarMonth++) {
    if (leap > 0 && lunarMonth === (leap + 1) && !isLeap) {
      --lunarMonth;
      isLeap = true;
      temp = leapDays(lunarYear);
    } else {
      temp = monthDays(lunarYear, lunarMonth);
    }
    if (isLeap && lunarMonth === (leap + 1)) {
      isLeap = false;
    }
    offset -= temp;
  }

  if (offset === 0 && leap > 0 && lunarMonth === leap + 1) {
    if (isLeap) {
      isLeap = false;
    } else {
      isLeap = true;
      --lunarMonth;
    }
  }
  if (offset < 0) {
    offset += temp;
    --lunarMonth;
  }

  const lunarDay = offset + 1;
  const ganzhiIdx = (lunarYear - 4) % 60;
  const ganzhi = HEAVENLY_STEMS[ganzhiIdx % 10] + EARTHLY_BRANCHES[ganzhiIdx % 12];
  const zodiac = ZODIAC_ANIMALS[(lunarYear - 4) % 12];

  return {
    year: lunarYear,
    month: lunarMonth,
    day: lunarDay,
    isLeap,
    monthStr: (isLeap ? '闰' : '') + LUNAR_MONTHS[lunarMonth - 1] + '月',
    dayStr: LUNAR_DAYS[lunarDay - 1],
    ganzhi,
    zodiac,
  };
}

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

  // Small (1×2): horizontal bar — large date + details
  if (size === 'small') {
    const dayOfWeek = isZh
      ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()]
      : ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][now.getDay()];

    const lunar = solarToLunar(now.getFullYear(), now.getMonth() + 1, today);
    const monthText = isZh
      ? `${now.getMonth() + 1}月`
      : now.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const lunarText = isZh
      ? `${lunar.monthStr}${lunar.dayStr}`
      : now.toLocaleDateString('en-US', { weekday: 'long' });

    return (
      <div className="w-full h-full flex items-center justify-center select-none px-5 gap-3">
        {/* Left: large date number */}
        <span className="text-[48px] font-[200] text-white leading-none tracking-tight shrink-0">{today}</span>
        {/* Right: month + weekday + lunar stacked */}
        <div className="flex flex-col justify-center gap-[1px] min-w-0">
          <span className="text-[15px] font-bold text-red-400 uppercase leading-snug tracking-wide">{monthText}</span>
          <span className="text-[15px] font-semibold text-white/85 leading-snug">{dayOfWeek}</span>
          <span className="text-[12px] text-white/40 leading-snug truncate">{lunarText}</span>
        </div>
      </div>
    );
  }

  // Medium (2×2): full calendar grid
  return (
    <div className="w-full h-full flex flex-col select-none px-3 py-2 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5 shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); prevMonth(); }}
          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/15 transition-colors text-white/50 hover:text-white"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); goToToday(); }}
          className="text-[13px] font-semibold text-white/90 hover:text-white transition-colors"
        >
          {monthLabel}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); nextMonth(); }}
          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/15 transition-colors text-white/50 hover:text-white"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>

      {/* Week headers */}
      <div className="grid grid-cols-7 gap-0 mb-0.5 shrink-0">
        {weekDays.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-white/40">{d}</div>
        ))}
      </div>

      {/* Days grid — fixed 6 rows */}
      <div className="grid grid-cols-7 grid-rows-6 gap-0 flex-1 min-h-0">
        {days.map((cell, i) => (
          <div
            key={i}
            className={`text-[12px] flex items-center justify-center mx-auto rounded-full transition-colors aspect-square w-full max-w-[26px] ${
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

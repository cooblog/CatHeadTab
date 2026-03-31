import React, { useEffect, useState } from 'react';
import type { WidgetSize, CountdownWidgetConfig } from '../../store/layoutStore';
import { useTranslation } from '../../i18n/useTranslation';

interface CountdownWidgetProps {
  size: WidgetSize;
  config?: CountdownWidgetConfig;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isPast: boolean;
  totalDays: number;
}

function calcTimeLeft(targetDate: string): TimeLeft {
  const target = new Date(targetDate);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  const isPast = diff < 0;
  const absDiff = Math.abs(diff);

  const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((absDiff % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds, isPast, totalDays: days };
}

export const CountdownWidget: React.FC<CountdownWidgetProps> = ({ size, config }) => {
  const { language } = useTranslation();
  const isZh = language === 'zh';
  const targetDate = config?.targetDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const eventName = config?.eventName || (isZh ? '未命名事件' : 'Unnamed Event');

  const [timeLeft, setTimeLeft] = useState<TimeLeft>(calcTimeLeft(targetDate));

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calcTimeLeft(targetDate));
    }, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  // Small (1×2): horizontal bar — days + event name
  if (size === 'small') {
    return (
      <div className="w-full h-full flex items-center justify-center gap-2 select-none px-3">
        <div className="flex items-baseline gap-0.5 shrink-0">
          <span className="text-xl font-light text-white leading-none">{timeLeft.days}</span>
          <span className="text-[9px] text-white/50">{isZh ? '天' : 'd'}</span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[9px] font-semibold text-orange-400 uppercase leading-tight truncate">
            {timeLeft.isPast ? (isZh ? '已过' : 'PAST') : (isZh ? '还有' : 'IN')}
          </span>
          <span className="text-[9px] text-white/50 truncate">{eventName}</span>
        </div>
      </div>
    );
  }

  // Medium (2×2): days + hours/mins/secs + event name
  return (
    <div className="w-full h-full flex flex-col items-center justify-center select-none px-3 py-3 gap-1.5">
      <span className="text-sm font-semibold text-white/90 truncate max-w-full">{eventName}</span>

      <div className="flex items-baseline gap-1">
        <span className="text-[52px] font-[200] text-white leading-none tracking-tight">{timeLeft.days}</span>
        <span className="text-base text-white/50">{isZh ? '天' : 'days'}</span>
      </div>

      <div className="flex gap-4 mt-1">
        {[
          { value: timeLeft.hours, label: isZh ? '时' : 'hrs' },
          { value: timeLeft.minutes, label: isZh ? '分' : 'min' },
          { value: timeLeft.seconds, label: isZh ? '秒' : 'sec' },
        ].map(({ value, label }) => (
          <div key={label} className="flex flex-col items-center">
            <span className="text-xl font-light text-white/80">{String(value).padStart(2, '0')}</span>
            <span className="text-[10px] text-white/40">{label}</span>
          </div>
        ))}
      </div>

      <div className="mt-1 px-3 py-1 rounded-full bg-white/[0.08] text-xs text-white/50">
        {timeLeft.isPast ? (isZh ? '🏁 已过去' : '🏁 Passed') : (isZh ? '⏳ 倒计时' : '⏳ Counting')}
      </div>
    </div>
  );
};

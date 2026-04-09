import React, { useEffect, useState, useMemo } from 'react';
import type { WidgetSize, ClockWidgetConfig } from '../../store/layoutStore';
import { useTranslation } from '../../i18n/useTranslation';

interface ClockWidgetProps {
  size: WidgetSize;
  config?: ClockWidgetConfig;
}

/** Resolve time parts in a given IANA timezone (or local if empty). */
function getTimeParts(date: Date, timezone?: string) {
  const opts: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    weekday: 'short',
    day: 'numeric',
    hour12: false,
    ...(timezone ? { timeZone: timezone } : {}),
  };
  const parts = new Intl.DateTimeFormat('en-US', opts).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(p => p.type === type)?.value ?? '';

  const hours = Number(get('hour'));
  const minutes = Number(get('minute'));
  const seconds = Number(get('second'));
  const dayNum = Number(get('day'));
  const weekday = get('weekday'); // e.g. "Mon"

  return { hours, minutes, seconds, dayNum, weekday };
}

/** Map English short weekday to Chinese. */
const weekdayZhMap: Record<string, string> = {
  Sun: '周日', Mon: '周一', Tue: '周二', Wed: '周三',
  Thu: '周四', Fri: '周五', Sat: '周六',
};

/** Get a short display label for a timezone, e.g. "Asia/Shanghai" → "Shanghai", "UTC" → "UTC". */
function getTimezoneLabel(tz?: string): string {
  if (!tz) return '';
  if (tz === 'UTC') return 'UTC';
  // Take the city part after the last "/"
  const city = tz.includes('/') ? tz.split('/').pop()! : tz;
  return city.replace(/_/g, ' ');
}

/** iOS/macOS-style clock widget with analog clock face. */
export const ClockWidget: React.FC<ClockWidgetProps> = ({ size, config }) => {
  const { language } = useTranslation();
  const isZh = language === 'zh';
  const [now, setNow] = useState(new Date());

  const timezone = config?.timezone || undefined;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { hours, minutes, seconds, dayNum, weekday } = useMemo(
    () => getTimeParts(now, timezone),
    [now, timezone],
  );

  // Angles for clock hands
  const secondDeg = seconds * 6;
  const minuteDeg = minutes * 6 + seconds * 0.1;
  const hourDeg = (hours % 12) * 30 + minutes * 0.5;

  const dayOfWeekShort = isZh ? (weekdayZhMap[weekday] ?? weekday) : weekday;
  const timezoneLabel = getTimezoneLabel(timezone);

  // Small analog clock (for 1×2 bar layout) — dark/transparent style
  const SmallAnalogClock = ({ diameter }: { diameter: number }) => {
    const r = diameter / 2;
    const hourTickLen = diameter < 60 ? 4 : 6;

    return (
      <div
        className="relative shrink-0 rounded-full"
        style={{
          width: diameter,
          height: diameter,
          background: 'radial-gradient(circle, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)',
          border: '1.5px solid rgba(255,255,255,0.2)',
        }}
      >
        {/* Tick marks */}
        {Array.from({ length: 12 }, (_, i) => {
          const angle = i * 30;
          return (
            <div
              key={i}
              className="absolute"
              style={{
                width: i % 3 === 0 ? 1.5 : 1,
                height: hourTickLen,
                background: i % 3 === 0 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)',
                top: 3,
                left: r - 0.5,
                transformOrigin: `50% ${r - 3}px`,
                transform: `rotate(${angle}deg)`,
              }}
            />
          );
        })}
        {/* Hour hand */}
        <div className="absolute rounded-full" style={{ width: 2, height: r * 0.5, background: 'rgba(255,255,255,0.9)', top: r - r * 0.5, left: r - 1, transformOrigin: '50% 100%', transform: `rotate(${hourDeg}deg)` }} />
        {/* Minute hand */}
        <div className="absolute rounded-full" style={{ width: 1.5, height: r * 0.7, background: 'rgba(255,255,255,0.8)', top: r - r * 0.7, left: r - 0.75, transformOrigin: '50% 100%', transform: `rotate(${minuteDeg}deg)` }} />
        {/* Second hand */}
        <div className="absolute" style={{ width: 0.8, height: r * 0.75, background: '#ef4444', top: r - r * 0.75, left: r - 0.4, transformOrigin: '50% 100%', transform: `rotate(${secondDeg}deg)`, borderRadius: 0.5 }} />
        {/* Center dot */}
        <div className="absolute rounded-full" style={{ width: 4, height: 4, background: '#ef4444', top: r - 2, left: r - 2 }} />
      </div>
    );
  };

  // macOS-style large analog clock (for 2×2 layout) — white dial with numbers
  const MacOSAnalogClock = ({ diameter }: { diameter: number }) => {
    const r = diameter / 2;
    // Number positions (1-12) placed inside the dial
    const numberRadius = r - 18;
    const numberItems = Array.from({ length: 12 }, (_, i) => {
      const num = i === 0 ? 12 : i;
      const angle = (i * 30 - 90) * (Math.PI / 180);
      const x = r + numberRadius * Math.cos(angle);
      const y = r + numberRadius * Math.sin(angle);
      return { num, x, y };
    });

    // Minute tick marks (60 total)
    const ticks = Array.from({ length: 60 }, (_, i) => {
      const isHourMark = i % 5 === 0;
      return { angle: i * 6, isHourMark };
    });

    // Digital time string (HH:MM)
    const digitalTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

    return (
      <div
        className="relative shrink-0 rounded-full"
        style={{
          width: diameter,
          height: diameter,
          background: 'radial-gradient(circle at 40% 35%, #f8f8f8 0%, #e8e8e8 100%)',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        {/* Minute & hour tick marks */}
        {ticks.map((tick, i) => (
          <div
            key={i}
            className="absolute"
            style={{
              width: tick.isHourMark ? 2 : 1,
              height: tick.isHourMark ? 8 : 4,
              background: tick.isHourMark ? 'rgba(60,60,60,0.8)' : 'rgba(60,60,60,0.3)',
              top: 4,
              left: r - (tick.isHourMark ? 1 : 0.5),
              transformOrigin: `50% ${r - 4}px`,
              transform: `rotate(${tick.angle}deg)`,
            }}
          />
        ))}

        {/* Hour numbers (1-12) */}
        {numberItems.map(({ num, x, y }) => (
          <span
            key={num}
            className="absolute"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#3a3a3a',
              transform: 'translate(-50%, -50%)',
              left: x,
              top: y,
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
            }}
          >
            {num}
          </span>
        ))}

        {/* Digital time inside dial (centered, upper area) */}
        <div
          className="absolute"
          style={{
            top: r * 0.62,
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: '#555',
              letterSpacing: 0.5,
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", monospace',
              background: 'rgba(255,255,255,0.6)',
              padding: '1px 4px',
              borderRadius: 3,
              border: '0.5px solid rgba(0,0,0,0.08)',
            }}
          >
            {digitalTime}
          </span>
        </div>

        {/* Date + weekday + timezone inside dial (lower center) */}
        <div
          className="absolute flex flex-col items-center"
          style={{
            bottom: timezoneLabel ? r - 32 : r - 24,
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        >
          <div className="flex items-center gap-1">
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 600,
                color: '#2563eb',
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
              }}
            >
              {dayNum}
            </span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 500,
                color: '#777',
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
              }}
            >
              {dayOfWeekShort}
            </span>
          </div>
          {timezoneLabel && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 500,
                color: '#999',
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
                marginTop: 1,
                whiteSpace: 'nowrap',
              }}
            >
              {timezoneLabel}
            </span>
          )}
        </div>

        {/* Hour hand — thick, black, tapered */}
        <div
          className="absolute"
          style={{
            width: 3.5,
            height: r * 0.48,
            background: '#1a1a1a',
            top: r - r * 0.48,
            left: r - 1.75,
            transformOrigin: '50% 100%',
            transform: `rotate(${hourDeg}deg)`,
            borderRadius: 2,
          }}
        />

        {/* Minute hand — thinner, black */}
        <div
          className="absolute"
          style={{
            width: 2.5,
            height: r * 0.68,
            background: '#1a1a1a',
            top: r - r * 0.68,
            left: r - 1.25,
            transformOrigin: '50% 100%',
            transform: `rotate(${minuteDeg}deg)`,
            borderRadius: 2,
          }}
        />

        {/* Second hand — blue, thin, with counterweight */}
        <div
          className="absolute"
          style={{
            width: 1,
            height: r * 0.82,
            background: '#2563eb',
            top: r - r * 0.82 + r * 0.15,
            left: r - 0.5,
            transformOrigin: `50% ${r * 0.82 - r * 0.15}px`,
            transform: `rotate(${secondDeg}deg)`,
            borderRadius: 0.5,
          }}
        />
        {/* Second hand counterweight (small circle at bottom) */}
        <div
          className="absolute rounded-full"
          style={{
            width: 4,
            height: 4,
            background: '#2563eb',
            top: r + (r * 0.15) - 2,
            left: r - 2,
            transformOrigin: `2px ${-(r * 0.15) + 2}px`,
            transform: `rotate(${secondDeg}deg)`,
          }}
        />

        {/* Center dot — white with blue ring */}
        <div
          className="absolute rounded-full"
          style={{
            width: 8,
            height: 8,
            background: '#fff',
            border: '2px solid #2563eb',
            top: r - 4,
            left: r - 4,
            zIndex: 10,
          }}
        />
      </div>
    );
  };

  // Small (1×2): horizontal bar — analog clock + digital time
  if (size === 'small') {
    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    const period = hours < 12 ? (isZh ? '上午' : 'AM') : (isZh ? '下午' : 'PM');

    return (
      <div className="w-full h-full flex items-center justify-center select-none overflow-hidden gap-3">
        {/* Left: analog clock */}
        <SmallAnalogClock diameter={56} />
        {/* Right: digital time + info */}
        <div className="flex flex-col justify-center min-w-0" style={{ gap: '3px' }}>
          <span className="text-[22px] font-light text-white leading-none tracking-tight tabular-nums">
            {timeStr}
          </span>
          <span className="text-[11px] text-white/50 leading-none">
            {period} · {dayOfWeekShort}{timezoneLabel ? ` · ${timezoneLabel}` : ''}
          </span>
        </div>
      </div>
    );
  }

  // Medium (2×2): macOS-style white dial clock filling the widget
  return (
    <div className="w-full h-full flex items-center justify-center select-none overflow-hidden p-2">
      <MacOSAnalogClock diameter={155} />
    </div>
  );
};

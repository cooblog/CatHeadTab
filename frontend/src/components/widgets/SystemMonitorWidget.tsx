import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { WidgetSize } from '../../store/layoutStore';
import { useTranslation } from '../../i18n/useTranslation';

interface SystemMonitorWidgetProps {
  size: WidgetSize;
}

interface CpuInfo {
  modelName: string;
  numOfProcessors: number;
  usage: number; // 0–100
}

interface MemoryInfo {
  capacity: number; // bytes
  availableCapacity: number; // bytes
  usagePercent: number; // 0–100
}

interface BatteryInfo {
  level: number; // 0–100
  charging: boolean;
  chargingTime: number; // seconds, Infinity if not charging
  dischargingTime: number; // seconds, Infinity if plugged in
}

interface SystemInfo {
  cpu: CpuInfo | null;
  memory: MemoryInfo | null;
  cpuTemp: number | null; // °C — null if unavailable
  battery: BatteryInfo | null; // null if no battery (desktop)
}

/** Format bytes to human-readable string. */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

/** Calculate CPU usage from chrome.system.cpu processor times. */
function calcCpuUsage(
  prev: chrome.system.cpu.ProcessorUsage[],
  curr: chrome.system.cpu.ProcessorUsage[],
): number {
  let totalIdle = 0;
  let totalTotal = 0;

  for (let i = 0; i < curr.length; i++) {
    const p = prev[i];
    const c = curr[i];
    if (!p || !c) continue;

    const idleDelta = c.idle - p.idle;
    const totalDelta = c.total - p.total;
    totalIdle += idleDelta;
    totalTotal += totalDelta;
  }

  if (totalTotal === 0) return 0;
  return Math.round(((totalTotal - totalIdle) / totalTotal) * 100);
}

/** Circular progress ring SVG component. */
const Ring: React.FC<{
  percent: number;
  size: number;
  strokeWidth: number;
  color: string;
  trackColor?: string;
  children?: React.ReactNode;
}> = ({ percent, size, strokeWidth, color, trackColor = 'rgba(255,255,255,0.08)', children }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(percent, 100) / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
};

/** Get color based on usage percentage. */
function getUsageColor(percent: number): string {
  if (percent < 50) return '#72d565'; // green
  if (percent < 80) return '#f5a623'; // orange/amber
  return '#ff5f56'; // red
}

/** Get color for battery level. */
function getBatteryColor(level: number, charging: boolean): string {
  if (charging) return '#5ac8fa'; // blue when charging
  if (level > 50) return '#72d565'; // green
  if (level > 20) return '#f5a623'; // orange
  return '#ff5f56'; // red
}

/** Get battery emoji. */
function getBatteryIcon(level: number, charging: boolean): string {
  if (charging) return '⚡';
  if (level > 75) return '🔋';
  if (level > 20) return '🔋';
  return '🪫';
}

/** Format remaining time from seconds. */
function formatTime(seconds: number, isZh: boolean): string {
  if (!isFinite(seconds) || seconds <= 0) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return isZh ? `${h}时${m}分` : `${h}h ${m}m`;
  return isZh ? `${m}分钟` : `${m}m`;
}

// Extend Navigator for Battery API
interface BatteryManager extends EventTarget {
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
  level: number;
  onchargingchange: ((this: BatteryManager, ev: Event) => void) | null;
  onchargingtimechange: ((this: BatteryManager, ev: Event) => void) | null;
  ondischargingtimechange: ((this: BatteryManager, ev: Event) => void) | null;
  onlevelchange: ((this: BatteryManager, ev: Event) => void) | null;
}

declare global {
  interface Navigator {
    getBattery?: () => Promise<BatteryManager>;
  }
}

export const SystemMonitorWidget: React.FC<SystemMonitorWidgetProps> = ({ size }) => {
  const { language } = useTranslation();
  const isZh = language === 'zh';

  const [info, setInfo] = useState<SystemInfo>({ cpu: null, memory: null, cpuTemp: null, battery: null });
  const [error, setError] = useState<string | null>(null);
  const [hasBattery, setHasBattery] = useState(false);
  const prevProcessorsRef = useRef<chrome.system.cpu.ProcessorUsage[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const batteryRef = useRef<BatteryManager | null>(null);

  const fetchInfo = useCallback(() => {
    const hasChromeSystemCpu = typeof chrome !== 'undefined' && chrome.system?.cpu;
    const hasChromeSystemMemory = typeof chrome !== 'undefined' && chrome.system?.memory;

    if (!hasChromeSystemCpu && !hasChromeSystemMemory) {
      setError(isZh ? '需要 Chrome 扩展环境' : 'Chrome extension required');
      return;
    }

    // Fetch CPU info
    if (hasChromeSystemCpu) {
      chrome.system.cpu.getInfo((cpuInfo) => {
        if (chrome.runtime.lastError) {
          console.warn('system.cpu.getInfo error:', chrome.runtime.lastError);
          return;
        }
        const currentProcessors = cpuInfo.processors.map(p => p.usage);
        let usage = 0;

        if (prevProcessorsRef.current && prevProcessorsRef.current.length === currentProcessors.length) {
          usage = calcCpuUsage(prevProcessorsRef.current, currentProcessors);
        }

        prevProcessorsRef.current = currentProcessors;

        setInfo(prev => ({
          ...prev,
          cpu: {
            modelName: cpuInfo.modelName,
            numOfProcessors: cpuInfo.numOfProcessors,
            usage,
          },
        }));
      });
    }

    // Fetch Memory info
    if (hasChromeSystemMemory) {
      chrome.system.memory.getInfo((memInfo) => {
        if (chrome.runtime.lastError) {
          console.warn('system.memory.getInfo error:', chrome.runtime.lastError);
          return;
        }
        const used = memInfo.capacity - memInfo.availableCapacity;
        const usagePercent = Math.round((used / memInfo.capacity) * 100);

        setInfo(prev => ({
          ...prev,
          memory: {
            capacity: memInfo.capacity,
            availableCapacity: memInfo.availableCapacity,
            usagePercent,
          },
        }));
      });
    }
  }, [isZh]);

  useEffect(() => {
    // Initial fetch (twice for CPU to get a delta)
    fetchInfo();
    const initTimer = setTimeout(fetchInfo, 1000);

    // Update every 2 seconds
    timerRef.current = setInterval(fetchInfo, 2000);

    return () => {
      clearTimeout(initTimer);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchInfo]);

  // Battery detection & monitoring
  useEffect(() => {
    if (!navigator.getBattery) return;

    let bm: BatteryManager | null = null;
    let handler: (() => void) | null = null;

    const updateBattery = (battery: BatteryManager) => {
      const level = Math.round(battery.level * 100);
      setInfo(prev => ({
        ...prev,
        battery: {
          level,
          charging: battery.charging,
          chargingTime: battery.chargingTime,
          dischargingTime: battery.dischargingTime,
        },
      }));
    };

    navigator.getBattery().then((battery) => {
      bm = battery;
      batteryRef.current = battery;

      // Detect if device actually has a battery:
      // Desktops typically report level=1.0, charging=true, chargingTime=0, dischargingTime=Infinity
      const isLikelyDesktop = battery.level === 1 && battery.charging && battery.chargingTime === 0;
      setHasBattery(!isLikelyDesktop);

      if (!isLikelyDesktop) {
        updateBattery(battery);

        handler = () => updateBattery(battery);
        battery.addEventListener('levelchange', handler);
        battery.addEventListener('chargingchange', handler);
        battery.addEventListener('chargingtimechange', handler);
        battery.addEventListener('dischargingtimechange', handler);
      }
    }).catch(() => {
      setHasBattery(false);
    });

    return () => {
      if (bm && handler) {
        bm.removeEventListener('levelchange', handler);
        bm.removeEventListener('chargingchange', handler);
        bm.removeEventListener('chargingtimechange', handler);
        bm.removeEventListener('dischargingtimechange', handler);
      }
    };
  }, []);

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-white/50">
        <span className="text-2xl">🖥️</span>
        <span className="text-[10px]">{error}</span>
      </div>
    );
  }

  const cpuUsage = info.cpu?.usage ?? 0;
  const memUsage = info.memory?.usagePercent ?? 0;
  const cpuColor = getUsageColor(cpuUsage);
  const memColor = getUsageColor(memUsage);

  // Small (1×2): compact horizontal bar — rings with labels underneath
  if (size === 'small') {
    return (
      <div className="w-full h-full flex items-center justify-evenly select-none overflow-hidden">
        {/* CPU */}
        <div className="flex flex-col items-center gap-0.5">
          <Ring percent={cpuUsage} size={48} strokeWidth={4} color={cpuColor}>
            <span className="text-[11px] font-semibold text-white/90 tabular-nums">{cpuUsage}%</span>
          </Ring>
          <span className="text-[10px] font-semibold text-white/70 leading-tight">CPU</span>
        </div>

        {/* Divider */}
        <div className="w-px h-12 bg-white/[0.08] shrink-0" />

        {/* Memory */}
        <div className="flex flex-col items-center gap-0.5">
          <Ring percent={memUsage} size={48} strokeWidth={4} color={memColor}>
            <span className="text-[11px] font-semibold text-white/90 tabular-nums">{memUsage}%</span>
          </Ring>
          <span className="text-[10px] font-semibold text-white/70 leading-tight">{isZh ? '内存' : 'RAM'}</span>
        </div>
      </div>
    );
  }

  // Medium (2×2): detailed view with larger rings
  const memUsed = info.memory ? info.memory.capacity - info.memory.availableCapacity : 0;
  const memTotal = info.memory?.capacity ?? 0;

  // Shorten model name for display
  const shortModelName = (() => {
    if (!info.cpu?.modelName) return '-';
    const name = info.cpu.modelName;
    // Try to extract meaningful part (e.g., "i7-13700K" or "Ryzen 7 5800X")
    const intelMatch = name.match(/(i[3579]-\w+|Xeon \w+)/i);
    if (intelMatch) return intelMatch[1];
    const amdMatch = name.match(/(Ryzen \d+ \w+)/i);
    if (amdMatch) return amdMatch[1];
    const armMatch = name.match(/(Apple M\d+\w*)/i);
    if (armMatch) return armMatch[1];
    // Fallback: truncate
    return name.length > 20 ? `${name.slice(0, 18)}…` : name;
  })();

  return (
    <div className="w-full h-full flex flex-col justify-center select-none px-4 py-3 gap-3 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[14px]">🖥️</span>
        <span className="text-[13px] font-semibold text-white/80">{isZh ? '系统监控' : 'System Monitor'}</span>
      </div>

      {/* CPU + Memory rings side by side */}
      <div className="flex items-center justify-around flex-1 min-h-0">
        {/* CPU */}
        <div className="flex flex-col items-center gap-1.5">
          <Ring percent={cpuUsage} size={68} strokeWidth={5} color={cpuColor}>
            <div className="flex flex-col items-center">
              <span className="text-[16px] font-semibold text-white/90 tabular-nums leading-none">{cpuUsage}</span>
              <span className="text-[8px] text-white/40">%</span>
            </div>
          </Ring>
          <span className="text-[11px] font-medium text-white/70">CPU</span>
        </div>

        {/* Memory */}
        <div className="flex flex-col items-center gap-1.5">
          <Ring percent={memUsage} size={68} strokeWidth={5} color={memColor}>
            <div className="flex flex-col items-center">
              <span className="text-[16px] font-semibold text-white/90 tabular-nums leading-none">{memUsage}</span>
              <span className="text-[8px] text-white/40">%</span>
            </div>
          </Ring>
          <span className="text-[11px] font-medium text-white/70">{isZh ? '内存' : 'RAM'}</span>
        </div>
      </div>

      {/* Details row */}
      <div className="flex items-center justify-between gap-1 pt-2 border-t border-white/[0.06] shrink-0">
        {hasBattery && info.battery ? (
          <div className="flex flex-col items-center flex-1 min-w-0">
            <span className="text-[9px] text-white/30 uppercase tracking-wider">{isZh ? '电池' : 'Battery'}</span>
            <div className="flex items-center gap-1">
              <span className="text-[10px]">{getBatteryIcon(info.battery.level, info.battery.charging)}</span>
              <span className="text-[10px] font-light tabular-nums" style={{ color: getBatteryColor(info.battery.level, info.battery.charging) }}>
                {info.battery.level}%
              </span>
              {info.battery.charging && <span className="text-[8px] text-white/30">{isZh ? '充电中' : 'Charging'}</span>}
              {!info.battery.charging && info.battery.dischargingTime > 0 && isFinite(info.battery.dischargingTime) && (
                <span className="text-[8px] text-white/30">{formatTime(info.battery.dischargingTime, isZh)}</span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center flex-1 min-w-0">
            <span className="text-[9px] text-white/30 uppercase tracking-wider">{isZh ? '处理器' : 'CPU'}</span>
            <span className="text-[10px] text-white/60 font-light truncate max-w-full" title={info.cpu?.modelName}>{shortModelName}</span>
          </div>
        )}
        <div className="w-px h-5 bg-white/[0.08]" />
        <div className="flex flex-col items-center flex-1">
          <span className="text-[9px] text-white/30 uppercase tracking-wider">{isZh ? '核心' : 'Cores'}</span>
          <span className="text-[10px] text-white/60 font-light">{info.cpu?.numOfProcessors ?? '-'}</span>
        </div>
        <div className="w-px h-5 bg-white/[0.08]" />
        <div className="flex flex-col items-center flex-1">
          <span className="text-[9px] text-white/30 uppercase tracking-wider">{isZh ? '内存' : 'Used'}</span>
          <span className="text-[10px] text-white/60 font-light tabular-nums">{memTotal ? `${formatBytes(memUsed)}` : '-'}</span>
        </div>
      </div>
    </div>
  );
};

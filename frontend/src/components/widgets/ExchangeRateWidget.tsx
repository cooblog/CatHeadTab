import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { WidgetSize, ExchangeRateWidgetConfig, ExchangeRatePair } from '../../store/layoutStore';
import { useLayoutStore } from '../../store/layoutStore';
import { useConfigStore } from '../../store/configStore';
import { useTranslation } from '../../i18n/useTranslation';
import { getDefaultFloatingWindowSize, useFloatingWindow } from '../../hooks/useFloatingWindow';

interface ExchangeRateWidgetProps {
  size: WidgetSize;
  config?: ExchangeRateWidgetConfig;
  /** Widget item ID — needed to persist config changes. */
  itemId: string;
}

interface RateData {
  from: string;
  to: string;
  rate: number;
  change: number;
  error?: boolean;
}

/** Default currency pairs for first-time users. */
const DEFAULT_PAIRS: ExchangeRatePair[] = [
  { from: 'USD', to: 'CNY' },
  { from: 'EUR', to: 'CNY' },
  { from: 'USD', to: 'JPY' },
  { from: 'GBP', to: 'USD' },
  { from: 'USD', to: 'HKD' },
];

/** All supported currencies with labels. */
const CURRENCIES: Record<string, { zh: string; en: string; flag: string }> = {
  USD: { zh: '美元', en: 'US Dollar', flag: '🇺🇸' },
  EUR: { zh: '欧元', en: 'Euro', flag: '🇪🇺' },
  CNY: { zh: '人民币', en: 'Chinese Yuan', flag: '🇨🇳' },
  JPY: { zh: '日元', en: 'Japanese Yen', flag: '🇯🇵' },
  GBP: { zh: '英镑', en: 'British Pound', flag: '🇬🇧' },
  HKD: { zh: '港币', en: 'Hong Kong Dollar', flag: '🇭🇰' },
  KRW: { zh: '韩元', en: 'South Korean Won', flag: '🇰🇷' },
  CAD: { zh: '加元', en: 'Canadian Dollar', flag: '🇨🇦' },
  AUD: { zh: '澳元', en: 'Australian Dollar', flag: '🇦🇺' },
  SGD: { zh: '新加坡元', en: 'Singapore Dollar', flag: '🇸🇬' },
  CHF: { zh: '瑞郎', en: 'Swiss Franc', flag: '🇨🇭' },
  THB: { zh: '泰铢', en: 'Thai Baht', flag: '🇹🇭' },
  INR: { zh: '印度卢比', en: 'Indian Rupee', flag: '🇮🇳' },
  MXN: { zh: '墨西哥比索', en: 'Mexican Peso', flag: '🇲🇽' },
  NZD: { zh: '新西兰元', en: 'New Zealand Dollar', flag: '🇳🇿' },
  SEK: { zh: '瑞典克朗', en: 'Swedish Krona', flag: '🇸🇪' },
  NOK: { zh: '挪威克朗', en: 'Norwegian Krone', flag: '🇳🇴' },
  DKK: { zh: '丹麦克朗', en: 'Danish Krone', flag: '🇩🇰' },
  PLN: { zh: '波兰兹罗提', en: 'Polish Zloty', flag: '🇵🇱' },
  TRY: { zh: '土耳其里拉', en: 'Turkish Lira', flag: '🇹🇷' },
  BRL: { zh: '巴西雷亚尔', en: 'Brazilian Real', flag: '🇧🇷' },
  ZAR: { zh: '南非兰特', en: 'South African Rand', flag: '🇿🇦' },
  MYR: { zh: '马来西亚林吉特', en: 'Malaysian Ringgit', flag: '🇲🇾' },
  IDR: { zh: '印尼盾', en: 'Indonesian Rupiah', flag: '🇮🇩' },
  PHP: { zh: '菲律宾比索', en: 'Philippine Peso', flag: '🇵🇭' },
  CZK: { zh: '捷克克朗', en: 'Czech Koruna', flag: '🇨🇿' },
  HUF: { zh: '匈牙利福林', en: 'Hungarian Forint', flag: '🇭🇺' },
  ILS: { zh: '以色列新谢克尔', en: 'Israeli Shekel', flag: '🇮🇱' },
  RON: { zh: '罗马尼亚列伊', en: 'Romanian Leu', flag: '🇷🇴' },
  BGN: { zh: '保加利亚列弗', en: 'Bulgarian Lev', flag: '🇧🇬' },
  ISK: { zh: '冰岛克朗', en: 'Icelandic Krona', flag: '🇮🇸' },
};

/** Color classes for currency badges. */
function getCurrencyBadgeClass(code: string): string {
  const map: Record<string, string> = {
    USD: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
    EUR: 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20',
    CNY: 'bg-rose-500/15 text-rose-400 border border-rose-500/20',
    JPY: 'bg-pink-500/15 text-pink-400 border border-pink-500/20',
    GBP: 'bg-purple-500/15 text-purple-400 border border-purple-500/20',
    HKD: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
  };
  return map[code] || 'bg-white/[0.06] text-white/30 border border-white/10';
}

// --- Cache ---
const RATE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
interface RateCache { data: RateData[]; timestamp: number }

function rateCacheKey(pairs: ExchangeRatePair[]): string {
  return `exrate_cache_${pairs.map(p => `${p.from}_${p.to}`).sort().join(',')}`;
}

function readRateCache(key: string): RateCache | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const c: RateCache = JSON.parse(raw);
    if (Date.now() - c.timestamp < RATE_CACHE_TTL) return c;
  } catch { /* corrupted */ }
  return null;
}

function writeRateCache(key: string, data: RateData[]): void {
  try {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch { /* storage full */ }
}

// --- API fetch ---

async function fetchExchangeRates(pairs: ExchangeRatePair[]): Promise<RateData[]> {
  if (pairs.length === 0) return [];

  // 优先通过后端 API 获取（有缓存 + singleflight）
  const serverUrl = useConfigStore.getState().getEffectiveServerUrl();
  console.log('[ExchangeRateWidget] serverUrl:', serverUrl || '(empty)');
  if (serverUrl) {
    try {
      const result = await fetchExchangeRatesFromBackend(serverUrl, pairs);
      // 确保至少有一条有效数据
      if (result.some(r => !r.error && r.rate > 0)) {
        console.log('[ExchangeRateWidget] Backend API succeeded');
        return result;
      }
      return pairs.map(p => ({ from: p.from, to: p.to, rate: 0, change: 0, error: true }));
    } catch (err) {
      console.warn('[ExchangeRateWidget] Backend API failed:', err);
      return pairs.map(p => ({ from: p.from, to: p.to, rate: 0, change: 0, error: true }));
    }
  }

  return pairs.map(p => ({ from: p.from, to: p.to, rate: 0, change: 0, error: true }));
}

/**
 * Fetch exchange rates from our backend proxy.
 */
async function fetchExchangeRatesFromBackend(serverUrl: string, pairs: ExchangeRatePair[]): Promise<RateData[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${serverUrl}/api/v1/finance/exchange-rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairs: pairs.map(p => ({ from: p.from, to: p.to })) }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const items: Array<{ from: string; to: string; rate: number; change: number }> = json.data || [];
    return items.map(item => ({
      from: item.from,
      to: item.to,
      rate: item.rate || 0,
      change: item.change || 0,
      error: item.rate === 0,
    }));
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}


// --- Helpers ---
function formatRate(rate: number): string {
  if (rate >= 1000) return rate.toFixed(1);
  if (rate >= 100) return rate.toFixed(2);
  if (rate >= 10) return rate.toFixed(3);
  return rate.toFixed(4);
}

function getCurrencyLabel(code: string, isZh: boolean): string {
  const c = CURRENCIES[code];
  if (!c) return code;
  return isZh ? c.zh : c.en;
}

function getCurrencyFlag(code: string): string {
  return CURRENCIES[code]?.flag || '🏳️';
}

function pairKey(p: ExchangeRatePair): string {
  return `${p.from}_${p.to}`;
}

/** ExchangeRateWidget — shows currency pairs on desktop, opens management modal on click. */
export const ExchangeRateWidget: React.FC<ExchangeRateWidgetProps> = ({ size, config, itemId }) => {
  const { language } = useTranslation();
  const isZh = language === 'zh';

  const pairs = config?.pairs ?? DEFAULT_PAIRS;
  const [rates, setRates] = useState<RateData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cacheKey = rateCacheKey(pairs);

  const fetchData = useCallback(async (showSpinner = false) => {
    if (pairs.length === 0) { setRates([]); setLoading(false); return; }
    const cached = readRateCache(cacheKey);
    if (cached) { setRates(cached.data); setLoading(false); return; }
    if (showSpinner) setLoading(true);
    try {
      const data = await fetchExchangeRates(pairs);
      setRates(data);
      // 只缓存至少有一条有效数据的结果，避免缓存全部失败数据
      const hasValid = data.some(d => !d.error && d.rate > 0);
      if (hasValid) {
        writeRateCache(cacheKey, data);
      }
      setError(null);
    } catch (err) {
      console.error('[ExchangeRateWidget] fetchData error:', err);
      if (rates.length === 0) setError(isZh ? '无法获取汇率数据' : 'Unable to fetch exchange rates');
    } finally {
      setLoading(false);
    }
  }, [pairs, cacheKey, isZh]);

  useEffect(() => {
    fetchData(true);
    timerRef.current = setInterval(() => fetchData(false), RATE_CACHE_TTL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchData]);

  // --- Loading ---
  if (loading && rates.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <div className="w-6 h-6 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
      </div>
    );
  }

  // --- Error ---
  if (error && rates.length === 0) {
    return (
      <>
        <div
          className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/50 cursor-pointer"
          onClick={(e) => { e.stopPropagation(); setShowDetail(true); }}
        >
          <span className="text-[20px]">💱</span>
          <span className="text-[11px] text-white/40">{error}</span>
          <span className="text-[10px] text-white/25">{isZh ? '点击管理汇率' : 'Click to manage rates'}</span>
        </div>

        {showDetail && (
          <ExchangeRateDetailModal
            rates={rates}
            pairs={pairs}
            itemId={itemId}
            isZh={isZh}
            onClose={() => setShowDetail(false)}
            onRefresh={() => { localStorage.removeItem(cacheKey); fetchData(true); }}
          />
        )}
      </>
    );
  }

  // --- Small (1×2): compact horizontal view ---
  if (size === 'small') {
    const displayRates = rates.slice(0, 3);
    return (
      <>
        <div
          className="w-full h-full flex items-center select-none overflow-hidden cursor-pointer px-3 gap-2"
          onClick={(e) => { e.stopPropagation(); setShowDetail(true); }}
        >
          {/* Icon */}
          <div
            className="shrink-0 flex items-center justify-center rounded-lg"
            style={{
              width: 36,
              height: 36,
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
              boxShadow: '0 2px 8px rgba(59,130,246,0.3)',
            }}
          >
            <span className="text-[16px]">💱</span>
          </div>
          {/* Rate list */}
          <div className="flex-1 flex flex-col justify-center min-w-0 gap-[1px]">
            {displayRates.map(r => (
              <div key={pairKey(r)} className="flex items-center justify-between gap-1">
                <span className="text-[11px] text-white/80 truncate font-medium" style={{ maxWidth: '50%' }}>
                  {r.from}/{r.to}
                </span>
                <span className="text-[11px] text-white/70 font-semibold tabular-nums">
                  {formatRate(r.rate)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {showDetail && (
          <ExchangeRateDetailModal
            rates={rates}
            pairs={pairs}
            itemId={itemId}
            isZh={isZh}
            onClose={() => setShowDetail(false)}
            onRefresh={() => { localStorage.removeItem(cacheKey); fetchData(false); }}
          />
        )}
      </>
    );
  }

  // --- Medium (2×2): card view ---
  return (
    <>
      <div
        className="w-full h-full flex flex-col select-none overflow-hidden cursor-pointer p-3 gap-2"
        onClick={(e) => { e.stopPropagation(); setShowDetail(true); }}
      >
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px]">💱</span>
            <span className="text-[13px] font-semibold text-white/80">
              {isZh ? '汇率助手' : 'Exchange Rate'}
            </span>
          </div>
          <span className="text-[10px] text-white/30">
            {pairs.length} {isZh ? '组' : 'pairs'}
          </span>
        </div>

        {/* Rate list — scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-[3px] no-scrollbar">
          {rates.map(r => (
            <div
              key={pairKey(r)}
              className="flex items-center justify-between rounded-lg px-2 py-1 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span className="text-[13px]">{getCurrencyFlag(r.from)}</span>
                <div className="flex flex-col min-w-0">
                  <span className="text-[12px] text-white/85 font-medium truncate">
                    {r.from} → {r.to}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end shrink-0 ml-2">
                <span className="text-[12px] text-white/90 font-medium tabular-nums">
                  {formatRate(r.rate)}
                </span>
                {r.change !== 0 && (
                  <span className={`text-[10px] font-semibold tabular-nums ${r.change >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
                    {r.change >= 0 ? '▲' : '▼'} {Math.abs(r.change).toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showDetail && (
        <ExchangeRateDetailModal
          rates={rates}
          pairs={pairs}
          itemId={itemId}
          isZh={isZh}
          onClose={() => setShowDetail(false)}
          onRefresh={() => { localStorage.removeItem(cacheKey); fetchData(false); }}
        />
      )}
    </>
  );
};

// =========================================================================
// Sortable rate pair row — used inside the pair list with dnd-kit
// =========================================================================
interface SortableRateRowProps {
  r: RateData;
  isZh: boolean;
  onRemove: () => void;
}

const SortableRateRow: React.FC<SortableRateRowProps> = ({ r, isZh, onRemove }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: pairKey(r) });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.8 : 1,
    position: 'relative' as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border transition-colors transition-opacity ${
        isDragging
          ? 'bg-white/[0.12] border-white/25 shadow-lg'
          : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]'
      }`}
    >
      <div className="flex items-center justify-between px-4 py-3">
        {/* Drag handle */}
        <div
          className="flex items-center justify-center w-6 h-6 mr-2 cursor-grab active:cursor-grabbing text-white/20 hover:text-white/40 shrink-0 touch-none"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="8" cy="4" r="2" /><circle cx="16" cy="4" r="2" />
            <circle cx="8" cy="12" r="2" /><circle cx="16" cy="12" r="2" />
            <circle cx="8" cy="20" r="2" /><circle cx="16" cy="20" r="2" />
          </svg>
        </div>

        {/* Pair info */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[18px]">{getCurrencyFlag(r.from)}</span>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[14px] text-white/90 font-semibold">
                {r.from} → {r.to}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${getCurrencyBadgeClass(r.from)}`}>
                {getCurrencyLabel(r.from, isZh)}
              </span>
            </div>
            <span className="text-[11px] text-white/40 mt-0.5">
              1 {r.from} = {formatRate(r.rate)} {r.to}
            </span>
          </div>
        </div>

        {/* Rate + change */}
        <div className="flex items-center gap-3 shrink-0">
          {r.error ? (
            <span className="text-[11px] text-white/30 italic">
              {isZh ? '加载中...' : 'Loading...'}
            </span>
          ) : (
            <div className="flex flex-col items-end">
              <span className="text-[16px] text-white font-semibold tabular-nums">
                {formatRate(r.rate)}
              </span>
              {r.change !== 0 && (
                <span className={`text-[11px] tabular-nums px-1.5 py-0.5 rounded ${
                  r.change >= 0 ? 'bg-[#4ade80]/15 text-[#4ade80]' : 'bg-[#f87171]/15 text-[#f87171]'
                }`}>
                  {r.change >= 0 ? '▲' : '▼'}{Math.abs(r.change).toFixed(2)}%
                </span>
              )}
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title={isZh ? '移除' : 'Remove'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// Exchange Rate Detail Modal — macOS-style, matches StockDetailModal
// =========================================================================
interface ExchangeRateDetailModalProps {
  rates: RateData[];
  pairs: ExchangeRatePair[];
  itemId: string;
  isZh: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

const ExchangeRateDetailModal: React.FC<ExchangeRateDetailModalProps> = ({
  rates, pairs, itemId, isZh, onClose, onRefresh,
}) => {
  const updateWidgetConfig = useLayoutStore(s => s.updateWidgetConfig);
  const [tab, setTab] = useState<'list' | 'add'>('list');
  const [search, setSearch] = useState('');
  const [addFrom, setAddFrom] = useState('USD');
  const [addTo, setAddTo] = useState('CNY');
  const floatingWindow = useFloatingWindow({
    defaultSize: () => getDefaultFloatingWindowSize(
      typeof window === 'undefined' ? 768 : Math.min(768, window.innerWidth * 0.9),
      0.68,
    ),
    minHeight: 500,
    minWidth: 640,
  });

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const savePairs = useCallback((newList: ExchangeRatePair[]) => {
    updateWidgetConfig(itemId, { widgetType: 'exchangeRate', pairs: newList });
  }, [itemId, updateWidgetConfig]);

  const removePair = useCallback((from: string, to: string) => {
    const newList = pairs.filter(p => !(p.from === from && p.to === to));
    savePairs(newList);
    onRefresh();
  }, [pairs, savePairs, onRefresh]);

  const addPair = useCallback((from: string, to: string) => {
    if (from === to) return;
    if (pairs.some(p => p.from === from && p.to === to)) return;
    const newList = [...pairs, { from, to }];
    savePairs(newList);
    onRefresh();
  }, [pairs, savePairs, onRefresh]);

  const isInList = (from: string, to: string) => pairs.some(p => p.from === from && p.to === to);

  // dnd-kit sensors
  const rateSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const displayRates: RateData[] = useMemo(() => {
    if (rates.length > 0) return rates;
    return pairs.map(p => ({
      from: p.from, to: p.to, rate: 0, change: 0, error: true,
    }));
  }, [rates, pairs]);

  const rateIds = useMemo(() => displayRates.map(r => pairKey(r)), [displayRates]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = pairs.findIndex(p => pairKey(p) === active.id);
    const newIndex = pairs.findIndex(p => pairKey(p) === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newList = arrayMove(pairs, oldIndex, newIndex);
    savePairs(newList);
    onRefresh();
  }, [pairs, savePairs, onRefresh]);

  // Currency list for the add panel
  const currencyCodes = Object.keys(CURRENCIES);
  const filteredCurrencies = currencyCodes.filter(code => {
    if (!search) return true;
    const q = search.toLowerCase();
    const c = CURRENCIES[code];
    return code.toLowerCase().includes(q) || c.zh.includes(q) || c.en.toLowerCase().includes(q);
  });

  /** Popular pre-built pairs for quick add. */
  const popularPairs: ExchangeRatePair[] = [
    { from: 'USD', to: 'CNY' },
    { from: 'EUR', to: 'CNY' },
    { from: 'USD', to: 'JPY' },
    { from: 'GBP', to: 'USD' },
    { from: 'USD', to: 'HKD' },
    { from: 'EUR', to: 'USD' },
    { from: 'USD', to: 'KRW' },
    { from: 'AUD', to: 'USD' },
    { from: 'USD', to: 'CAD' },
    { from: 'USD', to: 'CHF' },
    { from: 'EUR', to: 'GBP' },
    { from: 'USD', to: 'SGD' },
    { from: 'USD', to: 'THB' },
    { from: 'GBP', to: 'CNY' },
    { from: 'JPY', to: 'CNY' },
    { from: 'EUR', to: 'JPY' },
  ];

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-6 md:p-12"
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      {/* Dimmed Background Overlay */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px] animate-fadeIn"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      />

      {/* macOS-style App Window */}
      <div
        ref={floatingWindow.shellRef}
        className={`relative bg-black/30 backdrop-blur-xl border-0 sm:border border-white/10 rounded-none sm:rounded-[1.5rem] md:rounded-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.55)] flex flex-col pointer-events-auto animate-scaleIn overflow-hidden select-none transition-all ${floatingWindow.isInteracting ? 'duration-0' : 'duration-300'} ${floatingWindow.windowClassName}`}
        style={floatingWindow.style}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Window Header */}
        <div
          onPointerDown={floatingWindow.handleDragPointerDown}
          className="h-12 md:h-14 border-b border-white/10 flex items-center px-3 md:px-5 shrink-0 bg-white/[0.02] select-none sm:cursor-default"
        >
          <div className="flex items-center gap-2 w-auto md:w-20">
            <div className="hidden md:flex gap-2.5">
              <button
                onClick={onClose}
                className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default"
              >
                <svg className="w-2 h-2 text-red-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
              <button className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] hover:bg-[#ffbd2e]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
                <svg className="w-2 h-2 text-yellow-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14"/></svg>
              </button>
              <div className="w-3.5 h-3.5 rounded-full bg-[#27c93f]/50 border border-black/20" />
            </div>
          </div>

          <div className="flex-1 flex justify-center">
            <span className="text-[13px] font-semibold text-white/70">
              {isZh ? '💱 汇率助手' : '💱 Exchange Rate'}
            </span>
          </div>

          <div className="flex items-center w-auto md:w-20 justify-end">
            <button
              onClick={onClose}
              className="md:hidden w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
            <div className="hidden md:block w-20" />
          </div>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Sidebar */}
          <div className="w-full md:w-48 bg-black/20 border-b md:border-b-0 md:border-r border-white/10 px-3 py-2 md:p-5 flex flex-col gap-2 shrink-0">
            <div className="flex flex-row md:flex-col gap-2 overflow-x-auto no-scrollbar pb-1 md:pb-0">
              <button
                type="button"
                onClick={() => setTab('list')}
                className={`flex items-center gap-2 md:gap-3 px-4 py-2.5 md:py-3.5 rounded-xl md:rounded-2xl transition-all font-semibold text-[13px] tracking-wide text-left whitespace-nowrap ${
                  tab === 'list'
                    ? 'bg-white/20 text-white shadow-md'
                    : 'text-white/50 hover:bg-white/5 hover:text-white/80'
                }`}
              >
                📋 {isZh ? '汇率列表' : 'Rate List'}
              </button>
              <button
                type="button"
                onClick={() => setTab('add')}
                className={`flex items-center gap-2 md:gap-3 px-4 py-2.5 md:py-3.5 rounded-xl md:rounded-2xl transition-all font-semibold text-[13px] tracking-wide text-left whitespace-nowrap ${
                  tab === 'add'
                    ? 'bg-white/20 text-white shadow-md'
                    : 'text-white/50 hover:bg-white/5 hover:text-white/80'
                }`}
              >
                ➕ {isZh ? '添加货币对' : 'Add Pair'}
              </button>
            </div>

            <div className="hidden md:block mt-auto pt-4 border-t border-white/5">
              <div className="text-[11px] text-white/30 leading-relaxed">
                {isZh ? '已选' : 'Selected'}: {pairs.length} {isZh ? '组货币对' : 'pairs'}
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 flex flex-col p-3 sm:p-5 md:px-6 md:pt-6 md:pb-2 relative bg-gradient-to-br from-white/[0.02] to-transparent overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto desktop-scrollbar sm:pr-2 md:pr-3">
              {tab === 'list' ? (
                /* ===== Rate List Tab ===== */
                <div className="space-y-3 animate-fadeIn">
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">
                      {isZh ? '我的汇率列表' : 'My Exchange Rates'}
                    </h3>
                    <p className="text-[12px] text-white/50 mb-4">
                      {isZh ? '拖拽可排序，点击可查看详情' : 'Drag to reorder, click to view details'}
                    </p>
                  </div>

                  {pairs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <span className="text-[48px] mb-4 opacity-20">💱</span>
                      <p className="text-[13px] text-white/30 text-center mb-3">
                        {isZh ? '暂无汇率' : 'No currency pairs'}
                      </p>
                      <button
                        type="button"
                        onClick={() => setTab('add')}
                        className="px-4 py-2 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-[13px] font-medium transition-colors border border-blue-500/30"
                      >
                        {isZh ? '去添加 →' : 'Add pairs →'}
                      </button>
                    </div>
                  ) : (
                    <DndContext
                      sensors={rateSensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext items={rateIds} strategy={verticalListSortingStrategy}>
                        <div className="space-y-2">
                          {displayRates.map(r => (
                            <SortableRateRow
                              key={pairKey(r)}
                              r={r}
                              isZh={isZh}
                              onRemove={() => removePair(r.from, r.to)}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              ) : (
                /* ===== Add Pair Tab ===== */
                <div className="space-y-4 animate-fadeIn">
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">
                      {isZh ? '添加货币对' : 'Add Currency Pair'}
                    </h3>
                    <p className="text-[12px] text-white/50 mb-3">
                      {isZh ? '选择基准货币和目标货币，或从热门列表快速添加' : 'Pick base and target currencies, or quick-add from popular pairs'}
                    </p>
                  </div>

                  {/* Custom pair picker */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="block text-[10px] uppercase tracking-widest font-bold text-white/40 mb-1.5 ml-1">
                        {isZh ? '基准货币' : 'From'}
                      </label>
                      <select
                        value={addFrom}
                        onChange={(e) => setAddFrom(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-3 py-2.5 text-[13px] text-white focus:outline-none focus:border-blue-500/50 transition-all appearance-none cursor-pointer"
                      >
                        {currencyCodes.map(code => (
                          <option key={code} value={code}>
                            {CURRENCIES[code].flag} {code} - {getCurrencyLabel(code, isZh)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="pt-5 text-white/30 text-[16px]">→</div>
                    <div className="flex-1">
                      <label className="block text-[10px] uppercase tracking-widest font-bold text-white/40 mb-1.5 ml-1">
                        {isZh ? '目标货币' : 'To'}
                      </label>
                      <select
                        value={addTo}
                        onChange={(e) => setAddTo(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-3 py-2.5 text-[13px] text-white focus:outline-none focus:border-blue-500/50 transition-all appearance-none cursor-pointer"
                      >
                        {currencyCodes.map(code => (
                          <option key={code} value={code}>
                            {CURRENCIES[code].flag} {code} - {getCurrencyLabel(code, isZh)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={() => addPair(addFrom, addTo)}
                    disabled={addFrom === addTo || isInList(addFrom, addTo)}
                    className={`w-full py-2.5 rounded-xl text-[13px] font-semibold transition-colors ${
                      addFrom === addTo || isInList(addFrom, addTo)
                        ? 'bg-white/5 text-white/20 cursor-not-allowed'
                        : 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30'
                    }`}
                  >
                    {isInList(addFrom, addTo)
                      ? (isZh ? '已添加' : 'Already Added')
                      : addFrom === addTo
                        ? (isZh ? '不能相同' : 'Cannot be same')
                        : (isZh ? `添加 ${addFrom} → ${addTo}` : `Add ${addFrom} → ${addTo}`)}
                  </button>

                  {/* Search */}
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder={isZh ? '搜索货币...' : 'Search currencies...'}
                    className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3 text-[13px] text-white select-text focus:outline-none focus:border-blue-500/50 transition-all"
                  />

                  {/* Popular pairs */}
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest font-bold text-white/40 mb-2 ml-1">
                      {isZh ? '热门货币对' : 'Popular Pairs'}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {popularPairs
                        .filter(pp => {
                          if (!search) return true;
                          const q = search.toLowerCase();
                          return pp.from.toLowerCase().includes(q) || pp.to.toLowerCase().includes(q)
                            || getCurrencyLabel(pp.from, isZh).toLowerCase().includes(q)
                            || getCurrencyLabel(pp.to, isZh).toLowerCase().includes(q);
                        })
                        .map(pp => {
                          const added = isInList(pp.from, pp.to);
                          return (
                            <button
                              key={`${pp.from}_${pp.to}`}
                              onClick={() => !added && addPair(pp.from, pp.to)}
                              disabled={added}
                              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
                                added
                                  ? 'bg-white/[0.03] border-white/[0.06] opacity-50 cursor-not-allowed'
                                  : 'bg-white/[0.03] border-white/[0.06] hover:bg-blue-500/10 hover:border-blue-500/30 cursor-pointer'
                              }`}
                            >
                              <span className="text-[16px]">{getCurrencyFlag(pp.from)}</span>
                              <div className="flex-1 min-w-0">
                                <div className="text-[12px] text-white/85 font-medium">{pp.from} → {pp.to}</div>
                                <div className="text-[10px] text-white/35">{getCurrencyLabel(pp.from, isZh)} → {getCurrencyLabel(pp.to, isZh)}</div>
                              </div>
                              {added ? (
                                <span className="text-[10px] text-[#4ade80]">✓</span>
                              ) : (
                                <span className="text-[14px] text-white/20">+</span>
                              )}
                            </button>
                          );
                        })}
                    </div>
                  </div>

                  {/* All currencies list */}
                  {search.trim() && (
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest font-bold text-white/40 mb-2 ml-1">
                        {isZh ? '所有货币' : 'All Currencies'}
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {filteredCurrencies.map(code => (
                          <div
                            key={code}
                            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[11px]"
                          >
                            <span className="text-[14px]">{getCurrencyFlag(code)}</span>
                            <div className="min-w-0">
                              <div className="text-white/80 font-medium">{code}</div>
                              <div className="text-white/35 text-[9px] truncate">{getCurrencyLabel(code, isZh)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Hint */}
                  <div className="rounded-xl bg-black/20 border border-white/[0.06] p-3">
                    <p className="text-[11px] text-white/40 leading-relaxed">
                      {isZh
                        ? '💡 汇率数据来源于欧洲央行（ECB），每个工作日更新。支持 30+ 种主要货币。从上方下拉菜单选择任意货币对，或点击热门列表快速添加。'
                        : '💡 Exchange rates from the European Central Bank (ECB), updated every business day. Supports 30+ major currencies. Pick any pair from the dropdowns above, or quick-add from the popular list.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {floatingWindow.resizeHandle}
      </div>

      {/* Inline animations */}
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

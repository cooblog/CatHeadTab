import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { WidgetSize, StockWidgetConfig, StockItem, StockMarket } from '../../store/layoutStore';
import { useLayoutStore } from '../../store/layoutStore';
import { useConfigStore } from '../../store/configStore';
import { useTranslation } from '../../i18n/useTranslation';

/**
 * Detect whether we are running inside a Chrome extension context
 * (chrome-extension:// origin with `chrome.runtime.id` available).
 * In this context, `host_permissions` bypass CORS for cross-origin fetch.
 * In a plain web page context (dev / hosted web build), CORS applies
 * and we must proxy requests through our own backend.
 */
function isExtensionContext(): boolean {
  try {
    return typeof chrome !== 'undefined'
      && !!chrome.runtime
      && !!chrome.runtime.id;
  } catch {
    return false;
  }
}

interface StockWidgetProps {
  size: WidgetSize;
  config?: StockWidgetConfig;
  /** Widget item ID — needed to persist watchlist changes. */
  itemId: string;
}

interface StockQuote {
  symbol: string;
  name: string;
  market: StockMarket;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  marketCap: number;
  currency: string;
  error?: boolean;
}

/** Default watchlist for first-time users. */
const DEFAULT_WATCHLIST: StockItem[] = [
  { symbol: 'AAPL', name: 'Apple', market: 'US' },
  { symbol: '0700.HK', name: '腾讯控股', market: 'HK' },
  { symbol: '600519.SS', name: '贵州茅台', market: 'CN' },
];

/** Popular stocks & indices for the search/add panel. */
const POPULAR_STOCKS: Record<StockMarket, StockItem[]> = {
  US: [
    // --- Indices ---
    { symbol: '^GSPC', name: 'S&P 500', market: 'US' },
    { symbol: '^DJI', name: 'Dow Jones', market: 'US' },
    { symbol: '^IXIC', name: 'NASDAQ', market: 'US' },
    // --- Stocks ---
    { symbol: 'AAPL', name: 'Apple', market: 'US' },
    { symbol: 'MSFT', name: 'Microsoft', market: 'US' },
    { symbol: 'GOOGL', name: 'Google', market: 'US' },
    { symbol: 'AMZN', name: 'Amazon', market: 'US' },
    { symbol: 'NVDA', name: 'NVIDIA', market: 'US' },
    { symbol: 'TSLA', name: 'Tesla', market: 'US' },
    { symbol: 'META', name: 'Meta', market: 'US' },
    { symbol: 'TSM', name: 'TSMC', market: 'US' },
  ],
  HK: [
    // --- Indices ---
    { symbol: '^HSI', name: '恒生指数', market: 'HK' },
    { symbol: '^HSCE', name: '国企指数', market: 'HK' },
    { symbol: '^HSTECH', name: '恒生科技', market: 'HK' },
    // --- Stocks ---
    { symbol: '0700.HK', name: '腾讯控股', market: 'HK' },
    { symbol: '9988.HK', name: '阿里巴巴', market: 'HK' },
    { symbol: '3690.HK', name: '美团', market: 'HK' },
    { symbol: '9618.HK', name: '京东集团', market: 'HK' },
    { symbol: '1810.HK', name: '小米集团', market: 'HK' },
    { symbol: '9888.HK', name: '百度集团', market: 'HK' },
    { symbol: '0005.HK', name: '汇丰控股', market: 'HK' },
    { symbol: '2318.HK', name: '中国平安', market: 'HK' },
  ],
  CN: [
    // --- Indices ---
    { symbol: '000001.SS', name: '上证指数', market: 'CN' },
    { symbol: '399001.SZ', name: '深证成指', market: 'CN' },
    { symbol: '399006.SZ', name: '创业板指', market: 'CN' },
    { symbol: '000300.SS', name: '沪深300', market: 'CN' },
    // --- Stocks ---
    { symbol: '600519.SS', name: '贵州茅台', market: 'CN' },
    { symbol: '000001.SZ', name: '平安银行', market: 'CN' },
    { symbol: '600036.SS', name: '招商银行', market: 'CN' },
    { symbol: '000858.SZ', name: '五粮液', market: 'CN' },
    { symbol: '601318.SS', name: '中国平安', market: 'CN' },
    { symbol: '600900.SS', name: '长江电力', market: 'CN' },
    { symbol: '002594.SZ', name: '比亚迪', market: 'CN' },
    { symbol: '601899.SS', name: '紫金矿业', market: 'CN' },
  ],
};

// --- Cache ---
const STOCK_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
interface StockCache { data: StockQuote[]; timestamp: number }

function stockCacheKey(symbols: string[], language: string): string {
  return `stock_cache_${language}_${symbols.sort().join(',')}`;
}

function readStockCache(key: string): StockCache | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const c: StockCache = JSON.parse(raw);
    if (Date.now() - c.timestamp < STOCK_CACHE_TTL) return c;
  } catch { /* corrupted */ }
  return null;
}

function writeStockCache(key: string, data: StockQuote[]): void {
  try {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch { /* storage full */ }
}

/** Build a placeholder quote when data for an item cannot be obtained. */
function makeErrorQuote(item: StockItem): StockQuote {
  return {
    symbol: item.symbol,
    name: item.name,
    market: item.market,
    price: 0, change: 0, changePercent: 0,
    open: 0, high: 0, low: 0, prevClose: 0,
    volume: 0, marketCap: 0, currency: 'USD',
    error: true,
  };
}

/** Sina index symbol mapping for international indices. */
const SINA_INDEX_MAP: Record<string, string> = {
  '^GSPC': 'int_sp500',
  '^DJI': 'int_dji',
  '^IXIC': 'int_nasdaq',
  '^HSI': 'int_hangseng',
  '^HSCE': 'int_hscei',
  '^HSTECH': 'int_hstech',
};

/** Get default currency for a market. */
function defaultCurrencyForMarket(market: StockMarket): string {
  switch (market) {
    case 'US': return 'USD';
    case 'HK': return 'HKD';
    case 'CN': return 'CNY';
    default: return 'USD';
  }
}

/** Convert a standard symbol to Sina finance symbol format. */
function toSinaSymbol(symbol: string, market: StockMarket): string {
  if (SINA_INDEX_MAP[symbol]) return SINA_INDEX_MAP[symbol];
  switch (market) {
    case 'US':
      return `gb_${symbol.toLowerCase()}`;
    case 'HK': {
      let code = symbol.replace(/\.HK$/i, '');
      while (code.length < 5) code = `0${code}`;
      return `hk${code}`;
    }
    case 'CN':
      if (/\.SS$/i.test(symbol)) return `sh${symbol.replace(/\.SS$/i, '')}`;
      if (/\.SZ$/i.test(symbol)) return `sz${symbol.replace(/\.SZ$/i, '')}`;
      return symbol;
    default:
      return symbol;
  }
}

/** Safe float parsing. */
function safeParseFloat(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.trim());
  return Number.isFinite(n) ? n : 0;
}

/** Extract fields from a Sina API response line like: var hq_str_xxx="a,b,c,..."; */
function parseSinaFields(line: string): string[] {
  const idx = line.indexOf('="');
  if (idx === -1) return [];
  let data = line.slice(idx + 2);
  if (data.endsWith('";')) data = data.slice(0, -2);
  else if (data.endsWith('"')) data = data.slice(0, -1);
  if (!data) return [];
  return data.split(',');
}

/** Parse Sina international index line. */
function parseSinaIndex(line: string, item: StockItem): StockQuote | null {
  const parts = parseSinaFields(line);
  if (parts.length < 2) return null;
  const price = safeParseFloat(parts[1]);
  if (price === 0) return null;

  let change = 0, changePercent = 0, open = 0, high = 0, low = 0, prevClose = 0;
  if (parts.length >= 9) {
    change = safeParseFloat(parts[3]);
    changePercent = safeParseFloat(parts[4]);
    open = safeParseFloat(parts[5]);
    high = safeParseFloat(parts[6]);
    low = safeParseFloat(parts[7]);
    prevClose = safeParseFloat(parts[8]);
  } else if (parts.length >= 5) {
    change = safeParseFloat(parts[3]);
    changePercent = safeParseFloat(parts[4]);
    prevClose = price - change;
  }

  return {
    symbol: item.symbol, name: item.name, market: item.market,
    price, change, changePercent, open, high, low, prevClose,
    volume: 0, marketCap: 0,
    currency: defaultCurrencyForMarket(item.market),
  };
}

/** Parse Sina A-share (CN) line. */
function parseSinaCN(line: string, item: StockItem): StockQuote | null {
  const parts = parseSinaFields(line);
  if (parts.length < 32) return null;
  const name = parts[0] || item.name;
  const price = safeParseFloat(parts[3]);
  const prevClose = safeParseFloat(parts[2]);
  if (price === 0) return null;
  const change = price - prevClose;
  const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

  return {
    symbol: item.symbol, name, market: 'CN',
    price, change, changePercent,
    open: safeParseFloat(parts[1]),
    high: safeParseFloat(parts[4]),
    low: safeParseFloat(parts[5]),
    prevClose,
    volume: safeParseFloat(parts[8]),
    marketCap: 0,
    currency: 'CNY',
  };
}

/** Parse Sina HK stock line. */
function parseSinaHK(line: string, item: StockItem): StockQuote | null {
  const parts = parseSinaFields(line);
  if (parts.length < 13) return null;
  const name = parts[1] || item.name;
  const price = safeParseFloat(parts[6]);
  if (price === 0) return null;
  const prevClose = safeParseFloat(parts[3]);
  let change = safeParseFloat(parts[7]);
  if (change === 0) change = price - prevClose;
  let changePercent = safeParseFloat(parts[8]);
  if (changePercent === 0 && prevClose > 0) changePercent = (change / prevClose) * 100;

  return {
    symbol: item.symbol, name, market: 'HK',
    price, change, changePercent,
    open: safeParseFloat(parts[2]),
    high: safeParseFloat(parts[4]),
    low: safeParseFloat(parts[5]),
    prevClose,
    volume: safeParseFloat(parts[12]),
    marketCap: 0,
    currency: 'HKD',
  };
}

/** Parse Sina US stock line. */
function parseSinaUS(line: string, item: StockItem): StockQuote | null {
  const parts = parseSinaFields(line);
  if (parts.length < 18) return null;
  const name = parts[0] || item.name;
  const price = safeParseFloat(parts[1]);
  if (price === 0) return null;

  return {
    symbol: item.symbol, name, market: 'US',
    price,
    change: safeParseFloat(parts[2]),
    changePercent: safeParseFloat(parts[4]),
    open: safeParseFloat(parts[5]),
    high: safeParseFloat(parts[6]),
    low: safeParseFloat(parts[7]),
    prevClose: safeParseFloat(parts[17]),
    volume: safeParseFloat(parts[10]),
    marketCap: safeParseFloat(parts[12]),
    currency: 'USD',
  };
}

/**
 * Fetch all quotes via Sina Finance in one batch request.
 * Response is GBK-encoded, decoded via TextDecoder('gbk').
 */
async function fetchStockQuotesSina(items: StockItem[]): Promise<StockQuote[]> {
  if (items.length === 0) throw new Error('no items');

  const sinaSymbols = items.map(it => toSinaSymbol(it.symbol, it.market));
  const url = `https://hq.sinajs.cn/list=${sinaSymbols.join(',')}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    // NOTE: `Referer` is a forbidden request header for JS and cannot be set here.
    // It is injected by a declarativeNetRequest rule (see public/rules/sina_referer.json)
    // so that Sina does not reject the request with HTTP 403.
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`sina HTTP ${res.status}`);

    // Decode GBK → UTF-8 via TextDecoder (Chromium supports 'gbk').
    const buf = await res.arrayBuffer();
    const text = new TextDecoder('gbk').decode(buf);

    const validLines = text.split('\n').map(s => s.trim()).filter(Boolean);

    const quotes: StockQuote[] = items.map((it, i) => {
      const fallback = makeErrorQuote(it);
      if (i >= validLines.length) return fallback;
      const line = validLines[i];
      const sinaSym = toSinaSymbol(it.symbol, it.market);

      let parsed: StockQuote | null = null;
      if (sinaSym.startsWith('int_')) {
        parsed = parseSinaIndex(line, it);
      } else if (it.market === 'CN') {
        parsed = parseSinaCN(line, it);
      } else if (it.market === 'HK') {
        parsed = parseSinaHK(line, it);
      } else if (it.market === 'US') {
        parsed = parseSinaUS(line, it);
      }
      return parsed ?? fallback;
    });

    if (quotes.every(q => q.error)) throw new Error('all sina requests failed');
    return quotes;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/** Fetch a single symbol via Yahoo Finance v8 chart API. */
async function fetchSingleYahooChart(item: StockItem): Promise<StockQuote> {
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  for (const host of hosts) {
    const url = `https://${host}/v8/finance/chart/${encodeURIComponent(item.symbol)}?interval=1d&range=1d`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) continue;

      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;

      const meta = result.meta || {};
      const price = Number(meta.regularMarketPrice) || 0;
      const prevClose = Number(meta.chartPreviousClose) || Number(meta.previousClose) || 0;
      const change = price - prevClose;
      const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
      const currency = meta.currency || defaultCurrencyForMarket(item.market);

      let open = 0, high = 0, low = 0, volume = 0;
      const q = result?.indicators?.quote?.[0];
      if (q) {
        const toNum = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
        if (Array.isArray(q.open) && q.open.length > 0) {
          open = toNum(q.open[q.open.length - 1]);
        }
        if (Array.isArray(q.high)) {
          high = q.high.reduce((acc: number, v: unknown) => Math.max(acc, toNum(v)), 0);
        }
        if (Array.isArray(q.low)) {
          low = q.low.reduce((acc: number, v: unknown) => {
            const n = toNum(v);
            if (n <= 0) return acc;
            return acc === 0 ? n : Math.min(acc, n);
          }, 0);
        }
        if (Array.isArray(q.volume)) {
          volume = q.volume.reduce((acc: number, v: unknown) => acc + toNum(v), 0);
        }
      }

      return {
        symbol: item.symbol, name: item.name, market: item.market,
        price, change, changePercent,
        open, high, low, prevClose, volume, marketCap: 0, currency,
      };
    } catch {
      clearTimeout(timeoutId);
      // try next host
    }
  }
  return makeErrorQuote(item);
}

/** Fetch all quotes via Yahoo Finance (one request per symbol, in parallel). */
async function fetchStockQuotesYahoo(items: StockItem[]): Promise<StockQuote[]> {
  if (items.length === 0) throw new Error('no items');
  const results = await Promise.all(items.map(fetchSingleYahooChart));
  if (results.every(q => q.error)) throw new Error('all yahoo requests failed');
  return results;
}

/**
 * Fetch quotes via our own backend proxy.
 * Used when running as a plain web page (dev / hosted build) where direct
 * requests to Sina / Yahoo would be blocked by CORS.
 */
async function fetchStockQuotesFromBackend(
  serverUrl: string,
  items: StockItem[],
  language: string,
): Promise<StockQuote[]> {
  if (items.length === 0) return [];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${serverUrl}/api/v1/finance/stock-quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map(it => ({
          symbol: it.symbol,
          name: it.name,
          market: it.market,
        })),
        language,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`backend HTTP ${res.status}`);

    const json = await res.json();
    const list: Array<Partial<StockQuote> & { symbol: string; market: StockMarket }> = json?.data || [];

    // Map backend response back into our local StockQuote shape, preserving
    // the original watchlist order (backend may or may not preserve order).
    const byKey = new Map(list.map(q => [q.symbol, q]));
    return items.map(it => {
      const q = byKey.get(it.symbol);
      if (!q || q.error || !q.price || q.price <= 0) return makeErrorQuote(it);
      return {
        symbol: it.symbol,
        name: q.name || it.name,
        market: it.market,
        price: q.price || 0,
        change: q.change || 0,
        changePercent: q.changePercent || 0,
        open: q.open || 0,
        high: q.high || 0,
        low: q.low || 0,
        prevClose: q.prevClose || 0,
        volume: q.volume || 0,
        marketCap: q.marketCap || 0,
        currency: q.currency || defaultCurrencyForMarket(it.market),
      };
    });
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Unified data fetcher.
 *
 * - Extension context (`chrome-extension://` origin): request Sina / Yahoo
 *   directly — `host_permissions` in the manifest bypasses CORS.
 *   - Chinese users: Sina primary, Yahoo fallback.
 *   - English users: Yahoo primary, Sina fallback.
 * - Web page context (dev / hosted web build): go through our backend
 *   proxy to avoid CORS errors. If no backend is configured, return
 *   error placeholders.
 */
async function fetchStockQuotes(items: StockItem[], language: string): Promise<StockQuote[]> {
  if (items.length === 0) return [];

  const inExtension = isExtensionContext();

  // --- Web page context: always go through backend proxy ---
  if (!inExtension) {
    const serverUrl = useConfigStore.getState().getEffectiveServerUrl();
    console.log('[StockWidget] web context, serverUrl:', serverUrl || '(empty)');
    if (!serverUrl) {
      console.warn('[StockWidget] no backend serverUrl configured in web context');
      return items.map(makeErrorQuote);
    }
    try {
      const data = await fetchStockQuotesFromBackend(serverUrl, items, language);
      if (data.some(d => !d.error && d.price > 0)) return data;
      throw new Error('backend returned no valid data');
    } catch (err) {
      console.warn('[StockWidget] backend proxy failed:', err);
      return items.map(makeErrorQuote);
    }
  }

  // --- Extension context: direct fetch with primary / fallback ---
  const isZh = language === 'zh';
  const primary = isZh ? fetchStockQuotesSina : fetchStockQuotesYahoo;
  const fallback = isZh ? fetchStockQuotesYahoo : fetchStockQuotesSina;

  try {
    return await primary(items);
  } catch (errPrimary) {
    console.warn('[StockWidget] primary source failed, trying fallback:', errPrimary);
    try {
      return await fallback(items);
    } catch (errFallback) {
      console.warn('[StockWidget] fallback source also failed:', errFallback);
      return items.map(makeErrorQuote);
    }
  }
}

// --- Helpers ---
function formatPrice(price: number, _currency: string): string {
  if (price >= 10000) return price.toFixed(0);
  if (price >= 100) return price.toFixed(1);
  return price.toFixed(2);
}

function formatVolume(vol: number): string {
  if (vol >= 1e9) return `${(vol / 1e9).toFixed(1)}B`;
  if (vol >= 1e6) return `${(vol / 1e6).toFixed(1)}M`;
  if (vol >= 1e4) return `${(vol / 1e4).toFixed(1)}W`;
  return vol.toString();
}

function formatMarketCap(cap: number): string {
  if (cap >= 1e12) return `${(cap / 1e12).toFixed(2)}T`;
  if (cap >= 1e9) return `${(cap / 1e9).toFixed(1)}B`;
  if (cap >= 1e6) return `${(cap / 1e6).toFixed(0)}M`;
  return cap.toString();
}

function getMarketLabel(m: StockMarket, isZh: boolean): string {
  const labels: Record<StockMarket, { zh: string; en: string }> = {
    US: { zh: '美股', en: 'US' },
    HK: { zh: '港股', en: 'HK' },
    CN: { zh: 'A股', en: 'CN' },
  };
  return isZh ? labels[m].zh : labels[m].en;
}

/** Color classes for market badge: blue for US, amber for HK, purple for CN. */
function getMarketBadgeClass(m: StockMarket): string {
  const map: Record<StockMarket, string> = {
    US: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
    HK: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
    CN: 'bg-purple-500/15 text-purple-400 border border-purple-500/20',
  };
  return map[m] || 'bg-white/[0.06] text-white/30';
}

function getCurrencySymbol(currency: string): string {
  const map: Record<string, string> = { USD: '$', HKD: 'HK$', CNY: '¥' };
  return map[currency] || '';
}

/** StockWidget — shows watchlist on desktop, opens detail panel on click. */
export const StockWidget: React.FC<StockWidgetProps> = ({ size, config, itemId }) => {
  const { language } = useTranslation();
  const isZh = language === 'zh';

  const watchlist = config?.watchlist ?? DEFAULT_WATCHLIST;
  const [quotes, setQuotes] = useState<StockQuote[]>([]);
  const [loading, setLoading] = useState(true);

  // Derive ordered quotes from watchlist + fetched data to ensure UI matches user's preferred order
  const orderedQuotes = useMemo(() => {
    const quoteMap = new Map((quotes || []).map(q => [q.symbol, q]));
    return watchlist.map(w => quoteMap.get(w.symbol) || makeErrorQuote(w));
  }, [quotes, watchlist]);
  const [error, setError] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cacheKey = stockCacheKey(watchlist.map(s => s.symbol), language);

  const fetchData = useCallback(async (showSpinner = false) => {
    if (watchlist.length === 0) { setQuotes([]); setLoading(false); return; }
    const cached = readStockCache(cacheKey);
    if (cached) { setQuotes(cached.data); setLoading(false); return; }
    if (showSpinner) setLoading(true);
    try {
      const data = await fetchStockQuotes(watchlist, language);
      setQuotes(data);
      // 只缓存至少有一条有效数据的结果，避免缓存全部失败数据
      const hasValid = data.some(d => !d.error && d.price > 0);
      if (hasValid) {
        writeStockCache(cacheKey, data);
      }
      setError(null);
    } catch (err) {
      console.error('[StockWidget] fetchData error:', err);
      if (quotes.length === 0) setError(isZh ? '无法获取行情数据' : 'Unable to fetch stock data');
    } finally {
      setLoading(false);
    }
  }, [watchlist, cacheKey, language, isZh]);

  useEffect(() => {
    fetchData(true);
    // Refresh every 5 minutes
    timerRef.current = setInterval(() => fetchData(false), STOCK_CACHE_TTL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchData]);

  // --- Loading ---
  if (loading && quotes.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <div className="w-6 h-6 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
      </div>
    );
  }

  // --- Error ---
  if (error && quotes.length === 0) {
    return (
      <>
        <div
          className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/50 cursor-pointer"
          onClick={(e) => { e.stopPropagation(); setShowDetail(true); }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/30">
            <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" strokeLinejoin="round"/>
            <path d="M13 13l6 6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-[11px] text-white/40">{error}</span>
          <span className="text-[10px] text-white/25">{isZh ? '点击管理自选股' : 'Click to manage watchlist'}</span>
        </div>

        {showDetail && (
          <StockDetailModal
            quotes={quotes}
            watchlist={watchlist}
            itemId={itemId}
            isZh={isZh}
            onClose={() => setShowDetail(false)}
            onRefresh={() => { localStorage.removeItem(cacheKey); fetchData(true); }}
          />
        )}
      </>
    );
  }

  // --- Small (1×2): horizontal compact view — top 2-3 stocks ---
  if (size === 'small') {
    const displayQuotes = orderedQuotes.slice(0, 3);
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
              background: 'linear-gradient(135deg, #f5a623 0%, #f7c948 100%)',
              boxShadow: '0 2px 8px rgba(245,166,35,0.3)',
            }}
          >
            <span className="text-[16px]">📈</span>
          </div>
          {/* Stock list */}
          <div className="flex-1 flex flex-col justify-center min-w-0 gap-[1px]">
            {displayQuotes.map(q => (
              <div key={q.symbol} className="flex items-center justify-between gap-1">
                <span className="text-[11px] text-white/80 truncate font-medium" style={{ maxWidth: '50%' }}>
                  {q.name}
                </span>
                <span className={`text-[11px] font-semibold tabular-nums ${q.change >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
                  {q.change >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {showDetail && (
          <StockDetailModal
            quotes={quotes}
            watchlist={watchlist}
            itemId={itemId}
            isZh={isZh}
            onClose={() => setShowDetail(false)}
            onRefresh={() => { localStorage.removeItem(cacheKey); fetchData(false); }}
          />
        )}
      </>
    );
  }

  // --- Medium (2×2): card view with more details ---
  return (
    <>
      <div
        className="w-full h-full flex flex-col select-none overflow-hidden cursor-pointer p-3 gap-2"
        onClick={(e) => { e.stopPropagation(); setShowDetail(true); }}
      >
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px]">📊</span>
            <span className="text-[13px] font-semibold text-white/80">
              {isZh ? '股票小助手' : 'Stock Tracker'}
            </span>
          </div>
          <span className="text-[10px] text-white/30">
            {watchlist.length} {isZh ? '只' : 'stocks'}
          </span>
        </div>

        {/* Stock list — scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-[3px] no-scrollbar">
          {orderedQuotes.map(q => (
            <div
              key={q.symbol}
              className="flex items-center justify-between rounded-lg px-2 py-1 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
            >
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[12px] text-white/85 font-medium truncate">{q.name}</span>
                <span className="text-[10px] text-white/35">{q.symbol}</span>
              </div>
              <div className="flex flex-col items-end shrink-0 ml-2">
                <span className="text-[12px] text-white/90 font-medium tabular-nums">
                  {getCurrencySymbol(q.currency)}{formatPrice(q.price, q.currency)}
                </span>
                <span className={`text-[10px] font-semibold tabular-nums ${q.change >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
                  {q.change >= 0 ? '▲' : '▼'} {Math.abs(q.changePercent).toFixed(2)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showDetail && (
        <StockDetailModal
          quotes={orderedQuotes}
          watchlist={watchlist}
          itemId={itemId}
          isZh={isZh}
          onClose={() => setShowDetail(false)}
          onRefresh={() => { localStorage.removeItem(cacheKey); fetchData(false); }}
        />
      )}
    </>
  );
};

/** Small detail cell for expanded stock info. */
const DetailCell: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex flex-col items-center">
    <span className="text-[9px] text-white/30 uppercase tracking-wider">{label}</span>
    <span className="text-[11px] text-white/70 font-light tabular-nums">{value}</span>
  </div>
);

// =========================================================================
// Sortable stock row — used inside the watchlist with dnd-kit
// =========================================================================
interface SortableStockRowProps {
  q: StockQuote;
  isSelected: boolean;
  isZh: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

const SortableStockRow: React.FC<SortableStockRowProps> = ({ q, isSelected, isZh, onSelect, onRemove }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: q.symbol });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    // While dragging, no transition so the item follows the pointer instantly.
    // When not dragging, use the dnd-kit transition for the snap-back animation.
    transition: isDragging ? 'none' : transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.8 : 1,
    position: 'relative' as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border transition-colors transition-opacity cursor-pointer ${
        isDragging
          ? 'bg-white/[0.12] border-white/25 shadow-lg'
          : isSelected
            ? 'bg-white/[0.08] border-white/20'
            : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]'
      }`}
      onClick={onSelect}
    >
      {/* Main row */}
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

        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] text-white/90 font-semibold">{q.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${getMarketBadgeClass(q.market)}`}>
              {getMarketLabel(q.market, isZh)}
            </span>
          </div>
          <span className="text-[11px] text-white/40 mt-0.5">{q.symbol}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {q.error ? (
            <span className="text-[11px] text-white/30 italic">
              {isZh ? '数据加载中...' : 'Loading...'}
            </span>
          ) : (
            <div className="flex flex-col items-end">
              <span className="text-[16px] text-white font-semibold tabular-nums">
                {getCurrencySymbol(q.currency)}{formatPrice(q.price, q.currency)}
              </span>
              <div className="flex items-center gap-1">
                <span className={`text-[12px] font-semibold tabular-nums ${q.change >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
                  {q.change >= 0 ? '+' : ''}{q.change.toFixed(2)}
                </span>
                <span className={`text-[11px] tabular-nums px-1.5 py-0.5 rounded ${
                  q.change >= 0 ? 'bg-[#4ade80]/15 text-[#4ade80]' : 'bg-[#f87171]/15 text-[#f87171]'
                }`}>
                  {q.change >= 0 ? '▲' : '▼'}{Math.abs(q.changePercent).toFixed(2)}%
                </span>
              </div>
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

      {/* Expanded detail */}
      {isSelected && !q.error && (
        <div className="px-4 pb-3 pt-1 border-t border-white/[0.06]">
          <div className="grid grid-cols-4 gap-3">
            <DetailCell label={isZh ? '开盘' : 'Open'} value={formatPrice(q.open, q.currency)} />
            <DetailCell label={isZh ? '最高' : 'High'} value={formatPrice(q.high, q.currency)} />
            <DetailCell label={isZh ? '最低' : 'Low'} value={formatPrice(q.low, q.currency)} />
            <DetailCell label={isZh ? '昨收' : 'Prev'} value={formatPrice(q.prevClose, q.currency)} />
            <DetailCell label={isZh ? '成交量' : 'Volume'} value={formatVolume(q.volume)} />
            <DetailCell label={isZh ? '市值' : 'Mkt Cap'} value={formatMarketCap(q.marketCap)} />
            <DetailCell label={isZh ? '货币' : 'Currency'} value={q.currency} />
            <DetailCell label={isZh ? '市场' : 'Market'} value={getMarketLabel(q.market, isZh)} />
          </div>
        </div>
      )}
    </div>
  );
};

// =========================================================================
// Stock Detail Modal — full watchlist management (Portal-based, macOS style)
// Uses ReactDOM.createPortal to escape transform containers so fixed
// positioning works correctly relative to the viewport.
// =========================================================================
interface StockDetailModalProps {
  quotes: StockQuote[];
  watchlist: StockItem[];
  itemId: string;
  isZh: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

const StockDetailModal: React.FC<StockDetailModalProps> = ({
  quotes, watchlist, itemId, isZh, onClose, onRefresh,
}) => {
  const updateWidgetConfig = useLayoutStore(s => s.updateWidgetConfig);
  const [tab, setTab] = useState<'list' | 'add'>('list');
  const [selectedMarket, setSelectedMarket] = useState<StockMarket>('US');
  const [search, setSearch] = useState('');
  const [selectedQuote, setSelectedQuote] = useState<StockQuote | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const saveWatchlist = useCallback((newList: StockItem[]) => {
    updateWidgetConfig(itemId, { widgetType: 'stock', watchlist: newList });
  }, [itemId, updateWidgetConfig]);

  const removeStock = useCallback((symbol: string) => {
    const newList = watchlist.filter(s => s.symbol !== symbol);
    saveWatchlist(newList);
    onRefresh();
  }, [watchlist, saveWatchlist, onRefresh]);

  const addStock = useCallback((item: StockItem) => {
    if (watchlist.some(s => s.symbol === item.symbol)) return;
    const newList = [...watchlist, item];
    saveWatchlist(newList);
    onRefresh();
  }, [watchlist, saveWatchlist, onRefresh]);

  const isInWatchlist = (symbol: string) => watchlist.some(s => s.symbol === symbol);

  // dnd-kit sensors
  const stockSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Build display list: directly use quotes from parent (which is already ordered)
  const displayQuotes = quotes;
  const stockIds = useMemo(() => displayQuotes.map(q => q.symbol), [displayQuotes]);

  const handleStockDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = watchlist.findIndex(s => s.symbol === active.id);
    const newIndex = watchlist.findIndex(s => s.symbol === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newList = arrayMove(watchlist, oldIndex, newIndex);
    saveWatchlist(newList);
    onRefresh();
  }, [watchlist, saveWatchlist, onRefresh]);

  const filteredPopular = POPULAR_STOCKS[selectedMarket].filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
  });

  const markets: StockMarket[] = ['US', 'HK', 'CN'];

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
        className="bg-black/30 backdrop-blur-xl border-0 sm:border border-white/10 rounded-none sm:rounded-[1.5rem] md:rounded-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.55)] flex flex-col pointer-events-auto animate-scaleIn overflow-hidden select-none w-full h-full sm:w-auto sm:h-auto sm:w-full sm:max-w-[90vw] md:max-w-3xl sm:h-[70vh] md:h-[68vh]"
        onClick={(e) => e.stopPropagation()}
        /* Stop drag-related events from bubbling to the Desktop DndContext.
           Desktop uses MouseSensor (onMouseDown) and TouchSensor (onTouchStart),
           so we must stop those specific events, not just pointer events. */
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        /* We do NOT stop pointerdown propagation here to allow inner DnD (PointerSensor) 
           to work while still blocking outer Desktop DnD (Mouse/Touch). 
           Outer Desktop DndContext does not use PointerSensor by default. */
      >
        {/* Window Header — macOS traffic lights */}
        <div className="h-12 md:h-14 border-b border-white/10 flex items-center px-3 md:px-5 shrink-0 bg-white/[0.02] select-none">
          {/* Left: Mac traffic lights on desktop */}
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

          {/* Center title */}
          <div className="flex-1 flex justify-center">
            <span className="text-[13px] font-semibold text-white/70">
              {isZh ? '📊 股票小助手' : '📊 Stock Tracker'}
            </span>
          </div>

          {/* Right: mobile close button */}
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
          {/* Sidebar — tab switcher */}
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
                📋 {isZh ? '自选股' : 'Watchlist'}
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
                ➕ {isZh ? '添加股票' : 'Add Stock'}
              </button>
            </div>

            {/* Sidebar info: stock count */}
            <div className="hidden md:block mt-auto pt-4 border-t border-white/5">
              <div className="text-[11px] text-white/30 leading-relaxed">
                {isZh ? '自选' : 'Watchlist'}: {watchlist.length} {isZh ? '只' : 'stocks'}
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 flex flex-col p-3 sm:p-5 md:px-6 md:pt-6 md:pb-2 relative bg-gradient-to-br from-white/[0.02] to-transparent overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar sm:pr-2 md:pr-3">
              {tab === 'list' ? (
                /* ===== Watchlist Tab ===== */
                <div className="space-y-3 animate-fadeIn">
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">
                      {isZh ? '我的自选股' : 'My Watchlist'}
                    </h3>
                    <p className="text-[12px] text-white/50 mb-4">
                      {isZh ? '点击股票查看详情，拖拽可排序' : 'Click to view details, drag to reorder'}
                    </p>
                  </div>

                  {quotes.length === 0 && watchlist.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-white/15 mb-4">
                        <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
                      </svg>
                      <p className="text-[13px] text-white/30 text-center mb-3">
                        {isZh ? '暂无自选股' : 'No stocks in watchlist'}
                      </p>
                      <button
                        type="button"
                        onClick={() => setTab('add')}
                        className="px-4 py-2 rounded-xl bg-[#f5a623]/20 hover:bg-[#f5a623]/30 text-[#f5a623] text-[13px] font-medium transition-colors border border-[#f5a623]/30"
                      >
                        {isZh ? '去添加 →' : 'Add stocks →'}
                      </button>
                    </div>
                  ) : (
                    <DndContext
                      sensors={stockSensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleStockDragEnd}
                    >
                      <SortableContext items={stockIds} strategy={verticalListSortingStrategy}>
                        <div className="space-y-2">
                          {displayQuotes.map(q => (
                            <SortableStockRow
                              key={q.symbol}
                              q={q}
                              isSelected={selectedQuote?.symbol === q.symbol}
                              isZh={isZh}
                              onSelect={() => setSelectedQuote(selectedQuote?.symbol === q.symbol ? null : q)}
                              onRemove={() => removeStock(q.symbol)}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              ) : (
                /* ===== Add Stock Tab ===== */
                <div className="space-y-4 animate-fadeIn">
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">
                      {isZh ? '添加自选股' : 'Add Stocks'}
                    </h3>
                    <p className="text-[12px] text-white/50 mb-3">
                      {isZh ? '选择市场并搜索或点击添加' : 'Select a market and search or click to add'}
                    </p>
                  </div>

                  {/* Market tabs */}
                  <div className="flex items-center gap-2">
                    {markets.map(m => (
                      <button
                        key={m}
                        onClick={() => setSelectedMarket(m)}
                        className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                          selectedMarket === m
                            ? 'bg-[#f5a623]/20 text-[#f5a623] border border-[#f5a623]/30'
                            : 'bg-white/5 text-white/50 border border-white/5 hover:bg-white/10'
                        }`}
                      >
                        {getMarketLabel(m, isZh)}
                      </button>
                    ))}
                  </div>

                  {/* Search input */}
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder={isZh ? '搜索股票代码或名称...' : 'Search symbol or name...'}
                    className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3 text-[13px] text-white select-text focus:outline-none focus:border-[#f5a623]/50 transition-all"
                  />

                  {/* Stock grid */}
                  <div className="grid grid-cols-2 gap-2">
                    {filteredPopular.map(stock => {
                      const added = isInWatchlist(stock.symbol);
                      return (
                        <button
                          key={stock.symbol}
                          onClick={() => !added && addStock(stock)}
                          disabled={added}
                          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
                            added
                              ? 'bg-white/[0.03] border-white/[0.06] opacity-50 cursor-not-allowed'
                              : 'bg-white/[0.03] border-white/[0.06] hover:bg-[#f5a623]/10 hover:border-[#f5a623]/30 cursor-pointer'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] text-white/85 font-medium truncate">{stock.name}</div>
                            <div className="text-[10px] text-white/35">{stock.symbol}</div>
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

                  {filteredPopular.length === 0 && search.trim() && (
                    <div className="text-center py-4">
                      <p className="text-white/40 text-[12px] mb-2">
                        {isZh ? '预设列表中未找到匹配项' : 'No match in preset list'}
                      </p>
                      <button
                        onClick={() => {
                          const sym = search.trim().toUpperCase();
                          if (!sym) return;
                          // Determine market from symbol format
                          let market: StockMarket = selectedMarket;
                          if (sym.endsWith('.HK')) market = 'HK';
                          else if (sym.endsWith('.SS') || sym.endsWith('.SZ')) market = 'CN';
                          else if (sym.startsWith('^') || /^[A-Z]+$/.test(sym)) market = 'US';
                          const newItem: StockItem = { symbol: sym, name: sym, market };
                          if (!isInWatchlist(sym)) {
                            addStock(newItem);
                            setSearch('');
                          }
                        }}
                        className="px-4 py-2 rounded-xl bg-[#f5a623]/20 text-[#f5a623] border border-[#f5a623]/30 text-[12px] font-medium hover:bg-[#f5a623]/30 transition-colors"
                      >
                        {isZh ? `添加自定义代码 "${search.trim().toUpperCase()}"` : `Add custom symbol "${search.trim().toUpperCase()}"`}
                      </button>
                    </div>
                  )}

                  {/* Hint */}
                  <div className="rounded-xl bg-black/20 border border-white/[0.06] p-3">
                    <p className="text-[11px] text-white/40 leading-relaxed">
                      {isZh
                        ? '💡 支持股票和指数。美股如 AAPL、指数 ^GSPC，港股如 0700.HK、指数 ^HSI，A股沪市 600519.SS、深市 000001.SZ。预设列表找不到的可直接输入代码添加。数据来源：新浪财经（中文）/ Yahoo Finance（英文），每 5 分钟刷新。'
                        : '💡 Supports stocks & indices. US: AAPL, ^GSPC; HK: 0700.HK, ^HSI; CN: 600519.SS, 000001.SZ. Type any symbol to add custom entries. Data from Sina Finance (Chinese) / Yahoo Finance (English), refreshed every 5 min.'
                      }
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Inline animations (same as SettingsModal) */}
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

  // Render via Portal to escape any transform containers
  return ReactDOM.createPortal(modal, document.body);
};



/**
 * Favicon utility — unified favicon URL generation with local IndexedDB caching.
 *
 * Strategy:
 * 1. Check local IndexedDB cache (permanent, never expires).
 * 2. If cache miss, return the backend proxy URL (which handles multi-source
 *    fetching + server-side disk cache).
 * 3. After the image loads successfully, store it in IndexedDB as a Blob URL
 *    so subsequent loads are instant and offline-capable.
 * 4. In extension context (host_permissions granted), an async background
 *    task fetches the target page's HTML, parses <link rel="icon"> tags and
 *    picks the largest one. The hi-res Blob is stored in IndexedDB and
 *    subscribers are notified via an EventTarget so <img> tags can swap
 *    their src live. This works for intranet / IP hosts too.
 */

import { useEffect, useState } from 'react';
import { useConfigStore } from '../store/configStore';

// ---------------------------------------------------------------------------
// IndexedDB helpers
// ---------------------------------------------------------------------------

const DB_NAME = 'catheadtab-favicons';
const STORE_NAME = 'icons';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

async function idbGet<T = unknown>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function idbPut(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Silently fail — caching is best-effort
  }
}

/**
 * Remove an entry from the IndexedDB store. Used to evict stale low-res
 * icons discovered after the resolution guard was introduced.
 */
async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Silently fail — eviction is best-effort
  }
}

async function getCachedFavicon(key: string): Promise<Blob | null> {
  const v = await idbGet<Blob>(key);
  return v instanceof Blob ? v : null;
}

async function setCachedFavicon(key: string, blob: Blob): Promise<void> {
  await idbPut(key, blob);
}

/**
 * Decode a Blob with a temporary <img> and return its natural dimensions.
 * Returns null if decoding fails (e.g. corrupted or non-image Blob).
 * SVG blobs report either 0x0 or a 1-pixel viewport in some browsers, so
 * callers should treat naturalWidth=0 specially.
 */
async function getBlobIntrinsicSize(blob: Blob): Promise<{ w: number; h: number; isSvg: boolean } | null> {
  const type = (blob.type || '').toLowerCase();
  const isSvg = type.includes('svg');
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve) => {
      const probe = new Image();
      probe.onload = () => resolve({ w: probe.naturalWidth, h: probe.naturalHeight, isSvg });
      probe.onerror = () => resolve(null);
      probe.src = url;
    });
  } finally {
    // Small delay so the <img> can finish decoding before the URL is
    // revoked; 0-ms timeout yields to the event loop.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * Return `true` when the given cached Blob is high-resolution enough to
 * satisfy a favicon request of size `sz`. Vector images (SVG) are always
 * considered sharp; raster images must meet the `minAcceptableNaturalSize`
 * threshold on their longest side.
 */
async function isBlobHighResEnough(blob: Blob, sz: number): Promise<boolean> {
  if (!blob || blob.size < 20) return false;
  const dims = await getBlobIntrinsicSize(blob);
  if (!dims) return false;
  if (dims.isSvg) return true;
  const longest = Math.max(dims.w, dims.h);
  if (longest <= 0) return false;
  return longest >= minAcceptableNaturalSize(sz);
}

// ---------------------------------------------------------------------------
// In-memory blob URL cache (for the lifetime of the page)
// ---------------------------------------------------------------------------

const blobURLCache = new Map<string, string>();
// Track pending fetches to avoid duplicate requests for the same favicon
const pendingFetches = new Map<string, Promise<string | null>>();
// Track pending scans so we don't scan the same target twice in one page load
const pendingScans = new Map<string, Promise<string | null>>();

// ---------------------------------------------------------------------------
// Live-update event bus (so <img> subscribers can swap src when a hi-res
// icon is discovered by the background scanner)
// ---------------------------------------------------------------------------

const faviconEvents = new EventTarget();

/**
 * FaviconUpdatedDetail payload for the 'favicon-updated' CustomEvent.
 */
export interface FaviconUpdatedDetail {
  key: string;
  blobUrl: string;
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Generate a cache key from domain + size.
 */
function cacheKey(domain: string, sz: number): string {
  return `${domain}_${sz}`;
}

/**
 * Marker key used in IndexedDB to remember that we've already attempted a
 * scan for this domain+size — regardless of success — so we don't waste
 * cycles re-scanning on every new-tab open.
 *
 * The version suffix is bumped whenever the scanner's algorithm materially
 * changes (e.g. new HTML-parsing passes, manifest.json support) so that
 * clients with a warm cache of stale failure markers re-attempt the scan.
 */
const SCAN_ALGO_VERSION = 2;
function scanMarkerKey(domain: string, sz: number): string {
  return `scanned:v${SCAN_ALGO_VERSION}:${domain}_${sz}`;
}

/**
 * Extract a clean domain from a URL string.
 * Non-default ports are preserved because they commonly represent distinct
 * services with their own favicon.
 */
export function extractDomain(urlStr: string): string {
  try {
    const u = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`);
    if (u.port && u.port !== '80' && u.port !== '443') {
      return `${u.hostname}:${u.port}`;
    }
    return u.hostname;
  } catch {
    return '';
  }
}

/**
 * Return true when the given host is an IP address, localhost or a
 * *.local mDNS name — i.e. a host the backend usually cannot reach
 * and for which the browser's own favicon cache is the best source.
 */
export function isIPHost(host: string): boolean {
  if (!host) return false;
  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.local')) return true;
  // IPv4 (with optional :port trimmed by the caller when needed)
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(lower)) return true;
  // IPv6 — a hostname part containing ':' is never a valid DNS name
  if (lower.includes(':')) return true;
  return false;
}

/**
 * Return true when the given URL or domain points at a LAN / loopback host.
 * Accepts either a full URL or a bare host[:port] string.
 */
export function isLocalOrIPTarget(urlOrDomain: string): boolean {
  if (!urlOrDomain) return false;
  try {
    const u = new URL(urlOrDomain.includes('://') ? urlOrDomain : `https://${urlOrDomain}`);
    return isIPHost(u.hostname);
  } catch {
    // Fallback: strip an optional port and test the raw string
    const host = urlOrDomain.split('/')[0].split(':')[0];
    return isIPHost(host);
  }
}

/**
 * Return true when we're running inside a Chrome extension context with
 * host_permissions that allow unrestricted fetch. Web dev mode returns
 * false.
 */
export function isExtensionEnv(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
}

/**
 * Build the backend favicon proxy URL.
 */
export function getFaviconProxyUrl(domain: string, sz: number = 64): string {
  const serverUrl = useConfigStore.getState().getEffectiveServerUrl();
  if (!serverUrl || !domain) return '';

  const base = serverUrl.endsWith('/') ? serverUrl.slice(0, -1) : serverUrl;
  return `${base}/api/v1/favicon?domain=${encodeURIComponent(domain)}&sz=${sz}`;
}

/**
 * Get a favicon URL for display. Returns either:
 * - A blob: URL from local cache (instant, no network)
 * - The backend proxy URL (needs network, first load only)
 *
 * When returning a proxy URL, an async background task checks IndexedDB
 * and — on miss — fetches the favicon from the backend, storing it in
 * IndexedDB. On subsequent page loads the IndexedDB hit returns a blob
 * URL instantly, skipping the backend entirely.
 */
export function getFaviconUrl(urlOrDomain: string, sz: number = 64): string {
  const domain = urlOrDomain.includes('://') ? extractDomain(urlOrDomain) : urlOrDomain;
  if (!domain) return '';

  const key = cacheKey(domain, sz);

  // 1. Check in-memory blob URL cache (fastest)
  const cached = blobURLCache.get(key);
  if (cached) return cached;

  // 2. Trigger async IndexedDB-only check (no network fetch)
  loadFromIndexedDB(domain, sz);

  // 3. Return the proxy URL for immediate use by <img> tags
  return getFaviconProxyUrl(domain, sz);
}

/**
 * Async version: resolves to a blob URL if cached, or fetches and caches.
 * Returns null if everything fails.
 */
export async function getFaviconUrlAsync(urlOrDomain: string, sz: number = 64): Promise<string | null> {
  const domain = urlOrDomain.includes('://') ? extractDomain(urlOrDomain) : urlOrDomain;
  if (!domain) return null;

  const key = cacheKey(domain, sz);

  // Check in-memory cache
  const memCached = blobURLCache.get(key);
  if (memCached) return memCached;

  // Check IndexedDB cache
  const dbCached = await getCachedFavicon(key);
  if (dbCached) {
    const blobUrl = URL.createObjectURL(dbCached);
    blobURLCache.set(key, blobUrl);
    return blobUrl;
  }

  // Fetch from backend proxy and cache
  return fetchAndCache(domain, sz);
}

/**
 * Background loader: check IndexedDB only (no network fetch).
 * If found in IndexedDB, promotes to in-memory blob URL cache (no network).
 * If not in IndexedDB, we do NOT issue a fetch() here to avoid CORS errors.
 * Instead, the <img> tag loads the image normally and then
 * `cacheImageFromElement` (called via onLoad) writes it to IndexedDB so
 * the next page load can use the local cache directly.
 */
function loadFromIndexedDB(domain: string, sz: number): void {
  const key = cacheKey(domain, sz);
  if (blobURLCache.has(key) || pendingFetches.has(key)) return;

  const promise = (async () => {
    const dbCached = await getCachedFavicon(key);
    if (dbCached) {
      // Reject low-res historical entries (e.g. ones that were stored
      // before the resolution guard was added). They would otherwise
      // produce a blurry upscale on the desktop grid forever.
      const sharp = await isBlobHighResEnough(dbCached, sz);
      if (!sharp) {
        await idbDelete(key);
        return null;
      }
      const blobUrl = URL.createObjectURL(dbCached);
      blobURLCache.set(key, blobUrl);
      // Notify subscribers so that <img> tags still showing a proxy URL
      // can swap to the cached blob URL immediately.
      faviconEvents.dispatchEvent(
        new CustomEvent<FaviconUpdatedDetail>('favicon-updated', {
          detail: { key, blobUrl },
        })
      );
      return blobUrl;
    }

    // IndexedDB miss — do NOT use fetch() here; the <img> tag will load
    // the proxy URL directly (immune to CORS) and cacheImageFromElement
    // will persist it to IndexedDB on successful load.
    return null;
  })();

  pendingFetches.set(key, promise);
  promise.finally(() => pendingFetches.delete(key));
}

/**
 * Minimum natural dimension (in px) that a source image must have before we
 * are willing to persist it as the canonical icon for a given `sz` request.
 *
 * The Chrome `_favicon` API returns 16x16/32x32 thumbnails sourced from the
 * browser's own favicon cache. If we accept those as the permanent
 * IndexedDB entry, the desktop grid (60x60) will upscale a 16px bitmap and
 * look terribly blurry forever. We require the source to be at least 75%
 * of the requested size — so a sz=128 request will reject a 32px thumbnail
 * but still accept a 96px favicon when that's the best the site provides.
 */
function minAcceptableNaturalSize(sz: number): number {
  return Math.max(48, Math.floor(sz * 0.75));
}

/**
 * Heuristic: `true` when the given <img> was rendered from Chrome's
 * built-in `_favicon` API. Those URLs are `chrome-extension://…/_favicon/…`
 * and always serve low-resolution bitmaps (16/32 px) sourced from the
 * browser's local favicon cache — unsuitable as the canonical high-res
 * icon for a desktop tile.
 */
function isChromeFaviconSource(img: HTMLImageElement): boolean {
  const src = img.currentSrc || img.src || '';
  return /^chrome-extension:\/\/[^/]+\/_favicon\//i.test(src);
}

/**
 * Cache a successfully loaded <img> element's image into IndexedDB.
 * Call this from an <img> tag's onLoad event to avoid a separate fetch().
 *
 * Usage:
 *   <img src={getSmartFaviconUrl(url, 64)} onLoad={(e) => cacheImageFromElement(e.currentTarget, url, 64)} />
 *
 * Low-resolution sources are rejected so the permanent on-disk cache is
 * never poisoned with a 16x16 thumbnail from Chrome's `_favicon` API.
 */
export async function cacheImageFromElement(
  img: HTMLImageElement,
  urlOrDomain: string,
  sz: number = 64
): Promise<void> {
  const domain = urlOrDomain.includes('://') ? extractDomain(urlOrDomain) : urlOrDomain;
  if (!domain) return;

  const key = cacheKey(domain, sz);
  // Already cached — nothing to do
  if (blobURLCache.has(key)) return;

  // Never persist Chrome's built-in _favicon thumbnails. They are always
  // low-res and would otherwise poison the IndexedDB cache forever.
  if (isChromeFaviconSource(img)) return;

  // Reject sources that are substantially smaller than requested — upscaling
  // a 16/32 px bitmap into a 128 px desktop tile produces a blurry result.
  // SVGs have naturalWidth=0 in some browsers, so we only enforce this when
  // the natural dimensions are known.
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (nw > 0 && nh > 0) {
    const minSize = minAcceptableNaturalSize(sz);
    if (Math.max(nw, nh) < minSize) return;
  }

  try {
    // Draw image to canvas → export as blob
    const canvas = document.createElement('canvas');
    canvas.width = nw || sz;
    canvas.height = nh || sz;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png')
    );

    if (!blob || blob.size < 10) return;

    const blobUrl = URL.createObjectURL(blob);
    blobURLCache.set(key, blobUrl);
    await setCachedFavicon(key, blob);
  } catch {
    // Silently fail — caching is best-effort
  }
}

/**
 * Fetch favicon from backend proxy and store in IndexedDB + memory.
 */
async function fetchAndCache(domain: string, sz: number): Promise<string | null> {
  const proxyUrl = getFaviconProxyUrl(domain, sz);
  if (!proxyUrl) return null;

  try {
    const resp = await fetch(proxyUrl);
    if (!resp.ok) return null;

    const blob = await resp.blob();

    // Validate it's actually an image
    if (!blob.type.startsWith('image/') || blob.size < 10) {
      return null;
    }

    const key = cacheKey(domain, sz);
    const blobUrl = URL.createObjectURL(blob);

    // Store in both caches
    blobURLCache.set(key, blobUrl);
    await setCachedFavicon(key, blob);

    return blobUrl;
  } catch {
    return null;
  }
}

/**
 * Preload a favicon into the cache. Call this when you know the user will
 * see the icon soon (e.g., when a URL is typed into the add-link modal).
 */
export function preloadFavicon(urlOrDomain: string, sz: number = 64): void {
  const domain = urlOrDomain.includes('://') ? extractDomain(urlOrDomain) : urlOrDomain;
  if (domain) fetchAndCache(domain, sz);
}

/**
 * Get the Google S2 favicon URL (legacy fallback for when server is not configured).
 */
export function getGoogleFaviconUrl(urlOrDomain: string, sz: number = 64): string {
  const domain = urlOrDomain.includes('://') ? extractDomain(urlOrDomain) : urlOrDomain;
  return `https://s2.googleusercontent.com/s2/favicons?domain_url=https://${encodeURIComponent(domain)}&sz=${sz}`;
}

/**
 * Get the Chrome built-in _favicon URL.
 * This uses the browser's local favicon cache — the same source that
 * chrome://bookmarks and chrome://history use. It requires the "favicon"
 * permission in manifest.json.
 *
 * Returns empty string if chrome.runtime is not available (e.g. web dev mode).
 */
export function getChromeFaviconUrl(urlOrDomain: string, sz: number = 32): string {
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getURL) {
    return '';
  }

  // _favicon API expects a full page URL, not just a domain
  const pageUrl = urlOrDomain.includes('://') ? urlOrDomain : `https://${urlOrDomain}`;

  try {
    const faviconUrl = new URL(chrome.runtime.getURL('/_favicon/'));
    faviconUrl.searchParams.set('pageUrl', pageUrl);
    faviconUrl.searchParams.set('size', String(sz));
    return faviconUrl.toString();
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// HTML-scan scanner (runs only inside extension context)
// ---------------------------------------------------------------------------

/**
 * IconCandidate describes one <link rel="icon"> or similar candidate
 * discovered while scanning the target page's HTML.
 */
interface IconCandidate {
  /** Absolute URL pointing at the icon resource. */
  href: string;
  /** Largest side length declared in the `sizes` attribute (0 if unknown). */
  size: number;
  /** Priority tag used as a tiebreaker when sizes are equal. */
  rank: number;
  /**
   * When true this is a vector image (SVG). It can be rendered at any
   * size without quality loss, so we always prefer it over raster icons
   * whose declared size is smaller than 256.
   */
  vector?: boolean;
}

const ICON_REL_PATTERNS: Array<{ pattern: RegExp; rank: number }> = [
  // apple-touch-icon is usually the highest-res dedicated asset
  { pattern: /apple-touch-icon/i, rank: 100 },
  // fluid-icon (Safari) and mask-icon come next
  { pattern: /fluid-icon/i, rank: 80 },
  // <link rel="icon" sizes="...">
  { pattern: /(^|\s)icon(\s|$)/i, rank: 60 },
  // generic shortcut icon
  { pattern: /shortcut\s+icon/i, rank: 40 },
];

/**
 * Heuristic: treat the given href or MIME hint as a vector (SVG) source.
 */
function isVectorIcon(href: string, typeHint?: string | null): boolean {
  if (typeHint && /svg/i.test(typeHint)) return true;
  try {
    const path = new URL(href, 'https://x/').pathname.toLowerCase();
    return path.endsWith('.svg');
  } catch {
    return /\.svg(\?|#|$)/i.test(href);
  }
}

/**
 * Parse the `sizes` attribute of a <link> element into a numeric
 * longest-side length. Returns 0 when unknown or "any".
 */
function parseSizes(raw: string | null | undefined): number {
  if (!raw) return 0;
  const lower = raw.toLowerCase().trim();
  if (lower === 'any') return 1024; // SVG — treat as very large
  // Pick the first token like "192x192" or "64x64"
  const m = lower.match(/(\d+)\s*x\s*(\d+)/);
  if (!m) return 0;
  const w = parseInt(m[1], 10);
  const h = parseInt(m[2], 10);
  return Number.isFinite(w) && Number.isFinite(h) ? Math.max(w, h) : 0;
}

/**
 * Resolve an href (which may be relative, protocol-relative, or absolute)
 * against the given base URL. Returns empty string if resolution fails.
 */
function resolveHref(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return '';
  }
}

/**
 * Extract icon candidates from raw HTML **without** ever constructing a
 * real DOM.
 *
 * Why we avoid DOMParser entirely:
 * Even though `new DOMParser().parseFromString(html, 'text/html')` yields
 * an inert `HTMLDocument` that does *not* execute scripts, Chromium's
 * HTML tokenizer still runs its speculative **Preload Scanner** on that
 * blob. The scanner walks the token stream looking for side-effecting
 * tags and eagerly fires network fetches for them, from the current
 * page's origin. In an extension new-tab context this produces noisy
 * CSP violations like:
 *
 *   - "Loading the script 'https://chatgpt.com/cdn/assets/…js' violates
 *      the following Content Security Policy directive: script-src 'self'"
 *   - "The resource https://chatgpt.com/cdn/assets/…css was preloaded
 *      using link preload but not used…"
 *
 * No amount of pre-sanitising the HTML string is bullet-proof against
 * malformed input (quoted `>` in attributes, cross-line tags, HTML
 * comments, `<template>` wrappers, etc.) — a single regex miss leaks a
 * preload tag straight into the scanner.
 *
 * The robust fix is to never hand HTML to any DOM-level API. We only
 * need `<link rel="...icon...">` hrefs and `<meta property="og:image">`
 * content — both trivially extractable with attribute regexes that do
 * not involve the browser's parser.
 */
function extractIconCandidates(html: string, baseUrl: string): IconCandidate[] {
  const seen = new Set<string>();
  const candidates: IconCandidate[] = [];

  const push = (c: IconCandidate) => {
    if (!c.href || seen.has(c.href)) return;
    seen.add(c.href);
    candidates.push(c);
  };

  // Strip HTML comments so "<!-- <link rel=icon ...> -->" doesn't count
  // as a real icon reference, and so commented-out <script>/<link> blocks
  // don't pollute the match space.
  const cleaned = html.replace(/<!--[\s\S]*?-->/g, '');

  // Tolerant attribute regexes — each allows double quotes, single quotes,
  // or unquoted values, and uses a non-greedy scan terminating at the
  // first `>` that is not inside a quoted value.
  const linkTagRE = /<link\b[^>]*?>/gi;
  const metaTagRE = /<meta\b[^>]*?>/gi;
  const relRE = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i;
  const hrefRE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i;
  const sizesRE = /\bsizes\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i;
  const typeRE = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i;
  const propertyRE = /\bproperty\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i;
  const nameRE = /\bname\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i;
  const contentRE = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i;

  const attr = (re: RegExp, source: string): string | null => {
    const m = re.exec(source);
    if (!m) return null;
    return m[1] ?? m[2] ?? m[3] ?? null;
  };

  // ── Pass 1: <link rel="...icon..." href="..."> ──────────────────────
  linkTagRE.lastIndex = 0;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkTagRE.exec(cleaned)) !== null) {
    const tag = linkMatch[0];
    const rel = attr(relRE, tag);
    if (!rel) continue;

    const matched = ICON_REL_PATTERNS.find((p) => p.pattern.test(rel));
    if (!matched) continue;

    const rawHref = attr(hrefRE, tag);
    if (!rawHref) continue;

    const absolute = resolveHref(rawHref, baseUrl);
    if (!absolute) continue;

    const sizes = attr(sizesRE, tag);
    const type = attr(typeRE, tag);

    push({
      href: absolute,
      size: parseSizes(sizes),
      rank: matched.rank,
      vector: isVectorIcon(absolute, type),
    });
  }

  // ── Pass 2: <meta property="og:image" content="..."> and the
  // Twitter variant <meta name="twitter:image" content="...">. These
  // are social-card images, typically 1200x630 or similar, so they
  // receive a lower rank than real icons but can still be useful for
  // sites that ship no <link rel="icon"> at all.
  metaTagRE.lastIndex = 0;
  let metaMatch: RegExpExecArray | null;
  while ((metaMatch = metaTagRE.exec(cleaned)) !== null) {
    const tag = metaMatch[0];
    const prop = (attr(propertyRE, tag) ?? attr(nameRE, tag) ?? '').toLowerCase();
    if (prop !== 'og:image' && prop !== 'twitter:image' && prop !== 'og:image:url') continue;

    const content = attr(contentRE, tag);
    if (!content) continue;

    const absolute = resolveHref(content, baseUrl);
    if (!absolute) continue;

    push({ href: absolute, size: 0, rank: 10 });
  }

  return candidates;
}

/**
 * Fetch and parse a Web App Manifest to harvest its `icons` array. This is
 * the canonical high-resolution asset source for modern PWAs (Beszel,
 * Grafana, Portainer, NextCloud, etc.) whose index.html only ships a single
 * low-res <link rel="icon">.
 *
 * Returns an empty array on any failure.
 */
async function fetchManifestIcons(manifestUrl: string): Promise<IconCandidate[]> {
  const resp = await fetchWithTimeout(manifestUrl, 5000);
  if (!resp || !resp.ok) return [];
  let json: unknown;
  try {
    json = await resp.json();
  } catch {
    return [];
  }
  if (!json || typeof json !== 'object') return [];
  const icons = (json as { icons?: unknown }).icons;
  if (!Array.isArray(icons)) return [];

  const out: IconCandidate[] = [];
  for (const raw of icons) {
    if (!raw || typeof raw !== 'object') continue;
    const src = (raw as { src?: unknown }).src;
    const sizes = (raw as { sizes?: unknown }).sizes;
    const type = (raw as { type?: unknown }).type;
    if (typeof src !== 'string' || !src) continue;

    const absolute = resolveHref(src, manifestUrl);
    if (!absolute) continue;

    out.push({
      href: absolute,
      size: parseSizes(typeof sizes === 'string' ? sizes : null),
      // Manifest icons are declared for PWA installation, so they are
      // typically the highest-quality assets available.
      rank: 90,
      vector: isVectorIcon(absolute, typeof type === 'string' ? type : null),
    });
  }
  return out;
}

/**
 * Find the web app manifest URL from HTML, if any.
 */
function findManifestUrl(html: string, baseUrl: string): string {
  const re = /<link\b[^>]*\brel\s*=\s*(?:"manifest"|'manifest'|manifest)[^>]*>/i;
  const m = re.exec(html);
  if (!m) return '';
  const tag = m[0];
  const hrefRE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i;
  const h = hrefRE.exec(tag);
  if (!h) return '';
  const raw = h[1] ?? h[2] ?? h[3] ?? '';
  return resolveHref(raw, baseUrl);
}

/**
 * Normalise a target URL or domain to a full http(s):// base URL suitable
 * for fetch(). Prefers https when the input had no protocol.
 */
function toFetchUrl(urlOrDomain: string): string {
  if (urlOrDomain.includes('://')) return urlOrDomain;
  // Private hosts default to http:// because most intranet services are
  // not exposed over TLS.
  const scheme = isLocalOrIPTarget(urlOrDomain) ? 'http' : 'https';
  return `${scheme}://${urlOrDomain}`;
}

/**
 * Fetch a remote resource with a timeout. Returns null on any failure.
 */
async function fetchWithTimeout(url: string, ms: number, init?: RequestInit): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const resp = await fetch(url, {
        ...init,
        signal: controller.signal,
        redirect: 'follow',
        credentials: 'omit',
      });
      return resp;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/**
 * Scan the target page's HTML to find the best available favicon, then
 * download it and store it in IndexedDB + memory. Dispatches the
 * 'favicon-updated' event on success so live subscribers can swap their
 * <img> src.
 *
 * Only runs inside the extension context; a no-op otherwise.
 *
 * @returns the cached blob URL on success, null otherwise.
 */
export async function scanBestFavicon(urlOrDomain: string, sz: number = 64): Promise<string | null> {
  if (!isExtensionEnv()) return null;

  const domain = urlOrDomain.includes('://') ? extractDomain(urlOrDomain) : urlOrDomain;
  if (!domain) return null;

  const key = cacheKey(domain, sz);

  // Already done (in memory)
  const existing = blobURLCache.get(key);
  if (existing) return existing;

  // Coalesce concurrent scans for the same key
  const inflight = pendingScans.get(key);
  if (inflight) return inflight;

  const task = (async (): Promise<string | null> => {
    // Already attempted and persisted — either we have a blob in IDB or
    // the scan was previously marked as failed. Promote IDB → memory
    // *only* when the cached blob is high-resolution enough for the
    // requested size. Low-res leftovers (e.g. historical entries saved
    // before the resolution guard in `cacheImageFromElement` was added)
    // get dropped so the scanner can fetch a fresh, sharp icon.
    const dbCached = await getCachedFavicon(key);
    if (dbCached) {
      const sharp = await isBlobHighResEnough(dbCached, sz);
      if (sharp) {
        const blobUrl = URL.createObjectURL(dbCached);
        blobURLCache.set(key, blobUrl);
        faviconEvents.dispatchEvent(
          new CustomEvent<FaviconUpdatedDetail>('favicon-updated', {
            detail: { key, blobUrl },
          })
        );
        return blobUrl;
      }
      // Stale low-res entry — wipe it so the scan proceeds below.
      await idbDelete(key);
    }

    const marker = await idbGet<{ failedAt: number }>(scanMarkerKey(domain, sz));
    // Skip re-scanning for 7 days after a failure
    if (marker && typeof marker.failedAt === 'number' && Date.now() - marker.failedAt < 7 * 24 * 3600 * 1000) {
      return null;
    }

    const pageUrl = toFetchUrl(urlOrDomain);

    // 1. Fetch HTML (extension env: host_permissions bypasses CORS)
    const htmlResp = await fetchWithTimeout(pageUrl, 5000);
    if (!htmlResp || !htmlResp.ok) {
      await idbPut(scanMarkerKey(domain, sz), { failedAt: Date.now() });
      return null;
    }
    const html = await htmlResp.text();

    // 2. Extract <link>/<meta> candidates (with regex fallback for malformed HTML)
    const finalUrl = htmlResp.url || pageUrl;
    const candidates = extractIconCandidates(html, finalUrl);

    // 2b. Also fetch the Web App Manifest — its icons array usually contains
    // the highest-resolution PWA assets (512x512 etc.).
    const manifestUrl = findManifestUrl(html, finalUrl);
    if (manifestUrl) {
      try {
        const manifestIcons = await fetchManifestIcons(manifestUrl);
        for (const ic of manifestIcons) candidates.push(ic);
      } catch {
        // Best-effort — ignore manifest errors
      }
    }

    // 3. Also include the conventional /favicon.ico as a baseline
    candidates.push({
      href: resolveHref('/favicon.ico', finalUrl),
      size: 0,
      rank: 5,
    });

    // 4. Sort by effective size (vectors count as 1024 because they scale
    // losslessly), then by rank.
    const effectiveSize = (c: IconCandidate) => (c.vector ? Math.max(c.size, 1024) : c.size);
    const ordered = [...candidates].sort((a, b) => {
      const ds = effectiveSize(b) - effectiveSize(a);
      if (ds !== 0) return ds;
      return b.rank - a.rank;
    });

    // Minimum resolution required for the scanner to accept a candidate
    // as the canonical high-res icon. Without this guard, a site that
    // only ships a 32x32 <link rel="icon"> (e.g. Gmail) would cause the
    // scanner to *downgrade* the icon that the backend proxy already
    // provided at 128/256 px — visually the user sees a sharp icon
    // first and then a blurry one a moment later.
    const minSize = minAcceptableNaturalSize(sz);

    for (const cand of ordered) {
      if (!cand.href) continue;

      // Pre-filter: skip raster candidates whose declared size is
      // clearly below the acceptance threshold. Vector icons (SVG) and
      // candidates with unknown size (0) proceed to download so the
      // blob-level check below has the final word.
      if (!cand.vector && cand.size > 0 && cand.size < minSize) continue;

      const iconResp = await fetchWithTimeout(cand.href, 5000);
      if (!iconResp || !iconResp.ok) continue;

      const blob = await iconResp.blob();
      // Most real icons are well above 100B. SVGs can be tiny but should
      // still be at least 20B to be a valid XML document. Reject anything
      // below that as truncated / placeholder content.
      if (!blob || blob.size < 20) continue;

      // Type guard: accept common image MIME types plus SVG. Some servers
      // (looking at you, PocketBase) serve SVG as application/octet-stream
      // or text/plain, so fall back to the href extension when necessary.
      const type = (blob.type || '').toLowerCase();
      const looksLikeImage =
        type.startsWith('image/') ||
        type.includes('svg') ||
        isVectorIcon(cand.href, type);
      if (!looksLikeImage) continue;

      // Final resolution gate: decode the blob to inspect its intrinsic
      // size. SVGs always pass; raster images must meet `minSize` on the
      // longest side. This is the critical check that prevents a site's
      // 32x32 <link rel="icon"> from overwriting a 128 px proxy image.
      const sharp = await isBlobHighResEnough(blob, sz);
      if (!sharp) continue;

      const blobUrl = URL.createObjectURL(blob);
      blobURLCache.set(key, blobUrl);
      await setCachedFavicon(key, blob);
      faviconEvents.dispatchEvent(
        new CustomEvent<FaviconUpdatedDetail>('favicon-updated', {
          detail: { key, blobUrl },
        })
      );
      return blobUrl;
    }

    // Every candidate failed the resolution gate. Do NOT mark the scan
    // as failed here — the backend proxy path (via cacheImageFromElement)
    // may still cache a perfectly good hi-res icon in IndexedDB. We just
    // couldn't improve upon it, so silently give up without poisoning
    // the marker for the next 7 days.
    return null;
  })();

  pendingScans.set(key, task);
  task.finally(() => pendingScans.delete(key));
  return task;
}

/**
 * Smart favicon URL with multi-level fallback:
 *  1. Chrome built-in _favicon API (optional, from browser's local cache)
 *  2. Backend proxy with IndexedDB caching (if server is configured)
 *  3. Google S2 (external fallback)
 *
 * In extension context we *also* kick off an async `scanBestFavicon` in
 * the background. When it finds a hi-res icon, subscribers of the
 * `useFaviconUrl` hook will receive the updated blob URL and swap
 * their <img> src live.
 *
 * @param urlOrDomain - URL or domain to get favicon for
 * @param sz - icon size in pixels
 * @param preferChromeFavicon - if true, prefer Chrome's _favicon API (low-res but instant).
 *   Suitable for small list items (bookmarks/history search results).
 *   Default false —桌面大图标等场景需要高清图，不走 Chrome 缓存。
 */
export function getSmartFaviconUrl(urlOrDomain: string, sz: number = 64, preferChromeFavicon: boolean = false): string {
  // Kick off background HTML scan — non-blocking.
  if (isExtensionEnv()) {
    // Fire and forget; errors swallowed inside scanBestFavicon.
    void scanBestFavicon(urlOrDomain, sz);
  }

  // Priority 0: LAN / loopback / *.local hosts — the backend and public
  // favicon APIs cannot reach intranet origins, but Chrome's local cache
  // already has the icon whenever the user has visited the page. Try the
  // built-in _favicon API first; it returns an empty string outside the
  // extension context, in which case we fall through to the normal path.
  if (isLocalOrIPTarget(urlOrDomain)) {
    const chromeFavicon = getChromeFaviconUrl(urlOrDomain, sz);
    if (chromeFavicon) {
      return chromeFavicon;
    }
  }

  // Priority 1 (optional): Chrome built-in _favicon API — low-res, suitable for list items
  if (preferChromeFavicon) {
    const chromeFavicon = getChromeFaviconUrl(urlOrDomain, sz);
    if (chromeFavicon) {
      return chromeFavicon;
    }
  }

  // Priority 2: Backend proxy with local caching (high quality)
  const serverUrl = useConfigStore.getState().getEffectiveServerUrl();
  if (serverUrl) {
    return getFaviconUrl(urlOrDomain, sz);
  }

  // Priority 3: Google S2 fallback
  return getGoogleFaviconUrl(urlOrDomain, sz);
}

// ---------------------------------------------------------------------------
// React hook: live-updating favicon URL
// ---------------------------------------------------------------------------

/**
 * React hook that returns a favicon URL and automatically upgrades the
 * returned value when the background scanner discovers a higher-quality
 * image. Drop-in replacement for `getSmartFaviconUrl` call sites that
 * render an <img>.
 *
 * @example
 *   const src = useFaviconUrl(site.url, 64);
 *   return <img src={src} onError={...} />;
 */
export function useFaviconUrl(
  urlOrDomain: string,
  sz: number = 64,
  preferChromeFavicon: boolean = false
): string {
  const [src, setSrc] = useState<string>(() => getSmartFaviconUrl(urlOrDomain, sz, preferChromeFavicon));

  useEffect(() => {
    // Reset whenever the inputs change
    setSrc(getSmartFaviconUrl(urlOrDomain, sz, preferChromeFavicon));

    const domain = urlOrDomain.includes('://') ? extractDomain(urlOrDomain) : urlOrDomain;
    if (!domain) return;
    const key = cacheKey(domain, sz);

    // If the scan has already finished (IDB warm), promote immediately
    const cached = blobURLCache.get(key);
    if (cached) {
      setSrc(cached);
    }

    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<FaviconUpdatedDetail>).detail;
      if (!detail || detail.key !== key) return;
      setSrc(detail.blobUrl);
    };

    faviconEvents.addEventListener('favicon-updated', handler);
    return () => {
      faviconEvents.removeEventListener('favicon-updated', handler);
    };
  }, [urlOrDomain, sz, preferChromeFavicon]);

  return src;
}

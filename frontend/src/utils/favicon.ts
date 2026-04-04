/**
 * Favicon utility — unified favicon URL generation with local IndexedDB caching.
 *
 * Strategy:
 * 1. Check local IndexedDB cache (permanent, never expires).
 * 2. If cache miss, return the backend proxy URL (which handles multi-source
 *    fetching + server-side disk cache).
 * 3. After the image loads successfully, store it in IndexedDB as a Blob URL
 *    so subsequent loads are instant and offline-capable.
 */

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

async function getCachedFavicon(key: string): Promise<Blob | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result instanceof Blob ? req.result : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function setCachedFavicon(key: string, blob: Blob): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Silently fail — caching is best-effort
  }
}

// ---------------------------------------------------------------------------
// In-memory blob URL cache (for the lifetime of the page)
// ---------------------------------------------------------------------------

const blobURLCache = new Map<string, string>();
// Track pending fetches to avoid duplicate requests for the same favicon
const pendingFetches = new Map<string, Promise<string | null>>();

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
 * Extract a clean domain from a URL string.
 */
export function extractDomain(urlStr: string): string {
  try {
    const u = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`);
    return u.hostname;
  } catch {
    return '';
  }
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
      const blobUrl = URL.createObjectURL(dbCached);
      blobURLCache.set(key, blobUrl);
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
 * Cache a successfully loaded <img> element's image into IndexedDB.
 * Call this from an <img> tag's onLoad event to avoid a separate fetch().
 *
 * Usage:
 *   <img src={getSmartFaviconUrl(url, 64)} onLoad={(e) => cacheImageFromElement(e.currentTarget, url, 64)} />
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

  try {
    // Draw image to canvas → export as blob
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || sz;
    canvas.height = img.naturalHeight || sz;
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
 * Smart favicon URL: uses backend proxy if server is configured, falls back to Google S2.
 */
export function getSmartFaviconUrl(urlOrDomain: string, sz: number = 64): string {
  const serverUrl = useConfigStore.getState().getEffectiveServerUrl();

  // If server is configured, use the proxy (with local caching)
  if (serverUrl) {
    return getFaviconUrl(urlOrDomain, sz);
  }

  // Fallback to Google S2 when no server is configured
  return getGoogleFaviconUrl(urlOrDomain, sz);
}

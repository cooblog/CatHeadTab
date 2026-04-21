import { useMemo, type ImgHTMLAttributes } from 'react';
import { cacheImageFromElement, useFaviconUrl } from '../utils/favicon';

/**
 * Props for the FaviconImg component.
 */
export interface FaviconImgProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /** Full URL or bare domain to fetch the favicon for. */
  url: string;
  /** Requested icon size in pixels. Defaults to 64. */
  sz?: number;
  /**
   * When true, prefer Chrome's built-in `_favicon` API as the initial
   * source. Use this for dense lists (bookmarks, history) where instant
   * low-res icons are preferable to a flash of backend-proxied images.
   */
  preferChromeFavicon?: boolean;
  /**
   * When true (default), persist the <img>'s loaded image into IndexedDB
   * via `cacheImageFromElement` on load. This is a fallback cache layer
   * for when the background HTML scanner cannot find a better icon.
   */
  cacheOnLoad?: boolean;
}

/**
 * FaviconImg renders a favicon <img> whose src upgrades automatically
 * when the background HTML scanner discovers a higher-resolution icon
 * for the target site. It is a drop-in replacement for the common
 * pattern:
 *
 *   <img src={getSmartFaviconUrl(url, 64)}
 *        onLoad={(e) => cacheImageFromElement(e.currentTarget, url, 64)}
 *        ... />
 */
export function FaviconImg({
  url,
  sz = 64,
  preferChromeFavicon = false,
  cacheOnLoad = true,
  onLoad,
  ...rest
}: FaviconImgProps) {
  const src = useFaviconUrl(url, sz, preferChromeFavicon);

  // Memoise the onLoad handler so re-renders don't needlessly reattach
  // listeners on <img>.
  const handleLoad = useMemo(() => {
    return (e: React.SyntheticEvent<HTMLImageElement>) => {
      if (cacheOnLoad) {
        // Best-effort: persist the displayed icon to IndexedDB so the
        // next cold-start reload is instant, even if the scanner never
        // runs (e.g. web dev mode without host_permissions).
        void cacheImageFromElement(e.currentTarget, url, sz);
      }
      onLoad?.(e);
    };
  }, [url, sz, cacheOnLoad, onLoad]);

  return <img src={src} onLoad={handleLoad} {...rest} />;
}

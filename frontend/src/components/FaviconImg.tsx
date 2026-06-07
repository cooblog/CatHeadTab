import { useEffect, useMemo, useState, type CSSProperties, type ImgHTMLAttributes } from 'react';
import { cacheImageFromElement, useFaviconUrl } from '../utils/favicon';

export const ICON_FALLBACK_COLORS = [
  '#6d5bd0',
  '#e6793f',
  '#2f9e9e',
  '#2f7ed8',
  '#c94f7c',
  '#3b9d5a',
  '#8a63d2',
  '#d25b5b',
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getInitial(value: string): string {
  const cleaned = value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '');
  const first = Array.from(cleaned)[0];
  return first ? first.toLocaleUpperCase() : '?';
}

function getFallbackBackground(seed: string): string {
  return ICON_FALLBACK_COLORS[hashString(seed || 'fallback') % ICON_FALLBACK_COLORS.length];
}

export function isGeneratedFaviconSource(src: string): boolean {
  return (
    src.startsWith('blob:')
    || /\/_favicon\/|\b_favicon\b|\/api\/v1\/favicon|s2\.googleusercontent\.com\/s2\/favicons/i.test(src)
  );
}

export function getIconCrossOrigin(src: string): 'anonymous' | undefined {
  return isGeneratedFaviconSource(src) && !src.startsWith('blob:') ? 'anonymous' : undefined;
}

export function shouldUseLetterFallback(img: HTMLImageElement): boolean {
  const src = img.currentSrc || img.src || '';
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!src || width <= 1 || height <= 1) return true;

  if (!isGeneratedFaviconSource(src)) return false;

  try {
    const canvas = document.createElement('canvas');
    const sampleSize = 32;
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;

    ctx.clearRect(0, 0, sampleSize, sampleSize);
    ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
    const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);
    const total = sampleSize * sampleSize;
    let opaque = 0;
    let colorful = 0;
    let bright = 0;
    let dark = 0;

    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha < 24) continue;
      opaque += 1;

      const red = data[i];
      const green = data[i + 1];
      const blue = data[i + 2];
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const saturation = max === 0 ? 0 : (max - min) / max;
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

      if (saturation > 0.12) colorful += 1;
      if (luminance > 218) bright += 1;
      if (luminance < 92) dark += 1;
    }

    if (opaque / total < 0.08) return true;
    if (!opaque) return true;

    const colorfulRatio = colorful / opaque;
    const brightRatio = bright / opaque;
    const darkRatio = dark / opaque;

    return colorfulRatio < 0.05 && brightRatio > 0.35 && darkRatio > 0.03 && darkRatio < 0.22;
  } catch {
    return false;
  }
}

export function IconFallback({
  className,
  seed,
  style,
  text,
  title,
  color,
}: {
  className?: string;
  color?: string;
  seed?: string;
  style?: CSSProperties;
  text: string;
  title?: string;
}) {
  const fallbackSeed = seed || text || 'fallback';
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center rounded-[inherit] text-white shadow-lg ${className ?? ''}`}
      style={{
        background: color || getFallbackBackground(fallbackSeed),
        ...style,
      }}
      title={title}
    >
      <span className="font-bold leading-none drop-shadow-sm">{getInitial(text || fallbackSeed)}</span>
    </span>
  );
}

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
  /** Text used for the colored-letter fallback when the favicon is missing. */
  fallbackText?: string;
  /** Stable seed for choosing the fallback background color. */
  fallbackSeed?: string;
  /** Explicit background color for the colored-letter fallback. */
  fallbackColor?: string;
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
  fallbackText,
  fallbackSeed,
  fallbackColor,
  onLoad,
  onError,
  className,
  crossOrigin,
  style,
  ...rest
}: FaviconImgProps) {
  const src = useFaviconUrl(url, sz, preferChromeFavicon);
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    setShowFallback(!src);
  }, [src]);

  // Memoise the onLoad handler so re-renders don't needlessly reattach
  // listeners on <img>.
  const handleLoad = useMemo(() => {
    return (e: React.SyntheticEvent<HTMLImageElement>) => {
      if (fallbackText && shouldUseLetterFallback(e.currentTarget)) {
        setShowFallback(true);
        return;
      }

      if (cacheOnLoad) {
        // Best-effort: persist the displayed icon to IndexedDB so the
        // next cold-start reload is instant, even if the scanner never
        // runs (e.g. web dev mode without host_permissions).
        void cacheImageFromElement(e.currentTarget, url, sz);
      }
      onLoad?.(e);
    };
  }, [url, sz, cacheOnLoad, fallbackText, onLoad]);

  const handleError = useMemo(() => {
    return (e: React.SyntheticEvent<HTMLImageElement>) => {
      if (fallbackText) {
        setShowFallback(true);
      }
      onError?.(e);
    };
  }, [fallbackText, onError]);

  if (fallbackText && showFallback) {
    return (
      <IconFallback
        className={className}
        color={fallbackColor}
        seed={fallbackSeed || url}
        style={style}
        text={fallbackText}
        title={typeof rest.alt === 'string' ? rest.alt : undefined}
      />
    );
  }

  return (
    <img
      src={src}
      onLoad={handleLoad}
      onError={handleError}
      className={className}
      crossOrigin={crossOrigin ?? (fallbackText ? getIconCrossOrigin(src) : undefined)}
      style={style}
      {...rest}
    />
  );
}

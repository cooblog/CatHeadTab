import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useConfigStore } from '../store/configStore';
import { useTranslation } from '../i18n/useTranslation';
import { FaviconImg } from './FaviconImg';

// ── Shared types ─────────────────────────────────────────────────────

type TrendingType = 'github' | 'bilibili' | 'weibo' | 'xiaohongshu' | 'bbc';

interface TrendingRepo {
  fullName: string;
  description: string;
  language: string;
  stars: number;
  todayStars: number;
  url: string;
}

interface HotVideo {
  title: string;
  bvid: string;
  owner: string;
  view: number;
  danmaku: number;
  duration: number;
  cover: string;
  url: string;
}

interface WeiboHotItem {
  title: string;
  url: string;
  hotNum: number;
  tag: string;
  rank: number;
}

interface XiaohongshuHotItem {
  title: string;
  url: string;
  score: string;
  rank: number;
}

interface BBCNewsItem {
  title: string;
  description: string;
  url: string;
  section: string;
  rank: number;
}

type GithubSince = 'daily' | 'weekly' | 'monthly';

interface GithubFilterOption {
  value: string;
  label: string;
}

interface ModalSize {
  width: number;
  height: number;
}

interface ModalPosition {
  left: number;
  top: number;
}

const MODAL_MIN_WIDTH = 420;
const MODAL_MIN_HEIGHT = 360;
const MODAL_VIEWPORT_MARGIN = 48;

const LANG_COLORS: Record<string, string> = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Java: '#b07219',
  Go: '#00ADD8', Rust: '#dea584', C: '#555555', 'C++': '#f34b7d', 'C#': '#178600',
  Ruby: '#701516', Swift: '#F05138', Kotlin: '#A97BFF', Dart: '#00B4AB',
  PHP: '#4F5D95', Lua: '#000080', Shell: '#89e051', Vue: '#41b883', HTML: '#e34c26',
  CSS: '#563d7c', Jupyter: '#DA5B0B', R: '#198CE7', Scala: '#c22d40',
};

const GITHUB_PROGRAMMING_LANGUAGES: GithubFilterOption[] = [
  { value: '', label: 'Any' },
  { value: 'c', label: 'C' },
  { value: 'c++', label: 'C++' },
  { value: 'c#', label: 'C#' },
  { value: 'css', label: 'CSS' },
  { value: 'dart', label: 'Dart' },
  { value: 'go', label: 'Go' },
  { value: 'html', label: 'HTML' },
  { value: 'java', label: 'Java' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'jupyter-notebook', label: 'Jupyter Notebook' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'lua', label: 'Lua' },
  { value: 'php', label: 'PHP' },
  { value: 'python', label: 'Python' },
  { value: 'r', label: 'R' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'rust', label: 'Rust' },
  { value: 'scala', label: 'Scala' },
  { value: 'shell', label: 'Shell' },
  { value: 'swift', label: 'Swift' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'vue', label: 'Vue' },
];

const GITHUB_SPOKEN_LANGUAGES: GithubFilterOption[] = [
  { value: '', label: 'Any' },
  { value: 'en', label: 'English' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'de', label: 'German' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish, Castilian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
  { value: 'ar', label: 'Arabic' },
  { value: 'hi', label: 'Hindi' },
  { value: 'id', label: 'Indonesian' },
  { value: 'it', label: 'Italian' },
  { value: 'nl', label: 'Dutch, Flemish' },
  { value: 'pl', label: 'Polish' },
  { value: 'tr', label: 'Turkish' },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'uk', label: 'Ukrainian' },
  { value: 'sv', label: 'Swedish' },
  { value: 'cs', label: 'Czech' },
  { value: 'da', label: 'Danish' },
  { value: 'fi', label: 'Finnish' },
  { value: 'he', label: 'Hebrew' },
  { value: 'th', label: 'Thai' },
  { value: 'bn', label: 'Bengali' },
  { value: 'ur', label: 'Urdu' },
];

function githubDateRanges(isZh: boolean): GithubFilterOption[] {
  return [
    { value: 'daily', label: isZh ? '今天' : 'Today' },
    { value: 'weekly', label: isZh ? '本周' : 'This week' },
    { value: 'monthly', label: isZh ? '本月' : 'This month' },
  ];
}

const WEIBO_TAG_COLORS: Record<string, string> = {
  '热': '#FF8C00',
  '沸': '#FF4500',
  '爆': '#FF0000',
  '新': '#1890FF',
  '暖': '#FF69B4',
};

function formatStars(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function formatNumber(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function normalizeGithubSince(value: unknown): GithubSince {
  return value === 'weekly' || value === 'monthly' ? value : 'daily';
}

function clampModalSize(size: ModalSize): ModalSize {
  if (typeof window === 'undefined') return size;
  const maxWidth = Math.max(MODAL_MIN_WIDTH, window.innerWidth - MODAL_VIEWPORT_MARGIN);
  const maxHeight = Math.max(MODAL_MIN_HEIGHT, window.innerHeight - MODAL_VIEWPORT_MARGIN);
  return {
    width: Math.min(Math.max(size.width, MODAL_MIN_WIDTH), maxWidth),
    height: Math.min(Math.max(size.height, MODAL_MIN_HEIGHT), maxHeight),
  };
}

function clampModalSizeForPosition(size: ModalSize, position: ModalPosition): ModalSize {
  if (typeof window === 'undefined') return size;
  const edgeGap = MODAL_VIEWPORT_MARGIN / 2;
  const maxWidth = Math.max(MODAL_MIN_WIDTH, window.innerWidth - position.left - edgeGap);
  const maxHeight = Math.max(MODAL_MIN_HEIGHT, window.innerHeight - position.top - edgeGap);
  return {
    width: Math.min(Math.max(size.width, MODAL_MIN_WIDTH), maxWidth),
    height: Math.min(Math.max(size.height, MODAL_MIN_HEIGHT), maxHeight),
  };
}

function clampModalPosition(position: ModalPosition, size: ModalSize): ModalPosition {
  if (typeof window === 'undefined') return position;
  const edgeGap = MODAL_VIEWPORT_MARGIN / 2;
  const maxLeft = Math.max(edgeGap, window.innerWidth - size.width - edgeGap);
  const maxTop = Math.max(edgeGap, window.innerHeight - size.height - edgeGap);
  return {
    left: Math.min(Math.max(position.left, edgeGap), maxLeft),
    top: Math.min(Math.max(position.top, edgeGap), maxTop),
  };
}

function getDefaultModalSize(): ModalSize {
  if (typeof window === 'undefined') {
    return { width: 560, height: 560 };
  }
  const desktop = window.innerWidth >= 768;
  return clampModalSize({
    width: desktop ? 560 : 500,
    height: Math.round(window.innerHeight * (desktop ? 0.7 : 0.75)),
  });
}

function getCenteredModalPosition(size: ModalSize): ModalPosition {
  if (typeof window === 'undefined') return { left: 0, top: 0 };
  return clampModalPosition({
    left: Math.round((window.innerWidth - size.width) / 2),
    top: Math.round((window.innerHeight - size.height) / 2),
  }, size);
}

function applyModalFrame(element: HTMLElement | null, position: ModalPosition, size: ModalSize): void {
  if (!element) return;
  element.style.setProperty('--trending-modal-left', `${position.left}px`);
  element.style.setProperty('--trending-modal-top', `${position.top}px`);
  element.style.setProperty('--trending-modal-width', `${size.width}px`);
  element.style.setProperty('--trending-modal-height', `${size.height}px`);
}

function githubStarsPeriodLabel(since: GithubSince, isZh: boolean): string {
  if (since === 'weekly') return isZh ? '本周' : 'this week';
  if (since === 'monthly') return isZh ? '本月' : 'this month';
  return isZh ? '今天' : 'today';
}

const GithubFilterSelect: React.FC<{
  label: string;
  value: string;
  options: GithubFilterOption[];
  onChange: (value: string) => void;
}> = ({ label, value, options, onChange }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find(option => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex min-w-0 items-center gap-1.5 text-[12px] text-white/55">
      <span className="shrink-0 whitespace-nowrap">{label}:</span>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex max-w-[170px] items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-semibold text-white/80 outline-none transition-colors hover:bg-white/5 hover:text-white focus:bg-white/10 focus:text-white"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selected?.label ?? 'Any'}</span>
        <svg className={`h-3 w-3 shrink-0 text-white/35 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.2 6.3a.75.75 0 0 1 1.06-.02L8 8.88l2.74-2.6a.75.75 0 1 1 1.03 1.09l-3.25 3.08a.75.75 0 0 1-1.03 0L4.24 7.37a.75.75 0 0 1-.03-1.06z" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[120] mt-1 w-max min-w-full max-w-[240px] overflow-hidden rounded-lg border border-white/10 bg-[#0b111d]/95 shadow-[0_18px_45px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="max-h-[260px] overflow-y-auto py-1 wp-scrollbar" role="listbox">
            {options.map(option => {
              const active = option.value === value;
              return (
                <button
                  key={option.value || 'any'}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[12px] transition-colors ${
                    active ? 'bg-[#2563eb]/85 text-white' : 'text-white/65 hover:bg-white/[0.07] hover:text-white'
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                  {active && (
                    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3.5 8.2 6.5 11 12.5 5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/** 根据 type 返回对应的配置（标题、主题色、API endpoint、图标） */
function getModalConfig(type: TrendingType, isZh: boolean) {
  switch (type) {
    case 'github':
      return { title: 'GitHub Trending', accentColor: '#72d565', endpoint: 'github' };
    case 'bilibili':
      return { title: isZh ? '哔哩哔哩热门' : 'Bilibili Hot', accentColor: '#00A1D6', endpoint: 'bilibili' };
    case 'weibo':
      return { title: isZh ? '微博热搜' : 'Weibo Hot', accentColor: '#E6162D', endpoint: 'weibo' };
    case 'xiaohongshu':
      return { title: isZh ? '小红书热搜' : 'Xiaohongshu Hot', accentColor: '#FF2442', endpoint: 'xiaohongshu' };
    case 'bbc':
      return { title: 'BBC News', accentColor: '#BB1919', endpoint: 'bbc' };
  }
}

// ── Modal shell ──────────────────────────────────────────────────────

interface TrendingModalProps {
  type: TrendingType;
  options?: any;
  onClose: () => void;
}

export const TrendingModal: React.FC<TrendingModalProps> = ({ type, options, onClose }) => {
  const { language } = useTranslation();
  const isZh = language === 'zh';
  const serverUrl = useConfigStore(s => s.getEffectiveServerUrl());
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [modalSize, setModalSize] = useState<ModalSize>(() => getDefaultModalSize());
  const [modalPosition, setModalPosition] = useState<ModalPosition>(() => getCenteredModalPosition(modalSize));
  const modalShellRef = useRef<HTMLDivElement>(null);
  const modalSizeRef = useRef<ModalSize>(modalSize);
  const modalPositionRef = useRef<ModalPosition>(modalPosition);
  const [githubLanguage, setGithubLanguage] = useState<string>(options?.language ?? '');
  const [githubSpokenLanguage, setGithubSpokenLanguage] = useState<string>(options?.spokenLanguage ?? options?.spoken_language_code ?? '');
  const [githubSince, setGithubSince] = useState<GithubSince>(() => normalizeGithubSince(options?.since));

  const { title, accentColor, endpoint } = getModalConfig(type, isZh);

  useEffect(() => {
    if (type !== 'github') return;
    setGithubLanguage(options?.language ?? '');
    setGithubSpokenLanguage(options?.spokenLanguage ?? options?.spoken_language_code ?? '');
    setGithubSince(normalizeGithubSince(options?.since));
  }, [type, options?.language, options?.spokenLanguage, options?.spoken_language_code, options?.since]);

  useEffect(() => {
    modalSizeRef.current = modalSize;
    modalPositionRef.current = modalPosition;
    applyModalFrame(modalShellRef.current, modalPosition, modalSize);
  }, [modalPosition, modalSize]);

  const load = useCallback(async () => {
    if (!serverUrl) return;
    setLoading(true);
    try {
      const url = new URL(`${serverUrl}/api/v1/trending/${endpoint}`);
      if (type === 'github') {
        if (githubLanguage) url.searchParams.set('lang', githubLanguage);
        if (githubSpokenLanguage) url.searchParams.set('spoken_language_code', githubSpokenLanguage);
        url.searchParams.set('since', githubSince);
      }
      const resp = await fetch(url.toString());
      if (resp.ok) {
        const json = await resp.json();
        setData(json.data || []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [serverUrl, endpoint, type, githubLanguage, githubSpokenLanguage, githubSince]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const clampOnResize = () => {
      const nextSize = clampModalSize(modalSizeRef.current);
      const nextPosition = clampModalPosition(modalPositionRef.current, nextSize);
      modalSizeRef.current = nextSize;
      modalPositionRef.current = nextPosition;
      applyModalFrame(modalShellRef.current, nextPosition, nextSize);
      setModalPosition(nextPosition);
      setModalSize(nextSize);
    };
    window.addEventListener('resize', clampOnResize);
    return () => window.removeEventListener('resize', clampOnResize);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  useEffect(() => {
    return () => {
      document.body.classList.remove('trending-modal-dragging', 'trending-modal-resizing');
    };
  }, []);

  const handleResizePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (isFullscreen) return;
    e.preventDefault();
    e.stopPropagation();

    const modalElement = modalShellRef.current;
    const startRect = modalElement?.getBoundingClientRect();
    const startPosition = startRect
      ? { left: startRect.left, top: startRect.top }
      : modalPositionRef.current;
    const startSize = startRect
      ? clampModalSize({ width: startRect.width, height: startRect.height })
      : modalSizeRef.current;
    const pointerOffsetX = startRect ? startRect.right - e.clientX : 0;
    const pointerOffsetY = startRect ? startRect.bottom - e.clientY : 0;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    const previousTransitionDuration = modalElement?.style.transitionDuration ?? '';
    let nextSize = startSize;

    modalSizeRef.current = startSize;
    modalPositionRef.current = startPosition;
    applyModalFrame(modalElement, startPosition, startSize);
    setIsResizing(true);
    document.body.classList.add('trending-modal-resizing');
    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';
    if (modalElement) modalElement.style.transitionDuration = '0ms';

    const handleMove = (event: PointerEvent) => {
      nextSize = clampModalSizeForPosition({
        width: event.clientX + pointerOffsetX - startPosition.left,
        height: event.clientY + pointerOffsetY - startPosition.top,
      }, startPosition);
      modalSizeRef.current = nextSize;
      applyModalFrame(modalElement, startPosition, nextSize);
    };

    const stopResize = (event?: PointerEvent) => {
      if (event) {
        nextSize = clampModalSizeForPosition({
          width: event.clientX + pointerOffsetX - startPosition.left,
          height: event.clientY + pointerOffsetY - startPosition.top,
        }, startPosition);
      }
      modalSizeRef.current = nextSize;
      modalPositionRef.current = startPosition;
      applyModalFrame(modalElement, startPosition, nextSize);
      setModalSize(nextSize);
      setModalPosition(startPosition);
      setIsResizing(false);
      document.body.classList.remove('trending-modal-resizing');
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      if (modalElement) modalElement.style.transitionDuration = previousTransitionDuration;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
  }, [isFullscreen]);

  const handleWindowDragPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (isFullscreen || e.button !== 0 || window.innerWidth < 640) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, a, input, textarea, select, [role="button"]')) return;

    e.preventDefault();
    e.stopPropagation();

    const modalElement = modalShellRef.current;
    const startRect = modalElement?.getBoundingClientRect();
    const startSize = startRect
      ? clampModalSize({ width: startRect.width, height: startRect.height })
      : modalSizeRef.current;
    const startPosition = startRect
      ? { left: startRect.left, top: startRect.top }
      : modalPositionRef.current;
    const pointerOffsetX = e.clientX - startPosition.left;
    const pointerOffsetY = e.clientY - startPosition.top;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    const previousTransitionDuration = modalElement?.style.transitionDuration ?? '';
    let nextPosition = startPosition;

    modalSizeRef.current = startSize;
    modalPositionRef.current = startPosition;
    applyModalFrame(modalElement, startPosition, startSize);
    setIsDragging(true);
    document.body.classList.add('trending-modal-dragging');
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'none';
    if (modalElement) modalElement.style.transitionDuration = '0ms';

    const handleMove = (event: PointerEvent) => {
      nextPosition = clampModalPosition({
        left: event.clientX - pointerOffsetX,
        top: event.clientY - pointerOffsetY,
      }, startSize);
      modalPositionRef.current = nextPosition;
      applyModalFrame(modalElement, nextPosition, startSize);
    };

    const stopDrag = (event?: PointerEvent) => {
      if (event) {
        nextPosition = clampModalPosition({
          left: event.clientX - pointerOffsetX,
          top: event.clientY - pointerOffsetY,
        }, startSize);
      }
      modalPositionRef.current = nextPosition;
      modalSizeRef.current = startSize;
      applyModalFrame(modalElement, nextPosition, startSize);
      setModalPosition(nextPosition);
      setModalSize(startSize);
      setIsDragging(false);
      document.body.classList.remove('trending-modal-dragging');
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      if (modalElement) modalElement.style.transitionDuration = previousTransitionDuration;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', stopDrag);
      window.removeEventListener('pointercancel', stopDrag);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);
  }, [isFullscreen]);

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center pointer-events-none ${isFullscreen ? 'p-0' : 'p-0 sm:p-6 md:p-12'}`}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px] pointer-events-auto animate-fadeIn" onClick={onClose} />

      {/* Window */}
      <div
        ref={modalShellRef}
        className={`relative bg-black/30 backdrop-blur-xl border-0 sm:border border-white/10 rounded-none sm:rounded-[1.5rem] md:rounded-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.55)] flex flex-col pointer-events-auto animate-scaleIn overflow-hidden transition-all ${isResizing || isDragging ? 'duration-0' : 'duration-300'} ${
          isFullscreen
            ? 'w-full h-full !rounded-none !border-0'
            : 'w-full h-full sm:fixed sm:left-[var(--trending-modal-left)] sm:top-[var(--trending-modal-top)] sm:w-[var(--trending-modal-width)] sm:h-[var(--trending-modal-height)] sm:max-w-[calc(100vw-3rem)] sm:max-h-[calc(100vh-3rem)]'
        }`}
        style={!isFullscreen ? ({
          '--trending-modal-left': `${modalPositionRef.current.left}px`,
          '--trending-modal-top': `${modalPositionRef.current.top}px`,
          '--trending-modal-width': `${modalSizeRef.current.width}px`,
          '--trending-modal-height': `${modalSizeRef.current.height}px`,
        } as React.CSSProperties) : undefined}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          onPointerDown={handleWindowDragPointerDown}
          className={`h-12 md:h-14 border-b border-white/10 flex items-center px-3 md:px-5 shrink-0 bg-white/[0.02] select-none ${!isFullscreen ? 'sm:cursor-default' : ''}`}
        >
          {/* Mac traffic lights (desktop) */}
          <div className="flex items-center gap-2 w-auto md:w-20">
            <div className="hidden md:flex gap-2.5">
              <button onClick={onClose} className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
                <svg className="w-2 h-2 text-red-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
              <button className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] hover:bg-[#ffbd2e]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
                <svg className="w-2 h-2 text-yellow-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14"/></svg>
              </button>
              <button onClick={() => setIsFullscreen(f => !f)} className="w-3.5 h-3.5 rounded-full bg-[#27c93f] hover:bg-[#27c93f]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
                {isFullscreen ? (
                  <svg className="w-2 h-2 text-green-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></svg>
                ) : (
                  <svg className="w-2 h-2 text-green-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
                )}
              </button>
            </div>
          </div>

          {/* Center title */}
          <div className="flex-1 flex items-center justify-center gap-2">
            {type === 'github' && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white" fillOpacity="0.7">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
            )}
            {type === 'bilibili' && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 01-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 01.16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906l-1.174 1.12zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.764-.28-1.396-.786-1.894a2.619 2.619 0 00-1.88-.773H5.333zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373z" fill="#00A1D6"/>
              </svg>
            )}
            {type === 'weibo' && (
              <FaviconImg
                url="weibo.com"
                sz={64}
                alt="Weibo"
                width={18}
                height={18}
                className="rounded"
              />
            )}
            {type === 'xiaohongshu' && (
              <span className="text-[16px]">📕</span>
            )}
            {type === 'bbc' && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <rect x="1" y="4" width="22" height="16" rx="2" fill="#BB1919"/>
                <text x="12" y="15" textAnchor="middle" fontSize="8" fontWeight="bold" fill="white" fontFamily="Arial,sans-serif">BBC</text>
              </svg>
            )}
            <span className="text-[13px] font-semibold text-white/70">{title}</span>
          </div>

          {/* Right: refresh + close (mobile) */}
          <div className="flex items-center w-auto md:w-20 justify-end gap-1">
            <button onClick={load} disabled={loading} className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? 'animate-spin' : ''}>
                <path d="M21 12a9 9 0 11-6.22-8.56" strokeLinecap="round"/>
              </svg>
            </button>
            <button onClick={onClose} className="md:hidden w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </div>

        {type === 'github' && (
          <div className="shrink-0 border-b border-white/10 bg-white/[0.02] px-3 py-2.5 sm:px-5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
              <GithubFilterSelect
                label={isZh ? '自然语言' : 'Spoken Language'}
                value={githubSpokenLanguage}
                options={GITHUB_SPOKEN_LANGUAGES.map((option, index) => index === 0 ? { ...option, label: isZh ? '任意' : 'Any' } : option)}
                onChange={setGithubSpokenLanguage}
              />
              <GithubFilterSelect
                label={isZh ? '编程语言' : 'Language'}
                value={githubLanguage}
                options={GITHUB_PROGRAMMING_LANGUAGES.map((option, index) => index === 0 ? { ...option, label: isZh ? '任意' : 'Any' } : option)}
                onChange={setGithubLanguage}
              />
              <GithubFilterSelect
                label={isZh ? '日期范围' : 'Date range'}
                value={githubSince}
                options={githubDateRanges(isZh)}
                onChange={(value) => setGithubSince(normalizeGithubSince(value))}
              />
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto wp-scrollbar px-2 sm:px-3 py-3 select-text">
          {loading && data.length === 0 && (
            <div className="h-full flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="animate-spin opacity-30">
                <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83"/>
              </svg>
            </div>
          )}

          {/* GitHub list */}
          {type === 'github' && (data as TrendingRepo[]).map((repo, i) => (
            <a
              key={repo.fullName}
              href={repo.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/[0.06] transition-colors group cursor-pointer"
            >
              <span className={`shrink-0 w-5 text-[11px] text-right mt-0.5 font-mono ${i < 3 ? 'font-bold' : 'text-white/25'}`} style={i < 3 ? { color: accentColor } : {}}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <span className="text-[13px] font-medium text-white/85 group-hover:text-[#72d565] transition-colors">{repo.fullName}</span>
                {repo.description && (
                  <p className="text-[12px] text-white/40 leading-snug mt-0.5 line-clamp-2">{repo.description}</p>
                )}
                <div className="flex items-center gap-3 mt-1">
                  {repo.language && (
                    <span className="flex items-center gap-1 text-[11px] text-white/35">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: LANG_COLORS[repo.language] || '#888' }} />
                      {repo.language}
                    </span>
                  )}
                  <span className="text-[11px] text-white/35">★ {formatStars(repo.stars)}</span>
                  {repo.todayStars > 0 && (
                    <span className="text-[11px] text-[#72d565]/70">+{repo.todayStars} {githubStarsPeriodLabel(githubSince, isZh)}</span>
                  )}
                </div>
              </div>
            </a>
          ))}

          {/* Bilibili list */}
          {type === 'bilibili' && (data as HotVideo[]).map((video, i) => (
            <a
              key={video.bvid}
              href={video.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/[0.06] transition-colors group cursor-pointer"
            >
              <span className={`shrink-0 w-5 text-[11px] text-right mt-0.5 font-mono ${i < 3 ? 'font-bold' : 'text-white/25'}`} style={i < 3 ? { color: accentColor } : {}}>{i + 1}</span>
              {/* 封面图 */}
              {video.cover && (
                <div className="shrink-0 w-[96px] h-[60px] rounded-lg overflow-hidden bg-white/5 mt-0.5">
                  <img
                    src={video.cover.replace('http://', 'https://')}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-white/85 group-hover:text-[#00A1D6] transition-colors line-clamp-2 leading-snug">{video.title}</p>
                <div className="flex items-center gap-2.5 mt-1">
                  <span className="text-[11px] text-white/35 truncate max-w-[120px]">{video.owner}</span>
                  <span className="text-[11px] text-white/30 flex items-center gap-0.5">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    {formatNumber(video.view)}
                  </span>
                  <span className="text-[11px] text-white/30">{formatDuration(video.duration)}</span>
                </div>
              </div>
            </a>
          ))}

          {/* Weibo list */}
          {type === 'weibo' && (data as WeiboHotItem[]).map((item, i) => (
            <a
              key={`${item.rank}-${item.title}`}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-2 px-3 py-2.5 rounded-xl hover:bg-white/[0.06] transition-colors group cursor-pointer"
            >
              <span className={`shrink-0 w-4 text-[11px] text-right mt-0.5 font-mono ${i < 3 ? 'font-bold' : 'text-white/25'}`} style={i < 3 ? { color: accentColor } : {}}>{item.rank}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[13px] font-medium text-white/85 group-hover:text-[#FF9AB2] transition-colors line-clamp-1 leading-snug">{item.title}</p>
                  {item.tag && (
                    <span
                      className="shrink-0 text-[9px] px-1 py-0.5 rounded font-bold leading-none"
                      style={{ color: WEIBO_TAG_COLORS[item.tag] || '#888', backgroundColor: `${WEIBO_TAG_COLORS[item.tag] || '#888'}20` }}
                    >
                      {item.tag}
                    </span>
                  )}
                </div>
                {item.hotNum > 0 && (
                  <span className="text-[11px] text-white/30 mt-0.5 block">{formatNumber(item.hotNum)}</span>
                )}
              </div>
            </a>
          ))}

          {/* Xiaohongshu list */}
          {type === 'xiaohongshu' && (data as XiaohongshuHotItem[]).map((item, i) => (
            <a
              key={`${item.rank}-${item.title}`}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/[0.06] transition-colors group cursor-pointer"
            >
              <span className={`shrink-0 w-5 text-[11px] text-right mt-0.5 font-mono ${i < 3 ? 'font-bold' : 'text-white/25'}`} style={i < 3 ? { color: accentColor } : {}}>{item.rank}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-white/85 group-hover:text-[#FF2442] transition-colors line-clamp-2 leading-snug">{item.title}</p>
                {item.score && (
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-white/30">🔥 {item.score}</span>
                  </div>
                )}
              </div>
            </a>
          ))}

          {/* BBC News list */}
          {type === 'bbc' && (data as BBCNewsItem[]).map((item, i) => (
            <a
              key={`${item.rank}-${item.title}`}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/[0.06] transition-colors group cursor-pointer"
            >
              <span className={`shrink-0 w-5 text-[11px] text-right mt-0.5 font-mono ${i < 3 ? 'font-bold' : 'text-white/25'}`} style={i < 3 ? { color: accentColor } : {}}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-white/85 group-hover:text-[#BB1919] transition-colors line-clamp-2 leading-snug">{item.title}</p>
                {item.description && (
                  <p className="text-[12px] text-white/35 line-clamp-2 mt-0.5 leading-snug">{item.description}</p>
                )}
                {item.section && (
                  <span className="text-[10px] text-white/25 mt-0.5 block">{item.section}</span>
                )}
              </div>
            </a>
          ))}
        </div>

        {!isFullscreen && (
          <button
            type="button"
            onPointerDown={handleResizePointerDown}
            className="hidden sm:flex absolute bottom-0 right-0 z-30 h-10 w-10 cursor-nwse-resize items-end justify-end bg-transparent p-2 text-white/25 transition-colors hover:bg-transparent hover:text-white/60 focus:outline-none focus-visible:outline-none"
            style={{ cursor: 'nwse-resize' }}
            title={isZh ? '拖动调整大小' : 'Drag to resize'}
            aria-label={isZh ? '拖动调整大小' : 'Drag to resize'}
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M14 6 6 14" />
              <path d="M14 10 10 14" />
              <path d="M14 2 2 14" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

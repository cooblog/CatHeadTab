import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from '../i18n/useTranslation';
import { isAIConfigured, hasAIAccess, getAIMode } from '../ai/provider';
import { runAgent } from '../ai/agent';
import type { AgentMessage } from '../ai/agent';
import { customStorage, useConfigStore } from '../store/configStore';
import { useLayoutStore } from '../store/layoutStore';
import { CatHeadIcon } from './CatHeadIcon';

const CHAT_STORAGE_KEY = 'catheadtab-ai-chat';

interface AiModalSize {
  width: number;
  height: number;
}

interface AiModalPosition {
  left: number;
  top: number;
}

const AI_MODAL_MIN_WIDTH = 420;
const AI_MODAL_MIN_HEIGHT = 360;
const AI_MODAL_VIEWPORT_MARGIN = 48;

function clampAiModalSize(size: AiModalSize): AiModalSize {
  if (typeof window === 'undefined') return size;
  const maxWidth = Math.max(AI_MODAL_MIN_WIDTH, window.innerWidth - AI_MODAL_VIEWPORT_MARGIN);
  const maxHeight = Math.max(AI_MODAL_MIN_HEIGHT, window.innerHeight - AI_MODAL_VIEWPORT_MARGIN);
  return {
    width: Math.min(Math.max(size.width, AI_MODAL_MIN_WIDTH), maxWidth),
    height: Math.min(Math.max(size.height, AI_MODAL_MIN_HEIGHT), maxHeight),
  };
}

function clampAiModalSizeForPosition(size: AiModalSize, position: AiModalPosition): AiModalSize {
  if (typeof window === 'undefined') return size;
  const edgeGap = AI_MODAL_VIEWPORT_MARGIN / 2;
  const maxWidth = Math.max(AI_MODAL_MIN_WIDTH, window.innerWidth - position.left - edgeGap);
  const maxHeight = Math.max(AI_MODAL_MIN_HEIGHT, window.innerHeight - position.top - edgeGap);
  return {
    width: Math.min(Math.max(size.width, AI_MODAL_MIN_WIDTH), maxWidth),
    height: Math.min(Math.max(size.height, AI_MODAL_MIN_HEIGHT), maxHeight),
  };
}

function clampAiModalPosition(position: AiModalPosition, size: AiModalSize): AiModalPosition {
  if (typeof window === 'undefined') return position;
  const edgeGap = AI_MODAL_VIEWPORT_MARGIN / 2;
  const maxLeft = Math.max(edgeGap, window.innerWidth - size.width - edgeGap);
  const maxTop = Math.max(edgeGap, window.innerHeight - size.height - edgeGap);
  return {
    left: Math.min(Math.max(position.left, edgeGap), maxLeft),
    top: Math.min(Math.max(position.top, edgeGap), maxTop),
  };
}

function getDefaultAiModalSize(): AiModalSize {
  if (typeof window === 'undefined') return { width: 540, height: 560 };
  const desktop = window.innerWidth >= 768;
  return clampAiModalSize({
    width: desktop ? 540 : 480,
    height: Math.round(window.innerHeight * (desktop ? 0.7 : 0.75)),
  });
}

function getCenteredAiModalPosition(size: AiModalSize): AiModalPosition {
  if (typeof window === 'undefined') return { left: 0, top: 0 };
  return clampAiModalPosition({
    left: Math.round((window.innerWidth - size.width) / 2),
    top: Math.round((window.innerHeight - size.height) / 2),
  }, size);
}

function applyAiModalFrame(element: HTMLElement | null, position: AiModalPosition, size: AiModalSize): void {
  if (!element) return;
  element.style.setProperty('--ai-agent-modal-left', `${position.left}px`);
  element.style.setProperty('--ai-agent-modal-top', `${position.top}px`);
  element.style.setProperty('--ai-agent-modal-width', `${size.width}px`);
  element.style.setProperty('--ai-agent-modal-height', `${size.height}px`);
}

async function loadChatHistory(): Promise<AgentMessage[]> {
  try {
    const raw = await customStorage.getItem(CHAT_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

async function saveChatHistory(messages: AgentMessage[]) {
  const trimmed = messages.slice(-50);
  await customStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(trimmed));
}

// ─── Markdown-lite renderer ───────────────────────────────────────────
// Handles: **bold**, *italic*, `code`, ```codeblock```, - list, [link](url)

interface ParsedBlock {
  type: 'think' | 'text';
  content: string;
}

function parseThinkBlocks(raw: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  let remaining = raw;
  const openTag = '<think>';
  const closeTag = '</think>';

  while (remaining.length > 0) {
    const openIdx = remaining.indexOf(openTag);
    if (openIdx === -1) {
      if (remaining.trim()) blocks.push({ type: 'text', content: remaining });
      break;
    }
    // Text before <think>
    if (openIdx > 0) {
      const before = remaining.substring(0, openIdx);
      if (before.trim()) blocks.push({ type: 'text', content: before });
    }
    const closeIdx = remaining.indexOf(closeTag, openIdx);
    if (closeIdx === -1) {
      // Unclosed think block (still streaming)
      blocks.push({ type: 'think', content: remaining.substring(openIdx + openTag.length) });
      break;
    }
    blocks.push({ type: 'think', content: remaining.substring(openIdx + openTag.length, closeIdx) });
    remaining = remaining.substring(closeIdx + closeTag.length);
  }
  return blocks;
}

// ─── Markdown custom components for styling ──────────────────────────
const mdComponents = {
  p: ({ children }: any) => <p className="mb-1 last:mb-0">{children}</p>,
  strong: ({ children }: any) => <strong className="font-semibold text-white/90">{children}</strong>,
  em: ({ children }: any) => <em className="italic text-white/75">{children}</em>,
  code: ({ className, children, ...props }: any) => {
    // Inline code vs code block
    const isBlock = className?.includes('language-');
    if (isBlock) {
      return <code className="text-[12px] font-mono text-white/70" {...props}>{children}</code>;
    }
    return <code className="px-1.5 py-0.5 rounded bg-white/[0.08] text-[12px] font-mono text-[#72d565]/80">{children}</code>;
  },
  pre: ({ children }: any) => (
    <pre className="my-2 px-3 py-2 rounded-lg bg-black/30 border border-white/[0.08] overflow-x-auto text-[12px] leading-relaxed whitespace-pre-wrap">{children}</pre>
  ),
  ul: ({ children }: any) => <ul className="space-y-0.5 ml-1 my-1">{children}</ul>,
  ol: ({ children }: any) => <ol className="space-y-0.5 ml-1 my-1 list-decimal list-inside marker:text-white/30">{children}</ol>,
  li: ({ children, ordered }: any) => ordered
    ? <li className="text-white/70">{children}</li>
    : <li className="flex gap-1.5"><span className="text-white/30 mt-0.5 shrink-0">•</span><span className="flex-1">{children}</span></li>,
  del: ({ children }: any) => <del className="text-white/40 line-through">{children}</del>,
  h1: ({ children }: any) => <h1 className="text-[15px] font-bold text-white/85 mt-2 mb-1">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-[14px] font-semibold text-white/85 mt-2 mb-1">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-[13px] font-semibold text-white/85 mt-1 mb-0.5">{children}</h3>,
  a: ({ href, children }: any) => <a href={href} target="_blank" rel="noreferrer" className="text-[#72d565]/80 hover:text-[#72d565] underline underline-offset-2">{children}</a>,
  blockquote: ({ children }: any) => <blockquote className="border-l-2 border-white/10 pl-3 text-white/50 italic my-1">{children}</blockquote>,
  hr: () => <hr className="border-white/[0.08] my-2" />,
  table: ({ children }: any) => <div className="overflow-x-auto my-2"><table className="text-[12px] border-collapse w-full">{children}</table></div>,
  th: ({ children }: any) => <th className="border border-white/10 px-2 py-1 bg-white/[0.04] text-left font-semibold text-white/60">{children}</th>,
  td: ({ children }: any) => <td className="border border-white/10 px-2 py-1 text-white/50">{children}</td>,
};

// ─── Think Block Component ────────────────────────────────────────────

const ThinkBlock: React.FC<{ content: string; isStreaming: boolean; isZh: boolean }> = ({ content, isStreaming, isZh }) => {
  const [expanded, setExpanded] = useState(false);

  // Auto-collapse when streaming finishes
  useEffect(() => {
    if (!isStreaming) setExpanded(false);
  }, [isStreaming]);

  // Auto-expand while streaming
  const isOpen = isStreaming || expanded;

  return (
    <div className="my-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-white/30 hover:text-white/50 transition-colors"
      >
        {isStreaming ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin shrink-0">
            <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83"/>
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}>
            <path d="M9 18l6-6-6-6"/>
          </svg>
        )}
        <span className="font-medium">{isStreaming ? (isZh ? '思考中...' : 'Thinking...') : (isZh ? '思考过程' : 'Thinking')}</span>
        {!isStreaming && <span className="text-white/15 ml-auto">{isOpen ? '▲' : '▼'}</span>}
      </button>
      {isOpen && (
        <div className="px-3 pb-2.5 text-[12px] leading-relaxed text-white/30 border-t border-white/[0.04] pt-2 max-h-40 overflow-y-auto wp-scrollbar whitespace-pre-wrap">
          {content.trim() || (isZh ? '...' : '...')}
        </div>
      )}
    </div>
  );
};

// ─── Message Bubble ───────────────────────────────────────────────────

const MessageBubble: React.FC<{ msg: AgentMessage; isStreaming: boolean; isZh: boolean }> = React.memo(({ msg, isStreaming, isZh }) => {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] sm:max-w-[80%] rounded-2xl rounded-br-lg px-4 py-2.5 text-[13px] leading-relaxed break-words bg-white/[0.08] text-white/85">
          {msg.content}
        </div>
      </div>
    );
  }

  // Assistant message
  const isError = !!msg.isError;
  const isEmpty = !msg.content;

  if (isError) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] sm:max-w-[80%] rounded-2xl rounded-bl-lg px-4 py-2.5 text-[13px] leading-relaxed break-words bg-red-500/10 border border-red-400/20 text-red-300/80">
          {msg.content}
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex justify-start">
        <div className="rounded-2xl rounded-bl-lg px-4 py-3 bg-white/[0.04] border border-white/[0.06]">
          <span className="inline-flex items-center gap-1.5 text-white/30">
            <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" />
            <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" style={{ animationDelay: '0.15s' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" style={{ animationDelay: '0.3s' }} />
          </span>
        </div>
      </div>
    );
  }

  // Parse think blocks
  const blocks = parseThinkBlocks(msg.content);

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] sm:max-w-[80%] rounded-2xl rounded-bl-lg px-4 py-2.5 text-[13px] leading-relaxed break-words bg-white/[0.04] border border-white/[0.06] text-white/70 space-y-1">
        {blocks.map((block, i) => {
          if (block.type === 'think') {
            return <ThinkBlock key={i} content={block.content} isStreaming={isStreaming && i === blocks.length - 1} isZh={isZh} />;
          }
          return <Markdown key={i} remarkPlugins={[remarkGfm]} components={mdComponents}>{block.content}</Markdown>;
        })}
        {/* Streaming cursor */}
        {isStreaming && msg.content && !msg.content.endsWith('\n') && (
          <span className="inline-block w-[2px] h-[14px] bg-[#72d565]/60 animate-pulse ml-0.5 align-middle" />
        )}
      </div>
    </div>
  );
});

// ─── Main Component ───────────────────────────────────────────────────

interface AiAgentModalProps {
  onClose: () => void;
}

export const AiAgentModal: React.FC<AiAgentModalProps> = ({ onClose }) => {
  const { language } = useTranslation();
  const isZh = language === 'zh';
  const activeModel = useConfigStore(s => {
    const mode = getAIMode();
    if (mode === 'server') return s.serverAIConfig?.model || 'Server AI';
    const cfg = s.aiProviderConfigs[s.aiActiveProvider];
    return cfg?.model || '';
  });
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [modalSize, setModalSize] = useState<AiModalSize>(() => getDefaultAiModalSize());
  const [modalPosition, setModalPosition] = useState<AiModalPosition>(() => getCenteredAiModalPosition(modalSize));
  const modalShellRef = useRef<HTMLDivElement>(null);
  const modalSizeRef = useRef<AiModalSize>(modalSize);
  const modalPositionRef = useRef<AiModalPosition>(modalPosition);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const configured = isAIConfigured();
  const proAccess = hasAIAccess();
  const aiMode = getAIMode();

  // Load saved chat history on mount
  useEffect(() => {
    loadChatHistory().then(saved => {
      if (saved.length > 0) setMessages(saved);
      setLoaded(true);
    });
  }, []);

  // Auto-save whenever messages change
  useEffect(() => {
    if (loaded && messages.length > 0) saveChatHistory(messages);
  }, [messages, loaded]);

  useEffect(() => {
    modalSizeRef.current = modalSize;
    modalPositionRef.current = modalPosition;
    applyAiModalFrame(modalShellRef.current, modalPosition, modalSize);
  }, [modalPosition, modalSize]);

  useEffect(() => {
    const clampOnResize = () => {
      const nextSize = clampAiModalSize(modalSizeRef.current);
      const nextPosition = clampAiModalPosition(modalPositionRef.current, nextSize);
      modalSizeRef.current = nextSize;
      modalPositionRef.current = nextPosition;
      applyAiModalFrame(modalShellRef.current, nextPosition, nextSize);
      setModalPosition(nextPosition);
      setModalSize(nextSize);
    };
    window.addEventListener('resize', clampOnResize);
    return () => window.removeEventListener('resize', clampOnResize);
  }, []);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Smooth scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: streaming ? 'instant' : 'smooth' });
    }
  }, [messages, streaming]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  useEffect(() => {
    return () => {
      document.body.classList.remove('ai-agent-modal-dragging', 'ai-agent-modal-resizing');
    };
  }, []);

  // Auto-resize textarea
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    if (inputRef.current) { inputRef.current.style.height = 'auto'; }
    const userMsg: AgentMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);
    try {
      let out = '';
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
      for await (const chunk of runAgent(text, [...messages, userMsg])) {
        out += chunk;
        setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: out }]);
      }
      if (!out) setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: isZh ? '✅ 操作已完成。' : '✅ Done.' }]);
    } catch (err: any) {
      const errMsg = err?.message || 'Unknown error';
      let displayMsg = errMsg;
      try {
        const parsed = JSON.parse(errMsg);
        if (parsed?.error?.message) displayMsg = parsed.error.message;
      } catch { /* not JSON */ }
      setMessages(prev => {
        const filtered = prev.filter(m => m.content !== '');
        return [...filtered, { role: 'assistant', content: `❌ ${isZh ? '出错了' : 'Error'}: ${displayMsg}`, isError: true }];
      });
    } finally { setStreaming(false); }
  }, [input, streaming, messages, isZh]);

  const hints = useMemo(() => isZh
    ? ['整理我的桌面', '搜索书签 React', '添加 GitHub 到桌面', '最近浏览了什么']
    : ['Organize my desktop', 'Search bookmarks React', 'Add GitHub to desktop', 'Recent history'],
  [isZh]);

  const handleClear = useCallback(() => {
    setMessages([]);
    customStorage.removeItem(CHAT_STORAGE_KEY);
  }, []);

  const handleWindowDragPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (isFullscreen || e.button !== 0 || window.innerWidth < 640) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, a, input, textarea, select, [role="button"]')) return;

    e.preventDefault();
    e.stopPropagation();

    const modalElement = modalShellRef.current;
    const startRect = modalElement?.getBoundingClientRect();
    const startSize = startRect
      ? clampAiModalSize({ width: startRect.width, height: startRect.height })
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
    applyAiModalFrame(modalElement, startPosition, startSize);
    setIsDragging(true);
    document.body.classList.add('ai-agent-modal-dragging');
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'none';
    if (modalElement) modalElement.style.transitionDuration = '0ms';

    const handleMove = (event: PointerEvent) => {
      nextPosition = clampAiModalPosition({
        left: event.clientX - pointerOffsetX,
        top: event.clientY - pointerOffsetY,
      }, startSize);
      modalPositionRef.current = nextPosition;
      applyAiModalFrame(modalElement, nextPosition, startSize);
    };

    const stopDrag = (event?: PointerEvent) => {
      if (event) {
        nextPosition = clampAiModalPosition({
          left: event.clientX - pointerOffsetX,
          top: event.clientY - pointerOffsetY,
        }, startSize);
      }
      modalPositionRef.current = nextPosition;
      modalSizeRef.current = startSize;
      applyAiModalFrame(modalElement, nextPosition, startSize);
      setModalPosition(nextPosition);
      setModalSize(startSize);
      setIsDragging(false);
      document.body.classList.remove('ai-agent-modal-dragging');
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
      ? clampAiModalSize({ width: startRect.width, height: startRect.height })
      : modalSizeRef.current;
    const pointerOffsetX = startRect ? startRect.right - e.clientX : 0;
    const pointerOffsetY = startRect ? startRect.bottom - e.clientY : 0;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    const previousTransitionDuration = modalElement?.style.transitionDuration ?? '';
    let nextSize = startSize;

    modalSizeRef.current = startSize;
    modalPositionRef.current = startPosition;
    applyAiModalFrame(modalElement, startPosition, startSize);
    setIsResizing(true);
    document.body.classList.add('ai-agent-modal-resizing');
    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';
    if (modalElement) modalElement.style.transitionDuration = '0ms';

    const handleMove = (event: PointerEvent) => {
      nextSize = clampAiModalSizeForPosition({
        width: event.clientX + pointerOffsetX - startPosition.left,
        height: event.clientY + pointerOffsetY - startPosition.top,
      }, startPosition);
      modalSizeRef.current = nextSize;
      applyAiModalFrame(modalElement, startPosition, nextSize);
    };

    const stopResize = (event?: PointerEvent) => {
      if (event) {
        nextSize = clampAiModalSizeForPosition({
          width: event.clientX + pointerOffsetX - startPosition.left,
          height: event.clientY + pointerOffsetY - startPosition.top,
        }, startPosition);
      }
      modalSizeRef.current = nextSize;
      modalPositionRef.current = startPosition;
      applyAiModalFrame(modalElement, startPosition, nextSize);
      setModalSize(nextSize);
      setModalPosition(startPosition);
      setIsResizing(false);
      document.body.classList.remove('ai-agent-modal-resizing');
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

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center pointer-events-none ${isFullscreen ? 'p-0' : 'p-0 sm:p-6 md:p-12'}`}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px] pointer-events-auto animate-fadeIn" onClick={onClose} />

      {/* Window */}
      <div
        ref={modalShellRef}
        className={`relative bg-black/30 backdrop-blur-xl border-0 sm:border border-white/10 rounded-none sm:rounded-[1.5rem] md:rounded-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.55)] flex flex-col pointer-events-auto animate-scaleIn overflow-hidden transition-all ${isDragging || isResizing ? 'duration-0' : 'duration-300'} ${
          isFullscreen
            ? 'w-full h-full !rounded-none !border-0'
            : 'w-full h-full sm:fixed sm:left-[var(--ai-agent-modal-left)] sm:top-[var(--ai-agent-modal-top)] sm:w-[var(--ai-agent-modal-width)] sm:h-[var(--ai-agent-modal-height)] sm:max-w-[calc(100vw-3rem)] sm:max-h-[calc(100vh-3rem)]'
        }`}
        style={!isFullscreen ? ({
          '--ai-agent-modal-left': `${modalPositionRef.current.left}px`,
          '--ai-agent-modal-top': `${modalPositionRef.current.top}px`,
          '--ai-agent-modal-width': `${modalSizeRef.current.width}px`,
          '--ai-agent-modal-height': `${modalSizeRef.current.height}px`,
        } as React.CSSProperties) : undefined}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
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
            <CatHeadIcon alt="" className="w-6 h-6 rounded-lg bg-black/25" />
            <span className="text-[13px] font-semibold text-white/70">AI {isZh ? '助手' : 'Agent'}</span>
            {activeModel && <span className="text-[11px] text-white/25 font-mono">{activeModel}</span>}
          </div>

          {/* Right: rollback + clear + close */}
          <div className="flex items-center w-auto md:w-28 justify-end gap-1">
            {useLayoutStore.getState().canRollback && (
              <button
                onClick={() => {
                  const ok = useLayoutStore.getState().rollbackLayout();
                  if (ok) {
                    const msg = isZh ? '✅ 布局已回滚到上一步' : '✅ Layout rolled back';
                    setMessages(prev => [...prev, { role: 'assistant', content: msg }]);
                  }
                }}
                className="hidden md:block px-2.5 py-1 rounded-lg text-[11px] text-amber-400/60 hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
                title={isZh ? '回滚布局' : 'Undo layout change'}
              >
                {isZh ? '回滚' : 'Undo'}
              </button>
            )}
            {messages.length > 0 && (
              <button onClick={handleClear} className="hidden md:block px-2.5 py-1 rounded-lg text-[11px] text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors">
                {isZh ? '清空' : 'Clear'}
              </button>
            )}
            <button onClick={onClose} className="md:hidden w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        {!proAccess ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #8b5cf6 50%, #ec4899 100%)', opacity: 0.6 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <div className="space-y-1.5">
              <p className="text-[15px] font-semibold text-white/70">{isZh ? 'Pro 专属功能' : 'Pro Feature'}</p>
              <p className="text-[13px] text-white/35 leading-relaxed">
                {isZh ? 'AI 助手是 Pro 会员专属功能，升级后即可使用智能桌面管家。' : 'AI Agent is a Pro-exclusive feature. Upgrade to unlock the smart desktop assistant.'}
              </p>
            </div>
          </div>
        ) : !configured ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <span className="text-4xl">🔑</span>
            <div className="space-y-2">
              <p className="text-[13px] text-white/50 leading-relaxed">
                {isZh ? '请先在设置 → AI 助手中配置 API Key' : 'Configure API Key in Settings → AI Agent first'}
              </p>
              <div className="flex flex-col gap-1.5 mt-3 px-4">
                <div className="flex items-start gap-2 text-[11px] text-white/25">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  <span>{isZh ? 'API Key 仅保存在浏览器本地；使用本地 AI 时只会直接发送给你配置的 AI 服务商用于鉴权' : 'API keys are stored locally; local AI sends them directly to your configured AI provider for authentication'}</span>
                </div>
                <div className="flex items-start gap-2 text-[11px] text-white/25">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                  <span>{isZh ? 'AI 完全在浏览器本地运行，直接调用你配置的 LLM API' : 'AI runs entirely in your browser, calling the LLM API you configured directly'}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-3 wp-scrollbar select-text">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center gap-4">
                  <CatHeadIcon alt="" className="w-14 h-14 rounded-2xl bg-white/[0.04] opacity-45" />
                  <p className="text-[12px] text-white/20">{isZh ? '试试这些指令' : 'Try these commands'}</p>
                  <div className="flex flex-wrap justify-center gap-2 px-4">
                    {hints.map(h => (
                      <button
                        key={h}
                        onClick={() => { setInput(h); inputRef.current?.focus(); }}
                        className="px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-white/35 hover:text-white/60 text-[12px] transition-all"
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-white/15 mt-2 flex items-center gap-1.5">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    {aiMode === 'server'
                      ? (isZh ? '服务端 AI 模式 · 不读取浏览器书签或历史记录' : 'Server AI mode · browser bookmarks and history stay unavailable')
                      : (isZh ? '本地 AI 模式 · 直连你配置的 AI 服务商' : 'Local AI mode · calls your configured AI provider directly')}
                  </p>
                </div>
              )}
              {messages.map((msg, i) => (
                <MessageBubble
                  key={i}
                  msg={msg}
                  isStreaming={streaming && i === messages.length - 1 && msg.role === 'assistant'}
                  isZh={isZh}
                />
              ))}
            </div>

            {/* Mobile clear */}
            {messages.length > 0 && (
              <div className="md:hidden flex justify-center pb-1">
                <button onClick={handleClear} className="px-3 py-1 rounded-lg text-[11px] text-white/25 hover:text-white/50 hover:bg-white/5 transition-colors">
                  {isZh ? '清空对话' : 'Clear chat'}
                </button>
              </div>
            )}

            {/* ── Input Area ── */}
            <div className="shrink-0 px-3 sm:px-4 pb-3 sm:pb-4 pt-2">
              {/* Streaming indicator */}
              {streaming && (
                <div className="flex items-center gap-2 px-1 pb-2">
                  <div className="flex gap-1">
                    <span className="w-1 h-1 rounded-full bg-[#72d565]/50 animate-pulse" />
                    <span className="w-1 h-1 rounded-full bg-[#72d565]/50 animate-pulse" style={{ animationDelay: '0.2s' }} />
                    <span className="w-1 h-1 rounded-full bg-[#72d565]/50 animate-pulse" style={{ animationDelay: '0.4s' }} />
                  </div>
                  <span className="text-[11px] text-white/25">{isZh ? 'AI 正在回复...' : 'AI is responding...'}</span>
                </div>
              )}
              <div className="flex items-center gap-2 bg-white/[0.05] hover:bg-white/[0.07] border border-white/[0.08] rounded-2xl px-4 py-2.5 transition-all focus-within:border-white/[0.15]">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder={isZh ? '告诉 AI 你想做什么...（Shift+Enter 换行）' : 'Tell AI what you want... (Shift+Enter for newline)'}
                  disabled={streaming}
                  rows={1}
                  className="flex-1 bg-transparent text-[14px] text-white/85 placeholder:text-white/20 outline-none min-w-0 resize-none no-scrollbar leading-[1.4] max-h-[120px] py-0.5"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || streaming}
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-[#72d565]/70 hover:bg-[#72d565] disabled:opacity-20 transition-all mb-0.5"
                >
                  {streaming ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="black" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20V4M5 11l7-7 7 7"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </>
        )}

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

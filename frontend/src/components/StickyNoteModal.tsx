import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import {
  STICKY_NOTE_CONTENT_MAX_LENGTH,
  clampStickyNoteContent,
  countTextCharacters,
  useLayoutStore,
} from '../store/layoutStore';
import type { StickyNoteWidgetConfig, DesktopItem } from '../store/layoutStore';
import { getDefaultFloatingWindowSize, useFloatingWindow } from '../hooks/useFloatingWindow';

interface StickyNoteModalProps {
  onClose: () => void;
  item: DesktopItem;
}

/** Available note color presets. */
const NOTE_COLORS = [
  { key: 'yellow', color: '#F9E547', bg: '#FFF9C4' },
  { key: 'pink', color: '#F48FB1', bg: '#FCE4EC' },
  { key: 'green', color: '#81C784', bg: '#E8F5E9' },
  { key: 'blue', color: '#64B5F6', bg: '#E3F2FD' },
  { key: 'purple', color: '#BA68C8', bg: '#F3E5F5' },
  { key: 'orange', color: '#FFB74D', bg: '#FFF3E0' },
] as const;

type NoteColor = typeof NOTE_COLORS[number]['key'];

/** Full color config for the modal UI. */
const COLOR_STYLES: Record<string, {
  bg: string;
  headerBg: string;
  textColor: string;
  placeholderColor: string;
  lineColor: string;
  toolbarBg: string;
}> = {
  yellow: {
    bg: '#FFF9C4',
    headerBg: '#F9E547',
    textColor: '#5D4E37',
    placeholderColor: '#B8A66A',
    lineColor: 'rgba(200,180,80,0.2)',
    toolbarBg: '#FFF59D',
  },
  pink: {
    bg: '#FCE4EC',
    headerBg: '#F48FB1',
    textColor: '#6D3B4F',
    placeholderColor: '#C77D97',
    lineColor: 'rgba(200,100,130,0.15)',
    toolbarBg: '#F8BBD0',
  },
  green: {
    bg: '#E8F5E9',
    headerBg: '#81C784',
    textColor: '#3E5F3E',
    placeholderColor: '#7BAF7B',
    lineColor: 'rgba(100,160,100,0.15)',
    toolbarBg: '#C8E6C9',
  },
  blue: {
    bg: '#E3F2FD',
    headerBg: '#64B5F6',
    textColor: '#37586E',
    placeholderColor: '#7BAAC8',
    lineColor: 'rgba(80,140,200,0.15)',
    toolbarBg: '#BBDEFB',
  },
  purple: {
    bg: '#F3E5F5',
    headerBg: '#BA68C8',
    textColor: '#5A3D6A',
    placeholderColor: '#A07AB0',
    lineColor: 'rgba(150,100,170,0.15)',
    toolbarBg: '#E1BEE7',
  },
  orange: {
    bg: '#FFF3E0',
    headerBg: '#FFB74D',
    textColor: '#6D4C2F',
    placeholderColor: '#C89A5E',
    lineColor: 'rgba(200,150,70,0.15)',
    toolbarBg: '#FFE0B2',
  },
};

/** macOS/iPadOS-style sticky note editor modal. */
export const StickyNoteModal: React.FC<StickyNoteModalProps> = ({ onClose, item }) => {
  const { t } = useTranslation();
  const updateWidgetConfig = useLayoutStore(s => s.updateWidgetConfig);
  const floatingWindow = useFloatingWindow({
    defaultSize: () => getDefaultFloatingWindowSize(520, 0.7),
    minHeight: 420,
    minWidth: 420,
  });

  const noteConfig = item.widgetConfig as StickyNoteWidgetConfig | undefined;
  const [content, setContent] = useState(() => clampStickyNoteContent(noteConfig?.content || ''));
  const [selectedColor, setSelectedColor] = useState<NoteColor>(noteConfig?.color || 'yellow');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const styles = COLOR_STYLES[selectedColor] || COLOR_STYLES.yellow;

  // Auto-focus textarea
  useEffect(() => {
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 300);
  }, []);

  // Auto-save on change with debounce
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveNote = useCallback((newContent: string, newColor: NoteColor) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    const safeContent = clampStickyNoteContent(newContent);
    saveTimeoutRef.current = setTimeout(() => {
      updateWidgetConfig(item.id, {
        widgetType: 'stickyNote',
        content: safeContent,
        color: newColor,
      });
    }, 400);
  }, [item.id, updateWidgetConfig]);

  // Save before closing
  const handleClose = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    const safeContent = clampStickyNoteContent(content);
    updateWidgetConfig(item.id, {
      widgetType: 'stickyNote',
      content: safeContent,
      color: selectedColor,
    });
    onClose();
  };

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = clampStickyNoteContent(e.target.value);
    setContent(newContent);
    saveNote(newContent, selectedColor);
  };

  const handleColorChange = (color: NoteColor) => {
    setSelectedColor(color);
    setShowColorPicker(false);
    saveNote(content, color);
  };

  // Character count
  const charCount = countTextCharacters(content);
  const lineCount = content.split('\n').length;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none p-0 sm:p-6 md:p-12"
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      {/* Dimmed Background */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px] pointer-events-auto transition-opacity animate-fadeIn"
        onClick={handleClose}
      />

      {/* Note Window */}
      <div
        ref={floatingWindow.shellRef}
        className={`relative backdrop-blur-xl border-0 sm:border border-black/10 rounded-none sm:rounded-[1.5rem] md:rounded-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.35)] flex flex-col pointer-events-auto transform animate-scaleIn overflow-hidden transition-all ${floatingWindow.isInteracting ? 'duration-0' : 'duration-300'} select-none w-full h-full sm:fixed sm:left-[var(--floating-window-left)] sm:top-[var(--floating-window-top)] sm:w-[var(--floating-window-width)] sm:h-[var(--floating-window-height)] sm:max-w-[calc(100vw-3rem)] sm:max-h-[calc(100vh-3rem)]`}
        style={{ ...floatingWindow.style, background: styles.bg }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          onPointerDown={floatingWindow.handleDragPointerDown}
          className="h-12 md:h-14 flex items-center px-3 md:px-5 shrink-0 select-none sm:cursor-default"
          style={{
            background: styles.headerBg,
            borderBottom: `1px solid rgba(0,0,0,0.08)`,
          }}
        >
          {/* Left: Mac traffic lights on desktop */}
          <div className="flex items-center gap-2 w-auto md:w-20">
            <div className="hidden md:flex gap-2.5">
              <button
                onClick={handleClose}
                className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default"
              >
                <svg className="w-2 h-2 text-red-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
              <div className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] border border-black/20" />
              <div className="w-3.5 h-3.5 rounded-full bg-[#27c93f] border border-black/20" />
            </div>
          </div>

          {/* Center title */}
          <div className="flex-1 flex justify-center">
            <span
              className="text-[13px] font-semibold leading-none"
              style={{ color: 'rgba(0,0,0,0.5)' }}
            >
              {t('widget.stickyNote')}
            </span>
          </div>

          {/* Right: color picker toggle + mobile close */}
          <div className="flex items-center w-auto md:w-20 justify-end gap-2">
            {/* Color picker button */}
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-black/10"
              title={t('widget.stickyNoteColor')}
            >
              <div
                className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
                style={{ background: NOTE_COLORS.find(c => c.key === selectedColor)?.color }}
              />
            </button>

            {/* Mobile close */}
            <button
              onClick={handleClose}
              className="md:hidden w-8 h-8 rounded-lg bg-black/10 flex items-center justify-center transition-colors"
              style={{ color: 'rgba(0,0,0,0.5)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Color picker dropdown */}
        {showColorPicker && (
          <div
            className="shrink-0 flex items-center justify-center gap-3 py-3 px-4"
            style={{
              background: styles.toolbarBg,
              borderBottom: `1px solid rgba(0,0,0,0.06)`,
            }}
          >
            {NOTE_COLORS.map((c) => (
              <button
                key={c.key}
                onClick={() => handleColorChange(c.key)}
                className="relative w-8 h-8 rounded-full transition-transform hover:scale-110"
                style={{
                  background: c.color,
                  boxShadow: selectedColor === c.key
                    ? `0 0 0 3px ${c.bg}, 0 0 0 5px ${c.color}`
                    : '0 1px 3px rgba(0,0,0,0.2)',
                }}
              >
                {selectedColor === c.key && (
                  <svg
                    className="absolute inset-0 m-auto"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgba(0,0,0,0.5)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Text area — ruled paper style */}
        <div className="flex-1 relative overflow-hidden min-h-0">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleContentChange}
            maxLength={STICKY_NOTE_CONTENT_MAX_LENGTH}
            placeholder={t('widget.stickyNotePlaceholder')}
            className="absolute inset-0 w-full h-full resize-none border-0 outline-none p-4 leading-[28px]"
            style={{
              background: 'transparent',
              color: styles.textColor,
              fontSize: 15,
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "PingFang SC", sans-serif',
              backgroundImage: `repeating-linear-gradient(transparent, transparent 27px, ${styles.lineColor} 27px, ${styles.lineColor} 28px)`,
              backgroundPositionY: 15,
              caretColor: styles.textColor,
            }}
            spellCheck={false}
          />
        </div>

        {/* Bottom status bar */}
        <div
          className="shrink-0 flex items-center justify-between px-4 py-2"
          style={{
            background: styles.toolbarBg,
            borderTop: `1px solid rgba(0,0,0,0.06)`,
          }}
        >
          <span
            className="text-[11px]"
            style={{ color: 'rgba(0,0,0,0.35)' }}
          >
            {charCount}/{STICKY_NOTE_CONTENT_MAX_LENGTH} {t('widget.stickyNoteChars')} / {lineCount} {t('widget.stickyNoteLines')}
          </span>
          <span
            className="text-[11px]"
            style={{ color: 'rgba(0,0,0,0.25)' }}
          >
            {t('widget.stickyNoteAutoSave')}
          </span>
        </div>
        {floatingWindow.resizeHandle}
      </div>
    </div>
  );
};

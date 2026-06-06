import React from 'react';
import type { WidgetSize } from '../../store/layoutStore';
import type { StickyNoteWidgetConfig } from '../../store/layoutStore';

interface StickyNoteWidgetProps {
  size: WidgetSize;
  config?: StickyNoteWidgetConfig;
}

/** Color presets with a translucent glass tint for desktop widgets. */
const COLOR_PRESETS: Record<string, { bg: string; headerBg: string; lineColor: string; textColor: string; titleColor: string; headerTextColor: string; dotColor: string }> = {
  yellow: {
    bg: 'linear-gradient(180deg, rgba(255,249,196,0.22) 0%, rgba(255,245,157,0.09) 100%)',
    headerBg: 'rgba(249,229,71,0.24)',
    lineColor: 'rgba(255,255,255,0.16)',
    textColor: 'rgba(255,255,255,0.84)',
    titleColor: 'rgba(255,255,255,0.68)',
    headerTextColor: 'rgba(255,255,255,0.82)',
    dotColor: 'rgba(255,255,255,0.22)',
  },
  pink: {
    bg: 'linear-gradient(180deg, rgba(252,228,236,0.22) 0%, rgba(248,187,208,0.09) 100%)',
    headerBg: 'rgba(244,143,177,0.24)',
    lineColor: 'rgba(255,255,255,0.16)',
    textColor: 'rgba(255,255,255,0.84)',
    titleColor: 'rgba(255,255,255,0.68)',
    headerTextColor: 'rgba(255,255,255,0.82)',
    dotColor: 'rgba(255,255,255,0.22)',
  },
  green: {
    bg: 'linear-gradient(180deg, rgba(232,245,233,0.22) 0%, rgba(200,230,201,0.09) 100%)',
    headerBg: 'rgba(129,199,132,0.24)',
    lineColor: 'rgba(255,255,255,0.16)',
    textColor: 'rgba(255,255,255,0.84)',
    titleColor: 'rgba(255,255,255,0.68)',
    headerTextColor: 'rgba(255,255,255,0.82)',
    dotColor: 'rgba(255,255,255,0.22)',
  },
  blue: {
    bg: 'linear-gradient(180deg, rgba(227,242,253,0.22) 0%, rgba(187,222,251,0.09) 100%)',
    headerBg: 'rgba(100,181,246,0.24)',
    lineColor: 'rgba(255,255,255,0.16)',
    textColor: 'rgba(255,255,255,0.84)',
    titleColor: 'rgba(255,255,255,0.68)',
    headerTextColor: 'rgba(255,255,255,0.82)',
    dotColor: 'rgba(255,255,255,0.22)',
  },
  purple: {
    bg: 'linear-gradient(180deg, rgba(243,229,245,0.22) 0%, rgba(225,190,231,0.09) 100%)',
    headerBg: 'rgba(186,104,200,0.24)',
    lineColor: 'rgba(255,255,255,0.16)',
    textColor: 'rgba(255,255,255,0.84)',
    titleColor: 'rgba(255,255,255,0.68)',
    headerTextColor: 'rgba(255,255,255,0.82)',
    dotColor: 'rgba(255,255,255,0.22)',
  },
  orange: {
    bg: 'linear-gradient(180deg, rgba(255,243,224,0.22) 0%, rgba(255,224,178,0.09) 100%)',
    headerBg: 'rgba(255,183,77,0.24)',
    lineColor: 'rgba(255,255,255,0.16)',
    textColor: 'rgba(255,255,255,0.84)',
    titleColor: 'rgba(255,255,255,0.68)',
    headerTextColor: 'rgba(255,255,255,0.82)',
    dotColor: 'rgba(255,255,255,0.22)',
  },
};

const noteGlassStyle = (preset: typeof COLOR_PRESETS.yellow): React.CSSProperties => ({
  background: preset.bg,
  borderRadius: 'inherit',
  backgroundClip: 'padding-box',
  isolation: 'isolate',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16), inset 0 -1px 0 rgba(255,255,255,0.06)',
});

/** iOS/iPadOS-style sticky note widget for the desktop grid. */
export const StickyNoteWidget: React.FC<StickyNoteWidgetProps> = ({ size, config }) => {
  const color = config?.color || 'yellow';
  const content = config?.content || '';
  const preset = COLOR_PRESETS[color] || COLOR_PRESETS.yellow;

  // Split into lines for the ruled-paper effect
  const lines = content.split('\n');
  const maxLines = size === 'small' ? 3 : 8;
  const displayLines = lines.slice(0, maxLines);
  const hasMore = lines.length > maxLines;

  if (size === 'small') {
    // 1×2 horizontal bar layout
    return (
      <div
        className="w-full h-full flex flex-col overflow-hidden cursor-pointer select-none"
        style={noteGlassStyle(preset)}
      >
        {/* Tiny colored header strip */}
        <div
          className="shrink-0 flex items-center px-3"
          style={{ height: 26, background: preset.headerBg }}
        >
          <span
            className="text-[11px] font-bold tracking-wide leading-none"
            style={{ color: preset.headerTextColor, textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}
          >
            📝 Note
          </span>
        </div>

        {/* Content area */}
        <div className="flex-1 px-3 py-1.5 overflow-hidden relative">
          {content ? (
            <div className="flex flex-col" style={{ gap: '1px' }}>
              {displayLines.map((line, i) => (
                <div
                  key={i}
                  className="truncate"
                  style={{
                    fontSize: 12,
                    lineHeight: '18px',
                    color: preset.textColor,
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "PingFang SC", sans-serif',
                  }}
                >
                  {line || '\u00A0'}
                </div>
              ))}
              {hasMore && (
                <span style={{ fontSize: 10, color: preset.titleColor }}>···</span>
              )}
            </div>
          ) : (
            <span
              style={{
                fontSize: 12,
                color: preset.titleColor,
                opacity: 0.6,
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
              }}
            >
              Tap to write...
            </span>
          )}
        </div>
      </div>
    );
  }

  // Medium (2×2) — Apple Notes style note card
  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden cursor-pointer select-none"
      style={noteGlassStyle(preset)}
    >
      {/* Header bar */}
      <div
        className="shrink-0 flex items-center justify-between px-4"
        style={{ height: 32, background: preset.headerBg }}
      >
        <span
          className="text-[12px] font-bold tracking-wide leading-none"
          style={{ color: preset.headerTextColor, textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}
        >
          📝 Note
        </span>
        <div className="flex items-center gap-1">
          <div
            className="rounded-full"
            style={{
              width: 8,
              height: 8,
              background: preset.dotColor,
            }}
          />
        </div>
      </div>

      {/* Ruled paper content area */}
      <div className="flex-1 px-4 pt-2 pb-2 overflow-hidden relative">
        <div className="flex flex-col" style={{ gap: 0 }}>
          {content ? (
            displayLines.map((line, i) => (
              <div
                key={i}
                className="relative"
                style={{
                  fontSize: 13,
                  lineHeight: '22px',
                  color: preset.textColor,
                  borderBottom: `1px solid ${preset.lineColor}`,
                  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "PingFang SC", sans-serif',
                }}
              >
                <span className="block truncate">{line || '\u00A0'}</span>
              </div>
            ))
          ) : (
            Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                style={{
                  height: 22,
                  borderBottom: `1px solid ${preset.lineColor}`,
                }}
              >
                {i === 0 && (
                  <span
                    style={{
                      fontSize: 13,
                      color: preset.titleColor,
                      opacity: 0.5,
                      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
                    }}
                  >
                    Tap to write...
                  </span>
                )}
              </div>
            ))
          )}
          {hasMore && (
            <span
              className="mt-0.5"
              style={{ fontSize: 11, color: preset.titleColor, opacity: 0.7 }}
            >
              ···
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

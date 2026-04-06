import React from 'react';
import type { WidgetSize } from '../../store/layoutStore';
import type { StickyNoteWidgetConfig } from '../../store/layoutStore';

interface StickyNoteWidgetProps {
  size: WidgetSize;
  config?: StickyNoteWidgetConfig;
}

/** Color presets matching Apple Notes / iOS sticky note feel. */
const COLOR_PRESETS: Record<string, { bg: string; headerBg: string; lineColor: string; textColor: string; titleColor: string }> = {
  yellow: {
    bg: 'linear-gradient(180deg, #FFF9C4 0%, #FFF59D 100%)',
    headerBg: '#F9E547',
    lineColor: 'rgba(200,180,80,0.25)',
    textColor: '#5D4E37',
    titleColor: '#8B7355',
  },
  pink: {
    bg: 'linear-gradient(180deg, #FCE4EC 0%, #F8BBD0 100%)',
    headerBg: '#F48FB1',
    lineColor: 'rgba(200,100,130,0.2)',
    textColor: '#6D3B4F',
    titleColor: '#AD5D7A',
  },
  green: {
    bg: 'linear-gradient(180deg, #E8F5E9 0%, #C8E6C9 100%)',
    headerBg: '#81C784',
    lineColor: 'rgba(100,160,100,0.2)',
    textColor: '#3E5F3E',
    titleColor: '#5A8A5A',
  },
  blue: {
    bg: 'linear-gradient(180deg, #E3F2FD 0%, #BBDEFB 100%)',
    headerBg: '#64B5F6',
    lineColor: 'rgba(80,140,200,0.2)',
    textColor: '#37586E',
    titleColor: '#5B8DB8',
  },
  purple: {
    bg: 'linear-gradient(180deg, #F3E5F5 0%, #E1BEE7 100%)',
    headerBg: '#BA68C8',
    lineColor: 'rgba(150,100,170,0.2)',
    textColor: '#5A3D6A',
    titleColor: '#8E5FA0',
  },
  orange: {
    bg: 'linear-gradient(180deg, #FFF3E0 0%, #FFE0B2 100%)',
    headerBg: '#FFB74D',
    lineColor: 'rgba(200,150,70,0.2)',
    textColor: '#6D4C2F',
    titleColor: '#B87A3D',
  },
};

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
        style={{ background: preset.bg, borderRadius: 'inherit' }}
      >
        {/* Tiny colored header strip */}
        <div
          className="shrink-0 flex items-center px-3"
          style={{ height: 26, background: preset.headerBg }}
        >
          <span
            className="text-[11px] font-bold tracking-wide leading-none"
            style={{ color: 'rgba(0,0,0,0.5)' }}
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
      style={{ background: preset.bg, borderRadius: 'inherit' }}
    >
      {/* Header bar */}
      <div
        className="shrink-0 flex items-center justify-between px-4"
        style={{ height: 32, background: preset.headerBg }}
      >
        <span
          className="text-[12px] font-bold tracking-wide leading-none"
          style={{ color: 'rgba(0,0,0,0.5)' }}
        >
          📝 Note
        </span>
        <div className="flex items-center gap-1">
          <div
            className="rounded-full"
            style={{
              width: 8,
              height: 8,
              background: 'rgba(0,0,0,0.12)',
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

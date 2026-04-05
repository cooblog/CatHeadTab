import React from 'react';
import type { DesktopItem, WidgetSize, WeatherWidgetConfig, CountdownWidgetConfig } from '../../store/layoutStore';
import { WIDGET_SIZE_MAP } from '../../store/layoutStore';
import { CalendarWidget } from './CalendarWidget';
import { WeatherWidget } from './WeatherWidget';
import { CountdownWidget } from './CountdownWidget';
import { SystemMonitorWidget } from './SystemMonitorWidget';
import { ClockWidget } from './ClockWidget';

interface DesktopWidgetProps {
  item: DesktopItem;
  isOverlay?: boolean;
}

/** Returns the CSS grid-column and grid-row span values for a widget size. */
export function getWidgetGridStyle(size: WidgetSize): React.CSSProperties {
  const { cols, rows } = WIDGET_SIZE_MAP[size];
  return {
    gridColumn: `span ${cols}`,
    gridRow: `span ${rows}`,
  };
}

/** Renders the widget card with glass styling and appropriate content. */
export const DesktopWidget: React.FC<DesktopWidgetProps> = ({ item, isOverlay }) => {
  const renderWidget = () => {
    const size = item.widgetSize || 'small';
    switch (item.widgetType) {
      case 'calendar':
        return <CalendarWidget size={size} />;
      case 'weather':
        return <WeatherWidget size={size} config={item.widgetConfig as WeatherWidgetConfig} />;
      case 'countdown':
        return <CountdownWidget size={size} config={item.widgetConfig as CountdownWidgetConfig} />;
      case 'systemMonitor':
        return <SystemMonitorWidget size={size} />;
      case 'clock':
        return <ClockWidget size={size} />;
      default:
        return (
          <div className="w-full h-full flex items-center justify-center text-white/40 text-xs">
            Unknown Widget
          </div>
        );
    }
  };

  return (
    <div
      className={`widget-container relative w-full h-full overflow-hidden rounded-[20px] border border-white/[0.15] shadow-[0_4px_24px_rgba(0,0,0,0.3)] ${
        isOverlay ? 'shadow-[0_16px_50px_rgba(0,0,0,0.5)] scale-[1.02]' : ''
      }`}
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.08) 50%, rgba(0,0,0,0.2) 100%)',
      }}
    >
      {renderWidget()}
    </div>
  );
};

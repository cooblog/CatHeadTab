import React, { useState } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import type { TranslationKeys } from '../i18n/useTranslation';
import type { WidgetType, WidgetSize, WidgetConfig } from '../store/layoutStore';
import { useLayoutStore, WIDGET_SIZE_MAP } from '../store/layoutStore';
import { CalendarWidget } from './widgets/CalendarWidget';
import { WeatherWidget } from './widgets/WeatherWidget';
import { CountdownWidget } from './widgets/CountdownWidget';

interface AddWidgetModalProps {
  onClose: () => void;
  pageIndex?: number;
}

interface WidgetOption {
  type: WidgetType;
  icon: string;
  labelKey: TranslationKeys;
  descKey: TranslationKeys;
  sizes: WidgetSize[];
}

const WIDGET_OPTIONS: WidgetOption[] = [
  {
    type: 'calendar',
    icon: '📅',
    labelKey: 'widget.calendar',
    descKey: 'widget.calendarDesc',
    sizes: ['small', 'medium'],
  },
  {
    type: 'weather',
    icon: '🌤️',
    labelKey: 'widget.weather',
    descKey: 'widget.weatherDesc',
    sizes: ['small', 'medium'],
  },
  {
    type: 'countdown',
    icon: '⏱️',
    labelKey: 'widget.countdown',
    descKey: 'widget.countdownDesc',
    sizes: ['small', 'medium'],
  },
];

export const AddWidgetModal: React.FC<AddWidgetModalProps> = ({ onClose, pageIndex }) => {
  const { t, language } = useTranslation();
  const isZh = language === 'zh';
  const addWidget = useLayoutStore(s => s.addWidget);

  const [selectedType, setSelectedType] = useState<WidgetType | null>(null);
  const [selectedSize, setSelectedSize] = useState<WidgetSize>('medium');

  // Countdown config
  const [eventName, setEventName] = useState('');
  const [targetDate, setTargetDate] = useState('');
  // Weather config
  const [weatherCity, setWeatherCity] = useState('');
  const [weatherUnit, setWeatherUnit] = useState<'C' | 'F'>('C');

  const selectedOption = WIDGET_OPTIONS.find(w => w.type === selectedType);

  const handleAdd = () => {
    if (!selectedType) return;

    let config: WidgetConfig;
    switch (selectedType) {
      case 'calendar':
        config = { widgetType: 'calendar' };
        break;
      case 'weather':
        config = {
          widgetType: 'weather',
          city: weatherCity || undefined,
          unit: weatherUnit,
        };
        break;
      case 'countdown':
        if (!targetDate) return;
        config = {
          widgetType: 'countdown',
          targetDate,
          eventName: eventName || (isZh ? '未命名事件' : 'Unnamed Event'),
        };
        break;
      default:
        return;
    }

    addWidget(selectedType, selectedSize, config, pageIndex);
    onClose();
  };

  const sizeLabel = (s: WidgetSize) => {
    const { cols, rows } = WIDGET_SIZE_MAP[s];
    const nameMap: Record<WidgetSize, { en: string; zh: string }> = {
      small: { en: 'Small', zh: '小' },
      medium: { en: 'Medium', zh: '中' },
    };
    const name = isZh ? nameMap[s].zh : nameMap[s].en;
    return `${name} (${rows}×${cols})`;
  };

  // Preview widget dimensions (scaled down)
  const previewScale = 0.65;
  const previewDims = (() => {
    const { cols, rows } = WIDGET_SIZE_MAP[selectedSize];
    // Cell=80, Gap=20 (preview approximation)
    const cell = 56;
    const gap = 8;
    return {
      width: cols * cell + (cols - 1) * gap,
      height: rows * cell + (rows - 1) * gap,
    };
  })();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-lg animate-fadeIn" onClick={onClose}>
      <div
        className="w-full max-w-md mx-4 bg-[#1a1c1e]/90 backdrop-blur-3xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">
            {selectedType ? t(selectedOption!.labelKey) : t('widget.addWidget')}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 hover:text-white transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {!selectedType ? (
          /* Step 1: Choose widget type */
          <div className="px-6 pb-6 space-y-3">
            <p className="text-[13px] text-white/50 mb-4">{t('widget.chooseType')}</p>
            {WIDGET_OPTIONS.map((opt) => (
              <button
                key={opt.type}
                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.1] hover:border-white/20 transition-colors text-left group"
                onClick={() => setSelectedType(opt.type)}
              >
                <span className="text-3xl">{opt.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold text-white group-hover:text-white">{t(opt.labelKey)}</div>
                  <div className="text-[12px] text-white/50">{t(opt.descKey)}</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/30 group-hover:text-white/60 transition-colors shrink-0"><path d="m9 18 6-6-6-6"/></svg>
              </button>
            ))}
          </div>
        ) : (
          /* Step 2: Configure widget */
          <div className="px-6 pb-6 space-y-4">
            <button
              onClick={() => setSelectedType(null)}
              className="flex items-center gap-1.5 text-[12px] text-white/50 hover:text-white/80 transition-colors mb-2"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
              {t('widget.backToList')}
            </button>

            {/* Size selector */}
            <div>
              <label className="text-[12px] text-white/50 uppercase tracking-wider mb-2 block">{t('widget.size')}</label>
              <div className="flex gap-2">
                {(selectedOption?.sizes || []).map((s) => (
                  <button
                    key={s}
                    className={`flex-1 py-2.5 rounded-xl text-[12px] font-medium transition-colors ${
                      selectedSize === s
                        ? 'bg-white/20 text-white border border-white/30'
                        : 'bg-white/[0.05] text-white/60 border border-white/[0.08] hover:bg-white/10'
                    }`}
                    onClick={() => setSelectedSize(s)}
                  >
                    {sizeLabel(s)}
                  </button>
                ))}
              </div>
            </div>

            {/* Type-specific config */}
            {selectedType === 'countdown' && (
              <div className="space-y-3">
                <div>
                  <label className="text-[12px] text-white/50 uppercase tracking-wider mb-1.5 block">{t('widget.eventName')}</label>
                  <input
                    type="text"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    placeholder={isZh ? '例如：生日' : 'e.g. Birthday'}
                    className="glass-input text-[13px]"
                  />
                </div>
                <div>
                  <label className="text-[12px] text-white/50 uppercase tracking-wider mb-1.5 block">{t('widget.targetDate')}</label>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="glass-input text-[13px]"
                  />
                </div>
              </div>
            )}

            {selectedType === 'weather' && (
              <div className="space-y-3">
                <div>
                  <label className="text-[12px] text-white/50 uppercase tracking-wider mb-1.5 block">{t('widget.city')}</label>
                  <input
                    type="text"
                    value={weatherCity}
                    onChange={(e) => setWeatherCity(e.target.value)}
                    placeholder={isZh ? '留空则自动定位' : 'Leave empty for auto-detect'}
                    className="glass-input text-[13px]"
                  />
                </div>
                <div>
                  <label className="text-[12px] text-white/50 uppercase tracking-wider mb-1.5 block">{t('widget.unit')}</label>
                  <div className="flex gap-2">
                    {(['C', 'F'] as const).map((u) => (
                      <button
                        key={u}
                        className={`flex-1 py-2 rounded-xl text-[12px] font-medium transition-colors ${
                          weatherUnit === u
                            ? 'bg-white/20 text-white border border-white/30'
                            : 'bg-white/[0.05] text-white/60 border border-white/[0.08] hover:bg-white/10'
                        }`}
                        onClick={() => setWeatherUnit(u)}
                      >
                        °{u} {u === 'C' ? (isZh ? '摄氏度' : 'Celsius') : (isZh ? '华氏度' : 'Fahrenheit')}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Preview */}
            <div>
              <label className="text-[12px] text-white/50 uppercase tracking-wider mb-2 block">{t('widget.preview')}</label>
              <div className="flex justify-center py-3">
                <div
                  className="rounded-[16px] bg-white/[0.08] backdrop-blur-2xl border border-white/[0.15] shadow-lg overflow-hidden"
                  style={{
                    width: previewDims.width * previewScale,
                    height: previewDims.height * previewScale,
                    transform: `scale(${previewScale})`,
                    transformOrigin: 'center center',
                  }}
                >
                  <div style={{ width: previewDims.width, height: previewDims.height, transform: `scale(${1 / previewScale})`, transformOrigin: 'top left' }}>
                    {selectedType === 'calendar' && <CalendarWidget size={selectedSize} />}
                    {selectedType === 'weather' && <WeatherWidget size={selectedSize} config={{ widgetType: 'weather', city: weatherCity || undefined, unit: weatherUnit }} />}
                    {selectedType === 'countdown' && <CountdownWidget size={selectedSize} config={{ widgetType: 'countdown', targetDate: targetDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), eventName: eventName || (isZh ? '示例事件' : 'Sample Event') }} />}
                  </div>
                </div>
              </div>
            </div>

            {/* Add button */}
            <button
              onClick={handleAdd}
              disabled={selectedType === 'countdown' && !targetDate}
              className={`w-full py-3 rounded-2xl text-[14px] font-semibold transition-colors ${
                selectedType === 'countdown' && !targetDate
                  ? 'bg-white/10 text-white/30 cursor-not-allowed'
                  : 'bg-white/20 text-white hover:bg-white/30 active:scale-[0.98]'
              }`}
            >
              {t('widget.add')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import type { TranslationKeys } from '../i18n/useTranslation';
import type { WidgetType, WidgetSize, WidgetConfig } from '../store/layoutStore';
import { useLayoutStore, WIDGET_SIZE_MAP } from '../store/layoutStore';

interface AddWidgetModalProps {
  onClose: () => void;
  pageIndex?: number;
  /** When provided, the modal enters "edit" mode for this existing widget. */
  editItem?: import('../store/layoutStore').DesktopItem | null;
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

export const AddWidgetModal: React.FC<AddWidgetModalProps> = ({ onClose, pageIndex, editItem }) => {
  const { t, language } = useTranslation();
  const isZh = language === 'zh';
  const addWidget = useLayoutStore(s => s.addWidget);
  const updateWidgetConfig = useLayoutStore(s => s.updateWidgetConfig);
  const updateDesktopItem = useLayoutStore(s => s.updateDesktopItem);

  const isEditMode = !!editItem && editItem.type === 'widget';

  // Pre-populate from editItem when in edit mode
  const [selectedType, setSelectedType] = useState<WidgetType | null>(
    isEditMode ? (editItem.widgetType ?? null) : null
  );
  const [selectedSize, setSelectedSize] = useState<WidgetSize>(
    isEditMode ? (editItem.widgetSize ?? 'medium') : 'medium'
  );

  // Countdown config
  const editCountdown = isEditMode && editItem.widgetConfig?.widgetType === 'countdown' ? editItem.widgetConfig : null;
  const [eventName, setEventName] = useState(editCountdown?.eventName ?? '');
  const [targetDate, setTargetDate] = useState(editCountdown?.targetDate ?? '');
  // Weather config
  const editWeather = isEditMode && editItem.widgetConfig?.widgetType === 'weather' ? editItem.widgetConfig : null;
  const [weatherCity, setWeatherCity] = useState(editWeather?.city ?? '');
  const [weatherUnit, setWeatherUnit] = useState<'C' | 'F'>(editWeather?.unit ?? 'C');

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

    if (isEditMode) {
      // Update existing widget
      updateWidgetConfig(editItem.id, config);
      updateDesktopItem(editItem.id, { widgetSize: selectedSize });
    } else {
      // Add new widget
      addWidget(selectedType, selectedSize, config, pageIndex);
    }
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




  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-lg animate-fadeIn" onClick={onClose}>
      <div
        className="w-full max-w-md mx-4 bg-[#1a1c1e]/90 backdrop-blur-3xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">
            {isEditMode ? t('widget.editWidget') : (selectedType ? t(selectedOption!.labelKey) : t('widget.addWidget'))}
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
            {!isEditMode && (
              <button
                onClick={() => setSelectedType(null)}
                className="flex items-center gap-1.5 text-[12px] text-white/50 hover:text-white/80 transition-colors mb-2"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
                {t('widget.backToList')}
              </button>
            )}

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

            {/* Widget description hint (replaces the useless scaled-down preview) */}
            <div className="rounded-2xl bg-white/[0.05] border border-white/[0.08] p-4">
              <p className="text-[13px] text-white/60 leading-relaxed">
                {selectedType === 'calendar' && (isZh
                  ? '📅 日历小组件会自动显示当前月份，支持翻页浏览和高亮今天。小尺寸显示精简日期，中尺寸显示完整月历。'
                  : '📅 The calendar widget automatically shows the current month with page navigation and today highlight. Small size shows a compact date, medium shows the full month grid.')}
                {selectedType === 'weather' && (isZh
                  ? '🌤️ 天气小组件会根据你的城市实时显示天气信息。小尺寸显示温度和天气图标，中尺寸额外显示湿度、风速等详情。'
                  : '🌤️ The weather widget shows real-time weather for your city. Small size displays temperature and icon, medium size adds humidity, wind speed and more details.')}
                {selectedType === 'countdown' && (isZh
                  ? '⏱️ 倒计时小组件会显示距离目标日期的剩余天数。小尺寸显示天数和事件名，中尺寸额外显示时分秒倒计时。'
                  : '⏱️ The countdown widget shows days remaining until your target date. Small size shows days and event name, medium size adds hours, minutes and seconds.')}
              </p>
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
              {isEditMode ? t('widget.save') : t('widget.add')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

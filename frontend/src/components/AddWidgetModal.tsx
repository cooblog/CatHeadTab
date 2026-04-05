import React, { useState } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import type { TranslationKeys } from '../i18n/useTranslation';
import type { WidgetType, WidgetSize, WidgetConfig } from '../store/layoutStore';
import { useLayoutStore, WIDGET_SIZE_MAP } from '../store/layoutStore';
import { DatePicker } from './DatePicker';

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
  {
    type: 'systemMonitor',
    icon: '🖥️',
    labelKey: 'widget.systemMonitor',
    descKey: 'widget.systemMonitorDesc',
    sizes: ['small', 'medium'],
  },
  {
    type: 'clock',
    icon: '🕐',
    labelKey: 'widget.clock',
    descKey: 'widget.clockDesc',
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
      case 'systemMonitor':
        config = { widgetType: 'systemMonitor' };
        break;
      case 'clock':
        config = { widgetType: 'clock' };
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none p-0 sm:p-6 md:p-12" onContextMenu={(e) => e.preventDefault()}>
      {/* Dimmed Background Overlay */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px] pointer-events-auto transition-opacity animate-fadeIn"
        onClick={onClose}
      />

      {/* macOS-style Window */}
      <div
        className="bg-black/30 backdrop-blur-xl border-0 sm:border border-white/10 rounded-none sm:rounded-[1.5rem] md:rounded-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.55)] flex flex-col pointer-events-auto transform animate-scaleIn overflow-hidden transition-all duration-300 select-none w-full h-full sm:w-auto sm:h-auto sm:max-w-lg sm:min-w-[440px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Window Header — macOS traffic lights */}
        <div className="h-12 md:h-14 border-b border-white/10 flex items-center px-3 md:px-5 shrink-0 bg-white/[0.02] select-none">
          {/* Left: Mac traffic lights on desktop */}
          <div className="flex items-center gap-2 w-auto md:w-20">
            <div className="hidden md:flex gap-2.5">
              <button onClick={onClose} className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
                <svg className="w-2 h-2 text-red-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
              <div className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] border border-black/20" />
              <div className="w-3.5 h-3.5 rounded-full bg-[#27c93f] border border-black/20" />
            </div>
          </div>

          {/* Center title */}
          <div className="flex-1 flex justify-center">
            <span className="text-[13px] font-semibold text-white/70">
              {isEditMode ? t('widget.editWidget') : (selectedType ? t(selectedOption!.labelKey) : t('widget.addWidget'))}
            </span>
          </div>

          {/* Right spacer / mobile close */}
          <div className="flex items-center w-auto md:w-20 justify-end">
            <button onClick={onClose} className="md:hidden w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
            <div className="hidden md:block w-20" />
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 md:p-8 bg-gradient-to-br from-white/[0.02] to-transparent no-scrollbar">
          {!selectedType ? (
            /* Step 1: Choose widget type — grouped list style */
            <div className="space-y-5 fade-in">
              <div>
                <h3 className="text-xl font-bold text-white mb-1">{t('widget.addWidget')}</h3>
                <p className="text-[13px] text-white/50">{t('widget.chooseType')}</p>
              </div>

              <div className="bg-black/40 border border-white/10 rounded-xl overflow-hidden">
                {WIDGET_OPTIONS.map((opt, idx) => (
                  <button
                    key={opt.type}
                    className={`w-full flex items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-white/5 group ${
                      idx < WIDGET_OPTIONS.length - 1 ? 'border-b border-white/5' : ''
                    }`}
                    onClick={() => setSelectedType(opt.type)}
                  >
                    <span className="text-2xl shrink-0">{opt.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-medium text-white/90">{t(opt.labelKey)}</div>
                      <div className="text-[12px] text-white/40 mt-0.5">{t(opt.descKey)}</div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/20 group-hover:text-white/50 transition-colors shrink-0"><path d="m9 18 6-6-6-6"/></svg>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Step 2: Configure widget — macOS settings style */
            <div className="space-y-5 fade-in">
              {/* Back button */}
              {!isEditMode && (
                <button
                  onClick={() => setSelectedType(null)}
                  className="flex items-center gap-1.5 text-[13px] text-[#72d565] hover:text-[#5bb84f] transition-colors font-medium"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
                  {t('widget.backToList')}
                </button>
              )}

              {/* Size selector — grouped list with checkmarks */}
              <div>
                <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 mb-2 ml-1">{t('widget.size')}</label>
                <div className="bg-black/40 border border-white/10 rounded-xl overflow-hidden">
                  {(selectedOption?.sizes || []).map((s, idx, arr) => (
                    <button
                      key={s}
                      className={`w-full px-5 py-4 text-[14px] font-medium flex justify-between transition-colors ${
                        idx < arr.length - 1 ? 'border-b border-white/5' : ''
                      } ${selectedSize === s ? 'bg-white/5 text-white/90' : 'text-white/50 hover:bg-white/5 hover:text-white/90'}`}
                      onClick={() => setSelectedSize(s)}
                    >
                      {sizeLabel(s)}
                      {selectedSize === s && <span className="text-[#72d565]">✓</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Type-specific config */}
              {selectedType === 'countdown' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 mb-2 ml-1">{t('widget.eventName')}</label>
                    <input
                      type="text"
                      value={eventName}
                      onChange={(e) => setEventName(e.target.value)}
                      placeholder={isZh ? '例如：生日' : 'e.g. Birthday'}
                      className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3.5 text-[14px] text-white focus:outline-none focus:border-[#72d565]/50 focus:bg-black/60 transition-all shadow-inner"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 mb-2 ml-1">{t('widget.targetDate')}</label>
                    <DatePicker
                      value={targetDate}
                      onChange={setTargetDate}
                      isZh={isZh}
                    />
                  </div>
                </div>
              )}

              {selectedType === 'weather' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 mb-2 ml-1">{t('widget.city')}</label>
                    <input
                      type="text"
                      value={weatherCity}
                      onChange={(e) => setWeatherCity(e.target.value)}
                      placeholder={isZh ? '留空则自动定位' : 'Leave empty for auto-detect'}
                      className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3.5 text-[14px] text-white focus:outline-none focus:border-[#72d565]/50 focus:bg-black/60 transition-all shadow-inner"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 mb-2 ml-1">{t('widget.unit')}</label>
                    <div className="bg-black/40 border border-white/10 rounded-xl overflow-hidden">
                      {(['C', 'F'] as const).map((u, idx) => (
                        <button
                          key={u}
                          className={`w-full px-5 py-4 text-[14px] font-medium flex justify-between transition-colors ${
                            idx === 0 ? 'border-b border-white/5' : ''
                          } ${weatherUnit === u ? 'bg-white/5 text-white/90' : 'text-white/50 hover:bg-white/5 hover:text-white/90'}`}
                          onClick={() => setWeatherUnit(u)}
                        >
                          °{u} {u === 'C' ? (isZh ? '摄氏度' : 'Celsius') : (isZh ? '华氏度' : 'Fahrenheit')}
                          {weatherUnit === u && <span className="text-[#72d565]">✓</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Widget description hint */}
              <div className="rounded-xl bg-black/20 border border-white/[0.06] p-4">
                <p className="text-[13px] text-white/50 leading-relaxed">
                  {selectedType === 'calendar' && (isZh
                    ? '📅 日历小组件会自动显示当前月份，支持翻页浏览和高亮今天。小尺寸显示精简日期，中尺寸显示完整月历。'
                    : '📅 The calendar widget automatically shows the current month with page navigation and today highlight. Small size shows a compact date, medium shows the full month grid.')}
                  {selectedType === 'weather' && (isZh
                    ? '🌤️ 天气小组件会根据你的城市实时显示天气信息。小尺寸显示温度和天气图标，中尺寸额外显示湿度、风速等详情。'
                    : '🌤️ The weather widget shows real-time weather for your city. Small size displays temperature and icon, medium size adds humidity, wind speed and more details.')}
                  {selectedType === 'countdown' && (isZh
                    ? '⏱️ 倒计时小组件会显示距离目标日期的剩余天数。小尺寸显示天数和事件名，中尺寸额外显示时分秒倒计时。'
                    : '⏱️ The countdown widget shows days remaining until your target date. Small size shows days and event name, medium size adds hours, minutes and seconds.')}
                  {selectedType === 'systemMonitor' && (isZh
                    ? '🖥️ 系统监控小组件实时显示 CPU 和内存使用率。小尺寸显示双环形图概览，中尺寸额外显示处理器型号、核心数等详细信息。'
                    : '🖥️ The system monitor widget shows real-time CPU and memory usage. Small size displays dual ring gauges, medium size adds processor model, core count and more details.')}
                </p>
              </div>

              {/* Action button — green accent like SettingsModal */}
              <button
                onClick={handleAdd}
                disabled={selectedType === 'countdown' && !targetDate}
                className={`w-full py-3.5 rounded-xl text-[14px] font-bold transition-colors active:scale-[0.98] ${
                  selectedType === 'countdown' && !targetDate
                    ? 'bg-white/10 text-white/30 cursor-not-allowed'
                    : 'bg-[#72d565] hover:bg-[#5bb84f] text-black shadow-lg shadow-[#72d565]/20'
                }`}
              >
                {isEditMode ? t('widget.save') : t('widget.add')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

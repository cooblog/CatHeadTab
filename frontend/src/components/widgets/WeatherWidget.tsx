import React, { useEffect, useState, useRef } from 'react';
import type { WidgetSize, WeatherWidgetConfig } from '../../store/layoutStore';
import { useTranslation } from '../../i18n/useTranslation';

interface WeatherWidgetProps {
  size: WidgetSize;
  config?: WeatherWidgetConfig;
}

interface WeatherData {
  temp: number;
  description: string;
  icon: string;
  city: string;
  humidity: number;
  windSpeed: number;
  feelsLike: number;
  high: number;
  low: number;
}

const WEATHER_ICONS: Record<string, string> = {
  'clear sky': '☀️',
  'few clouds': '🌤️',
  'scattered clouds': '⛅',
  'broken clouds': '☁️',
  'overcast clouds': '☁️',
  'shower rain': '🌧️',
  'rain': '🌧️',
  'light rain': '🌦️',
  'moderate rain': '🌧️',
  'heavy rain': '🌧️',
  'thunderstorm': '⛈️',
  'snow': '❄️',
  'light snow': '🌨️',
  'mist': '🌫️',
  'haze': '🌫️',
  'fog': '🌫️',
  'drizzle': '🌦️',
};

function getWeatherEmoji(description: string): string {
  const lower = description.toLowerCase();
  for (const [key, emoji] of Object.entries(WEATHER_ICONS)) {
    if (lower.includes(key)) return emoji;
  }
  // Time-based fallback
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 18) return '🌤️';
  return '🌙';
}

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({ size, config }) => {
  const { language } = useTranslation();
  const isZh = language === 'zh';
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const fetchWeather = async () => {
      try {
        setLoading(true);
        setError(null);

        // Use wttr.in — a free weather API that requires no API key
        const city = config?.city || '';
        const lang = isZh ? 'zh' : 'en';
        const url = city
          ? `https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=${lang}`
          : `https://wttr.in/?format=j1&lang=${lang}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error('Weather fetch failed');
        const data = await res.json();

        const current = data.current_condition?.[0];
        const todayWeather = data.weather?.[0];
        if (!current) throw new Error('Invalid weather data');

        const unitIsF = config?.unit === 'F';
        const temp = unitIsF ? parseInt(current.temp_F) : parseInt(current.temp_C);
        const feelsLike = unitIsF ? parseInt(current.FeelsLikeF) : parseInt(current.FeelsLikeC);
        const high = unitIsF ? parseInt(todayWeather?.maxtempF || '0') : parseInt(todayWeather?.maxtempC || '0');
        const low = unitIsF ? parseInt(todayWeather?.mintempF || '0') : parseInt(todayWeather?.mintempC || '0');

        const description = isZh
          ? (current.lang_zh?.[0]?.value || current.weatherDesc?.[0]?.value || 'Unknown')
          : (current.weatherDesc?.[0]?.value || 'Unknown');

        setWeather({
          temp,
          description,
          icon: getWeatherEmoji(current.weatherDesc?.[0]?.value || ''),
          city: data.nearest_area?.[0]?.areaName?.[0]?.value || city || (isZh ? '当前位置' : 'Current Location'),
          humidity: parseInt(current.humidity),
          windSpeed: parseInt(current.windspeedKmph),
          feelsLike,
          high,
          low,
        });
      } catch (err) {
        console.error('Weather fetch error:', err);
        setError(isZh ? '无法获取天气' : 'Unable to fetch weather');
      } finally {
        setLoading(false);
      }
    };

    fetchWeather();
  }, [config?.city, config?.unit, isZh]);

  const unitLabel = config?.unit === 'F' ? '°F' : '°C';

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-white/50">
        <span className="text-2xl">🌐</span>
        <span className="text-[10px]">{error || (isZh ? '无法获取天气' : 'No weather data')}</span>
      </div>
    );
  }

  // Small (1×2): horizontal bar — icon + temp + city
  if (size === 'small') {
    return (
      <div className="w-full h-full flex items-center justify-center gap-2 select-none px-3">
        <span className="text-xl leading-none">{weather.icon}</span>
        <span className="text-lg font-light text-white leading-none">{weather.temp}{unitLabel}</span>
        <span className="text-[9px] text-white/50 truncate">{weather.city}</span>
      </div>
    );
  }

  // Medium (2×2): icon + temp + description + high/low + details
  return (
    <div className="w-full h-full flex flex-col select-none px-3 py-2 overflow-hidden">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-3xl leading-none shrink-0">{weather.icon}</span>
        <div className="min-w-0">
          <span className="text-2xl font-extralight text-white leading-none block">{weather.temp}{unitLabel}</span>
          <span className="text-[10px] text-white/70 truncate block">{weather.description}</span>
        </div>
      </div>
      <span className="text-[9px] text-white/50 truncate mb-1.5">{weather.city}</span>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 flex-1 content-start">
        <div className="flex flex-col">
          <span className="text-[8px] text-white/40 uppercase">{isZh ? '体感' : 'Feels'}</span>
          <span className="text-[11px] text-white/80">{weather.feelsLike}{unitLabel}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[8px] text-white/40 uppercase">{isZh ? '湿度' : 'Humid'}</span>
          <span className="text-[11px] text-white/80">{weather.humidity}%</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[8px] text-white/40 uppercase">H</span>
          <span className="text-[11px] text-white/80">{weather.high}{unitLabel}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[8px] text-white/40 uppercase">L</span>
          <span className="text-[11px] text-white/80">{weather.low}{unitLabel}</span>
        </div>
      </div>
    </div>
  );
};

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
  descriptionEn: string;
  icon: string;
  city: string;
  humidity: number;
  windSpeed: number;
  feelsLike: number;
  high: number;
  low: number;
  isDay: boolean;
}

// WMO Weather Code mapping → { emoji, zh, en }
const WMO_CODES: Record<number, { emoji: string; emojiNight?: string; zh: string; en: string }> = {
  0:  { emoji: '☀️', emojiNight: '🌙', zh: '晴', en: 'Clear' },
  1:  { emoji: '🌤️', emojiNight: '🌙', zh: '大部晴朗', en: 'Mostly Clear' },
  2:  { emoji: '⛅', zh: '多云', en: 'Partly Cloudy' },
  3:  { emoji: '☁️', zh: '阴', en: 'Overcast' },
  45: { emoji: '🌫️', zh: '雾', en: 'Fog' },
  48: { emoji: '🌫️', zh: '雾凇', en: 'Rime Fog' },
  51: { emoji: '🌦️', zh: '小毛毛雨', en: 'Light Drizzle' },
  53: { emoji: '🌦️', zh: '毛毛雨', en: 'Drizzle' },
  55: { emoji: '🌧️', zh: '大毛毛雨', en: 'Heavy Drizzle' },
  56: { emoji: '🌧️', zh: '冻毛毛雨', en: 'Freezing Drizzle' },
  57: { emoji: '🌧️', zh: '强冻毛毛雨', en: 'Heavy Freezing Drizzle' },
  61: { emoji: '🌧️', zh: '小雨', en: 'Light Rain' },
  63: { emoji: '🌧️', zh: '中雨', en: 'Rain' },
  65: { emoji: '🌧️', zh: '大雨', en: 'Heavy Rain' },
  66: { emoji: '🌧️', zh: '冻雨', en: 'Freezing Rain' },
  67: { emoji: '🌧️', zh: '强冻雨', en: 'Heavy Freezing Rain' },
  71: { emoji: '🌨️', zh: '小雪', en: 'Light Snow' },
  73: { emoji: '❄️', zh: '中雪', en: 'Snow' },
  75: { emoji: '❄️', zh: '大雪', en: 'Heavy Snow' },
  77: { emoji: '❄️', zh: '雪粒', en: 'Snow Grains' },
  80: { emoji: '🌦️', zh: '小阵雨', en: 'Light Showers' },
  81: { emoji: '🌧️', zh: '阵雨', en: 'Showers' },
  82: { emoji: '🌧️', zh: '大阵雨', en: 'Heavy Showers' },
  85: { emoji: '🌨️', zh: '小阵雪', en: 'Light Snow Showers' },
  86: { emoji: '❄️', zh: '阵雪', en: 'Snow Showers' },
  95: { emoji: '⛈️', zh: '雷暴', en: 'Thunderstorm' },
  96: { emoji: '⛈️', zh: '雷暴夹冰雹', en: 'Thunderstorm with Hail' },
  99: { emoji: '⛈️', zh: '强雷暴夹冰雹', en: 'Heavy Thunderstorm with Hail' },
};

function getWmoInfo(code: number, isDay: boolean) {
  const info = WMO_CODES[code] || WMO_CODES[0]!;
  const emoji = (!isDay && info.emojiNight) ? info.emojiNight : info.emoji;
  return { emoji, zh: info.zh, en: info.en };
}

/** Try browser geolocation, fallback to IP-based. */
async function getCoordinates(city?: string, lang?: string): Promise<{ lat: number; lon: number; cityName: string }> {
  // If user specified a city, geocode it via Open-Meteo
  if (city) {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=${lang || 'en'}&format=json`;
    const res = await fetch(geoUrl);
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      const r = data.results[0];
      return { lat: r.latitude, lon: r.longitude, cityName: r.name || city };
    }
    throw new Error('City not found');
  }

  // Try browser Geolocation API
  const pos = await new Promise<GeolocationPosition | null>((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p),
      () => resolve(null),
      { timeout: 5000, maximumAge: 300000 }
    );
  });

  if (pos) {
    const { latitude, longitude } = pos.coords;
    // Reverse geocode to get city name
    const cityName = await reverseGeocode(latitude, longitude, lang);
    return { lat: latitude, lon: longitude, cityName };
  }

  // Fallback: IP-based geolocation
  try {
    const ipRes = await fetch('https://ipapi.co/json/');
    const ipData = await ipRes.json();
    return {
      lat: ipData.latitude,
      lon: ipData.longitude,
      cityName: ipData.city || (lang === 'zh' ? '当前位置' : 'Current Location'),
    };
  } catch {
    // Last resort: default to Beijing
    return { lat: 39.9, lon: 116.4, cityName: lang === 'zh' ? '北京' : 'Beijing' };
  }
}

/** Reverse geocode lat/lon to city name using Open-Meteo geocoding search nearby. */
async function reverseGeocode(lat: number, lon: number, lang?: string): Promise<string> {
  try {
    // Use a lightweight reverse geocode service
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=${lang || 'en'}&zoom=10`);
    const data = await res.json();
    return data.address?.city || data.address?.town || data.address?.county || data.display_name?.split(',')[0] || (lang === 'zh' ? '当前位置' : 'Current Location');
  } catch {
    return lang === 'zh' ? '当前位置' : 'Current Location';
  }
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

        const lang = isZh ? 'zh' : 'en';
        const { lat, lon, cityName } = await getCoordinates(config?.city, lang);

        // Build Open-Meteo API URL
        const unitParam = config?.unit === 'F' ? '&temperature_unit=fahrenheit' : '';
        const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1${unitParam}`;

        const res = await fetch(apiUrl);
        if (!res.ok) throw new Error('Weather fetch failed');
        const data = await res.json();

        const current = data.current;
        const daily = data.daily;
        if (!current) throw new Error('Invalid weather data');

        const isDay = current.is_day === 1;
        const weatherCode = current.weather_code ?? 0;
        const wmoInfo = getWmoInfo(weatherCode, isDay);

        setWeather({
          temp: Math.round(current.temperature_2m),
          description: isZh ? wmoInfo.zh : wmoInfo.en,
          descriptionEn: wmoInfo.en,
          icon: wmoInfo.emoji,
          city: cityName,
          humidity: current.relative_humidity_2m,
          windSpeed: Math.round(current.wind_speed_10m),
          feelsLike: Math.round(current.apparent_temperature),
          high: Math.round(daily?.temperature_2m_max?.[0] ?? 0),
          low: Math.round(daily?.temperature_2m_min?.[0] ?? 0),
          isDay,
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
      <div className="w-full h-full flex items-center justify-center gap-2.5 select-none px-3">
        <span className="text-xl leading-none">{weather.icon}</span>
        <span className="text-lg font-light text-white leading-none">{weather.temp}{unitLabel}</span>
        <span className="text-[9px] text-white/50 truncate">{weather.city}</span>
      </div>
    );
  }

  // Medium (2×2): redesigned clean layout
  return (
    <div className="w-full h-full flex flex-col select-none p-3.5 overflow-hidden">
      {/* Top: Large temp + icon */}
      <div className="flex items-start justify-between mb-1">
        <div className="flex flex-col">
          <span className="text-[32px] font-extralight text-white leading-none tracking-tight">{weather.temp}{unitLabel}</span>
          <span className="text-[11px] text-white/60 mt-0.5">{weather.description}</span>
        </div>
        <span className="text-[36px] leading-none mt-[-2px]">{weather.icon}</span>
      </div>

      {/* City name */}
      <span className="text-[10px] text-white/40 truncate mb-auto">{weather.city}</span>

      {/* Bottom: Key stats in a single row */}
      <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-white/[0.06]">
        <div className="flex flex-col items-center flex-1">
          <span className="text-[8px] text-white/30 uppercase tracking-wider">{isZh ? '体感' : 'Feels'}</span>
          <span className="text-[12px] text-white/80 font-light">{weather.feelsLike}°</span>
        </div>
        <div className="w-px h-5 bg-white/[0.08]" />
        <div className="flex flex-col items-center flex-1">
          <span className="text-[8px] text-white/30 uppercase tracking-wider">{isZh ? '湿度' : 'Humid'}</span>
          <span className="text-[12px] text-white/80 font-light">{weather.humidity}%</span>
        </div>
        <div className="w-px h-5 bg-white/[0.08]" />
        <div className="flex flex-col items-center flex-1">
          <span className="text-[8px] text-white/30 uppercase tracking-wider">H</span>
          <span className="text-[12px] text-white/80 font-light">{weather.high}°</span>
        </div>
        <div className="w-px h-5 bg-white/[0.08]" />
        <div className="flex flex-col items-center flex-1">
          <span className="text-[8px] text-white/30 uppercase tracking-wider">L</span>
          <span className="text-[12px] text-white/80 font-light">{weather.low}°</span>
        </div>
      </div>
    </div>
  );
};

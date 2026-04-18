import React, { useEffect, useState, useRef } from 'react';
import type { WidgetSize, WeatherWidgetConfig } from '../../store/layoutStore';
import { useTranslation } from '../../i18n/useTranslation';
import { useConfigStore } from '../../store/configStore';

interface WeatherWidgetProps {
  size: WidgetSize;
  config?: WeatherWidgetConfig;
}

interface WeatherData {
  temp: number;
  description: string;   // Chinese description
  descriptionEn: string; // English description
  icon: string;
  city: string;           // city name (from the fetch language)
  cityZh?: string;        // Chinese city name (if available)
  cityEn?: string;        // English city name (if available)
  humidity: number;
  windSpeed: number;
  feelsLike: number;
  high: number;
  low: number;
  isDay: boolean;
  weatherCode?: number;   // WMO code for re-deriving descriptions
}

/** Fetch with a timeout — avoids hanging forever on slow/unreachable APIs. */
async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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
    const res = await fetchWithTimeout(geoUrl, 6000);
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      const r = data.results[0];
      return { lat: r.latitude, lon: r.longitude, cityName: r.name || city };
    }
    throw new Error('City not found');
  }

  // Browser Geolocation API disabled to prevent permission popups
  /*
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
  */

  // Final resort: default to Beijing (since real geolocation happens server-side now)
  return { lat: 39.9, lon: 116.4, cityName: lang === 'zh' ? '北京' : 'Beijing' };
}

/*
async function reverseGeocode(lat: number, lon: number, lang?: string): Promise<string> {
  try {
    // Use a lightweight reverse geocode service
    const res = await fetchWithTimeout(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=${lang || 'en'}&zoom=10`, 5000);
    const data = await res.json();
    return data.address?.city || data.address?.town || data.address?.county || data.display_name?.split(',')[0] || (lang === 'zh' ? '当前位置' : 'Current Location');
  } catch {
    return lang === 'zh' ? '当前位置' : 'Current Location';
  }
}
*/

/** Cache duration: 30 minutes in milliseconds. */
const WEATHER_CACHE_TTL = 30 * 60 * 1000;

/** Build a deterministic cache key based on widget config (language-independent). */
function weatherCacheKey(city?: string, unit?: string): string {
  return `weather_cache_${city || '_auto'}_${unit || 'C'}`;
}

interface WeatherCache {
  data: WeatherData;
  timestamp: number;
}

/** Read cached weather from localStorage. Returns data even if stale, with a fresh flag. */
function readWeatherCache(key: string): { data: WeatherData; fresh: boolean } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const cached: WeatherCache = JSON.parse(raw);
    const fresh = Date.now() - cached.timestamp < WEATHER_CACHE_TTL;
    return { data: cached.data, fresh };
  } catch {
    // Corrupted cache — ignore
  }
  return null;
}

/** Write weather data to localStorage cache. */
function writeWeatherCache(key: string, data: WeatherData): void {
  try {
    const cached: WeatherCache = { data, timestamp: Date.now() };
    localStorage.setItem(key, JSON.stringify(cached));
  } catch {
    // Storage full or unavailable — ignore
  }
}

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({ size, config }) => {
  const { language } = useTranslation();
  const isZh = language === 'zh';
  const lang = isZh ? 'zh' : 'en';
  const cacheKey = weatherCacheKey(config?.city, config?.unit);

  // Attempt to load cached data for instant display (even if stale)
  const initialCache = readWeatherCache(cacheKey);
  const [weather, setWeather] = useState<WeatherData | null>(initialCache?.data ?? null);
  const [loading, setLoading] = useState(!initialCache);
  const [error, setError] = useState<string | null>(null);
  const lastCacheKeyRef = useRef(cacheKey);

  // Use a ref to track latest weather state so async code never reads stale values.
  const weatherRef = useRef(weather);
  weatherRef.current = weather;

  useEffect(() => {
    let cancelled = false;
    const isConfigChange = lastCacheKeyRef.current !== cacheKey;
    lastCacheKeyRef.current = cacheKey;

    const cached = readWeatherCache(cacheKey);

    // If cache is fresh and config didn't change, use cached data directly.
    // Weather numbers are language-independent; city name is resolved at render time.
    if (cached?.fresh && !isConfigChange) {
      if (cached.data) setWeather(cached.data);
      setLoading(false);
      return;
    }

    // Show any available cached/existing data immediately while we refetch.
    if (cached?.data) {
      setWeather(cached.data);
    }
    // Clear any previous error so we don't flash an error while refetching
    setError(null);

    const fetchWeather = async () => {
      try {
        // Try backend first
        try {
          const baseUrl = useConfigStore.getState().getEffectiveServerUrl();
          const backendUrl = `${baseUrl}/api/v1/weather?city=${encodeURIComponent(config?.city || "")}&lang=${lang}&unit=${config?.unit || "C"}`;
          const backendRes = await fetchWithTimeout(backendUrl, 6000);
          if (backendRes.ok) {
            const { data: backendData } = await backendRes.json();
            if (backendData) {
              setWeather(backendData);
              setError(null);
              writeWeatherCache(cacheKey, backendData);
              return; // Success!
            }
          }
        } catch (e) {
          console.warn('Backend weather fetch failed, falling back to frontend direct fetch:', e);
        }

        // Fallback: Original frontend-only logic
        const { lat, lon, cityName } = await getCoordinates(config?.city, lang);

        // Build Open-Meteo API URL
        const unitParam = config?.unit === 'F' ? '&temperature_unit=fahrenheit' : '';
        const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1${unitParam}`;

        const res = await fetchWithTimeout(apiUrl, 8000);
        if (!res.ok) throw new Error('Weather fetch failed');
        const data = await res.json();

        const current = data.current;
        const daily = data.daily;
        if (!current) throw new Error('Invalid weather data');

        if (cancelled) return;

        const isDay = current.is_day === 1;
        const weatherCode = current.weather_code ?? 0;
        const wmoInfo = getWmoInfo(weatherCode, isDay);

        // Merge with existing cached data to preserve city names from both languages
        const prev = weatherRef.current;
        const weatherData: WeatherData = {
          temp: Math.round(current.temperature_2m),
          description: wmoInfo.zh,
          descriptionEn: wmoInfo.en,
          icon: wmoInfo.emoji,
          city: cityName,
          cityZh: lang === 'zh' ? cityName : (prev?.cityZh ?? undefined),
          cityEn: lang === 'en' ? cityName : (prev?.cityEn ?? undefined),
          humidity: current.relative_humidity_2m,
          windSpeed: Math.round(current.wind_speed_10m),
          feelsLike: Math.round(current.apparent_temperature),
          high: Math.round(daily?.temperature_2m_max?.[0] ?? 0),
          low: Math.round(daily?.temperature_2m_min?.[0] ?? 0),
          isDay,
          weatherCode,
        };

        setWeather(weatherData);
        setError(null);
        // 只缓存有效天气数据（温度非零或有天气描述）
        if (weatherData.temp !== undefined && weatherData.description) {
          writeWeatherCache(cacheKey, weatherData);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Weather fetch error:', err);
        // Only show error if we truly have no data at all
        if (weatherRef.current === null) {
          setError(isZh ? '无法获取天气' : 'Unable to fetch weather');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchWeather();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.city, config?.unit, cacheKey]);

  // When language changes and we already have weather data but are missing the
  // localised city name, do a lightweight reverse-geocode / geocode to fill it in.
  useEffect(() => {
    if (!weather) return;
    const needsCityName = isZh ? !weather.cityZh : !weather.cityEn;
    if (!needsCityName) return;

    let cancelled = false;

    (async () => {
      try {
        const { cityName } = await getCoordinates(config?.city, lang);
        if (cancelled) return;
        setWeather(prev => {
          if (!prev) return prev;
          const updated: WeatherData = {
            ...prev,
            cityZh: lang === 'zh' ? cityName : prev.cityZh,
            cityEn: lang === 'en' ? cityName : prev.cityEn,
          };
          writeWeatherCache(cacheKey, updated);
          return updated;
        });
      } catch {
        // Non-critical — fallback city name will be used
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, weather?.cityZh, weather?.cityEn]);

  const unitLabel = config?.unit === 'F' ? '°F' : '°C';

  // Derive localized display values from weather data
  const displayCity = weather
    ? (isZh ? (weather.cityZh || weather.city) : (weather.cityEn || weather.city))
    : '';
  const displayDesc = weather
    ? (isZh ? weather.description : weather.descriptionEn)
    : '';

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

  // Small (1×2): horizontal layout — icon+temp left, details right
  if (size === 'small') {
    return (
      <div className="w-full h-full flex items-center justify-center select-none px-4 gap-3">
        {/* Left: icon + temperature */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[26px] leading-none">{weather.icon}</span>
          <span className="text-[26px] font-[200] text-white leading-none">{weather.temp}{unitLabel}</span>
        </div>
        {/* Right: city + description + H/L */}
        <div className="flex flex-col justify-center gap-[1px] min-w-0">
          <span className="text-[13px] font-semibold text-white/85 leading-snug truncate">{displayCity}</span>
          <span className="text-[12px] text-white/50 leading-snug truncate">{displayDesc}</span>
          <span className="text-[11px] text-white/35 leading-snug">{weather.low}~{weather.high}°</span>
        </div>
      </div>
    );
  }

  // Medium (2×2): compact layout — no wasted space
  return (
    <div className="w-full h-full flex flex-col justify-center select-none p-3.5 overflow-hidden gap-3">
      {/* Top: Large temp + icon */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col">
          <span className="text-[36px] font-[200] text-white leading-none tracking-tight">{weather.temp}{unitLabel}</span>
          <span className="text-xs text-white/60 mt-1">{displayDesc}</span>
          <span className="text-[11px] text-white/40 mt-0.5 truncate">{displayCity}</span>
        </div>
        <span className="text-[40px] leading-none mt-[-2px]">{weather.icon}</span>
      </div>

      {/* Bottom: Key stats in a single row */}
      <div className="flex items-center justify-between gap-1 pt-2 border-t border-white/[0.06]">
        <div className="flex flex-col items-center flex-1">
          <span className="text-[9px] text-white/30 uppercase tracking-wider">{isZh ? '体感' : 'Feels'}</span>
          <span className="text-sm text-white/80 font-light">{weather.feelsLike}°</span>
        </div>
        <div className="w-px h-5 bg-white/[0.08]" />
        <div className="flex flex-col items-center flex-1">
          <span className="text-[9px] text-white/30 uppercase tracking-wider">{isZh ? '湿度' : 'Humid'}</span>
          <span className="text-sm text-white/80 font-light">{weather.humidity}%</span>
        </div>
        <div className="w-px h-5 bg-white/[0.08]" />
        <div className="flex flex-col items-center flex-1">
          <span className="text-[9px] text-white/30 uppercase tracking-wider">{isZh ? '温差' : 'Range'}</span>
          <span className="text-sm text-white/80 font-light">{weather.low}~{weather.high}°</span>
        </div>
      </div>


    </div>
  );
};

// Open-Meteo allows CORS, so the webview's own fetch is enough here (no plugin-http).

export interface WeatherLocation {
  name: string;
  lat: number;
  lon: number;
}

export interface CurrentWeather {
  tempC: number;
  code: number;
  highC: number;
  lowC: number;
  /** Yesterday → today → 5 days ahead (7 entries), aligned with dailyHigh/dailyLow. */
  dailyDates: string[];
  dailyHigh: number[];
  dailyLow: number[];
}

/** With `past_days=1`, index 0 is yesterday and index 1 is today. */
export const TODAY_INDEX = 1;

const STORAGE_KEY = 'auxin-weather-location';
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

export function getWeatherLocation(): WeatherLocation | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    const loc = parsed as Partial<WeatherLocation> | null;
    if (typeof loc?.name === 'string' && Number.isFinite(loc.lat) && Number.isFinite(loc.lon)) {
      return loc as WeatherLocation;
    }
  } catch {
    // corrupt or unavailable storage — treat as unset
  }
  return null;
}

export function setWeatherLocation(location: WeatherLocation): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
  } catch {
    // storage blocked — the location just won't persist
  }
}

/** Resolves a city name to its best match, or null if none / the lookup failed. */
export async function geocodeCity(query: string): Promise<WeatherLocation | null> {
  const res = await fetch(`${GEOCODE_URL}?name=${encodeURIComponent(query)}&count=1&language=en&format=json`);
  if (!res.ok) return null;
  const data: { results?: { name: string; admin1?: string; country: string; latitude: number; longitude: number }[] } =
    await res.json();
  const top = data.results?.[0];
  if (!top) return null;
  return {
    name: [top.name, top.admin1, top.country].filter(Boolean).join(', '),
    lat: top.latitude,
    lon: top.longitude,
  };
}

export async function fetchCurrentWeather({ lat, lon }: WeatherLocation): Promise<CurrentWeather | null> {
  const res = await fetch(
    `${FORECAST_URL}?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code` +
      '&daily=temperature_2m_max,temperature_2m_min&past_days=1&forecast_days=6&timezone=auto',
  );
  if (!res.ok) return null;
  const data: {
    current?: { temperature_2m: number; weather_code: number };
    daily?: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[] };
  } = await res.json();
  if (!data.current) return null;
  const tempC = data.current.temperature_2m;
  const dailyHigh = data.daily?.temperature_2m_max ?? [];
  const dailyLow = data.daily?.temperature_2m_min ?? [];
  return {
    tempC,
    code: data.current.weather_code,
    highC: dailyHigh[TODAY_INDEX] ?? tempC,
    lowC: dailyLow[TODAY_INDEX] ?? tempC,
    dailyDates: data.daily?.time ?? [],
    dailyHigh,
    dailyLow,
  };
}

/** WMO weather interpretation codes (Open-Meteo) → short label. */
export function describeWeatherCode(code: number): string {
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly cloudy';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code >= 61 && code <= 67) return 'rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return 'rain showers';
  if (code >= 85 && code <= 86) return 'snow showers';
  if (code >= 95) return 'thunderstorm';
  return 'unknown';
}

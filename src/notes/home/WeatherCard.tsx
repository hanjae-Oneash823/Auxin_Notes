import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  describeWeatherCode,
  fetchCurrentWeather,
  geocodeCity,
  getWeatherLocation,
  setWeatherLocation,
  type CurrentWeather,
  type WeatherLocation,
} from './weatherApi';
import { WEATHER_FONT, WeeklyTempChart } from './WeeklyTempChart';

const ENTER_DURATION_S = 0.2;

interface LocationSetupProps {
  onSet: (location: WeatherLocation) => void;
  onCancel?: () => void;
}

function LocationSetup({ onSet, onCancel }: LocationSetupProps) {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDisabled = isLoading || !query.trim();

  async function submit() {
    const city = query.trim();
    if (!city || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const location = await geocodeCity(city);
      if (!location) {
        setError('city not found');
        return;
      }
      setWeatherLocation(location);
      onSet(location);
    } catch {
      setError('lookup failed');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5" style={{ fontFamily: WEATHER_FONT }}>
      <div className="text-fg-muted" style={{ fontSize: '0.8rem' }}>
        set weather location
      </div>
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit();
            if (event.key === 'Escape') onCancel?.();
          }}
          placeholder="city name"
          className="rounded-row border border-border-subtle bg-transparent px-2 py-1 text-fg-prominent outline-none focus:border-border"
          style={{ fontSize: '0.8rem', width: 140 }}
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={isDisabled}
          className={isDisabled ? 'text-fg-faint' : 'text-fg-prominent'}
          style={{ fontSize: '0.8rem', cursor: isDisabled ? 'default' : 'pointer' }}
        >
          set
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-fg-faint" style={{ fontSize: '0.8rem' }}>
            cancel
          </button>
        )}
      </div>
      {error && (
        <div className="text-accent-link-broken" style={{ fontSize: '0.75rem' }}>
          {error}
        </div>
      )}
    </div>
  );
}

/** Home's weather block: the seven-day chart spans the column, with the city,
 *  temperature and condition overlaid at its top-left. Click the city name to
 *  change it. */
export function WeatherCard() {
  const [location, setLocation] = useState<WeatherLocation | null>(getWeatherLocation);
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!location) return;
    let cancelled = false;
    setStatus('loading');
    fetchCurrentWeather(location)
      .then((result) => {
        if (cancelled) return;
        setWeather(result);
        setStatus(result ? 'ready' : 'error');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [location]);

  if (!location || isEditing) {
    return (
      <LocationSetup
        onSet={(next) => {
          setLocation(next);
          setIsEditing(false);
        }}
        onCancel={location ? () => setIsEditing(false) : undefined}
      />
    );
  }

  if (status !== 'ready' || !weather) {
    return (
      <span
        className={status === 'error' ? 'text-accent-link-broken' : 'text-fg-faint'}
        style={{ fontSize: '0.8rem', fontFamily: WEATHER_FONT }}
      >
        {status === 'error' ? "couldn't reach the weather service" : 'loading…'}
      </span>
    );
  }

  const header = (
    <div className="flex flex-col" style={{ fontFamily: WEATHER_FONT }}>
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        title="click to change location"
        className="self-start text-fg-faint transition-colors duration-panel ease-panel hover:text-fg-prominent"
        style={{ fontSize: '0.75rem' }}
      >
        {location.name}
      </button>
      <div className="flex items-baseline gap-2">
        <span className="text-fg-prominent" style={{ fontSize: '1.9rem', fontWeight: 600, lineHeight: 1.15 }}>
          {Math.round(weather.tempC)}°C
        </span>
        <span className="text-fg-muted" style={{ fontSize: '0.85rem' }}>
          {describeWeatherCode(weather.code)}
        </span>
      </div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ENTER_DURATION_S, ease: 'easeOut' }}
    >
      <WeeklyTempChart dates={weather.dailyDates} highs={weather.dailyHigh} lows={weather.dailyLow} header={header} />
    </motion.div>
  );
}

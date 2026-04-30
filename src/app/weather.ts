import type { Locale } from '../i18n';

export type TemperatureUnit = 'celsius' | 'fahrenheit';
export const WEATHER_UNIT_STORAGE_KEY = 'mhh-weather-unit';
const MHH_WEATHER_COORDS = { latitude: 52.383675, longitude: 9.8049554 };

export const getWeatherUnit = (): TemperatureUnit => {
  const stored = localStorage.getItem(WEATHER_UNIT_STORAGE_KEY);
  if (stored === 'fahrenheit' || stored === 'celsius') {
    return stored;
  }
  return 'celsius';
};

const weatherCodeDescription = (code: number, language: Locale): string => {
  const labels =
    language === 'de'
      ? { 0: 'Klar', 1: 'Ueberwiegend klar', 2: 'Teilweise bewoelkt', 3: 'Bedeckt', 45: 'Nebel', 48: 'Nebel mit Reif', 51: 'Leichter Nieselregen', 53: 'Nieselregen', 55: 'Starker Nieselregen', 56: 'Gefrierender Nieselregen', 57: 'Starker gefrierender Nieselregen', 61: 'Leichter Regen', 63: 'Regen', 65: 'Starker Regen', 66: 'Gefrierender Regen', 67: 'Starker gefrierender Regen', 71: 'Leichter Schneefall', 73: 'Schneefall', 75: 'Starker Schneefall', 77: 'Schneekoerner', 80: 'Regenschauer', 81: 'Starke Regenschauer', 82: 'Heftige Regenschauer', 85: 'Leichte Schneeschauer', 86: 'Starke Schneeschauer', 95: 'Gewitter', 96: 'Gewitter mit leichtem Hagel', 99: 'Gewitter mit starkem Hagel' }
      : { 0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Depositing rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle', 56: 'Freezing drizzle', 57: 'Dense freezing drizzle', 61: 'Slight rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Heavy freezing rain', 71: 'Slight snow fall', 73: 'Snow fall', 75: 'Heavy snow fall', 77: 'Snow grains', 80: 'Rain showers', 81: 'Heavy rain showers', 82: 'Violent rain showers', 85: 'Snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Strong thunderstorm with hail' };
  return labels[code as keyof typeof labels] ?? (language === 'de' ? 'Unbekannt' : 'Unknown');
};

const formatWeatherTime = (isoDateTime: string, language: Locale): string => {
  const parsed = new Date(isoDateTime);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
};

export const renderWeather = async (
  weatherCard: HTMLDivElement,
  locale: Locale,
  unit: TemperatureUnit,
): Promise<void> => {
  const icons = { feelsLike: '🌡️', humidity: '💧', wind: '💨', highLow: '📈', rain: '🌧️', sunrise: '🌅', sunset: '🌇' } as const;
  const labels =
    locale === 'de'
      ? { loading: 'Wetter wird geladen...', failed: 'Wetterdaten konnten nicht geladen werden.', humidity: 'Luftfeuchtigkeit', wind: 'Wind', feelsLike: 'Gefuehlt', highLow: 'Max / Min', rain: 'Niederschlag', sunrise: 'Sonnenaufgang', sunset: 'Sonnenuntergang' }
      : { loading: 'Loading weather...', failed: 'Could not load weather data.', humidity: 'Humidity', wind: 'Wind', feelsLike: 'Feels like', highLow: 'High / Low', rain: 'Precipitation', sunrise: 'Sunrise', sunset: 'Sunset' };

  weatherCard.innerHTML = `<p class="weather-status">${labels.loading}</p>`;
  const params = new URLSearchParams({
    latitude: `${MHH_WEATHER_COORDS.latitude}`,
    longitude: `${MHH_WEATHER_COORDS.longitude}`,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,precipitation',
    daily: 'temperature_2m_max,temperature_2m_min,sunrise,sunset',
    timezone: 'auto',
    temperature_unit: unit,
  });

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
    if (!response.ok) throw new Error('Weather endpoint error');
    const data = (await response.json()) as {
      current?: { temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; wind_speed_10m: number; weather_code: number; precipitation: number };
      daily?: { temperature_2m_max: number[]; temperature_2m_min: number[]; sunrise: string[]; sunset: string[] };
      current_units?: { temperature_2m?: string; wind_speed_10m?: string; precipitation?: string };
    };
    if (!data.current || !data.daily || !data.current_units) throw new Error('Incomplete weather data');

    const tempUnit = data.current_units.temperature_2m ?? (unit === 'celsius' ? 'C' : 'F');
    const windUnit = data.current_units.wind_speed_10m ?? 'km/h';
    const precipitationUnit = data.current_units.precipitation ?? 'mm';

    weatherCard.innerHTML = `
      <p class="weather-temp">🌤️ ${Math.round(data.current.temperature_2m)}${tempUnit}</p>
      <p class="weather-desc">☁️ ${weatherCodeDescription(data.current.weather_code, locale)}</p>
      <div class="weather-grid">
        <p><strong>${icons.feelsLike} ${labels.feelsLike}:</strong> ${Math.round(data.current.apparent_temperature)}${tempUnit}</p>
        <p><strong>${icons.humidity} ${labels.humidity}:</strong> ${data.current.relative_humidity_2m}%</p>
        <p><strong>${icons.wind} ${labels.wind}:</strong> ${Math.round(data.current.wind_speed_10m)} ${windUnit}</p>
        <p><strong>${icons.highLow} ${labels.highLow}:</strong> ${Math.round(data.daily.temperature_2m_max[0] ?? data.current.temperature_2m)}${tempUnit} / ${Math.round(data.daily.temperature_2m_min[0] ?? data.current.temperature_2m)}${tempUnit}</p>
        <p><strong>${icons.rain} ${labels.rain}:</strong> ${data.current.precipitation} ${precipitationUnit}</p>
        <p><strong>${icons.sunrise} ${labels.sunrise}:</strong> ${formatWeatherTime(data.daily.sunrise[0] ?? '', locale)}</p>
        <p><strong>${icons.sunset} ${labels.sunset}:</strong> ${formatWeatherTime(data.daily.sunset[0] ?? '', locale)}</p>
      </div>
    `;
  } catch {
    weatherCard.innerHTML = `<p class="weather-status">${labels.failed}</p>`;
  }
};


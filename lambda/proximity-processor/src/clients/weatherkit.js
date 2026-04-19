// ============================================================================
// Apple WeatherKit Client
// ============================================================================
// Fetches current weather conditions for a given lat/lng using the Apple
// WeatherKit REST API (server-side).
//
// The weather data is used as context for Claude Sonnet to generate
// weather-appropriate activity suggestions (e.g., indoor activities on
// rainy days, outdoor suggestions when sunny).
//
// WeatherKit REST API docs:
// https://developer.apple.com/documentation/weatherkitrestapi
// ============================================================================

import { config } from '../config.js';

const WEATHERKIT_BASE_URL = 'https://weatherkit.apple.com/api/v1';

/**
 * @typedef {object} WeatherContext
 * @property {string}  conditionCode    — e.g. "Clear", "Cloudy", "Rain", "Snow"
 * @property {string}  description      — Human-readable description
 * @property {number}  temperatureC     — Temperature in Celsius
 * @property {number}  temperatureF     — Temperature in Fahrenheit
 * @property {number}  humidity         — Relative humidity (0-1)
 * @property {number}  windSpeedKmh     — Wind speed in km/h
 * @property {number}  uvIndex          — UV index
 * @property {string}  daylight         — "day" or "night"
 * @property {number}  precipChance     — Precipitation probability (0-1)
 * @property {string}  fetchedAt        — ISO8601 timestamp
 */

/**
 * Fetches current weather conditions from Apple WeatherKit.
 *
 * @param {number} lat — Latitude
 * @param {number} lng — Longitude
 * @returns {Promise<WeatherContext|null>}
 */
export async function fetchWeatherContext(lat, lng) {
  if (!config.APPLE_WEATHERKIT_TOKEN) {
    console.warn('[Weather] WeatherKit token not configured — returning fallback');
    return buildFallbackWeather();
  }

  const url = `${WEATHERKIT_BASE_URL}/weather/en/${lat}/${lng}?dataSets=currentWeather`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.APPLE_WEATHERKIT_TOKEN}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(3000), // 3s timeout
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[Weather] API error ${response.status}: ${errorBody}`);
      return buildFallbackWeather();
    }

    const data = await response.json();
    const current = data.currentWeather;

    if (!current) {
      console.warn('[Weather] No currentWeather data in response');
      return buildFallbackWeather();
    }

    const tempC = current.temperature;
    const tempF = tempC != null ? Math.round((tempC * 9) / 5 + 32) : null;

    return {
      conditionCode: current.conditionCode || 'Unknown',
      description: mapConditionToDescription(current.conditionCode),
      temperatureC: tempC != null ? Math.round(tempC) : null,
      temperatureF,
      humidity: current.humidity || null,
      windSpeedKmh: current.windSpeed ? Math.round(current.windSpeed) : null,
      uvIndex: current.uvIndex || 0,
      daylight: current.daylight ? 'day' : 'night',
      precipChance: current.precipitationIntensity > 0 ? 0.7 : 0.1,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[Weather] Request failed:', err.message);
    return buildFallbackWeather();
  }
}

/**
 * Maps Apple WeatherKit condition codes to human-readable descriptions.
 * @param {string} code
 * @returns {string}
 */
function mapConditionToDescription(code) {
  const map = {
    Clear: 'Clear skies',
    MostlyClear: 'Mostly clear',
    PartlyCloudy: 'Partly cloudy',
    MostlyCloudy: 'Mostly cloudy',
    Cloudy: 'Overcast',
    Drizzle: 'Light drizzle',
    Rain: 'Rainy',
    HeavyRain: 'Heavy rain',
    Thunderstorms: 'Thunderstorms',
    Snow: 'Snowing',
    Sleet: 'Sleet',
    Hail: 'Hail',
    Foggy: 'Foggy',
    Haze: 'Hazy',
    Windy: 'Windy',
    Breezy: 'Breezy',
    Hot: 'Hot',
    Frigid: 'Frigid',
    Blizzard: 'Blizzard',
    BlowingDust: 'Dusty',
    SmokyHaze: 'Smoky',
    TropicalStorm: 'Tropical storm',
    Hurricane: 'Hurricane warning',
  };
  return map[code] || code || 'Unknown conditions';
}

/**
 * Builds a neutral fallback weather context when the API is unavailable.
 * Claude will still generate reasonable suggestions without weather data.
 * @returns {WeatherContext}
 */
function buildFallbackWeather() {
  return {
    conditionCode: 'Unknown',
    description: 'Weather data unavailable',
    temperatureC: null,
    temperatureF: null,
    humidity: null,
    windSpeedKmh: null,
    uvIndex: 0,
    daylight: new Date().getHours() >= 6 && new Date().getHours() < 20 ? 'day' : 'night',
    precipChance: null,
    fetchedAt: new Date().toISOString(),
  };
}

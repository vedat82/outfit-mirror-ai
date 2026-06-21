const defaultWeather = {
  latitude: Number(process.env.DEFAULT_LATITUDE || 41.0082),
  longitude: Number(process.env.DEFAULT_LONGITUDE || 28.9784),
  city: process.env.DEFAULT_CITY || 'Istanbul'
};

const rainyWeatherCodes = new Set([
  51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99
]);

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isRainy(current) {
  return (
    Number(current.precipitation || 0) > 0 ||
    Number(current.rain || 0) > 0 ||
    Number(current.showers || 0) > 0 ||
    rainyWeatherCodes.has(Number(current.weather_code))
  );
}

export async function getCurrentWeather({ latitude, longitude, city } = {}) {
  const resolvedLatitude = toNumber(latitude, defaultWeather.latitude);
  const resolvedLongitude = toNumber(longitude, defaultWeather.longitude);
  const resolvedCity = city || defaultWeather.city;
  const params = new URLSearchParams({
    latitude: String(resolvedLatitude),
    longitude: String(resolvedLongitude),
    current: 'temperature_2m,precipitation,rain,showers,weather_code',
    temperature_unit: 'celsius',
    precipitation_unit: 'mm',
    timezone: 'auto'
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);

  if (!response.ok) {
    throw new Error('Weather service is unavailable right now.');
  }

  const data = await response.json();
  const current = data.current || {};

  return {
    city: resolvedCity,
    latitude: resolvedLatitude,
    longitude: resolvedLongitude,
    temperatureC: current.temperature_2m,
    precipitationMm: current.precipitation || 0,
    rainMm: current.rain || 0,
    showersMm: current.showers || 0,
    weatherCode: current.weather_code,
    rainy: isRainy(current),
    time: current.time
  };
}

import { config } from '../config/index.js';

async function fetchJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.weather.timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
            const err = new Error(`Weather API вернул статус ${res.status}`);
            err.status = res.status;
            throw err;
        }
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

export async function geocodeCity(name) {
    const url = new URL(config.weather.geocodingUrl);
    url.searchParams.set('name', name);
    url.searchParams.set('count', '1');
    url.searchParams.set('language', 'ru');
    url.searchParams.set('format', 'json');
    const data = await fetchJson(url.toString());
    const first = data?.results?.[0];
    if (!first) return null;
    return { name: first.name, country: first.country, lat: first.latitude, lon: first.longitude };
}

export async function fetchForecast(lat, lon, days = 3) {
    const url = new URL(config.weather.forecastUrl);
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set(
        'daily',
        'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
    );
    url.searchParams.set('forecast_days', String(days));
    url.searchParams.set('timezone', 'auto');
    return fetchJson(url.toString());
}
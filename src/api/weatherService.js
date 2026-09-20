import { fetchForecast } from '../api/weatherClient.js';
import { config } from '../config/index.js';
import { getLog } from '../utils/context.js';

export const weatherService = {
    async getForEquipment(equipment) {
        const { lat, lon } = equipment.location;
        getLog().debug({ event: 'weather_fetch', equipmentId: equipment.id, lat, lon }, 'Запрос прогноза погоды');
        const forecast = await fetchForecast(lat, lon, 3);
        const daily = forecast.daily ?? {};
        const days = (daily.time ?? []).map((date, i) => {
            const wind = daily.wind_speed_10m_max?.[i] ?? 0;
            const precipitation = daily.precipitation_sum?.[i] ?? 0;
            const suitable = precipitation === 0 && wind < config.weather.windThresholdMs;
            return {
                date,
                temperatureMax: daily.temperature_2m_max?.[i],
                temperatureMin: daily.temperature_2m_min?.[i],
                precipitationSum: precipitation,
                windSpeedMax: wind,
                suitableForOutdoorWork: suitable,
            };
        });
        return {
            equipmentId: equipment.id,
            location: { lat, lon },
            windThresholdMs: config.weather.windThresholdMs,
            days,
        };
    },
};
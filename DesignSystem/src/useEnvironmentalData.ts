import { useState, useEffect } from 'react';

export interface EnvironmentalData {
  temp: number;
  humidity: number;
  aqi: number;
  pm25: number;
  location: string;
  loading: boolean;
  error: string;
}

const INITIAL: EnvironmentalData = {
  temp: 0, humidity: 0, aqi: 0, pm25: 0, location: '', loading: true, error: '',
};

export function useEnvironmentalData(): EnvironmentalData {
  const [data, setData] = useState<EnvironmentalData>(INITIAL);

  useEffect(() => {
    let cancelled = false;

    if (!navigator.geolocation) {
      setData(d => ({ ...d, loading: false, error: 'Geolocation not available' }));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (cancelled) return;
        const { latitude, longitude } = pos.coords;
        try {
          const [weatherRes, aqiRes] = await Promise.all([
            fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m`),
            fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=european_aqi,pm2_5`),
          ]);
          const weather = await weatherRes.json();
          const aqiData = await aqiRes.json();
          if (cancelled) return;
          setData({
            temp: weather?.current?.temperature_2m ?? 0,
            humidity: weather?.current?.relative_humidity_2m ?? 0,
            aqi: aqiData?.current?.european_aqi ?? 0,
            pm25: aqiData?.current?.pm2_5 ?? 0,
            location: `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
            loading: false,
            error: '',
          });
        } catch (e) {
          if (!cancelled) setData(d => ({ ...d, loading: false, error: 'Failed to fetch environmental data' }));
        }
      },
      (err) => {
        if (!cancelled) setData(d => ({ ...d, loading: false, error: `Geolocation: ${err.message}` }));
      },
      { timeout: 10000, enableHighAccuracy: false },
    );

    return () => { cancelled = true; };
  }, []);

  return data;
}

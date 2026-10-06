export default function WeatherWidget({ weather, refreshWeather, useLocation, t }) {
  const temp = Math.round(weather.temperature ?? 28);
  const hum = Math.round(weather.humidity ?? 75);
  const rain = Math.round(weather.rainfall ?? 0);
  const isLive = weather.source === "Open-Meteo";

  // Environmental condition styling
  let conditionIcon = "🌤️";
  let conditionText = t.weatherOptimalSun;
  let conditionClass = "env-sunny";

  if (rain > 1) {
    conditionIcon = "🌧️";
    conditionText = t.weatherRainActive;
    conditionClass = "env-rainy";
  } else if (temp >= 32) {
    conditionIcon = "☀️";
    conditionText = t.weatherHighHeat;
    conditionClass = "env-hot";
  } else if (hum > 80) {
    conditionIcon = "🌦️";
    conditionText = t.weatherHighHumidity;
    conditionClass = "env-humid";
  }

  return (
    <div className={`card-panel weather-living-panel ${conditionClass}`}>
      <div>
        <div className="panel-head">
          <div>
            <div className="eyebrow">{t.liveContext}</div>
            <h2 className="panel-title">{t.weather}</h2>
          </div>
          <button
            type="button"
            className="icon-refresh-btn"
            onClick={refreshWeather}
            title={t.refreshWeatherTitle}
            aria-label={t.refreshWeatherTitle}
          >
            ↻
          </button>
        </div>

        <div className="weather-hero-row">
          <div className="weather-visual-orb">
            <span className="weather-hero-icon" aria-hidden="true">{conditionIcon}</span>
          </div>
          <div className="weather-hero-meta">
            <div className="weather-temp-num">{temp}°C</div>
            <div className="weather-condition-tag">
              <span className="condition-pulse-dot" />
              <span>{conditionText}</span>
            </div>
          </div>
        </div>

        <div className="weather-metrics-triad">
          <div className="weather-metric-col">
            <div className="metric-header-row">
              <span className="metric-mini-icon">💧</span>
              <span>{t.humidity}</span>
            </div>
            <b>{hum}%</b>
          </div>

          <div className="weather-metric-col">
            <div className="metric-header-row">
              <span className="metric-mini-icon">🌧️</span>
              <span>{t.rain}</span>
            </div>
            <b>{rain} mm</b>
          </div>

          <div className="weather-metric-col">
            <div className="metric-header-row">
              <span className="metric-mini-icon">📡</span>
              <span>{t.source}</span>
            </div>
            <b className={isLive ? "text-emerald" : ""}>{isLive ? t.live : t.demo}</b>
          </div>
        </div>
      </div>

      <div className="weather-footer-actions">
        <button
          type="button"
          className="btn-outline btn-full weather-loc-btn"
          onClick={useLocation}
        >
          <span>📍 {t.useMyLocation}</span>
        </button>
      </div>
    </div>
  );
}

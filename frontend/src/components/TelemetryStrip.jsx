export default function TelemetryStrip({ dashboard, weather, t }) {
  const cropsCount = dashboard.crops ?? 0;
  const scansCount = dashboard.scans ?? 0;
  const highRiskCount = dashboard.high_risk ?? 0;
  
  // Dynamic health calculation based on scan history
  const healthRate = scansCount > 0 
    ? Math.max(0, Math.round(((scansCount - highRiskCount) / scansCount) * 100))
    : 96;

  return (
    <div className="telemetry-strip-dock" aria-label={t.telemetryLiveWeather}>
      <div className="telemetry-cell">
        <div className="cell-icon-wrap" aria-hidden="true">🌱</div>
        <div className="cell-data-wrap">
          <span className="cell-metric-label">{t.statCrops}</span>
          <div className="cell-metric-num">
            {cropsCount}
            <span className="cell-unit">{t.unitFields}</span>
          </div>
        </div>
      </div>

      <div className="telemetry-cell-divider" aria-hidden="true" />

      <div className="telemetry-cell">
        <div className="cell-icon-wrap" aria-hidden="true">🤖</div>
        <div className="cell-data-wrap">
          <span className="cell-metric-label">{t.statScans}</span>
          <div className="cell-metric-num">
            {scansCount}
            <span className="cell-unit">{t.unitVerified}</span>
          </div>
        </div>
      </div>

      <div className="telemetry-cell-divider" aria-hidden="true" />

      <div className="telemetry-cell">
        <div className="cell-icon-wrap" aria-hidden="true">💚</div>
        <div className="cell-data-wrap">
          <span className="cell-metric-label">{t.telemetryVitality}</span>
          <div className="cell-metric-num text-emerald">
            {healthRate}%
            <span className="cell-unit">{t.telemetryOptimal}</span>
          </div>
        </div>
      </div>

      <div className="telemetry-cell-divider" aria-hidden="true" />

      <div className="telemetry-cell">
        <div className="cell-icon-wrap" aria-hidden="true">⚠️</div>
        <div className="cell-data-wrap">
          <span className="cell-metric-label">{t.statHighRisk}</span>
          <div className={`cell-metric-num ${highRiskCount > 0 ? "text-amber" : "text-emerald"}`}>
            {highRiskCount}
            <span className="cell-unit">{highRiskCount > 0 ? t.telemetryFlagged : t.telemetryZeroAlerts}</span>
          </div>
        </div>
      </div>

      <div className="telemetry-cell-divider" aria-hidden="true" />

      <div className="telemetry-cell cell-weather">
        <div className="cell-icon-wrap" aria-hidden="true">🌦️</div>
        <div className="cell-data-wrap">
          <span className="cell-metric-label">{weather.source === "Open-Meteo" ? t.telemetryLiveWeather : t.telemetryDemoWeather}</span>
          <div className="cell-metric-num">
            {Math.round(weather.temperature ?? 28)}°C
            <span className="cell-unit">· {Math.round(weather.humidity ?? 75)}% {t.unitHum}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

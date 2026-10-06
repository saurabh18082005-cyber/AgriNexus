export default function AiFieldHud({ dashboard, weather, t }) {
  const isOptimal = (dashboard.high_risk || 0) === 0;
  const temp = Math.round(weather.temperature ?? 28);
  const hum = Math.round(weather.humidity ?? 75);
  const rain = Math.round(weather.rainfall ?? 0);

  return (
    <div className="ai-field-hud-panel" aria-label={t.hudTitle}>
      {/* Top Telemetry Header with Radar Sensor */}
      <div className="hud-panel-top">
        <div className="hud-beacon-wrap">
          <span className="hud-beacon-dot" />
          <div>
            <span className="hud-beacon-title">{t.hudTitle}</span>
            <span className="hud-beacon-sub">{t.hudSubtitle}</span>
          </div>
        </div>
        <div className="hud-mini-radar" aria-hidden="true">
          <div className="radar-circle-outer" />
          <div className="radar-sweep-beam" />
          <span className="radar-center-ping" />
        </div>
      </div>

      {/* Primary Telemetry Stream Grid */}
      <div className="hud-metrics-list">
        <div className="hud-metric-row">
          <div className="hud-label-group">
            <span className="hud-metric-label">{t.hudVitalityIndex}</span>
            <span className="hud-micro-stream">{t.hudSensorActive}</span>
          </div>
          <div className="hud-metric-val-wrap">
            <span className="hud-val-bold text-emerald">96.4%</span>
            <span className="hud-val-pill pill-emerald">{t.hudOptimal}</span>
          </div>
        </div>

        <div className="hud-metric-row">
          <div className="hud-label-group">
            <span className="hud-metric-label">{t.hudPathogenRisk}</span>
            <span className="hud-micro-stream">{t.hudSpectralAudit}</span>
          </div>
          <div className="hud-metric-val-wrap">
            <span className={`hud-val-bold ${isOptimal ? "text-emerald" : "text-amber"}`}>
              {isOptimal ? t.hudNominal : t.hudEvaluating}
            </span>
            <span className={`hud-val-pill ${isOptimal ? "pill-emerald" : "pill-amber"}`}>
              {isOptimal ? t.hudZeroThreats : t.hudActionReq}
            </span>
          </div>
        </div>

        <div className="hud-metric-row">
          <div className="hud-label-group">
            <span className="hud-metric-label">{t.hudMicroclimateSynth}</span>
            <span className="hud-micro-stream">{t.hudRealtimeMeteo}</span>
          </div>
          <div className="hud-metric-val-wrap">
            <span className="hud-val-bold">{temp}°C · {hum}% {t.unitHum}</span>
            <span className="hud-val-pill pill-neutral">{rain > 0 ? `${rain}mm ${t.hudRain}` : t.hudArid}</span>
          </div>
        </div>

        <div className="hud-metric-row">
          <div className="hud-label-group">
            <span className="hud-metric-label">{t.hudSatelliteGeofence}</span>
            <span className="hud-micro-stream">{t.hudGpsLock}</span>
          </div>
          <div className="hud-metric-val-wrap">
            <span className="hud-val-mono">12.9716°N · 77.5946°E</span>
          </div>
        </div>
      </div>

      {/* Mini Telemetry Sparklines & Signal Footer */}
      <div className="hud-panel-footer">
        <div className="hud-sparkline-group" aria-hidden="true">
          <span className="spark-bar" style={{ height: "45%" }} />
          <span className="spark-bar" style={{ height: "70%" }} />
          <span className="spark-bar" style={{ height: "90%" }} />
          <span className="spark-bar" style={{ height: "65%" }} />
          <span className="spark-bar" style={{ height: "85%" }} />
          <span className="spark-bar" style={{ height: "100%" }} />
          <span className="spark-bar" style={{ height: "95%" }} />
          <span className="spark-bar" style={{ height: "80%" }} />
        </div>
        <span className="hud-footer-note">{t.hudSensorsSync}</span>
      </div>
    </div>
  );
}

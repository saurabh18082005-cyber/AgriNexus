import { useState } from "react";
import cinematicFieldHero from "../assets/cinematic_field_hero.jpg";
import aerialFarmZones from "../assets/aerial_farm_zones.jpg";
import specimenLeafAi from "../assets/specimen_leaf_ai.jpg";
import smartGreenhouseAi from "../assets/smart_greenhouse_ai.jpg";

import CropJourneyRoadmap from "../components/CropJourneyRoadmap";
import WeatherWidget from "../components/WeatherWidget";

const fillText = (text, vars) => (text ? text.replace(/\{(\w+)\}/g, (_, key) => vars[key]) : "");

export default function Home({
  t,
  setPage,
  openPassport,
  openMarket,
  dashboard,
  weather,
  refreshWeather,
  useLocation,
  coords,
  location,
}) {
  const [activeSphereMode, setActiveSphereMode] = useState("analysis");
  const [askInput, setAskInput] = useState("");

  const displayLocation = (loc) => {
    if (!loc) return t.defaultLocation;
    if (loc === "Current location" || loc === "वर्तमान स्थान" || loc === "ಪ್ರಸ್ತುತ ಸ್ಥಳ" || loc === t.currentLocationText) {
      return t.currentLocationText;
    }
    return t.locations?.[loc] || loc;
  };

  const temp = Math.round(weather.temperature ?? 28);
  const hum = Math.round(weather.humidity ?? 75);
  const rain = Math.round(weather.rainfall ?? 0);

  // Environmental condition styling from real weather data
  let conditionIcon = "🌤️";
  let conditionText = t.weatherOptimalSun;
  if (rain > 1) {
    conditionIcon = "🌧️";
    conditionText = t.weatherRainActive;
  } else if (temp >= 32) {
    conditionIcon = "☀️";
    conditionText = t.weatherHighHeat;
  } else if (hum > 80) {
    conditionIcon = "🌦️";
    conditionText = t.weatherHighHumidity;
  }

  const recentScan = dashboard.recent?.[0];

  const handleAskSubmit = (e) => {
    e.preventDefault();
    if (askInput.trim()) {
      setPage("scan");
    }
  };

  return (
    <div className="home-continuous-landscape">
      {/* 1. CINEMATIC LIVING FARM HERO */}
      <section
        className="hero-cinematic-banner"
        style={{ backgroundImage: `url(${cinematicFieldHero})` }}
        aria-label={t.heroEyebrow}
      >
        <div className="hero-cinematic-overlay" aria-hidden="true" />

        <div className="hero-foreground-content">
          {/* Left Narrative Column */}
          <div className="hero-narrative-column">
            <div className="hero-eyebrow-badge">
              <span className="badge-ping" aria-hidden="true" />
              <span>{t.heroEyebrow}</span>
            </div>

            <h1 className="hero-headline-fluid">
              {t.heroLine1}{" "}
              <span className="hero-highlight-gradient">{t.heroLine2}</span>
            </h1>

            <p className="hero-narrative-desc">{t.heroText}</p>

            <div className="hero-cta-action-row">
              <button
                type="button"
                className="btn-primary hero-primary-cta"
                onClick={() => setPage("scan")}
              >
                <span>🔬 {t.scanCrop}</span>
                <span className="cta-arrow" aria-hidden="true">➔</span>
              </button>

              <button
                type="button"
                className="btn-secondary"
                onClick={openPassport}
              >
                <span>🪪 {t.openPassport}</span>
              </button>

              <button
                type="button"
                className="btn-outline"
                onClick={openMarket}
              >
                <span>🤝 {t.findBuyers}</span>
              </button>
            </div>

            {/* Real Data Stat Pills */}
            <div className="hero-quick-stats-row">
              <span className="quick-stat-pill">
                <span className="pill-dot dot-green" aria-hidden="true" />
                <strong>{dashboard.crops}</strong> {t.statCrops}
              </span>
              <span className="quick-stat-pill">
                <span className="pill-dot dot-blue" aria-hidden="true" />
                <strong>{dashboard.scans}</strong> {t.statScans}
              </span>
              <span className={`quick-stat-pill ${dashboard.high_risk > 0 ? "pill-alert" : ""}`}>
                <span className="pill-dot dot-amber" aria-hidden="true" />
                <strong>{dashboard.high_risk}</strong> {t.statHighRisk}
              </span>
            </div>
          </div>

          {/* Right Column: 3D Floating Real-Data Glass Cards */}
          <div className="hero-live-cards-column">
            {/* Live Microclimate Card (Real Open-Meteo) */}
            <div className="hero-floating-glass-card hero-live-weather-card">
              <div className="glass-card-header">
                <div className="glass-card-title-group">
                  <span className="live-pulse-ring" aria-hidden="true" />
                  <span className="glass-card-eyebrow">{t.liveContext}</span>
                </div>
                <button
                  type="button"
                  className="glass-mini-refresh-btn"
                  onClick={refreshWeather}
                  title={t.refreshWeatherTitle}
                  aria-label={t.refreshWeatherTitle}
                >
                  ↻
                </button>
              </div>

              <div className="weather-orb-display-row">
                <div className="weather-floating-orb" aria-hidden="true">
                  {conditionIcon}
                </div>
                <div>
                  <div className="weather-temp-hero">{temp}°C</div>
                  <div className="weather-status-sub">{conditionText}</div>
                </div>
              </div>

              <div className="weather-pills-trio">
                <div className="micro-weather-pill">
                  <small>{t.humidity}</small>
                  <span>💧 {hum}%</span>
                </div>
                <div className="micro-weather-pill">
                  <small>{t.rain}</small>
                  <span>🌧️ {rain} mm</span>
                </div>
                <div className="micro-weather-pill">
                  <small>{t.source}</small>
                  <span>{weather.source === "Open-Meteo" ? t.live : t.demo}</span>
                </div>
              </div>

              <button
                type="button"
                className="btn-glass-subtle"
                onClick={useLocation}
              >
                📍 {t.useMyLocation}
              </button>
            </div>

            {/* Real Crop Health Overview Card */}
            <div className="hero-floating-glass-card hero-live-crop-card">
              <div className="glass-card-header">
                <div className="glass-card-title-group">
                  <span className="leaf-status-dot" aria-hidden="true" />
                  <span className="glass-card-eyebrow">{t.realCropOverview}</span>
                </div>
                <span className="glass-tag-badge">{t.realCropActive}</span>
              </div>

              {recentScan ? (
                <div className="recent-crop-hero-meta">
                  <div className="recent-crop-title-row">
                    <h3>{recentScan.crop ? (t.crops?.[recentScan.crop] || recentScan.crop) : t.specimenFallback}</h3>
                    <span className="recent-crop-disease">{t.diseases?.[recentScan.disease] || recentScan.disease}</span>
                  </div>
                  <div className="recent-crop-chips">
                    <span>🤖 {recentScan.confidence}% {t.confidence}</span>
                    <span>•</span>
                    <span>⚠️ {recentScan.risk_score}% {t.risk}</span>
                  </div>
                </div>
              ) : (
                <div className="empty-recent-notice">
                  <p>{t.realNoRecentScans}</p>
                </div>
              )}

              <div className="crop-metrics-dual">
                <div className="crop-metric-tile">
                  <div className="metric-val">{dashboard.crops}</div>
                  <div className="metric-lbl">{t.statCrops}</div>
                </div>
                <div className="crop-metric-tile">
                  <div className="metric-val">{dashboard.scans}</div>
                  <div className="metric-lbl">{t.statScans}</div>
                </div>
                <div className="crop-metric-tile">
                  <div className="metric-val">{dashboard.high_risk}</div>
                  <div className="metric-lbl">{t.statHighRisk}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. AGRIXAI THE INTELLIGENT SPHERE (AI Interaction Hub - Dribbble Page 5, 7, 8) */}
      <section className="ai-intelligent-sphere-section" aria-label={t.aiHubTitle}>
        <div className="ai-sphere-header-bar">
          <div className="sphere-title-group">
            <span className="eyebrow">{t.aiHubTitle}</span>
            <h2>{t.aiHubSubtitle}</h2>
          </div>
        </div>

        {/* Quick Diagnostic Interaction Pills */}
        <div className="sphere-quick-pills-row">
          <button
            type="button"
            className={`sphere-mode-pill ${activeSphereMode === "analysis" ? "active" : ""}`}
            onClick={() => {
              setActiveSphereMode("analysis");
              setPage("scan");
            }}
          >
            <span>🔬 {t.aiQuickAnalysis}</span>
          </button>
          <button
            type="button"
            className={`sphere-mode-pill ${activeSphereMode === "voice" ? "active" : ""}`}
            onClick={() => setActiveSphereMode("voice")}
          >
            <span>🎙️ {t.aiQuickVoice}</span>
          </button>
          <button
            type="button"
            className={`sphere-mode-pill ${activeSphereMode === "weather" ? "active" : ""}`}
            onClick={() => setActiveSphereMode("weather")}
          >
            <span>🌦️ {t.aiQuickWeather}</span>
          </button>
          <button
            type="button"
            className={`sphere-mode-pill ${activeSphereMode === "market" ? "active" : ""}`}
            onClick={() => {
              setActiveSphereMode("market");
              openMarket();
            }}
          >
            <span>🤝 {t.aiQuickMarket}</span>
          </button>
        </div>

        {/* AgrixAI Specimen & Voice Diagnostic Card */}
        <div className="ai-dialogue-specimen-grid">
          {/* Specimen Showcase Visual with Reticle Overlay */}
          <div className="specimen-leaf-lens-card">
            <img
              src={specimenLeafAi}
              alt={t.aiSpecimenLeaf}
              className="specimen-leaf-img"
            />
            <div className="specimen-lens-reticle">
              <div className="specimen-badge-top">
                <span className="specimen-badge-chip">{t.specimenChip}</span>
                <span className="specimen-badge-chip">{t.aiSpecimenLeaf}</span>
              </div>
              <div className="specimen-target-crosshair" aria-hidden="true" />
            </div>
          </div>

          {/* Dialogue & Voice Note Column */}
          <div className="ai-chat-response-column">
            {/* Field Agronomist Voice Note Simulator */}
            <div className="ai-voice-note-player">
              <button
                type="button"
                className="audio-play-trigger"
                aria-label={t.aiSpecimenAudio}
              >
                ▶
              </button>
              <div className="audio-waveform-bars" aria-hidden="true">
                <span className="waveform-bar" style={{ height: "14px" }} />
                <span className="waveform-bar" style={{ height: "22px" }} />
                <span className="waveform-bar" style={{ height: "10px" }} />
                <span className="waveform-bar" style={{ height: "26px" }} />
                <span className="waveform-bar" style={{ height: "16px" }} />
                <span className="waveform-bar" style={{ height: "20px" }} />
                <span className="waveform-bar" style={{ height: "12px" }} />
                <span className="waveform-bar" style={{ height: "24px" }} />
                <span className="waveform-bar" style={{ height: "18px" }} />
                <span className="waveform-bar" style={{ height: "14px" }} />
                <span className="waveform-bar" style={{ height: "20px" }} />
              </div>
              <div className="audio-timer-badge">
                <span>{t.aiSpecimenDuration}</span>
              </div>
            </div>

            {/* Diagnostic Intelligence Bubble */}
            <div className="ai-recommendation-bubble">
              <p>
                {recentScan?.recommendation
                  ? (t.recommendations?.[recentScan.recommendation] || recentScan.recommendation)
                  : t.aiSampleDiagnosis}
              </p>
            </div>
          </div>
        </div>

        {/* Interactive Query Input Bar */}
        <form className="ai-interactive-input-bar" onSubmit={handleAskSubmit}>
          <input
            type="text"
            value={askInput}
            onChange={(e) => setAskInput(e.target.value)}
            placeholder={t.aiHubAskPlaceholder}
          />
          <div className="ai-input-actions-group">
            <button
              type="button"
              className="ai-input-btn"
              onClick={() => setPage("scan")}
            >
              📷 {t.scan}
            </button>
            <button type="submit" className="btn-primary btn-sm">
              ➔
            </button>
          </div>
        </form>
      </section>

      {/* 3. FIELD TELEMETRY & SATELLITE ZONES (Dribbble Page 3 & 4) */}
      <section className="field-satellite-zones-section" aria-label={t.fieldZonesTitle}>
        <div className="page-head-banner" style={{ marginBottom: "16px" }}>
          <span className="eyebrow">{t.fieldZonesTitle}</span>
          <h2>{t.fieldZonesSubtitle}</h2>
        </div>

        <div
          className="satellite-banner-frame"
          style={{ backgroundImage: `url(${aerialFarmZones})` }}
        >
          <div className="satellite-banner-overlay">
            <div className="satellite-top-meta">
              <span className="gps-coordinates-badge">
                📍 {displayLocation(location)} · {coords?.latitude ? coords.latitude.toFixed(4) : "12.9716"}°N, {coords?.longitude ? coords.longitude.toFixed(4) : "77.5946"}°E
              </span>
              <span className="glass-tag-badge">{t.hudSensorsSync}</span>
            </div>

            <div className="satellite-zones-chips-row">
              <div className="zone-interactive-chip">
                <span>🌾 {t.fieldZoneA}</span>
                <span className="zone-chip-status">{t.vitalityTag}</span>
              </div>
              <div className="zone-interactive-chip">
                <span>💧 {t.fieldZoneB}</span>
                <span className="zone-chip-status">{t.soilMoistureTag}</span>
              </div>
              <div className="zone-interactive-chip">
                <span>✨ {t.fieldZoneC}</span>
                <span className="zone-chip-status">{t.harvestReadyStatus}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="field-zones-meta-grid">
          <div className="field-zone-metric-card">
            <h4>{t.fieldNdviIndex}</h4>
            <p>{t.fieldNdviOptimal}</p>
            <div className="field-zone-ndvi-bar" aria-hidden="true" />
          </div>

          <div className="field-zone-metric-card">
            <h4>{t.hudMicroclimateSynth}</h4>
            <p>{temp}°C · {hum}% {t.unitHum} · {weather.source === "Open-Meteo" ? t.live : t.demo}</p>
            <div className="field-zone-ndvi-bar" style={{ background: "linear-gradient(90deg, #38bdf8, #818cf8)" }} aria-hidden="true" />
          </div>

          <div className="field-zone-metric-card">
            <h4>{t.hudPathogenRisk}</h4>
            <p>{dashboard.high_risk > 0 ? fillText(t.highRiskPlotsCount, { count: dashboard.high_risk }) : t.hudZeroThreats}</p>
            <div className="field-zone-ndvi-bar" style={{ background: "linear-gradient(90deg, #10b981, #22c55e)" }} aria-hidden="true" />
          </div>
        </div>
      </section>

      {/* 4. PRECISION CONTROLLED GREENHOUSE (Dribbble Page 1 & 14) */}
      <section className="greenhouse-precision-section" aria-label={t.greenhouseTitle}>
        <div
          className="greenhouse-visual-frame"
          style={{ backgroundImage: `url(${smartGreenhouseAi})` }}
        >
          <div className="greenhouse-visual-overlay">
            <span className="greenhouse-badge-pill">
              🌿 {t.greenhouseTitle}
            </span>
          </div>
        </div>

        <div>
          <span className="eyebrow">{t.greenhouseTitle}</span>
          <h2 style={{ fontSize: "22px", fontWeight: 850, color: "var(--ink-primary)", margin: "4px 0 8px" }}>
            {t.greenhouseSubtitle}
          </h2>

          <div className="greenhouse-telemetry-grid">
            <div className="greenhouse-stat-tile">
              <span>{t.greenhouseGrowth}</span>
              <b>{t.greenhouseGrowthVal}</b>
            </div>
            <div className="greenhouse-stat-tile">
              <span>{t.greenhouseCo2}</span>
              <b>{t.co2LevelVal}</b>
            </div>
            <div className="greenhouse-stat-tile">
              <span>{t.greenhouseLight}</span>
              <b>{t.photoperiodVal}</b>
            </div>
            <div className="greenhouse-stat-tile">
              <span>{t.weather}</span>
              <b>{temp}°C · {hum}% {t.unitHum}</b>
            </div>
          </div>
        </div>
      </section>

      {/* 5. CONNECTED 5-STAGE CROP JOURNEY ROADMAP */}
      <CropJourneyRoadmap t={t} />

      {/* 6. ENVIRONMENTAL LIVE MICROCLIMATE */}
      <WeatherWidget
        weather={weather}
        refreshWeather={refreshWeather}
        useLocation={useLocation}
        t={t}
      />
    </div>
  );
}

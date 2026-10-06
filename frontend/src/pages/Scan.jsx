import CircularGauge from "../components/CircularGauge";
import RiskBadge from "../components/RiskBadge";
import ScanLaserOverlay from "../components/ScanLaserOverlay";
import specimenLeafAi from "../assets/specimen_leaf_ai.jpg";

export default function Scan({
  t,
  file,
  preview,
  handleFile,
  fileRef,
  location,
  setLocation,
  useLocation,
  analyze,
  loading,
  result,
  openPassport,
  openMarket,
}) {
  const onDragOver = (e) => {
    e.preventDefault();
  };

  const onDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const isHealthy = result?.disease?.toLowerCase().includes("healthy");

  return (
    <section className="page-section scan-lab-experience">
      <div className="page-head-banner">
        <div className="eyebrow">{t.scanEyebrow}</div>
        <h1>{t.scan}</h1>
        <p>{t.scanDesc}</p>
      </div>

      <div className="scan-split-layout">
        {/* Upload & Precision AI Targeting Laboratory */}
        <div className="scan-lab-chamber">
          <div className="chamber-header-bar">
            <div className="chamber-title-group">
              <span className="chamber-dot-active" />
              <span className="chamber-title">{t.scanChamberTitle}</span>
            </div>
            <span className="chamber-spec-chip">{t.scanChamberSpec}</span>
          </div>

          <div
            className={`dropzone-container chamber-dropzone ${preview ? "is-active-image" : ""}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={onDragOver}
            onDrop={onDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
            }}
            aria-label={t.choose}
          >
            {preview ? (
              <>
                <img
                  src={preview}
                  alt={t.choose}
                  className="dropzone-preview-img"
                />
                <ScanLaserOverlay
                  isScanning={loading}
                  label={result ? t.scanInspectionComplete : t.scanSpecimenPositioned}
                  t={t}
                />
              </>
            ) : (
              <div className="dropzone-empty-wrap chamber-standby-preview" style={{ backgroundImage: `url(${specimenLeafAi})` }}>
                <div className="chamber-standby-overlay">
                  <div className="chamber-target-frame" aria-hidden="true">
                    <span className="frame-corner corner-tl" />
                    <span className="frame-corner corner-tr" />
                    <span className="frame-corner corner-bl" />
                    <span className="frame-corner corner-br" />
                    <span className="frame-icon-leaf">🌿</span>
                  </div>
                  <h3>{t.scanPlaceCrop}</h3>
                  <p>{t.fileHint}</p>
                  <div className="chamber-upload-trigger">
                    <span>{t.scanClickCapture}</span>
                  </div>
                </div>
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>

          <div className="scan-inputs-row">
            <label className="form-label-field">
              {t.fieldLocation}
              <input
                className="form-input-text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t.locationPlaceholder}
              />
            </label>
            <button
              type="button"
              className="btn-outline btn-detect-loc"
              onClick={useLocation}
            >
              📍 {t.detectLocation}
            </button>
          </div>

          <button
            type="button"
            className="btn-primary btn-full lab-scan-execute-btn"
            disabled={!file || loading}
            onClick={analyze}
          >
            {loading ? (
              <span>{t.scanDiagnosing}</span>
            ) : (
              <span>🔬 {t.analyze}</span>
            )}
          </button>
        </div>

        {/* AI Diagnostic Report Panel */}
        <div className="scan-report-container">
          {result ? (
            <div className="diagnostic-report-body">
              {/* Report Header */}
              <div className="report-security-header">
                <div>
                  <span className="report-doc-title">{t.scanReportTitle}</span>
                  <div className="report-doc-id">
                    {t.scanRecordRef} <strong>#ANX-SCAN-{String(result.scan_id || "001").padStart(4, "0")}</strong>
                  </div>
                </div>
                <span className="report-verified-badge">{t.scanInferenceVerified}</span>
              </div>

              {/* Core Diagnosis Card with Confidence Gauge */}
              <div className="report-hero-grid">
                <div className="report-gauge-col">
                  <CircularGauge
                    value={result.confidence}
                    size={116}
                    strokeWidth={10}
                    label={t.confidenceLabel}
                    subLabel={result.confidence >= 85 ? t.confidenceHigh : t.confidenceModerate}
                    color={result.confidence >= 80 ? "#15803d" : "#d97706"}
                  />
                </div>

                <div className="report-diag-meta-col">
                  <div className="report-health-status-row">
                    <span className="eyebrow" style={{ margin: 0 }}>
                      {t.healthStatusEyebrow}
                    </span>
                    <span className={`report-status-pill ${isHealthy ? "pill-healthy" : "pill-infected"}`}>
                      {isHealthy ? t.optimalVitality : t.pathogenDetected}
                    </span>
                  </div>

                  <h2 className="report-crop-title">{t.crops?.[result.crop] || result.crop}</h2>
                  <div className="report-disease-name">{t.diseases?.[result.disease] || result.disease}</div>
                </div>
              </div>

              {/* Multi-Tier Risk Evaluation Meter */}
              <div className="report-risk-strip">
                <div className="risk-score-group">
                  <span className="risk-label-mini">{t.risk}</span>
                  <span className="risk-score-big">{result.risk?.score ?? 0}%</span>
                </div>

                <div className="risk-scale-group">
                  <RiskBadge level={result.risk?.level} t={t} />
                  <div className="risk-meter-track" aria-hidden="true">
                    <span className={`meter-segment seg-low ${result.risk?.score <= 35 ? "is-active" : ""}`}>{t.riskLow}</span>
                    <span className={`meter-segment seg-mod ${result.risk?.score > 35 && result.risk?.score <= 70 ? "is-active" : ""}`}>{t.riskMod}</span>
                    <span className={`meter-segment seg-high ${result.risk?.score > 70 ? "is-active" : ""}`}>{t.riskHigh}</span>
                  </div>
                </div>
              </div>

              {/* Field Microclimate at Diagnosis */}
              {result.weather && (
                <div className="report-microclimate-row">
                  <span className="microclimate-chip">
                    🌡️ <strong>{Math.round(result.weather.temperature)}°C</strong> {t.weatherAmbient}
                  </span>
                  <span className="microclimate-chip">
                    💧 <strong>{Math.round(result.weather.humidity)}%</strong> {t.humidity}
                  </span>
                  <span className="microclimate-chip">
                    🌧️ <strong>{Math.round(result.weather.rainfall)} mm</strong> {t.rain}
                  </span>
                </div>
              )}

              {/* Clinical Agronomy Prescription */}
              <div className="report-prescription-box">
                <div className="prescription-head">
                  <span>📋</span>
                  <strong>{t.recommendation}</strong>
                </div>
                <p>{t.recommendations?.[result.risk?.recommendation] || result.risk?.recommendation}</p>
              </div>

              {/* Report Actions */}
              <div className="report-actions-row">
                <button
                  type="button"
                  className="btn-secondary report-action-btn"
                  onClick={openPassport}
                >
                  📔 {t.openPassport}
                </button>
                <button
                  type="button"
                  className="btn-primary report-action-btn"
                  onClick={openMarket}
                >
                  🤝 {t.findBuyers}
                </button>
              </div>
            </div>
          ) : (
            <div className="report-idle-chamber">
              <div className="idle-laser-lens" aria-hidden="true">
                <div className="lens-ring-1" />
                <div className="lens-ring-2" />
                <span className="lens-symbol">🔬</span>
              </div>
              <h2>{t.idleStandbyTitle}</h2>
              <p>{t.idleStandbyDesc}</p>
              <div className="idle-specs-list">
                <span>{t.idleSpecTflite}</span>
                <span>{t.idleSpecSatellite}</span>
                <span>{t.idleSpecPassport}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

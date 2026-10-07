import RiskBadge from "../components/RiskBadge";
import HarvestForm from "../components/HarvestForm";

export default function Passport({
  t,
  fill,
  passport,
  openPassport,
  setPage,
  apiUrl,
  readyToSell,
  readyReason,
}) {
  const isHarvested = Boolean(passport?.harvest);
  const fillText = fill || ((text, vars) => text.replace(/\{(\w+)\}/g, (_, key) => vars[key]));

  const lifecycleStages = [
    { label: t.lifecycleSeed, icon: "🌱", active: true },
    { label: t.lifecycleGrowth, icon: "🌿", active: true },
    { label: t.lifecycleScan, icon: "📷", active: Boolean(passport?.scans?.length) },
    { label: t.lifecycleHealthCheck, icon: "🩺", active: Boolean(passport?.scans?.length) },
    { label: t.lifecycleHarvest, icon: "🌾", active: isHarvested },
    { label: t.lifecycleMarket, icon: "🤝", active: isHarvested },
  ];

  return (
    <section className="page-section passport-experience">
      <div className="page-head-banner">
        <div className="eyebrow">{t.passportEyebrow}</div>
        <h1>{t.passport}</h1>
        <p>{t.passportDesc}</p>
      </div>

      {passport ? (
        <div className="passport-split-layout">
          {/* Main Passport Digital Certificate Card */}
          <div className="passport-card-cert">
            {/* Official Security Header */}
            <div className="passport-cert-head">
              <div className="cert-top-security-bar">
                <div className="passport-chip-emblem">
                  <span className="chip-gold-lines" />
                  <span className="chip-label">ANX-ID</span>
                </div>
                <div className="cert-doc-type">
                  <span className="doc-nation">{t.passportDocNation}</span>
                  <span className="doc-reg">{t.passportDocReg}</span>
                </div>
                <span className="verified-pill">
                  {t.digitalRecord}
                </span>
              </div>

              <div className="cert-main-body">
                <div className="cert-emblem" aria-hidden="true">
                  🌾
                </div>
                <div className="cert-meta-info">
                  <span className="cert-id-tag">
                    {t.passportId}: ANX-{String(passport.crop.id).padStart(5, "0")}
                  </span>
                  <h2>{t.crops?.[passport.crop.crop_type] || passport.crop.crop_type}</h2>
                  <div className="cert-lot-meta">
                    <span>📍 {t.locations?.[passport.crop.location] || passport.crop.location || t.fieldLocation}</span>
                    <span>👨‍🌾 {t.farmers?.[passport.crop.farmer_name] || passport.crop.farmer_name || t.passportVerifiedGrower}</span>
                    <span>📅 {passport.crop.created_at ? new Date(passport.crop.created_at).toLocaleDateString() : t.passportActiveLot}</span>
                  </div>
                </div>

                <div className="cert-qr-glyph" aria-hidden="true">
                  <svg viewBox="0 0 40 40" width="44" height="44" fill="#34d399">
                    <rect x="2" y="2" width="14" height="14" fill="none" stroke="#34d399" strokeWidth="2.5" />
                    <rect x="6" y="6" width="6" height="6" />
                    <rect x="24" y="2" width="14" height="14" fill="none" stroke="#34d399" strokeWidth="2.5" />
                    <rect x="28" y="6" width="6" height="6" />
                    <rect x="2" y="24" width="14" height="14" fill="none" stroke="#34d399" strokeWidth="2.5" />
                    <rect x="6" y="28" width="6" height="6" />
                    <rect x="24" y="24" width="4" height="4" />
                    <rect x="34" y="24" width="4" height="4" />
                    <rect x="28" y="32" width="8" height="4" />
                  </svg>
                  <span className="qr-label">{t.passportChainVerified}</span>
                </div>
              </div>

              {/* Crop Life Journey Lifecycle Ribbon */}
              <div className="crop-lifecycle-ribbon" aria-label={t.passportDesc}>
                {lifecycleStages.map((st, i) => (
                  <div key={st.label} className={`lifecycle-stage-node ${st.active ? "is-stage-active" : "is-stage-pending"}`}>
                    <div className="stage-icon-circle">{st.icon}</div>
                    <span className="stage-label-text">{st.label}</span>
                    {i < lifecycleStages.length - 1 && <span className="stage-arrow">➔</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Health & Condition Observation Timeline */}
            <div className="timeline-scroller">
              <div className="timeline-header-bar">
                <span className="eyebrow" style={{ margin: 0 }}>
                  {t.passportAuditTrail}
                </span>
                <span className="scans-count-tag">
                  {fillText(t.passportEventCount, { count: passport.scans ? passport.scans.length : 0 })}
                </span>
              </div>

              {passport.scans && passport.scans.length > 0 ? (
                passport.scans.map((scan, idx) => (
                  <div className="timeline-node-item" key={scan.id}>
                    <div className="timeline-dot-pin" />
                    <div className="timeline-body">
                      <div className="timeline-top-row">
                        <div className="timeline-title-wrap">
                          <span className="event-index-pill">#{String(passport.scans.length - idx).padStart(2, "0")}</span>
                          <b>{t.diseases?.[scan.disease] || scan.disease}</b>
                        </div>
                        <RiskBadge level={scan.risk_level} t={t} />
                      </div>
                      <div className="timeline-timestamp">
                        📅 {new Date(scan.created_at).toLocaleString()}
                      </div>
                      <div className="timeline-badges-wrap">
                        <span className="timeline-meta-pill">
                          🤖 {t.aiLabel} {scan.confidence}% {t.passportConf}
                        </span>
                        <span className="timeline-meta-pill">
                          🌡️ {Math.round(scan.temperature)}°C {t.passportTemp}
                        </span>
                        <span className="timeline-meta-pill">
                          💧 {Math.round(scan.humidity)}% {t.humidity}
                        </span>
                        <span className="timeline-meta-pill">
                          ⚠️ {t.risk}: {scan.risk_score}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="timeline-empty-message">
                  <p>{t.noData}</p>
                </div>
              )}
            </div>
          </div>

          {/* Harvest & Batch Handoff Certification */}
          <div className="harvest-side-panel">
            <div className="harvest-badge-header">
              <div className="eyebrow">{t.harvestEyebrow}</div>
              <h2>{t.verified}</h2>
            </div>

            {passport.harvest ? (
              <div className="harvest-verified-certificate">
                <div className="cert-ribbon-badge">
                  <span className="ribbon-icon">🏅</span>
                  <span className="ribbon-text">{t.certOfficialTitle}</span>
                </div>
                <div className="harvest-verified-banner">
                  <div className="harvest-check-seal" aria-hidden="true">
                    ✓
                  </div>
                  <div>
                    <b>{t.verifiedLabel} {t.certProduceCertified}</b>
                    <p>
                      {t.certNetQuantity} <strong>{passport.harvest.quantity} {t.unitKg || passport.harvest.unit}</strong>
                    </p>
                    <p className="harvest-grade-pill">
                      {t.certQuality} <strong>{fillText(t.gradeFormat, { grade: passport.harvest.quality_grade })} ({t.certMarketReady})</strong>
                    </p>
                  </div>
                </div>
                <div className="harvest-cert-footer">
                  <span>{t.certCryptoSeal}</span>
                </div>
              </div>
            ) : (
              <div className="harvest-recorder-block">
                <p>{t.harvestPrompt}</p>
                <HarvestForm
                  cropId={passport.crop.id}
                  onDone={openPassport}
                  t={t}
                  apiUrl={apiUrl}
                />
              </div>
            )}
            <div className={`market-badge ${readyToSell ? "" : "status-pending"}`}>
              {readyToSell ? "✓ Ready to sell" : "Not ready"}
            </div>
            {!readyToSell && <p>{readyReason}</p>}
          </div>
        </div>
      ) : (
        <div className="empty-placeholder-view">
          <div className="empty-view-icon" aria-hidden="true">
            📔
          </div>
          <h2>{t.emptyPassportTitle}</h2>
          <p>{t.emptyPassportText}</p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setPage("scan")}
          >
            🌱 {t.startScan}
          </button>
        </div>
      )}
    </section>
  );
}

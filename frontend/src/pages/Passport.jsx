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
  loading,
  error,
  onRetry,
  onRescan,
}) {
  const isHarvested = Boolean(passport?.harvest);
  const fillText = fill || ((text, vars) => text.replace(/\{(\w+)\}/g, (_, key) => vars[key]));
  const treatmentCourses = passport?.treatment_courses || [];
  const chronologicalScans = [...(passport?.scans || [])].sort((left, right) => {
    const leftTime = new Date(left.created_at).getTime();
    const rightTime = new Date(right.created_at).getTime();
    const timeDifference = (Number.isNaN(leftTime) ? 0 : leftTime) - (Number.isNaN(rightTime) ? 0 : rightTime);
    return timeDifference || left.id - right.id;
  });
  const latestScan = chronologicalScans.at(-1) || null;
  const latestScanIsHealthy = String(latestScan?.disease || "").toLowerCase().includes("healthy");
  const currentTreatment = !latestScanIsHealthy && latestScan
    ? treatmentCourses.find((course) => course.scans?.some((item) => item.scan?.id === latestScan.id)) || null
    : null;
  const formatWorkflowDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };
  const followUpIntervalDays = Number(currentTreatment?.follow_up_interval_days);
  const hasVerifiedFollowUp = Boolean(
    currentTreatment?.follow_up_required
    && Number.isInteger(followUpIntervalDays)
    && followUpIntervalDays > 0
    && currentTreatment?.next_follow_up_at
    && formatWorkflowDate(currentTreatment.next_follow_up_at)
  );

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

      {loading ? (
        <div className="panel empty-state" role="status">
          <h2>Loading Health Passport…</h2>
        </div>
      ) : error ? (
        <div className="panel empty-state" role="alert">
          <h2>Health Passport could not be loaded</h2>
          <p>{error}</p>
          <button type="button" className="btn-primary" onClick={onRetry}>Try again</button>
        </div>
      ) : passport ? (
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

            {/* Latest scan and persisted treatment workflow */}
            <div className="timeline-scroller">
              <div className="timeline-header-bar">
                <span className="eyebrow" style={{ margin: 0 }}>CURRENT · LATEST SCAN</span>
              </div>

              {latestScan ? (
                <div className="timeline-body">
                  <div className="timeline-top-row">
                    <div className="timeline-title-wrap">
                      <span className="event-index-pill">{latestScanIsHealthy ? "HEALTHY" : "DISEASE DETECTED"}</span>
                      <b>{t.diseases?.[latestScan.disease] || latestScan.disease}</b>
                    </div>
                    <RiskBadge level={latestScan.risk_level} t={t} />
                  </div>
                  <div className="timeline-timestamp">
                    📅 {new Date(latestScan.created_at).toLocaleString()}
                  </div>
                  <div className="timeline-badges-wrap">
                    {latestScan.confidence != null && (
                      <span className="timeline-meta-pill">🤖 {t.aiLabel} {latestScan.confidence}% {t.passportConf}</span>
                    )}
                    {latestScan.risk_score != null && (
                      <span className="timeline-meta-pill">⚠️ {t.risk}: {latestScan.risk_score}%</span>
                    )}
                    {latestScan.temperature != null && (
                      <span className="timeline-meta-pill">🌡️ {Math.round(latestScan.temperature)}°C {t.passportTemp}</span>
                    )}
                    {latestScan.humidity != null && (
                      <span className="timeline-meta-pill">💧 {Math.round(latestScan.humidity)}% {t.humidity}</span>
                    )}
                    {latestScan.rainfall != null && (
                      <span className="timeline-meta-pill">🌧️ {latestScan.rainfall} mm rain</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="timeline-empty-message">
                  <p>No completed scans are recorded for this Passport yet.</p>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => onRescan?.(null)}
                  >
                    Start First Scan
                  </button>
                </div>
              )}

              <div className="timeline-header-bar">
                <span className="eyebrow" style={{ margin: 0 }}>NEXT · FOLLOW-UP</span>
              </div>
              <div className="timeline-body">
                <div className="timeline-top-row">
                  <b>Current status</b>
                  <span className="event-index-pill">
                    {!latestScan ? "AWAITING FIRST SCAN" : latestScanIsHealthy ? "HEALTHY" : currentTreatment?.status?.replaceAll("_", " ").toUpperCase() || "DISEASE DETECTED"}
                  </span>
                </div>
                {latestScan ? (
                  <div className="timeline-timestamp">
                    Latest scan: {new Date(latestScan.created_at).toLocaleString()}
                  </div>
                ) : null}
                {latestScanIsHealthy ? (
                  <>
                    <p>No follow-up scan is currently required.</p>
                    <p><strong>Eligible for Harvest Verification</strong></p>
                  </>
                ) : currentTreatment ? (
                  <>
                    <p>
                      Follow-up status: {currentTreatment.follow_up_required
                        ? hasVerifiedFollowUp ? "Follow-up scan required" : "Follow-up required; no verified interval available"
                        : "No follow-up information available"}
                    </p>
                    {currentTreatment.recommendation?.medicine && (
                      <p>Treatment: {currentTreatment.recommendation.medicine}</p>
                    )}
                    {hasVerifiedFollowUp && (
                      <>
                        <p>
                          Follow-up after {followUpIntervalDays} days ·{" "}
                          {formatWorkflowDate(currentTreatment.next_follow_up_at)}
                        </p>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => onRescan?.(currentTreatment.id)}
                        >
                          Re-scan Crop
                        </button>
                      </>
                    )}
                  </>
                ) : latestScan ? (
                  <p>No persisted treatment or follow-up course is linked to the latest scan.</p>
                ) : (
                  <p>Complete a scan to see the current follow-up status.</p>
                )}
              </div>

              <div className="timeline-header-bar">
                <span className="eyebrow" style={{ margin: 0 }}>HISTORY · TREATMENTS &amp; SPRAYS</span>
              </div>
              {treatmentCourses.length > 0 ? (
                [...treatmentCourses].reverse().map((course) => (
                  <div className="timeline-body" key={course.id}>
                    <div className="timeline-top-row">
                      <div className="timeline-title-wrap">
                        <b>{t.diseases?.[course.disease_class] || course.disease_class}</b>
                        <span className="event-index-pill">
                          {latestScanIsHealthy ? "HISTORY" : course.status?.replaceAll("_", " ").toUpperCase()}
                        </span>
                      </div>
                      {course.created_at && (
                        <span className="timeline-timestamp">{formatWorkflowDate(course.created_at)}</span>
                      )}
                    </div>
                    {course.recommendation?.medicine && (
                      <p>Treatment: {course.recommendation.medicine}</p>
                    )}
                    {Array.isArray(course.applications) && course.applications.length > 0 ? (
                      course.applications.map((application, index) => (
                        <div className="timeline-timestamp" key={application.id}>
                          Spray {index + 1}{course.total_applications ? ` of ${course.total_applications}` : ""} ·{" "}
                          {new Date(application.applied_at).toLocaleString()}
                        </div>
                      ))
                    ) : (
                      <p>No spray/application records are recorded.</p>
                    )}
                  </div>
                ))
              ) : (
                <div className="timeline-body">
                  <p>No persisted treatment or spray records are available for this Passport.</p>
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

import RiskBadge from "../components/RiskBadge";
import HarvestForm from "../components/HarvestForm";
import HealthPassport from "../components/HealthPassport";

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
  const toPercent = (value) => {
    const number = Number(value);
    return value == null || !Number.isFinite(number)
      ? undefined
      : Math.min(100, Math.max(0, number));
  };
  const mappedScans = chronologicalScans.map((scan) => ({
    id: scan.id,
    disease: scan.disease,
    confidence: toPercent(scan.confidence),
    risk: toPercent(scan.risk_score),
    temp: scan.temperature,
    humidity: scan.humidity,
    rain: scan.rainfall,
    scannedAt: scan.created_at ? new Date(scan.created_at).toISOString() : undefined,
  }));
  const mappedSprays = treatmentCourses.flatMap((course) =>
    (course.applications || []).map((application, index) => ({
      id: application.id,
      disease: course.disease_class,
      sprayNo: index + 1,
      totalSprays: course.total_applications ?? undefined,
      date: application.applied_at ? new Date(application.applied_at).toISOString() : undefined,
      temp: undefined,
      humidity: undefined,
      risk: undefined,
    }))
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

            <HealthPassport
              crop={t.crops?.[passport.crop.crop_type] || passport.crop.crop_type}
              passportId={`ANX-${String(passport.crop.id).padStart(5, "0")}`}
              farmer={passport.crop.farmer_name}
              location={passport.crop.location}
              scans={mappedScans}
              sprays={mappedSprays}
              onRescan={() => onRescan?.(currentTreatment?.id ?? null)}
              showHarvestPanel={false}
            />
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

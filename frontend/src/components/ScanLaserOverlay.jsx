import { useEffect, useState } from "react";

export default function ScanLaserOverlay({ isScanning, label, t }) {
  const [scanStep, setScanStep] = useState(0);

  const scanStages = t ? [
    { text: t.scanStageMorphology, pct: 32 },
    { text: t.scanStagePathogen, pct: 68 },
    { text: t.scanStageRisk, pct: 91 },
    { text: t.scanStageRecord, pct: 98 },
  ] : [];

  useEffect(() => {
    if (!isScanning || !scanStages.length) return;

    const interval = setInterval(() => {
      setScanStep((prev) => (prev + 1) % scanStages.length);
    }, 700);

    return () => clearInterval(interval);
  }, [isScanning, scanStages.length]);

  const currentStage = isScanning && scanStages.length ? scanStages[scanStep] : null;
  const progress = currentStage ? currentStage.pct : 25;
  const activeLabel = label || t?.scanLensActive || "";

  return (
    <div className={`scan-laser-hud ${isScanning ? "is-active-scanning" : ""}`} aria-hidden="true">
      {/* Corner Precision Brackets with Glow */}
      <div className="scan-corner-bracket bracket-tl" />
      <div className="scan-corner-bracket bracket-tr" />
      <div className="scan-corner-bracket bracket-bl" />
      <div className="scan-corner-bracket bracket-br" />

      {/* Center Target Reticle */}
      <div className="scan-reticle-center">
        <div className="reticle-ring" />
        <div className="reticle-crosshair" />
        <div className="reticle-pulse-wave" />
      </div>

      {/* Holographic Neural Grid & Sweep Laser */}
      <div className="scan-laser-grid" />
      <div className={`scan-laser-beam ${isScanning ? "is-analyzing" : ""}`} />

      {/* Floating Particles in Scan Chamber */}
      <div className="scan-particle particle-1" />
      <div className="scan-particle particle-2" />
      <div className="scan-particle particle-3" />

      {/* Active Diagnostics Telemetry HUD */}
      {isScanning && currentStage ? (
        <div className="scan-hud-analyzing-card">
          <div className="hud-analyzing-top">
            <span className="hud-analyzing-title">{t?.scanAnalyzingSpecimen}</span>
            <span className="hud-analyzing-pct">{progress}%</span>
          </div>

          <div className="hud-progress-track">
            <div className="hud-progress-fill" style={{ width: `${progress}%` }} />
          </div>

          <div className="hud-stage-message">
            <span className="stage-dot-pulse" />
            <span>{currentStage.text}</span>
          </div>
        </div>
      ) : (
        <>
          <div className="scan-hud-telemetry">
            <span>{t?.scanEdgeModel}</span>
            <span>{t?.scanResolution}</span>
          </div>

          <div className="scan-hud-status">
            <span className="hud-pulse-dot" />
            <span>{activeLabel}</span>
          </div>
        </>
      )}
    </div>
  );
}

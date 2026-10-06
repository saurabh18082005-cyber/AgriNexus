export default function CropJourneyRoadmap({ t }) {
  const journey = [
    { n: "01", icon: "📷", title: t.stepScan, text: t.stepScanText, tag: t.tagOptical },
    { n: "02", icon: "🧠", title: t.stepPredict, text: t.stepPredictText, tag: t.tagNeural },
    { n: "03", icon: "🌦️", title: t.stepRisk, text: t.stepRiskText, tag: t.tagWeather },
    { n: "04", icon: "📔", title: t.stepMonitor, text: t.stepMonitorText, tag: t.tagIdentity },
    { n: "05", icon: "🤝", title: t.stepConnect, text: t.stepConnectText, tag: t.tagMarket },
  ];

  return (
    <section className="crop-journey-section" aria-label={t.workflowTitle}>
      <div className="journey-section-header">
        <div className="eyebrow">{t.journeyEyebrow}</div>
        <h2 className="journey-main-title">{t.workflowTitle}</h2>
        <p className="journey-sub-text">
          {t.journeySubtitle}
        </p>
      </div>

      <div className="journey-flow-track-wrap">
        {/* Animated Connecting Flow Beam */}
        <div className="journey-connecting-beam" aria-hidden="true" />

        <div className="journey-nodes-row">
          {journey.map((step, idx) => (
            <div key={step.n} className="journey-node-item">
              <div className="node-marker-wrap">
                <div className="node-glow-ring" />
                <div className="node-icon-core">
                  <span className="node-step-badge">{step.n}</span>
                  <span className="node-emoji" aria-hidden="true">{step.icon}</span>
                </div>
              </div>

              <div className="node-card-body">
                <span className="node-tag-pill">{step.tag}</span>
                <h3 className="node-step-heading">{step.title}</h3>
                <p className="node-step-desc">{step.text}</p>
              </div>

              {idx < journey.length - 1 && (
                <div className="node-flow-connector-mobile" aria-hidden="true">↓</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

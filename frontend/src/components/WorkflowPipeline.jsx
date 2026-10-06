export default function WorkflowPipeline({ t }) {
  const steps = [
    { n: "01", icon: "📷", title: t.stepScan, text: t.stepScanText },
    { n: "02", icon: "🧠", title: t.stepPredict, text: t.stepPredictText },
    { n: "03", icon: "🌦️", title: t.stepRisk, text: t.stepRiskText },
    { n: "04", icon: "📔", title: t.stepMonitor, text: t.stepMonitorText },
    { n: "05", icon: "🤝", title: t.stepConnect, text: t.stepConnectText },
  ];

  return (
    <div className="card-panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow">{t.workflowEyebrow}</div>
          <h2 className="panel-title">{t.workflowTitle}</h2>
        </div>
      </div>

      <div className="workflow-pipeline-grid">
        {steps.map((s) => (
          <div key={s.n} className="workflow-step-card">
            <span className="step-num-pill">{s.n}</span>
            <span className="step-icon-emoji" aria-hidden="true">{s.icon}</span>
            <div className="step-meta">
              <b>{s.title}</b>
              <p>{s.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

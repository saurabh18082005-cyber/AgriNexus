import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { LANG } from "./translations";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const demoWeather = { temperature: 28, humidity: 78, rainfall: 2, source: "demo-fallback" };

function formatDisease(name) {
  return String(name || "").replace(/___/g, " · ").replace(/_/g, " ").replace(/,bell/g, "");
}

function RiskBadge({ level }) {
  return <span className={`badge risk-${String(level || "low").toLowerCase()}`}>{level || "Low"}</span>;
}

function Stat({ icon, label, value, sub }) {
  return <div className="stat-card"><div className="stat-icon">{icon}</div><div><div className="stat-value">{value}</div><div className="stat-label">{label}</div>{sub && <div className="stat-sub">{sub}</div>}</div></div>;
}

function App() {
  const [lang, setLang] = useState(localStorage.getItem("agrinexus-lang") || "en");
  const t = LANG[lang];
  const [page, setPage] = useState("home");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState(null);
  const [dashboard, setDashboard] = useState({ crops: 0, scans: 0, high_risk: 0, recent: [] });
  const [passport, setPassport] = useState(null);
  const [weather, setWeather] = useState(demoWeather);
  const [buyers, setBuyers] = useState([]);
  const [location, setLocation] = useState("Bengaluru");
  const [coords, setCoords] = useState({ latitude: 12.9716, longitude: 77.5946 });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const fileRef = useRef(null);

  const refreshDashboard = async () => {
    try {
      const res = await fetch(`${API_URL}/api/dashboard`);
      if (res.ok) setDashboard(await res.json());
    } catch { /* backend may be starting */ }
  };

  const refreshWeather = async () => {
    try {
      const res = await fetch(`${API_URL}/api/weather?latitude=${coords.latitude}&longitude=${coords.longitude}`);
      if (res.ok) setWeather(await res.json());
    } catch { setWeather(demoWeather); }
  };

  useEffect(() => {
    localStorage.setItem("agrinexus-lang", lang);
    refreshDashboard();
    refreshWeather();
  }, [lang]);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const handleFile = (selected) => {
    if (!selected) return;
    if (!selected.type.startsWith("image/")) { setMessage("Please choose an image file."); return; }
    if (selected.size > 10 * 1024 * 1024) { setMessage("Image must be smaller than 10 MB."); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setResult(null);
    setMessage("");
  };

  const useLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      setLocation("Current location");
    }, () => setMessage("Location permission was not available. Using Bengaluru demo location."));
  };

  const analyze = async () => {
    if (!file) return;
    setLoading(true); setMessage("");
    const form = new FormData();
    form.append("file", file);
    const params = new URLSearchParams({ latitude: coords.latitude, longitude: coords.longitude, location });
    try {
      const res = await fetch(`${API_URL}/api/scan?${params}`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Analysis failed");
      setResult(data);
      await refreshDashboard();
      setPage("scan");
    } catch (e) {
      setMessage(`${e.message}. Make sure the backend is running.`);
    } finally { setLoading(false); }
  };

  const openPassport = async () => {
    const cropId = result?.crop_id || dashboard.recent?.[0]?.crop_id;
    if (!cropId) { setPage("passport"); return; }
    try {
      const res = await fetch(`${API_URL}/api/passport/${cropId}`);
      if (res.ok) setPassport(await res.json());
    } catch { setMessage("Passport could not be loaded yet."); }
    setPage("passport");
  };

  const openMarket = async () => {
    const crop = result?.crop || passport?.crop?.crop_type || "Tomato";
    try {
      const res = await fetch(`${API_URL}/api/buyers?crop=${encodeURIComponent(crop)}`);
      if (res.ok) setBuyers(await res.json());
    } catch { setBuyers([]); }
    setPage("market");
  };

  const nav = (target) => {
    if (target === "passport") openPassport();
    else if (target === "market") openMarket();
    else setPage(target);
  };

  const cropTitle = useMemo(() => result?.crop || passport?.crop?.crop_type || "Tomato", [result, passport]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setPage("home")}><span className="brand-mark">🌱</span><span>Agri<span>Nexus</span></span></button>
        <nav className="nav-tabs">
          <button className={page === "home" ? "active" : ""} onClick={() => nav("home")}>{t.navHome}</button>
          <button className={page === "scan" ? "active" : ""} onClick={() => nav("scan")}>{t.navScan}</button>
          <button className={page === "passport" ? "active" : ""} onClick={() => nav("passport")}>{t.navPassport}</button>
          <button className={page === "market" ? "active" : ""} onClick={() => nav("market")}>{t.navMarket}</button>
        </nav>
        <select className="language" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
          {Object.entries(LANG).map(([key, value]) => <option key={key} value={key}>{value.name}</option>)}
        </select>
      </header>

      <main className="main">
        {message && <div className="alert">⚠️ {message}<button onClick={() => setMessage("")}>×</button></div>}

        {page === "home" && <>
          <section className="hero-card">
            <div className="hero-copy"><div className="eyebrow">AI CROP HEALTH INTELLIGENCE</div><h1>From first symptom<br/><span>to final sale.</span></h1><p>AgriNexus connects crop diagnosis, weather risk, health history and market access in one farmer-first workflow.</p><div className="hero-actions"><button className="primary" onClick={() => setPage("scan")}>📷 {t.scan}</button><button className="secondary" onClick={openPassport}>📔 {t.passport}</button></div></div>
            <div className="hero-visual"><div className="sun">☀️</div><div className="plant">🌿</div><div className="leaf-chip chip-one">AI diagnosis</div><div className="leaf-chip chip-two">Weather risk</div><div className="leaf-chip chip-three">Market ready</div></div>
          </section>
          <section className="stats-grid"><Stat icon="🌾" label="Tracked Crops" value={dashboard.crops} /><Stat icon="📷" label="Total Scans" value={dashboard.scans} /><Stat icon="⚠️" label="High Risk" value={dashboard.high_risk} /><Stat icon="🌦️" label="Humidity" value={`${Math.round(weather.humidity)}%`} sub={`${Math.round(weather.temperature)}°C · ${weather.source}`} /></section>
          <section className="section-grid">
            <div className="panel flow-panel"><div className="panel-head"><div><div className="eyebrow">THE WORKFLOW</div><h2>One scan. A complete crop story.</h2></div></div><div className="flow"><FlowStep n="01" icon="📷" title="Scan" text="Capture a leaf symptom." /><FlowStep n="02" icon="🧠" title="Predict" text="AI identifies the likely disease." /><FlowStep n="03" icon="🌦️" title="Risk" text="Weather conditions refine the risk." /><FlowStep n="04" icon="📔" title="Monitor" text="Every event becomes part of the passport." /><FlowStep n="05" icon="🤝" title="Connect" text="Verified harvest information reaches buyers." /></div></div>
            <div className="panel weather-panel"><div className="panel-head"><div><div className="eyebrow">LIVE CONTEXT</div><h2>{t.weather}</h2></div><button className="icon-btn" onClick={refreshWeather}>↻</button></div><div className="weather-main"><span>🌤️</span><strong>{Math.round(weather.temperature)}°C</strong></div><div className="weather-grid"><div><b>{Math.round(weather.humidity)}%</b><span>Humidity</span></div><div><b>{Math.round(weather.rainfall)} mm</b><span>Rain</span></div><div><b>{weather.source === "Open-Meteo" ? "Live" : "Demo"}</b><span>Source</span></div></div><button className="outline-btn" onClick={useLocation}>Use my location</button></div>
          </section>
        </>}

        {page === "scan" && <section className="page-section"><div className="page-title"><div><div className="eyebrow">STEP 1 · AI DIAGNOSIS</div><h1>{t.scan}</h1><p>Upload a clear leaf image. The system combines the disease model with weather context.</p></div></div><div className="scan-layout"><div className="panel scanner"><div className={`dropzone ${preview ? "has-image" : ""}`} onClick={() => fileRef.current?.click()}>{preview ? <img src={preview} alt="Selected crop leaf" /> : <><div className="drop-icon">📷</div><h3>{t.choose}</h3><p>JPG, PNG or WEBP · max 10 MB</p></>}<input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handleFile(e.target.files?.[0])} /></div><div className="scan-controls"><label>Field location<input value={location} onChange={(e) => setLocation(e.target.value)} /></label><button className="outline-btn" onClick={useLocation}>📍 Detect location</button></div><button className="primary full" disabled={!file || loading} onClick={analyze}>{loading ? t.analyzing : `✨ ${t.analyze}`}</button></div><div className="panel result-panel">{result ? <><div className="result-top"><span className="status-dot">●</span><span>{result.model_source === "tflite" ? "On-device TFLite model" : "Demo inference mode"}</span></div><div className="result-disease"><span className="result-emoji">🌿</span><div><span className="muted">Detected crop</span><h2>{result.crop}</h2><strong>{result.disease}</strong></div></div><div className="confidence-bar"><div style={{ width: `${Math.min(result.confidence, 100)}%` }} /></div><div className="confidence-row"><span>Model confidence</span><b>{result.confidence}%</b></div><div className="risk-card"><div><span className="muted">{t.risk}</span><h3>{result.risk.score}%</h3></div><RiskBadge level={result.risk.level} /></div><div className="weather-mini"><span>🌡️ {Math.round(result.weather.temperature)}°C</span><span>💧 {Math.round(result.weather.humidity)}%</span><span>🌧️ {Math.round(result.weather.rainfall)} mm</span></div><div className="recommendation"><b>💡 {t.recommendation}</b><p>{result.risk.recommendation}</p></div><div className="result-actions"><button className="secondary" onClick={openPassport}>Open Passport</button><button className="primary" onClick={openMarket}>Find Buyers</button></div></> : <div className="empty-result"><div>🧪</div><h2>Ready for analysis</h2><p>Your disease, weather and risk results will appear here after the scan.</p></div>}</div></div></section>}

        {page === "passport" && <section className="page-section"><div className="page-title"><div><div className="eyebrow">STEP 2 · CONTINUOUS RECORD</div><h1>{t.passport}</h1><p>A timeline of the crop's AI observations and field conditions.</p></div></div>{passport ? <div className="passport-layout"><div className="panel passport-card"><div className="passport-head"><div className="passport-icon">🌾</div><div><span className="muted">Passport ID</span><h2>ANX-{String(passport.crop.id).padStart(5, "0")}</h2><p>{passport.crop.crop_type} · {passport.crop.location || "Field location"}</p></div><span className="verified-pill">✓ Digital record</span></div><div className="timeline">{passport.scans.length ? passport.scans.map((s) => <div className="timeline-item" key={s.id}><div className="timeline-dot" /><div className="timeline-content"><div className="timeline-top"><b>{s.disease}</b><RiskBadge level={s.risk_level} /></div><p>{new Date(s.created_at).toLocaleString()}</p><div className="timeline-meta"><span>AI {s.confidence}%</span><span>{Math.round(s.temperature)}°C</span><span>{Math.round(s.humidity)}% RH</span><span>Risk {s.risk_score}%</span></div></div></div>) : <p className="muted">{t.noData}</p>}</div></div><div className="panel harvest-panel"><div className="eyebrow">HARVEST</div><h2>{t.verified}</h2>{passport.harvest ? <div className="harvest-success"><span>✓</span><div><b>Verified</b><p>{passport.harvest.quantity} {passport.harvest.unit} · Grade {passport.harvest.quality_grade}</p></div></div> : <><p>Record a harvest to create the market-ready handoff.</p><HarvestForm cropId={passport.crop.id} onDone={openPassport} /></>}</div></div> : <div className="panel empty-state"><div>📔</div><h2>Your passport starts with a scan</h2><p>Analyze a leaf first, then return here to see the crop health history.</p><button className="primary" onClick={() => setPage("scan")}>Start a scan</button></div>}</section>}

        {page === "market" && <section className="page-section"><div className="page-title"><div><div className="eyebrow">STEP 3 · MARKET ACCESS</div><h1>{t.market}</h1><p>Use the crop record to present a simple, transparent buyer handoff.</p></div></div><div className="market-layout"><div className="panel market-summary"><div className="market-badge">✓ VERIFIED-READY</div><h2>{cropTitle}</h2><p>Buyer matching is demonstrated with a curated MVP list. Production matching can later connect to FPOs and verified procurement networks.</p><div className="quality-row"><div><span className="muted">Latest health status</span><b>{result?.disease || "Awaiting scan"}</b></div><div><span className="muted">Risk</span><b>{result ? `${result.risk.score}%` : "—"}</b></div></div><button className="outline-btn" onClick={openPassport}>View crop passport</button></div><div className="buyer-list">{buyers.length ? buyers.map((b) => <div className="panel buyer-card" key={b.name}><div className="buyer-logo">🤝</div><div className="buyer-info"><h3>{b.name}</h3><p>{b.location} · {b.interest}</p><span>Accepts Grade {b.min_grade}+</span></div><button className="secondary" onClick={() => setMessage(`Demo interest request prepared for ${b.name}.`)}>Connect</button></div>) : <div className="panel empty-state"><div>🛒</div><h2>Buyers will appear here</h2><p>Run a crop scan to identify the crop and load matching buyers.</p><button className="primary" onClick={() => setPage("scan")}>Scan crop</button></div>}</div></div></section>}
      </main>
      <footer><span>🌱 AgriNexus</span><span>AI-assisted crop health · Weather-aware risk · Digital passport · Market access</span></footer>
    </div>
  );
}

function FlowStep({ n, icon, title, text }) { return <div className="flow-step"><span className="flow-number">{n}</span><span className="flow-icon">{icon}</span><div><b>{title}</b><p>{text}</p></div></div>; }

function HarvestForm({ cropId, onDone }) {
  const [quantity, setQuantity] = useState(100); const [grade, setGrade] = useState("A"); const [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); try { const r = await fetch(`${API_URL}/api/harvest`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ crop_id: cropId, quantity, unit: "kg", quality_grade: grade }) }); if (!r.ok) throw new Error(); onDone(); } catch { alert("Could not save harvest. Check that the backend is running."); } finally { setBusy(false); } };
  return <div className="harvest-form"><label>Quantity (kg)<input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label><label>Quality<select value={grade} onChange={(e) => setGrade(e.target.value)}><option>A</option><option>B</option><option>C</option></select></label><button className="primary full" disabled={busy} onClick={submit}>{busy ? "Saving…" : "✓ Verify harvest"}</button></div>;
}

export default App;
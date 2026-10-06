import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { LANG } from "./translations";

import FloatingFlora from "./components/FloatingFlora";
import Navigation from "./components/Navigation";
import AlertToast from "./components/AlertToast";

import Home from "./pages/Home";
import Scan from "./pages/Scan";
import Passport from "./pages/Passport";
import Market from "./pages/Market";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const demoWeather = {
  temperature: 28,
  humidity: 78,
  rainfall: 2,
  source: "demo-fallback",
};

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, key) => vars[key]);

export default function App() {
  const [lang, setLang] = useState(
    () => localStorage.getItem("agrinexus-lang") || "en"
  );
  const t = LANG[lang] || LANG.en;

  const [page, setPage] = useState("home");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState(null);
  const [dashboard, setDashboard] = useState({
    crops: 0,
    scans: 0,
    high_risk: 0,
    recent: [],
  });
  const [passport, setPassport] = useState(null);
  const [weather, setWeather] = useState(demoWeather);
  const [buyers, setBuyers] = useState([]);
  const [listings, setListings] = useState([]);
  const [listingBusy, setListingBusy] = useState(false);
  const [location, setLocation] = useState("Bengaluru");
  const [coords, setCoords] = useState({ latitude: 12.9716, longitude: 77.5946 });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const fileRef = useRef(null);

  const refreshDashboard = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/dashboard`);
      if (res.ok) {
        setDashboard(await res.json());
      }
    } catch {
      /* backend may be starting */
    }
  }, []);

  const refreshWeather = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_URL}/api/weather?latitude=${coords.latitude}&longitude=${coords.longitude}`
      );
      if (res.ok) {
        setWeather(await res.json());
      }
    } catch {
      setWeather(demoWeather);
    }
  }, [coords.latitude, coords.longitude]);

  useEffect(() => {
    localStorage.setItem("agrinexus-lang", lang);
  }, [lang]);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        const dRes = await fetch(`${API_URL}/api/dashboard`);
        if (dRes.ok && isMounted) {
          setDashboard(await dRes.json());
        }
      } catch {
        /* backend may be starting */
      }
      try {
        const wRes = await fetch(
          `${API_URL}/api/weather?latitude=${coords.latitude}&longitude=${coords.longitude}`
        );
        if (wRes.ok && isMounted) {
          setWeather(await wRes.json());
        }
      } catch {
        if (isMounted) setWeather(demoWeather);
      }
    };
    loadData();
    return () => {
      isMounted = false;
    };
  }, [coords.latitude, coords.longitude]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const handleFile = (selected) => {
    if (!selected) return;
    if (!selected.type.startsWith("image/")) {
      setMessage(t.msgImage);
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setMessage(t.msgSize);
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setResult(null);
    setMessage("");
  };

  const useLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        setLocation(t.currentLocationText);
      },
      () => setMessage(t.msgLocation)
    );
  };

  const analyze = async () => {
    if (!file) return;
    setLoading(true);
    setMessage("");

    const form = new FormData();
    form.append("file", file);

    const params = new URLSearchParams({
      latitude: coords.latitude,
      longitude: coords.longitude,
      location,
    });

    try {
      const res = await fetch(`${API_URL}/api/scan?${params}`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        const errorDetail = (data && data.detail) ? (t.backendMessages?.[data.detail] || data.detail) : t.msgAnalysisFailed;
        throw new Error(errorDetail);
      }
      setResult(data);
      await refreshDashboard();
      setPage("scan");
    } catch (e) {
      setMessage(`${e.message}. ${t.msgBackend}`);
    } finally {
      setLoading(false);
    }
  };

  const openPassport = async () => {
    const cropId = result?.crop_id || dashboard.recent?.[0]?.crop_id;
    if (!cropId) {
      setPage("passport");
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/passport/${cropId}`);
      if (res.ok) {
        setPassport(await res.json());
      }
    } catch {
      setMessage(t.msgPassport);
    }
    setPage("passport");
  };

  const openMarket = async () => {
    let currentPassport = passport;
    const cropId = result?.crop_id || dashboard.recent?.[0]?.crop_id;
    if (cropId) {
      try {
        const pRes = await fetch(`${API_URL}/api/passport/${cropId}`);
        if (pRes.ok) {
           currentPassport = await pRes.json();
           setPassport(currentPassport);
        }
      } catch {}
    }

    const crop = result?.crop || currentPassport?.crop?.crop_type || "Tomato";
    try {

      const res = await fetch(
        `${API_URL}/api/buyers?crop=${encodeURIComponent(crop)}`
      );
      if (res.ok) {
        setBuyers(await res.json());
      }
    } catch {
      setBuyers([]);
    }

      const res = await fetch(`${API_URL}/api/buyers?crop=${encodeURIComponent(crop)}`);
      if (res.ok) setBuyers(await res.json());

      const resList = await fetch(`${API_URL}/api/market/listings`);
      if (resList.ok) setListings(await resList.json());
    } catch { setBuyers([]); setListings([]); }

    setPage("market");
  };

  const createListing = async () => {
    if (!passport?.harvest?.id) return;
    setListingBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/market/listings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ harvest_id: passport.harvest.id })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Listing failed.");
      setMessage("Harvest successfully listed on the market!");
      openMarket();
    } catch (e) {
      alert(e.message);
    } finally {
      setListingBusy(false);
    }
  };

  const nav = (target) => {
    if (target === "passport") openPassport();
    else if (target === "market") openMarket();
    else setPage(target);
  };

  const cropTitle = useMemo(
    () => result?.crop || passport?.crop?.crop_type || "Tomato",
    [result, passport]
  );

  const latestScan = passport?.scans?.[0];
  const displayDisease = result?.disease || latestScan?.disease || "Awaiting scan";
  const displayRisk = result?.risk?.score ?? latestScan?.risk_score;
  const isAlreadyListed = passport?.harvest && listings.some(l => l.harvest_id === passport.harvest.id);

  return (
    <div className="app-shell">
      {/* Ambient Living Farm Particles */}
      <FloatingFlora />

      {/* Top Glass Navigation Bar */}
      <Navigation
        page={page}
        nav={nav}
        lang={lang}
        setLang={setLang}
        t={t}
      />

      {/* Main Page Views */}
      <main className="main-content">
        {page === "home" && (
          <Home
            t={t}
            setPage={setPage}
            openPassport={openPassport}
            openMarket={openMarket}
            dashboard={dashboard}
            weather={weather}
            refreshWeather={refreshWeather}
            useLocation={useLocation}
            coords={coords}
            location={location}
          />
        )}

        {page === "scan" && (
          <Scan
            t={t}
            file={file}
            preview={preview}
            handleFile={handleFile}
            fileRef={fileRef}
            location={location}
            setLocation={setLocation}
            useLocation={useLocation}
            analyze={analyze}
            loading={loading}
            result={result}
            openPassport={openPassport}
            openMarket={openMarket}
          />
        )}

        {page === "passport" && (
          <Passport
            t={t}
            fill={fill}
            passport={passport}
            openPassport={openPassport}
            setPage={setPage}
            apiUrl={API_URL}
          />
        )}


        {page === "market" && (
          <Market
            t={t}
            fill={fill}
            cropTitle={cropTitle}
            result={result}
            openPassport={openPassport}
            buyers={buyers}
            setMessage={setMessage}
            setPage={setPage}
          />
        )}

        {page === "market" && <section className="page-section"><div className="page-title"><div><div className="eyebrow">{t.marketEyebrow}</div><h1>{t.market}</h1><p>{t.marketDesc}</p></div></div><div className="market-layout"><div className="panel market-summary"><div className="market-badge">✓ {t.verifiedReady}</div><h2>{cropTitle}</h2><p>{t.marketNote}</p><div className="quality-row"><div><span className="muted">{t.healthStatus}</span><b>{result?.disease || t.awaitingScan}</b></div><div><span className="muted">{t.stepRisk}</span><b>{result ? `${result.risk.score}%` : "—"}</b></div></div><button className="outline-btn" onClick={openPassport}>{t.viewPassport}</button></div><div className="buyer-list">{buyers.length ? buyers.map((b) => <div className="panel buyer-card" key={b.name}><div className="buyer-logo">🤝</div><div className="buyer-info"><h3>{b.name}</h3><p>{b.location} · {b.interest}</p><span>{fill(t.acceptsGrade, { grade: b.min_grade })}</span></div><button className="secondary" onClick={() => setMessage(fill(t.msgInterest, { name: b.name }))}>{t.connect}</button></div>) : <div className="panel empty-state"><div>🛒</div><h2>{t.noBuyersTitle}</h2><p>{t.noBuyersText}</p><button className="primary" onClick={() => setPage("scan")}>{t.scanCrop}</button></div>}</div></div></section>}
        {page === "passport" && <section className="page-section"><div className="page-title"><div><div className="eyebrow">STEP 2 · CONTINUOUS RECORD</div><h1>{t.passport}</h1><p>A timeline of the crop's AI observations and field conditions.</p></div></div>{passport ? <div className="passport-layout"><div className="panel passport-card"><div className="passport-head"><div className="passport-icon">🌾</div><div><span className="muted">Passport ID</span><h2>ANX-{String(passport.crop.id).padStart(5, "0")}</h2><p>{passport.crop.crop_type} · {passport.crop.location || "Field location"}</p></div><span className="verified-pill">✓ Digital record</span></div><div className="timeline">{passport.scans.length ? passport.scans.map((s) => <div className="timeline-item" key={s.id}><div className="timeline-dot" /><div className="timeline-content"><div className="timeline-top"><b>{s.disease}</b><RiskBadge level={s.risk_level} /></div><p>{new Date(s.created_at).toLocaleString()}</p><div className="timeline-meta"><span>AI {s.confidence}%</span><span>{Math.round(s.temperature)}°C</span><span>{Math.round(s.humidity)}% RH</span><span>Risk {s.risk_score}%</span></div></div></div>) : <p className="muted">{t.noData}</p>}</div></div><div className="panel harvest-panel"><div className="eyebrow">HARVEST</div><h2>{t.verified}</h2>{passport.harvest ? <div className={`harvest-status status-${passport.harvest.verification_status?.toLowerCase() || 'pending'}`}><span>{passport.harvest.verification_status === "VERIFIED" ? "✓" : (passport.harvest.verification_status === "REJECTED" ? "⚠️" : "⏳")}</span><div><b>{passport.harvest.verification_status || "PENDING"}</b><p>{passport.harvest.quantity} {passport.harvest.unit} · Grade {passport.harvest.quality_grade}</p>{passport.harvest.verification_reason && <p className="muted" style={{marginTop: 6}}>{passport.harvest.verification_reason}</p>}</div></div> : <><p>Record a harvest to create the market-ready handoff.</p><HarvestForm cropId={passport.crop.id} onDone={openPassport} t={t} /></>}</div></div> : <div className="panel empty-state"><div>📔</div><h2>Your passport starts with a scan</h2><p>Analyze a leaf first, then return here to see the crop health history.</p><button className="primary" onClick={() => setPage("scan")}>Start a scan</button></div>}</section>}

        {page === "market" && <section className="page-section"><div className="page-title"><div><div className="eyebrow">STEP 3 · MARKET ACCESS</div><h1>{t.market}</h1><p>Use the crop record to present a simple, transparent buyer handoff.</p></div></div><div className="market-layout"><div className="market-left-col" style={{display: "flex", flexDirection: "column", gap: "16px"}}><div className="panel market-summary">{passport?.harvest?.verification_status === "VERIFIED" ? <div className="market-badge">✓ VERIFIED-READY</div> : (passport?.harvest ? <div className="market-badge" style={{background:"#ffe6e1", color:"#b33e2c"}}>⚠️ NOT VERIFIED</div> : <div className="market-badge" style={{background:"#fff3d6", color:"#9a6810"}}>⏳ AWAITING HARVEST</div>)}<h2>{cropTitle}</h2><p>Buyer matching is demonstrated with a curated MVP list. Production matching can later connect to FPOs and verified procurement networks.</p><div className="quality-row"><div><span className="muted">Latest health status</span><b>{displayDisease}</b></div><div><span className="muted">Risk</span><b>{displayRisk !== undefined ? `${displayRisk}%` : "—"}</b></div></div>{passport?.harvest ? <div style={{marginTop: 15, padding: 15, background: "#f8fbf7", borderRadius: 12, border: "1px solid var(--line)"}}><h3 style={{fontSize: 14, margin: "0 0 5px"}}>List Your Harvest</h3><p style={{fontSize: 11, color: "var(--muted)", margin: "0 0 10px"}}>Status: {passport.harvest.verification_status}</p>{isAlreadyListed ? <div style={{padding: "10px", background: "#eaf7eb", color: "#28763a", borderRadius: "8px", fontSize: "12px", textAlign: "center", fontWeight: "bold"}}>✓ Harvest is active on the market</div> : <><button className="primary full" onClick={createListing} disabled={listingBusy || passport.harvest.verification_status !== "VERIFIED"}>{listingBusy ? "Listing..." : "List on Market"}</button>{passport.harvest.verification_status !== "VERIFIED" && <p style={{fontSize:10, color:"#b33e2c", marginTop:6}}>Only verified harvests can be listed.</p>}</>}</div> : <div style={{marginTop: 15, padding: 15, background: "#f8fbf7", borderRadius: 12, border: "1px solid var(--line)", textAlign: "center"}}><p style={{fontSize: 12, color: "var(--muted)", margin: "0 0 10px"}}>Record a harvest in your passport before listing.</p><button className="outline-btn full" onClick={openPassport}>Open Health Passport</button></div>}</div><div><h3 style={{fontSize: 16, margin: "0 0 12px"}}>Active Market Listings</h3><div className="buyer-list">{listings.length ? listings.map((l) => <div className="panel buyer-card" key={l.id}><div className="buyer-logo" style={{background: "#eaf6e9"}}>🌾</div><div className="buyer-info"><h3>{l.crop_type}</h3><p>{l.quantity} {l.unit} · Grade {l.quality_grade}</p><span>Listed on {new Date(l.created_at).toLocaleDateString()}</span></div></div>) : <div className="panel empty-state" style={{minHeight: 150}}><div>🌾</div><h2 style={{fontSize: 16}}>No active listings</h2><p>Be the first to list a verified crop.</p></div>}</div></div></div><div className="market-right-col" style={{display: "flex", flexDirection: "column", gap: "16px"}}><h3 style={{fontSize: 16, margin: "0 0 -4px"}}>Verified Buyers</h3><div className="buyer-list">{buyers.length ? buyers.map((b) => <div className="panel buyer-card" key={b.name}><div className="buyer-logo">🤝</div><div className="buyer-info"><h3>{b.name}</h3><p>{b.location} · {b.interest}</p><span>Accepts Grade {b.min_grade}+</span></div><button className="secondary" onClick={() => setMessage(`Demo interest request prepared for ${b.name}.`)}>Connect</button></div>) : <div className="panel empty-state"><div>🛒</div><h2>Buyers will appear here</h2><p>Run a crop scan to identify the crop and load matching buyers.</p><button className="primary" onClick={() => setPage("scan")}>Scan crop</button></div>}</div></div></div></section>}

      </main>

      {/* Global Toast Alert */}
      <AlertToast message={message} onClose={() => setMessage("")} />

      {/* App Footer */}
      <footer className="app-footer">
        <div className="footer-brand">
          <span>🌱</span>
          <span>AgriNexus</span>
        </div>
        <span>{t.footerText}</span>
      </footer>
    </div>
  );
}
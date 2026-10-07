import RiskBadge from "./components/RiskBadge";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { LANG } from "./translations";

import FloatingFlora from "./components/FloatingFlora";
import Navigation from "./components/Navigation";
import AlertToast from "./components/AlertToast";
import HarvestForm from "./components/HarvestForm";

import Home from "./pages/Home";
import Scan from "./pages/Scan";
import Passport from "./pages/Passport";
import Market from "./pages/Market";
import BuyerDashboard from "./pages/BuyerDashboard";
import DealRoom from "./pages/DealRoom";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

function getPassportReadiness(passport) {
  const scans = passport?.scans || [];
  const latest = scans[0];
  if (!latest) return { ready: false, reason: "A health scan is required." };

  const latestDisease = (latest.disease || "").toLowerCase();
  const recentRisks = scans.slice(0, 3).map((scan) => Number(scan.risk_score ?? scan.risk?.score));
  const healthy = latestDisease.includes("healthy");
  const lowAndDecreasing = recentRisks.length >= 2 &&
    recentRisks[0] < 40 &&
    recentRisks.every((risk, index) => index === 0 || recentRisks[index - 1] > risk);
  if (!healthy && !lowAndDecreasing) {
    return { ready: false, reason: "The latest scan is not healthy with low, decreasing risk." };
  }

  let latestSpray = null;
  const prefix = `agrinexus-treatment-${passport.crop?.id}-`;
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix)) continue;
    try {
      const data = JSON.parse(localStorage.getItem(key));
      const dates = data?.sprayedDates || (data?.sprayedOn ? [data.sprayedOn] : []);
      const sprayedOn = dates[dates.length - 1];
      if (sprayedOn && (!latestSpray || new Date(sprayedOn) > new Date(latestSpray.sprayedOn))) {
        latestSpray = { sprayedOn, waitDays: data.waitDays };
      }
    } catch {
      continue;
    }
  }
  if (latestSpray) {
    if (latestSpray.waitDays == null) return { ready: false, reason: "Harvest wait time is unavailable for the last spray." };
    const readyDate = new Date(latestSpray.sprayedOn);
    readyDate.setDate(readyDate.getDate() + latestSpray.waitDays);
    if (Date.now() < readyDate.getTime()) {
      return { ready: false, reason: `Harvest wait period ends ${readyDate.toLocaleDateString()}.` };
    }
  }
  return { ready: true, reason: "Verified health conditions are met." };
}

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
  const [startNewPassport, setStartNewPassport] = useState(false);
  const [scanContext, setScanContext] = useState(null);
  const [passportLoading, setPassportLoading] = useState(false);
  const [passportError, setPassportError] = useState("");
  const [passportTargetId, setPassportTargetId] = useState(null);
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
  const [activeDealId, setActiveDealId] = useState(null);
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
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview("");
    setResult(null);
    setMessage("");
    if (!selected) return;
    if (!selected.type.startsWith("image/")) {
      setMessage(t.msgImage);
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setMessage(t.msgSize);
      return;
    }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  };

  const startRescan = (treatmentCourseId = null, cropId = null) => {
    setFile(null);
    setPreview("");
    setResult(null);
    setMessage("");
    setScanContext(cropId ? { treatmentCourseId, cropId } : null);
    if (fileRef.current) fileRef.current.value = "";
    setPage("scan");
  };

  const prepareNewPassport = () => {
    setStartNewPassport(true);
    setScanContext(null);
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
    const submittedFile = file;
    const submittedScanContext = scanContext;
    const submittedStartNewPassport = startNewPassport;
    if (!submittedFile) return;
    setResult(null);
    setLoading(true);
    setMessage("");

    const form = new FormData();
    form.append("file", submittedFile);

    const params = new URLSearchParams({
      latitude: coords.latitude,
      longitude: coords.longitude,
      location,
    });
    if (submittedStartNewPassport) {
      params.set("new_passport", "true");
    }
    if (submittedScanContext?.cropId) {
      params.set("crop_id", submittedScanContext.cropId);
      if (submittedScanContext.treatmentCourseId) {
        params.set("treatment_course_id", submittedScanContext.treatmentCourseId);
      }
    }

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
      setStartNewPassport(false);
      await refreshDashboard();
      if (submittedScanContext) {
        setScanContext(null);
        await openPassport(data.crop_id);
      } else {
        setPage("scan");
      }
    } catch (e) {
      setMessage(`${e.message}. ${t.msgBackend}`);
    } finally {
      setLoading(false);
    }
  };

  const openPassport = async (targetCropId) => {
    const cropId = Number.isInteger(targetCropId) ? targetCropId : result?.crop_id || dashboard.recent?.[0]?.crop_id;
    setPassportTargetId(cropId || null);
    setPassportError("");
    if (!cropId) {
      setPassport(null);
      setPassportLoading(false);
      setPage("passport-view");
      return;
    }
    setPassportLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/passport/${cropId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || t.msgPassport);
      setPassport(data);
    } catch (error) {
      setMessage(t.msgPassport);
      setPassportError(error.message || t.msgPassport);
    } finally {
      setPassportLoading(false);
    }
    setPage("passport-view");
  };

  useEffect(() => {
    const passportId = Number(new URLSearchParams(window.location.search).get("passport"));
    if (!passportId) return;
    fetch(`${API_URL}/api/passport/${passportId}`)
      .then((res) => {
        if (!res.ok) throw new Error(t.msgPassport);
        return res.json();
      })
      .then((data) => {
        setPassport(data);
        setPage("passport-view");
      })
      .catch((error) => setMessage(error.message));
  }, [t.msgPassport]);

  const openMarket = async () => {
    let currentPassport = passport;
    const cropId = result?.crop_id || passport?.crop?.id || dashboard.recent?.[0]?.crop_id;
    if (cropId) {
      try {
        const pRes = await fetch(`${API_URL}/api/passport/${cropId}`);
        if (pRes.ok) {
          currentPassport = await pRes.json();
          setPassport(currentPassport);
        }
      } catch { }
    }

    const crop = result?.crop || currentPassport?.crop?.crop_type || "Tomato";
    try {
      const res = await fetch(
        `${API_URL}/api/buyers?crop=${encodeURIComponent(crop)}`
      );

      if (res.ok) {
        setBuyers(await res.json());
      }
    

      

      const resList = await fetch(`${API_URL}/api/market/listings`);
      if (resList.ok) setListings(await resList.json());
    } catch { setBuyers([]); setListings([]); }

     


    setPage("market-view");
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

  const handleOpenDealRoom = (dealId) => {
    if (dealId) setActiveDealId(dealId);
    setPage("dealroom");
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
  const readinessPassport = result
    ? {
        crop: { id: result.crop_id },
        scans: [
          result,
          ...(passport?.crop?.id === result.crop_id
            ? passport.scans.filter((scan) => scan.id !== result.scan_id)
            : []),
        ],
      }
    : passport;
  const readiness = getPassportReadiness(readinessPassport);

  return (
    <div className="app-shell">
      {/* Ambient Living Farm Particles */}
      <FloatingFlora />

      {/* Top Glass Navigation Bar */}
      <Navigation
        page={page === "market-view" ? "market" : page === "passport-view" ? "passport" : page}
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
            readyToSell={readiness.ready}
            readyReason={readiness.reason}
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
            coords={coords}
            setLocation={setLocation}
            useLocation={useLocation}
            analyze={analyze}
            loading={loading}
            result={result}
            openPassport={openPassport}
            onStartNewPassport={prepareNewPassport}
            openMarket={openMarket}
            readyToSell={readiness.ready}
            readyReason={readiness.reason}
            onRescan={startRescan}
            onTreatmentCourseUpdate={(treatmentCourse) => {
              setResult((current) => current ? { ...current, treatment_course: treatmentCourse } : current);
            }}
          />
        )}

        {page === "passport-view" && (
          <Passport
            t={t}
            fill={fill}
            passport={passport}
            openPassport={openPassport}
            setPage={setPage}
            apiUrl={API_URL}
            readyToSell={readiness.ready}
            readyReason={readiness.reason}
            loading={passportLoading}
            error={passportError}
            onRetry={() => openPassport(passportTargetId)}
            onRescan={(treatmentCourseId) => startRescan(treatmentCourseId, passport?.crop?.id)}
            onTreatmentCourseUpdate={(updatedCourse) => {
              setPassport((current) => current ? {
                ...current,
                treatment_courses: (current.treatment_courses || []).map((course) =>
                  course.id === updatedCourse.id ? updatedCourse : course
                ),
              } : current);
            }}
          />
        )}


        {page === "market-view" && (
          <Market
            t={t}
            fill={fill}
            cropTitle={cropTitle}
            result={result}
            openPassport={openPassport}
            buyers={buyers}
            setMessage={setMessage}
            setPage={setPage}
            passport={passport}
            lotReadiness={readiness}
          />
        )}

        {page === "market" && <section className="page-section"><div className="page-title"><div><div className="eyebrow">{t.marketEyebrow}</div><h1>{t.market}</h1><p>{t.marketDesc}</p></div></div><div className="market-layout"><div className="panel market-summary"><div className="market-badge">✓ {t.verifiedReady}</div><h2>{cropTitle}</h2><p>{t.marketNote}</p><div className="quality-row"><div><span className="muted">{t.healthStatus}</span><b>{result?.disease || t.awaitingScan}</b></div><div><span className="muted">{t.stepRisk}</span><b>{result ? `${result.risk.score}%` : "—"}</b></div></div><button className="outline-btn" onClick={openPassport}>{t.viewPassport}</button></div><div className="buyer-list">{buyers.length ? buyers.map((b) => <div className="panel buyer-card" key={b.name}><div className="buyer-logo">🤝</div><div className="buyer-info"><h3>{b.name}</h3><p>{b.location} · {b.interest}</p><span>{fill(t.acceptsGrade, { grade: b.min_grade })}</span></div><button className="secondary" onClick={() => setMessage(fill(t.msgInterest, { name: b.name }))}>{t.connect}</button></div>) : <div className="panel empty-state"><div>🛒</div><h2>{t.noBuyersTitle}</h2><p>{t.noBuyersText}</p><button className="primary" onClick={() => setPage("scan")}>{t.scanCrop}</button></div>}</div></div></section>}
        {page === "passport" && <section className="page-section"><div className="page-title"><div><div className="eyebrow">STEP 2 · CONTINUOUS RECORD</div><h1>{t.passport}</h1><p>A timeline of the crop's AI observations and field conditions.</p></div></div>{passport ? <div className="passport-layout"><div className="panel passport-card"><div className="passport-head"><div className="passport-icon">🌾</div><div><span className="muted">Passport ID</span><h2>ANX-{String(passport.crop.id).padStart(5, "0")}</h2><p>{passport.crop.crop_type} · {passport.crop.location || "Field location"}</p></div><span className="verified-pill">✓ Digital record</span></div><div className="timeline">{passport.scans.length ? passport.scans.map((s) => <div className="timeline-item" key={s.id}><div className="timeline-dot" /><div className="timeline-content"><div className="timeline-top"><b>{s.disease}</b><RiskBadge level={s.risk_level} /></div><p>{new Date(s.created_at).toLocaleString()}</p><div className="timeline-meta"><span>AI {s.confidence}%</span><span>{Math.round(s.temperature)}°C</span><span>{Math.round(s.humidity)}% RH</span><span>Risk {s.risk_score}%</span></div></div></div>) : <p className="muted">{t.noData}</p>}</div></div><div className="panel harvest-panel"><div className="eyebrow">HARVEST</div><h2>{t.verified}</h2>{passport.harvest ? <div className={`harvest-status status-${passport.harvest.verification_status?.toLowerCase() || 'pending'}`}><span>{passport.harvest.verification_status === "VERIFIED" ? "✓" : (passport.harvest.verification_status === "REJECTED" ? "⚠️" : "⏳")}</span><div><b>{passport.harvest.verification_status || "PENDING"}</b><p>{passport.harvest.quantity} {passport.harvest.unit} · Grade {passport.harvest.quality_grade}</p>{passport.harvest.verification_reason && <p className="muted" style={{marginTop: 6}}>{passport.harvest.verification_reason}</p>}</div></div> : <><p>Record a harvest to create the market-ready handoff.</p><HarvestForm cropId={passport.crop.id} onDone={openPassport} t={t} apiUrl={API_URL} /></>}</div></div> : <div className="panel empty-state"><div>📔</div><h2>Your passport starts with a scan</h2><p>Analyze a leaf first, then return here to see the crop health history.</p><button className="primary" onClick={() => setPage("scan")}>Start a scan</button></div>}</section>}

        {page === "buyer" && (
          <BuyerDashboard
            apiUrl={API_URL}
            setMessage={setMessage}
            onOpenDealRoom={handleOpenDealRoom}
          />
        )}

        {page === "dealroom" && (
          <DealRoom
            dealId={activeDealId}
            apiUrl={API_URL}
            setMessage={setMessage}
          />
        )}

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
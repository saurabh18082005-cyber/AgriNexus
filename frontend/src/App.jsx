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

  const startRescan = () => {
    setFile(null);
    setPreview("");
    setResult(null);
    setMessage("");
    if (fileRef.current) fileRef.current.value = "";
    setPage("scan");
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

  const openPassport = async (targetCropId) => {
    const cropId = Number.isInteger(targetCropId) ? targetCropId : result?.crop_id || dashboard.recent?.[0]?.crop_id;
    if (!cropId) {
      setPage("passport-view");
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
      if (resList.ok) {
        setListings(await resList.json());
      }
    } catch {
      setBuyers([]);
      setListings([]);
    }

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
            openMarket={openMarket}
            readyToSell={readiness.ready}
            readyReason={readiness.reason}
            onRescan={startRescan}
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
            apiUrl={API_URL}
            onOpenDealRoom={handleOpenDealRoom}
          />
        )}

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
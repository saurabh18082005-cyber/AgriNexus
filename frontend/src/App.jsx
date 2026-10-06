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
    const crop = result?.crop || passport?.crop?.crop_type || "Tomato";
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
    setPage("market");
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
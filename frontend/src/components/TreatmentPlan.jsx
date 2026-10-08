import { useEffect, useState } from "react";

const box = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 14,
  padding: 14,
  marginTop: 12,
};
const row = { display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0" };
const fieldControlStyle = {
  boxSizing: "border-box",
  height: 42,
  width: "100%",
  minWidth: 0,
  padding: "0 10px",
  borderRadius: 8,
  fontSize: 14,
  fontFamily: "inherit",
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(255,255,255,0.08)",
  color: "inherit",
};

export default function TreatmentPlan({ diseaseClass, location, coords, recommendation, treatmentCourse, onRescan, onTreatmentCourseUpdate, apiUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000" }) {
  const [area, setArea] = useState("1");
  const [unit, setUnit] = useState("acre");
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState("");
  const [noTreatment, setNoTreatment] = useState(false);
  const [weatherForecast, setWeatherForecast] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [applicationBusy, setApplicationBusy] = useState(false);
  const [applicationError, setApplicationError] = useState("");

  useEffect(() => {
    if (!diseaseClass || !(Number(area) > 0)) return;
    const normalizedDisease = diseaseClass.trim().toLowerCase().replace(/[\s_]+/g, " ");
    setPlan(null);
    setError("");
    setNoTreatment(false);
    fetch(`${apiUrl}/treatment?disease=${encodeURIComponent(normalizedDisease)}&area=${area}&unit=${unit}`)
      .then((r) => {
        if (r.status === 404) {
          setPlan(null);
          setNoTreatment(true);
          console.warn(`No treatment data for disease label: ${diseaseClass}`);
          return null;
        }
        if (!r.ok) throw new Error("No plan for this result");
        return r.json();
      })
      .then((data) => {
        if (data) setPlan(data);
      })
      .catch((e) => {
        setPlan(null);
        setError(e.message);
      });
  }, [diseaseClass, area, unit, apiUrl]);

  const hasNoDose = noTreatment;

  useEffect(() => {
    if (!diseaseClass || coords?.latitude == null || coords?.longitude == null) return undefined;
    const controller = new AbortController();
    setWeatherLoading(true);
    setWeatherError("");
    setWeatherForecast(null);
    fetch(`${apiUrl}/api/spray-advice?latitude=${coords.latitude}&longitude=${coords.longitude}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || "Weather forecast is unavailable.");
        setWeatherForecast(data);
      })
      .catch((fetchError) => {
        if (fetchError.name !== "AbortError") {
          setWeatherForecast(null);
          setWeatherError(fetchError.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setWeatherLoading(false);
      });
    return () => controller.abort();
  }, [diseaseClass, location, coords?.latitude, coords?.longitude, apiUrl]);

  const formatWeatherTime = (value) => {
    if (!value) return "no suitable window forecast";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };
  const weatherHours = weatherForecast?.hourly || [];
  const currentForecast = weatherHours[0];
  const rainWithinThreeHours = weatherHours.slice(0, 3).find(
    (hour) => hour.rain_pct >= 50 || hour.rain_mm > 0
  );
  const nextGoodWindow = weatherForecast?.best_window;
  const windowLabel = nextGoodWindow
    ? `${formatWeatherTime(nextGoodWindow.start)}–${formatWeatherTime(nextGoodWindow.end)}`
    : "No suitable window forecast";
  const weatherBannerText = rainWithinThreeHours
    ? `Rain expected around ${formatWeatherTime(rainWithinThreeHours.time)} (${Math.round(rainWithinThreeHours.rain_pct)}%). Next available window: ${windowLabel}.`
    : currentForecast?.wind_kmh >= 15
      ? `Strong wind (${Math.round(currentForecast.wind_kmh)} km/h). Next available window: ${windowLabel}.`
      : currentForecast?.temp_c >= 35
        ? "Conditions are too hot for spraying."
        : currentForecast?.ok
          ? `Favorable conditions. Best available window: ${windowLabel}.`
          : currentForecast
            ? `Conditions are not favorable. Best available window: ${windowLabel}.`
            : "";
  const validInterval = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
  const totalSprays = treatmentCourse?.total_applications ?? null;
  const completedSprays = treatmentCourse?.completed_applications ?? 0;
  const applicationCountExceedsLimit = totalSprays != null && completedSprays > totalSprays;
  const latestApplication = treatmentCourse?.applications?.at(-1);
  const lastSprayDate = latestApplication?.applied_at ? new Date(latestApplication.applied_at) : null;
  const nextSprayDate = plan?.verified === true && lastSprayDate && validInterval(plan?.interval_days)
    ? new Date(new Date(lastSprayDate).setDate(lastSprayDate.getDate() + Number(plan.interval_days)))
    : null;
  const followUpDate = treatmentCourse?.next_follow_up_at
    ? new Date(treatmentCourse.next_follow_up_at)
    : null;
  const formatDate = (date) => date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const daysUntil = (date) => {
    const today = new Date();
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const targetUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.round((targetUtc - todayUtc) / 86400000);
  };
  const formatCountdown = (date) => {
    const days = daysUntil(date);
    if (days === 0) return "today";
    return days > 0 ? `in ${days} days` : `${Math.abs(days)} days overdue`;
  };

  if (!diseaseClass) return null;

  const recordNextSpray = async () => {
    if (!treatmentCourse?.id || applicationBusy) return;
    setApplicationBusy(true);
    setApplicationError("");
    try {
      const response = await fetch(`${apiUrl}/api/treatment-courses/${treatmentCourse.id}/applications`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not record treatment application.");
      onTreatmentCourseUpdate?.(data);
    } catch (error) {
      setApplicationError(error.message);
    } finally {
      setApplicationBusy(false);
    }
  };

  const shareTreatment = () => {
    const farmerPhone = (localStorage.getItem("agrinexus-farmer-phone") || "").replace(/\D/g, "");
    const crop = diseaseClass.split("___")[0].replaceAll("_", " ");
    const message = `${crop} — ${diseaseClass.split("___").slice(1).join(" ")}. Medicine: ${plan.medicine}. Dose: ${plan.dose_per_litre}. Field size: ${area} ${unit}. Water per spray: ${plan.water_per_spray_litres} L. Medicine per spray: ${plan.medicine_per_spray}. Total to buy: ${plan.medicine_total}${totalSprays ? ` (${totalSprays} sprays)` : ""}.${plan.interval_days != null ? ` Gap between sprays: ${plan.interval_days} days.` : ""} Confirm with your agri officer or product label.`;
    const phonePath = farmerPhone ? `${farmerPhone}` : "";
    window.open(`https://wa.me/${phonePath}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <>
    <div className="treatment-plan-card" style={box}>
      <h3 style={{ margin: 0 }}>Treatment Plan</h3>

      {(weatherLoading || weatherError || weatherForecast) && (
        <div
          role="status"
          style={{
            marginTop: 10,
            padding: "9px 11px",
            borderRadius: 9,
            background: "rgba(255,255,255,0.09)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <strong style={{ display: "block", marginBottom: 4 }}>Spray Conditions</strong>
          {weatherLoading && !weatherForecast && <div>Checking weather forecast…</div>}
          {weatherError && !weatherForecast && <div>Weather forecast unavailable. Treatment plan remains available.</div>}
          {weatherForecast && (
            <>
              {weatherBannerText && <div>{weatherBannerText}</div>}
              <div className="treatment-weather-secondary" style={{ fontSize: 11, marginTop: 4 }}>
                Weather updated: {formatWeatherTime(weatherForecast.updated_at)}.
              </div>
              <div className="treatment-weather-secondary" style={{ fontSize: 11, marginTop: 2 }}>Weather-based advisory; conditions may change.</div>
              {weatherForecast.stale && <div className="treatment-weather-secondary" style={{ fontSize: 11 }}>Weather data may be out of date.</div>}
            </>
          )}
        </div>
      )}

      {plan?.medicine && (
        <section style={{ marginTop: 14 }}>
          <h4 style={{ margin: "0 0 8px" }}>Field Size</h4>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
          <label style={{ flex: 1 }}>
            Field size
            <input
              type="number"
              min="0.01"
              step="any"
              value={area}
              placeholder="Enter field size"
              onChange={(e) => setArea(e.target.value)}
              style={fieldControlStyle}
            />
          </label>
          <select value={unit} onChange={(e) => setUnit(e.target.value)} style={{ ...fieldControlStyle, flex: 1 }}>
            <option value="acre">Acre</option>
            <option value="guntha">Guntha</option>
            <option value="hectare">Hectare</option>
          </select>
          </div>
        </section>
      )}

      {error && <p>{error}</p>}

      {recommendation && (
        <div className="report-prescription-box" style={{ marginTop: 14 }}>
          <div className="prescription-head">
            <span>📋</span>
            <strong>What to do now</strong>
          </div>
          <p>{recommendation}</p>
        </div>
      )}

      {plan && (
        <section style={{ marginTop: 14 }}>
          <h4 style={{ margin: "0 0 6px" }}>Treatment</h4>
          {plan.verified !== true && (
            <p style={{ margin: "0 0 6px", color: "#f8faf9" }}>
              Recommendation is marked unverified in the current data.
            </p>
          )}
          <p style={{ margin: 0 }}>{plan.advice}</p>
        </section>
      )}
      {hasNoDose && (
        <>
          <p>Consult your local agri officer</p>
          <p>Spray dose not available yet. Read the product label or ask your local agriculture officer.</p>
          <ul>
            <li>Remove affected plant parts and dispose of them away from the field.</li>
            <li>Keep foliage dry and avoid overhead watering.</li>
            <li>Clean tools and monitor new growth for changes.</li>
          </ul>
        </>
      )}

      {plan?.medicine && (
        <section style={{ marginTop: 14 }}>
          <h4 style={{ margin: "0 0 6px" }}>Medicine</h4>
          <div style={row}><span>Medicine</span><b>{plan.medicine}</b></div>
          <div style={row}><span>Dose</span><b>{plan.dose_per_litre}</b></div>
          <div style={row}><span>Water per spray</span><b>{plan.water_per_spray_litres} L</b></div>
          {plan.medicine_per_spray != null && <div style={row}><span>Medicine per spray</span><b>{plan.medicine_per_spray}</b></div>}
          {plan.medicine_total != null && (
            <div style={row}>
              <span>Total to buy{totalSprays ? ` (${totalSprays} sprays)` : ""}</span>
              <b>{plan.medicine_total}</b>
            </div>
          )}
          {plan.interval_days != null && <div style={row}><span>Gap between sprays</span><b>{plan.interval_days} days</b></div>}
          {applicationCountExceedsLimit ? (
            <>
              <div style={row}>
                <span>Recorded applications</span>
                <b>{completedSprays}</b>
              </div>
              <p role="alert">Recorded applications exceed the stored recommendation limit of {totalSprays}.</p>
            </>
          ) : totalSprays != null ? (
            <div style={row}>
              <span>Treatment progress</span>
              <b>Spray {completedSprays} of {totalSprays} done</b>
            </div>
          ) : null}
          {treatmentCourse?.applications_complete && <p>All required applications completed.</p>}
          {totalSprays == null && completedSprays > 0 && (
            <div style={row}>
              <span>Recorded applications</span>
              <b>{completedSprays}</b>
            </div>
          )}
          {nextSprayDate && (
            <div style={row}>
              <span>Next spray</span>
              <b>{formatDate(nextSprayDate)}</b>
            </div>
          )}
          {applicationError && <p role="alert" style={{ margin: "6px 0", color: "#f8faf9" }}>{applicationError}</p>}
          {treatmentCourse
            && totalSprays != null
            && completedSprays < totalSprays
            && treatmentCourse.status !== "healthy" && (
            <button
              type="button"
              onClick={recordNextSpray}
              disabled={applicationBusy}
              style={{ marginTop: 8, padding: "10px 14px", borderRadius: 10, width: "100%" }}
            >
              {applicationBusy ? "Saving application..." : "I did the next spray"}
            </button>
          )}
        </section>
      )}

      <section style={{ marginTop: 14 }}>
        <h4 style={{ margin: "0 0 6px" }}>Follow-up</h4>
        {treatmentCourse?.status === "healthy" || diseaseClass.toLowerCase().includes("healthy") ? (
          <p style={{ margin: "0 0 8px" }}>No follow-up scan is currently required.</p>
        ) : treatmentCourse?.follow_up_required && followUpDate && !Number.isNaN(followUpDate.getTime()) ? (
          <>
            <div style={row}>
              <span>Scan after {treatmentCourse.follow_up_interval_days} days — {formatDate(followUpDate)}</span>
              <b>({formatCountdown(followUpDate)})</b>
            </div>
            <button
              type="button"
              onClick={onRescan}
              style={{ marginTop: 4, padding: "10px 14px", borderRadius: 10, width: "100%" }}
            >
              Re-scan Crop
            </button>
          </>
        ) : (
          <p style={{ margin: "0 0 8px" }}>No verified follow-up interval is available.</p>
        )}
      </section>

      {plan?.medicine && (
        <button onClick={shareTreatment} style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, width: "100%" }}>
          Share on WhatsApp
        </button>
      )}

    </div>
    </>
  );
}
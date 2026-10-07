import { useEffect, useState } from "react";

// ---------- weather: today's spray advice (Open-Meteo, free, no key) ----------
async function getSprayAdvice(city) {
  try {
    const g = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
    ).then((r) => r.json());
    const place = g.results?.[0];
    if (!place) return null;

    const w = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
        `&daily=precipitation_probability_max,temperature_2m_max,wind_speed_10m_max&timezone=auto&forecast_days=2`
    ).then((r) => r.json());

    const rainToday = w.daily.precipitation_probability_max[0];
    const rainTomorrow = w.daily.precipitation_probability_max[1];
    const heat = w.daily.temperature_2m_max[0];
    const wind = w.daily.wind_speed_10m_max[0];

    if (rainToday >= 50)
      return { ok: false, text: `Rain likely today (${rainToday}%). Don't spray now. The rain will wash the medicine off. Spray after it clears.` };
    if (rainTomorrow >= 50)
      return { ok: true, text: `Rain expected tomorrow (${rainTomorrow}%). Spray this morning so it dries and sticks before the rain.` };
    if (wind >= 20)
      return { ok: false, text: `Windy today (${Math.round(wind)} km/h). Spray in the calm evening so it doesn't drift.` };
    if (heat >= 34)
      return { ok: true, text: `Hot today (${Math.round(heat)}°C). Spray early morning or late evening, not at midday.` };
    return { ok: true, text: "Good weather for spraying. Spray in the early morning or evening." };
  } catch {
    return null; // offline or API down: just hide the weather line
  }
}

// ---------- helper for the Health Passport: what to do after a rescan ----------
export function rescanDecision(previousRisk, newRisk, spraysDone, maxSprays = 3) {
  if (newRisk < 20) return { status: "recovered", text: "Risk is low. Mark as Recovered." };
  if (newRisk < previousRisk - 10) return { status: "improving", text: "Working. Continue and rescan in 3 days." };
  if (newRisk > previousRisk + 5) return { status: "worse", text: "Not working. Talk to your agri officer." };
  if (spraysDone >= maxSprays) return { status: "stop", text: "Maximum sprays reached. Talk to your agri officer." };
  return { status: "same", text: "Barely changed. Do the next spray as per the gap, then rescan." };
}

const box = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 14,
  padding: 14,
  marginTop: 12,
};
const row = { display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0" };

export default function TreatmentPlan({ diseaseClass, confidence, location, apiUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000" }) {
  const [area, setArea] = useState("1");
  const [unit, setUnit] = useState("acre");
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState("");
  const [advice, setAdvice] = useState(null);
  const [sprayInfo, setSprayInfo] = useState(null);

  const storeKey = `agrinexus-treatment-${diseaseClass}`;
  const conf = confidence > 1 ? confidence / 100 : confidence; // works for 0.87 or 87

  // load a saved "I sprayed today" record
  useEffect(() => {
    try {
      setSprayInfo(JSON.parse(localStorage.getItem(storeKey)) || null);
    } catch {
      setSprayInfo(null);
    }
  }, [storeKey]);

  // fetch the plan whenever disease / field size / unit changes
  useEffect(() => {
    if (!diseaseClass || !(Number(area) > 0)) return;
    setError("");
    fetch(`${apiUrl}/treatment?disease=${encodeURIComponent(diseaseClass)}&area=${area}&unit=${unit}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("No plan for this result"))))
      .then(setPlan)
      .catch((e) => {
        setPlan(null);
        setError(e.message);
      });
  }, [diseaseClass, area, unit, apiUrl]);

  // weather advice (only needed when there is a medicine to spray)
  useEffect(() => {
    if (plan?.medicine && location) getSprayAdvice(location).then(setAdvice);
  }, [plan?.medicine, location]);

  if (!diseaseClass) return null;

  if (conf < 0.6) {
    return (
      <div style={box}>
        <b>Not sure about this scan.</b> Retake a clear photo of one leaf in good light before using any treatment advice.
      </div>
    );
  }

  const markSprayed = () => {
    const info = { sprayedOn: new Date().toISOString(), sprays: (sprayInfo?.sprays || 0) + 1 };
    localStorage.setItem(storeKey, JSON.stringify(info));
    setSprayInfo(info);
  };

  const rescanDate = sprayInfo ? new Date(new Date(sprayInfo.sprayedOn).getTime() + 3 * 86400000) : null;
  const daysLeft = rescanDate ? Math.ceil((rescanDate - Date.now()) / 86400000) : null;

  return (
    <div style={box}>
      <b>Treatment plan</b>

      {plan?.medicine && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input
            type="number"
            min="0"
            step="any"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            style={{ flex: 1, padding: 8, borderRadius: 8 }}
            aria-label="Field size"
          />
          <select value={unit} onChange={(e) => setUnit(e.target.value)} style={{ padding: 8, borderRadius: 8 }}>
            <option value="acre">Acre</option>
            <option value="guntha">Guntha</option>
            <option value="hectare">Hectare</option>
          </select>
        </div>
      )}

      {error && <p style={{ opacity: 0.8 }}>{error}</p>}

      {plan && <p style={{ margin: "10px 0" }}>{plan.advice}</p>}

      {plan?.medicine && (
        <>
          <div style={row}><span>Medicine</span><b>{plan.medicine}</b></div>
          <div style={row}><span>Dose</span><b>{plan.dose_per_litre}</b></div>
          <div style={row}><span>Water per spray</span><b>{plan.water_per_spray_litres} L</b></div>
          <div style={row}><span>Medicine per spray</span><b>{plan.medicine_per_spray}</b></div>
          <div style={row}><span>Total to buy ({plan.sprays} sprays)</span><b>{plan.medicine_total}</b></div>
          <div style={row}><span>Gap between sprays</span><b>{plan.interval_days} days</b></div>
          <div style={row}><span>Wait before harvest</span><b>{plan.wait_days} days after last spray</b></div>
          <div style={row}><span>Organic option</span><b style={{ textAlign: "right" }}>{plan.organic}</b></div>

          {advice && (
            <p style={{ marginTop: 10, color: advice.ok ? "#6ee7b7" : "#fbbf24" }}>🌦 {advice.text}</p>
          )}

          {!sprayInfo ? (
            <button onClick={markSprayed} style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, width: "100%" }}>
              I sprayed today
            </button>
          ) : (
            <div style={{ marginTop: 10 }}>
              <p>
                Spray {sprayInfo.sprays} of {plan.sprays} done.{" "}
                {daysLeft > 0 ? `Rescan on ${rescanDate.toDateString()} (in ${daysLeft} day${daysLeft > 1 ? "s" : ""}).` : "Rescan due now. Scan the same plant again."}
              </p>
              {sprayInfo.sprays < plan.sprays && (
                <button onClick={markSprayed} style={{ padding: "8px 12px", borderRadius: 10 }}>
                  I did the next spray
                </button>
              )}
            </div>
          )}
        </>
      )}

      <p style={{ fontSize: 12, opacity: 0.7, marginTop: 12 }}>
        Confirm the medicine and dose with your local agri officer or the product label before spraying.
        {plan && plan.verified === false && " Doses in this table are a draft and still need checking."}
      </p>
    </div>
  );
}
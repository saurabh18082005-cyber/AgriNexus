import { useMemo, useState } from "react";

/* ------------------------------------------------------------------
   1. SETTINGS - change these numbers, nothing else needs touching
------------------------------------------------------------------- */
const REQUIRED_HEALTHY_SCANS = 2; // healthy scans in a row before "ready to sell"
const DEFAULT_PLAN = { medicine: "", intervalDays: 3, totalSprays: 3, waitDays: 7 };

// disease name (lowercase, words only) -> plan. Fill medicine from ICAR / your agri university.
const TREATMENTS = {
  "bacterial spot": { medicine: "Copper hydroxide 77% WP", intervalDays: 3, totalSprays: 3, waitDays: 7 },
  "early blight": { medicine: "", intervalDays: 3, totalSprays: 3, waitDays: 7 },
  "late blight": { medicine: "", intervalDays: 3, totalSprays: 3, waitDays: 7 },
  "northern leaf blight": { medicine: "", intervalDays: 3, totalSprays: 3, waitDays: 7 },
  "leaf blight": { medicine: "", intervalDays: 3, totalSprays: 3, waitDays: 7 },
  "black rot": { medicine: "", intervalDays: 3, totalSprays: 3, waitDays: 7 },
};

/* ------------------------------------------------------------------
   2. LOGIC - pure functions, easy to test
------------------------------------------------------------------- */
// "Pepper,_bell___Bacterial_spot" -> "pepper bell bacterial spot"
const normalize = (s = "") => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// "Pepper,_bell___Bacterial_spot" -> "Bacterial spot"
const prettyDisease = (s = "") => {
  const last = s.split("___").pop() || s;
  const t = last.replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const isHealthy = (scan) => normalize(scan.disease).includes("healthy");

const planFor = (disease) => {
  const n = normalize(disease);
  const key = Object.keys(TREATMENTS).find((k) => n.includes(k));
  return key ? TREATMENTS[key] : DEFAULT_PLAN; // never "no interval available"
};

const severity = (risk) => (risk >= 70 ? "HIGH" : risk >= 40 ? "MEDIUM" : "LOW");
const addDays = (iso, d) => new Date(new Date(iso).getTime() + d * 86400000);
const fmtDate = (d) => new Date(d).toLocaleDateString("en-GB");
const fmtDateTime = (d) =>
  new Date(d).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "medium" });

function buildPassportState(scans, sprays, now = new Date()) {
  const sorted = [...scans].sort((a, b) => new Date(a.scannedAt) - new Date(b.scannedAt));
  const latest = sorted[sorted.length - 1];
  if (!latest) return { sorted, latest: null };

  let streak = 0;
  for (let i = sorted.length - 1; i >= 0 && isHealthy(sorted[i]); i--) streak++;

  const lastSick = [...sorted].reverse().find((s) => !isHealthy(s));
  const plan = planFor(lastSick ? lastSick.disease : latest.disease);

  const courseSprays = lastSick
    ? sprays.filter((sp) => normalize(sp.disease) === normalize(lastSick.disease))
    : [];
  const lastSprayDate = [...sprays]
    .map((s) => new Date(s.date))
    .sort((a, b) => b - a)[0];
  const waitUntil = lastSprayDate ? addDays(lastSprayDate, plan.waitDays) : null;

  const healthyNow = isHealthy(latest);
  const waitOver = !waitUntil || now >= waitUntil;
  const eligible = healthyNow && streak >= REQUIRED_HEALTHY_SCANS && waitOver;

  let reason = "";
  if (!healthyNow) reason = "The latest scan still shows disease. Finish the spray course and re-scan.";
  else if (streak < REQUIRED_HEALTHY_SCANS)
    reason = `Needs ${REQUIRED_HEALTHY_SCANS} healthy scans in a row (${streak} so far).`;
  else if (!waitOver) reason = `Safe-to-harvest wait ends ${fmtDate(waitUntil)}.`;

  const followUpDue = eligible ? null : addDays(latest.scannedAt, plan.intervalDays);
  const spraysLeft = healthyNow ? 0 : Math.max(plan.totalSprays - courseSprays.length, 0);
  const upcomingSprays = Array.from({ length: Math.min(spraysLeft, 2) }, (_, i) => ({
    no: courseSprays.length + i + 1,
    total: plan.totalSprays,
    date: addDays(lastSprayDate || latest.scannedAt, plan.intervalDays * (i + 1)),
  }));

  return { sorted, latest, plan, streak, eligible, reason, followUpDue, upcomingSprays, waitUntil };
}

/* ------------------------------------------------------------------
   3. COMPONENT
   scans:  [{ id, disease, confidence, risk, temp, humidity, rain, scannedAt }]
   sprays: [{ id, disease, sprayNo, totalSprays, date, temp, humidity, risk }]
------------------------------------------------------------------- */
export default function HealthPassport({
  crop = "Crop",
  passportId = "ANX-00000",
  farmer = "Demo Farmer",
  location = "Bengaluru",
  scans = [],
  sprays = [],
  onRescan = () => {},
  onVerifyHarvest = () => {},
  showHarvestPanel = true,
}) {
  const [qty, setQty] = useState(100);
  const [quality, setQuality] = useState("Grade A (Premium Retail)");
  const s = useMemo(() => buildPassportState(scans, sprays), [scans, sprays]);

  return (
    <div className="hp">
      <style>{CSS}</style>

      <div className="hp-grid" style={showHarvestPanel ? undefined : { gridTemplateColumns: "minmax(0, 1fr)" }}>
        {/* LEFT: passport */}
        <section className="hp-card hp-main">
          <header className="hp-head">
            <div className="hp-icon">🌱</div>
            <div>
              <div className="hp-muted">Passport ID: {passportId}</div>
              <h2>{crop}</h2>
              <div className="hp-muted">
                {location} &nbsp;|&nbsp; {farmer} &nbsp;|&nbsp; {fmtDate(new Date())}
              </div>
            </div>
          </header>

          <nav className="hp-stages">
            {["Seed", "Growth", "Scan", "Health check", "Harvest", "Market"].map((n, i) => (
              <span key={n} className={i <= 3 || (s.eligible && i === 4) ? "on" : ""}>
                {n}
              </span>
            ))}
          </nav>

          {/* PAST SCANS */}
          <div className="hp-title">
            <h3>Past scans</h3>
            <span className="hp-pill">{s.sorted.length} scans recorded</span>
          </div>

          <ol className="hp-timeline">
            {s.sorted.map((sc, i) => {
              const prev = s.sorted[i - 1];
              const diff = prev ? Math.round(sc.risk - prev.risk) : 0;
              const sev = severity(sc.risk);
              return (
                <li key={sc.id ?? i}>
                  <span className="hp-dot" />
                  <div className="hp-scan">
                    <div className="hp-scan-top">
                      <div>
                        <span className="hp-tag">Scan #{i + 1}</span>
                        {i === s.sorted.length - 1 && <span className="hp-tag hp-latest">Latest</span>}
                        <strong>{prettyDisease(sc.disease)}</strong>
                      </div>
                      <span className={`hp-sev hp-${sev.toLowerCase()}`}>{sev}</span>
                    </div>
                    <div className="hp-muted">{fmtDateTime(sc.scannedAt)}</div>
                    <div className="hp-chips">
                      <span>AI {sc.confidence}% conf.</span>
                      <span>{sc.temp}°C</span>
                      <span>{sc.humidity}% humidity</span>
                      <span>{sc.rain ?? 0} mm rain</span>
                      <span>
                        Disease risk: {sc.risk}%
                        {prev && diff !== 0 && (
                          <b className={diff < 0 ? "good" : "bad"}> {diff < 0 ? "▼" : "▲"} {Math.abs(diff)}</b>
                        )}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          {/* NEXT FOLLOW-UP: its own full-width block, outside the timeline */}
          <div className="hp-follow">
            <h3>Next follow-up scan</h3>
            {s.eligible ? (
              <p className="good">No follow-up needed. Crop is verified healthy.</p>
            ) : (
              <div className="hp-follow-row">
                <div>
                  <div className="hp-big">{s.followUpDue && fmtDate(s.followUpDue)}</div>
                  <div className="hp-muted">Follow-up after {s.plan?.intervalDays} days</div>
                  {s.plan?.medicine && <div className="hp-muted">Treatment: {s.plan.medicine}</div>}
                </div>
                <button className="hp-btn" onClick={onRescan}>↻ Re-scan crop</button>
                {s.upcomingSprays.map((u) => (
                  <div className="hp-upcoming" key={u.no}>
                    <small>Upcoming</small>
                    <div className="hp-big">{fmtDate(u.date)}</div>
                    <div className="hp-muted">Spray {u.no} of {u.total}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* HISTORY */}
          <div className="hp-title"><h3>History: treatments and sprays</h3></div>
          {sprays.length === 0 ? (
            <p className="hp-muted">No sprays recorded yet.</p>
          ) : (
            <ul className="hp-history">
              {[...sprays]
                .sort((a, b) => new Date(a.date) - new Date(b.date))
                .map((sp, i) => (
                  <li key={sp.id ?? i}>
                    <strong>{prettyDisease(sp.disease)}</strong> · {fmtDate(sp.date)}
                    <div className="hp-muted">
                      Spray {sp.sprayNo} of {sp.totalSprays}
                      {sp.temp != null && ` · ${sp.temp}°C`}
                      {sp.humidity != null && ` · ${sp.humidity}% humidity`}
                      {sp.risk != null && ` · Disease risk: ${sp.risk}%`}
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </section>

        {/* RIGHT: harvest */}
        {showHarvestPanel && (
        <aside className="hp-card hp-side">
          <h3>Verified harvest</h3>
          <label>Quantity (kg)</label>
          <input type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} />
          <label>Quality</label>
          <select value={quality} onChange={(e) => setQuality(e.target.value)}>
            <option>Grade A (Premium Retail)</option>
            <option>Grade B (Standard)</option>
            <option>Grade C (Processing)</option>
          </select>
          <button
            className="hp-btn hp-wide"
            disabled={!s.eligible}
            onClick={() => onVerifyHarvest({ quantity: Number(qty), quality })}
          >
            ✓ Verify harvest
          </button>
          <span className={`hp-pill ${s.eligible ? "ok" : ""}`}>{s.eligible ? "Ready to sell" : "Not ready"}</span>
          <p className="hp-muted">
            {s.eligible
              ? "Verified healthy. You can record this harvest."
              : s.reason || "Harvest verification opens after disease control and healthy scans."}
          </p>
        </aside>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   4. STYLES - all scoped under .hp so nothing else can break them
------------------------------------------------------------------- */
const CSS = `
.hp{--bg:#05261d;--card:#0a3a2d;--card2:#0d4a38;--line:#14634b;--mint:#2ee6a6;--text:#e8fff6;--mute:#8fb8a8;
  --bad:#c0392b;--warn:#a88b1f;color:var(--text);font-family:Inter,system-ui,sans-serif;background:var(--bg);padding:20px;box-sizing:border-box}
.hp *{box-sizing:border-box}
.hp-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:20px;align-items:start}
@media(max-width:900px){.hp-grid{grid-template-columns:1fr}}
.hp-card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:20px}
.hp h2{margin:2px 0;font-size:28px}.hp h3{margin:0;font-size:15px;color:var(--mint)}
.hp-muted{color:var(--mute);font-size:13px}
.hp-head{display:flex;gap:14px;align-items:center}
.hp-icon{width:56px;height:56px;border-radius:16px;background:var(--card2);border:1px solid var(--mint);display:grid;place-items:center;font-size:26px}
.hp-stages{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0;padding:10px;background:#062a21;border-radius:14px}
.hp-stages span{padding:6px 12px;border-radius:999px;font-size:13px;color:var(--mute)}
.hp-stages span.on{background:var(--card2);color:var(--mint);font-weight:600}
.hp-title{display:flex;justify-content:space-between;align-items:center;margin:22px 0 12px}
.hp-pill{background:var(--card2);color:var(--text);padding:5px 12px;border-radius:999px;font-size:12px;width:fit-content}
.hp-pill.ok{background:var(--mint);color:#04261d;font-weight:700}
.hp-timeline{list-style:none;margin:0;padding:0 0 0 28px;position:relative}
.hp-timeline:before{content:"";position:absolute;left:8px;top:14px;bottom:14px;width:2px;background:var(--mint);opacity:.6}
.hp-timeline li{position:relative;margin-bottom:12px}
.hp-dot{position:absolute;left:-26px;top:18px;width:14px;height:14px;border-radius:50%;background:var(--mint);border:3px solid var(--card)}
.hp-scan{background:var(--card2);border:1px solid var(--line);border-radius:16px;padding:14px;width:100%}
.hp-scan-top{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:4px}
.hp-tag{background:#0a3a2d;border-radius:999px;padding:3px 10px;font-size:12px;margin-right:8px}
.hp-latest{background:var(--mint);color:#04261d;font-weight:700}
.hp-sev{padding:5px 14px;border-radius:999px;font-size:12px;font-weight:700}
.hp-high{background:var(--bad)}.hp-medium{background:var(--warn)}.hp-low{background:#1e8f5f}
.hp-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.hp-chips span{background:#0a3a2d;border-radius:999px;padding:5px 11px;font-size:12px}
.good{color:var(--mint)}.bad{color:#ff8a7a}
.hp-follow{margin-top:20px;padding:16px;border:1px solid var(--line);border-radius:16px;width:100%}
.hp-follow-row{display:flex;flex-wrap:wrap;gap:20px;align-items:center;margin-top:12px}
.hp-big{font-size:17px;font-weight:600}
.hp-upcoming{border-left:1px solid var(--line);padding-left:20px}.hp-upcoming small{color:var(--mint)}
.hp-btn{background:var(--mint);color:#04261d;border:0;border-radius:999px;padding:12px 22px;font-weight:700;cursor:pointer}
.hp-btn:disabled{background:#2a5a4b;color:#7aa597;cursor:not-allowed}
.hp-wide{width:100%;margin:14px 0 10px}
.hp-history{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.hp-history li{padding:10px 12px;border-radius:12px;background:#08322a;font-size:14px}
.hp-side{display:flex;flex-direction:column;gap:6px}
.hp-side label{font-size:13px;color:var(--mute);margin-top:10px}
.hp-side input,.hp-side select{background:#062a21;color:var(--text);border:1px solid var(--line);border-radius:12px;padding:10px;font-size:15px}
`;
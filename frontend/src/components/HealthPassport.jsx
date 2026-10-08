import { useMemo, useState } from "react";

/* ------------------------------------------------------------------
   1. SETTINGS - change these numbers, nothing else needs touching
------------------------------------------------------------------- */
const REQUIRED_HEALTHY_SCANS = 1;   // confirmed healthy scans in a row before the crop counts as healthy
const MIN_HEALTHY_CONFIDENCE = 0;    // 0 = any scan labelled Healthy counts. Set 50 to ignore weak Healthy guesses
const IMPROVE_BY = 5;               // risk must drop by at least this many points to count as "improving"
const DEMO_SKIP_HARVEST_WAIT = true; // true = ignore the safe-to-harvest wait so a demo can reach "Ready to sell". Set false for real use.
const DEFAULT_PLAN = { medicine: "", dose: "", intervalDays: 3, totalSprays: 3, waitDays: 7 };
// waitDays = days to wait after the last spray before harvest. Set to 0 for a quick demo.

// Fallback only. The real source is treatments.json, passed in through the getTreatment prop.
const TREATMENTS = {
  "bacterial spot": { medicine: "Copper hydroxide 77% WP", dose: "2 g per litre of water", intervalDays: 3, totalSprays: 3, waitDays: 7 },
  "early blight": { ...DEFAULT_PLAN },
  "late blight": { ...DEFAULT_PLAN },
  "northern leaf blight": { ...DEFAULT_PLAN },
  "leaf blight": { ...DEFAULT_PLAN },
  "black rot": { ...DEFAULT_PLAN },
};

/* ------------------------------------------------------------------
   2. LOGIC - plain functions, no React inside
------------------------------------------------------------------- */
export const normalize = (s = "") => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export const prettyDisease = (s = "") => {
  const last = s.split("___").pop() || s;
  const t = last.replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export const isHealthy = (scan) => normalize(scan.disease).includes("healthy");
const confirmedHealthy = (scan) => isHealthy(scan) && !(Number(scan.confidence) < MIN_HEALTHY_CONFIDENCE);

export function planFor(disease, getTreatment) {
  const n = normalize(disease);
  const key = Object.keys(TREATMENTS).find((k) => n.includes(k));
  const base = key ? TREATMENTS[key] : DEFAULT_PLAN;
  const external = getTreatment ? getTreatment(disease) || {} : {};
  return { ...base, ...external };
}

const severity = (risk) => (risk >= 70 ? "HIGH" : risk >= 40 ? "MEDIUM" : "LOW");
const addDays = (d, n) => new Date(new Date(d).getTime() + n * 86400000);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const fmtDate = (d) => new Date(d).toLocaleDateString("en-GB");
const fmtDateTime = (d) => new Date(d).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "medium" });
const dueText = (due, now) => {
  const d = Math.ceil((new Date(due) - now) / 86400000);
  if (d > 0) return `Due in ${d} day${d > 1 ? "s" : ""}`;
  if (d === 0) return "Due today";
  return `Overdue by ${-d} day${-d > 1 ? "s" : ""}`;
};

// Which visit does a spray belong to? The latest visit at or before the spray.
// A spray with no earlier visit (for example a date-only value) goes to visit 1.
function sprayVisitIndex(visits, sp) {
  let idx = 0;
  visits.forEach((v, i) => {
    if (new Date(v.scannedAt) <= new Date(sp.date)) idx = i;
  });
  return idx;
}

// One row per visit: used by both the summary table and the detail cards
export function visitRows(visits, sprays = [], getTreatment) {
  return visits.map((v, i) => {
    const prev = visits[i - 1];
    const sick = !isHealthy(v);
    const diff = prev ? Math.round(v.risk - prev.risk) : 0;
    const t = { ...planFor(v.disease, getTreatment), ...(v.treatment || {}) };
    const sprayList = sprays.filter((sp) => sprayVisitIndex(visits, sp) === i);
    let result, tone;
    if (!sick) {
      result = confirmedHealthy(v) ? "Healthy" : "Healthy, low confidence";
      tone = confirmedHealthy(v) ? "good" : "bad";
    } else if (!prev) {
      result = "Initial scan";
      tone = "";
    } else if (isHealthy(prev)) {
      result = "Disease came back";
      tone = "bad";
    } else if (diff <= -IMPROVE_BY) {
      result = "Improving";
      tone = "good";
    } else {
      result = "Not improving";
      tone = "bad";
    }
    return { v, i, diff, sick, t, sprayList, result, tone };
  });
}

// IMPORTANT: pass only the scans and sprays of ONE passport.
//   state.complete = the crop is healthy, so the passport is finished (new scans must open a new passport)
//   state.eligible = complete AND the safe-to-harvest wait is over (ready to sell)
export function buildPassportState(scans, sprays = [], getTreatment, now = new Date()) {
  const visits = [...scans].sort((a, b) => new Date(a.scannedAt) - new Date(b.scannedAt));
  const latest = visits[visits.length - 1];
  if (!latest) return { visits, latest: null };

  const caseStart = visits.find((v) => !isHealthy(v)) || visits[0];
  const lastSick = [...visits].reverse().find((v) => !isHealthy(v));
  const plan = planFor((lastSick || latest).disease, getTreatment);

  const courseSprays = [...sprays].sort((a, b) => new Date(a.date) - new Date(b.date));
  const lastSpray = courseSprays[courseSprays.length - 1];
  const spraysDone = Math.min(courseSprays.length, plan.totalSprays); // never "8 of 3"
  const waitUntil = lastSpray ? addDays(lastSpray.date, plan.waitDays) : null;
  const waitSkipped = DEMO_SKIP_HARVEST_WAIT && !!waitUntil && now < waitUntil;
  const waitOver = DEMO_SKIP_HARVEST_WAIT || !waitUntil || now >= waitUntil;

  let streak = 0;
  for (let i = visits.length - 1; i >= 0 && confirmedHealthy(visits[i]); i--) streak++;

  const prev = visits[visits.length - 2];
  const delta = prev ? Math.round(latest.risk - prev.risk) : 0;
  const healthyNow = isHealthy(latest);
  const confirmed = confirmedHealthy(latest);
  const complete = confirmed && streak >= REQUIRED_HEALTHY_SCANS; // crop is healthy
  const eligible = complete && waitOver;                          // healthy and safe to harvest
  const healthyHold = complete && !waitOver;                      // healthy, only waiting for the safe date

  let status;
  if (eligible) status = "Cleared: ready to sell";
  else if (healthyNow && !confirmed) status = "Looks healthy, but AI confidence is low. Re-scan to confirm.";
  else if (healthyHold) status = `Healthy. Ready to harvest after ${fmtDate(waitUntil)}`;
  else if (healthyNow) status = `Recovering: ${streak} of ${REQUIRED_HEALTHY_SCANS} healthy scans`;
  else if (!prev) status = "Under treatment";
  else if (isHealthy(prev)) status = "Disease came back";
  else if (delta <= -IMPROVE_BY) status = "Improving";
  else status = "Not improving";

  // One spray per visit: scan, spray, then scan again after the interval.
  const latestIdx = visits.length - 1;
  const needsSprays = !healthyNow && courseSprays.length < plan.totalSprays;
  const sprayedThisVisit = !healthyNow && courseSprays.some((sp) => sprayVisitIndex(visits, sp) === latestIdx);
  const sprayPending = needsSprays && !sprayedThisVisit;
  const sprayToday = sprayPending ? { no: courseSprays.length + 1, total: plan.totalSprays } : null;
  const sprayedAfterToday = courseSprays.length + (sprayPending ? 1 : 0);

  // ONE next-visit date: the next scan and the next spray happen on the same day.
  const baseDate =
    lastSpray && new Date(lastSpray.date) > new Date(latest.scannedAt) ? lastSpray.date : latest.scannedAt;
  const nextVisit =
    eligible || healthyHold
      ? null
      : {
          date: addDays(baseDate, plan.intervalDays),
          sprayNo: !healthyNow && sprayedAfterToday < plan.totalSprays ? sprayedAfterToday + 1 : null,
          total: plan.totalSprays,
        };

  return {
    visits, latest, caseStart, lastSick, plan, streak, delta, status,
    complete, eligible, healthyHold, sprayToday, sprayedThisVisit, nextVisit,
    courseSprays, spraysDone, waitUntil, waitSkipped,
    daysToRecover: daysBetween(caseStart.scannedAt, latest.scannedAt),
    reason: eligible
      ? ""
      : !healthyNow
      ? "The latest scan still shows disease. Finish the sprays and re-scan."
      : !confirmed
      ? "The healthy scan has low AI confidence. Re-scan to confirm."
      : `Safe-to-harvest wait ends ${fmtDate(waitUntil)}.`,
  };
}

/* ------------------------------------------------------------------
   3. COMPONENT
   scans:  [{ id, disease, confidence, risk, temp, humidity, rain, scannedAt, treatment? }]
   sprays: [{ id, disease, sprayNo, totalSprays, date }]
   getTreatment (optional): (disease) => ({ medicine, dose, intervalDays, totalSprays, waitDays })
   onRecordSpray (optional): async ({ sprayNo, totalSprays, disease, medicine, dose }) => save the spray, then reload sprays
   onNewPassport (optional): shows a "Scan a new crop" button once the crop is ready to sell.
------------------------------------------------------------------- */
const Stat = ({ label, value }) => (
  <div className="hp-stat">
    <small>{label}</small>
    <b>{value}</b>
  </div>
);

export default function HealthPassport({
  crop = "Crop",
  passportId = "ANX-00000",
  farmer = "Demo Farmer",
  location = "Bengaluru",
  scans = [],
  sprays = [],
  getTreatment,
  onRescan = () => {},
  onRecordSpray,
  onNewPassport,
  onVerifyHarvest = () => {},
  showHeader = true,
  showHarvestPanel = true,
}) {
  const [qty, setQty] = useState(100);
  const [quality, setQuality] = useState("Grade A (Premium Retail)");
  const [showDetails, setShowDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const now = new Date();
  const s = useMemo(() => buildPassportState(scans, sprays, getTreatment), [scans, sprays, getTreatment]);
  const rows = useMemo(
    () => (s.latest ? visitRows(s.visits, sprays, getTreatment) : []),
    [s, sprays, getTreatment]
  );

  const handleSpray = async () => {
    if (!s.sprayToday || !onRecordSpray) return;
    setSaving(true);
    try {
      await onRecordSpray({
        sprayNo: s.sprayToday.no,
        totalSprays: s.sprayToday.total,
        disease: (s.lastSick || s.latest).disease,
        medicine: s.plan.medicine || "",
        dose: s.plan.dose || "",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="hp">
      <style>{CSS}</style>
      <div className="hp-grid">
        <section className="hp-card hp-main">
          {showHeader && (
            <header className="hp-head">
              <div className="hp-icon">🌱</div>
              <div>
                <div className="hp-muted">Passport ID: {passportId}</div>
                <h2>{crop}</h2>
                <div className="hp-muted">{location} | {farmer} | {fmtDate(now)}</div>
              </div>
            </header>
          )}

          {!s.latest ? (
            <p className="hp-muted">No scans yet. Scan the crop to open this passport.</p>
          ) : (
            <>
              {/* 1. CASE SUMMARY */}
              <div className="hp-title">
                <h3>Case summary</h3>
                <span className={`hp-pill ${s.eligible ? "ok" : ""}`}>{s.status}</span>
              </div>
              <div className="hp-sumgrid">
                <Stat label="First scan" value={fmtDate(s.caseStart.scannedAt)} />
                <Stat label="Disease" value={prettyDisease(s.caseStart.disease)} />
                <Stat label="Risk" value={`${s.caseStart.risk}% → ${s.latest.risk}%`} />
                <Stat label="Visits" value={s.visits.length} />
                <Stat label="Sprays" value={`${s.spraysDone} of ${s.plan.totalSprays}`} />
              </div>

              {/* 2. READY TO SELL / HEALTHY HOLD / NEXT VISIT */}
              {s.eligible ? (
                <div className="hp-clear">
                  <h3>Crop is healthy. Ready to sell</h3>
                  <p className="hp-muted">
                    No more scans are needed. This passport is complete. A new scan starts a new passport.
                  </p>
                  {s.waitSkipped && (
                    <p className="hp-muted">
                      Demo mode: the safe-to-harvest wait ({s.plan.waitDays} days after the last spray) is skipped.
                    </p>
                  )}
                  <div className="hp-sumgrid">
                    <Stat label="Disease treated" value={s.lastSick ? prettyDisease(s.lastSick.disease) : "None"} />
                    <Stat label="Medicine used" value={s.lastSick ? s.plan.medicine || "Not available" : "None needed"} />
                    <Stat label="First scan" value={fmtDate(s.caseStart.scannedAt)} />
                    <Stat label="Cleared on" value={fmtDate(s.latest.scannedAt)} />
                    <Stat label="Days to recover" value={s.daysToRecover} />
                    <Stat label="Total visits" value={s.visits.length} />
                    <Stat label="Risk" value={`${s.caseStart.risk}% → ${s.latest.risk}%`} />
                    <Stat label="Sprays done" value={`${s.spraysDone} of ${s.plan.totalSprays}`} />
                  </div>
                  {onNewPassport && (
                    <button className="hp-btn hp-top" onClick={onNewPassport}>+ Scan a new crop</button>
                  )}
                </div>
              ) : s.healthyHold ? (
                <div className="hp-clear">
                  <h3>Crop is healthy. No scan needed</h3>
                  <p className="hp-muted">
                    Ready to harvest after {fmtDate(s.waitUntil)}. That is the safe wait after the last spray.
                  </p>
                </div>
              ) : (
                <div className="hp-follow">
                  <h3>Next visit</h3>

                  {s.sprayToday && (
                    <div className="hp-todo">
                      <div>
                        <b>Spray {s.sprayToday.no} of {s.sprayToday.total} today</b>
                        {(s.plan.medicine || s.plan.dose) && (
                          <div className="hp-muted">{[s.plan.medicine, s.plan.dose].filter(Boolean).join(" · ")}</div>
                        )}
                      </div>
                      {onRecordSpray && (
                        <button className="hp-btn hp-sm" disabled={saving} onClick={handleSpray}>
                          {saving ? "Saving..." : `✓ I did spray ${s.sprayToday.no}`}
                        </button>
                      )}
                    </div>
                  )}
                  {s.sprayedThisVisit && (
                    <div className="hp-done">
                      ✓ Spray {Math.min(s.courseSprays.length, s.plan.totalSprays)} of {s.plan.totalSprays} recorded for this visit
                    </div>
                  )}

                  <div className="hp-follow-row">
                    <div>
                      <div className="hp-big">{fmtDate(s.nextVisit.date)}</div>
                      <div className="hp-muted">{dueText(s.nextVisit.date, now)}</div>
                      <div className="hp-muted">
                        {s.nextVisit.sprayNo
                          ? `Scan the crop and apply Spray ${s.nextVisit.sprayNo} of ${s.nextVisit.total}`
                          : "Scan the crop to check recovery"}
                      </div>
                    </div>
                    <button className="hp-btn" onClick={onRescan}>↻ Scan crop now</button>
                  </div>
                </div>
              )}

              {/* 3. TREATMENT SUMMARY TABLE: one line per visit */}
              <div className="hp-title">
                <h3>Treatment summary</h3>
                <span className="hp-pill">{s.visits.length} scans recorded</span>
              </div>
              <div className="hp-tablewrap">
                <table className="hp-table">
                  <thead>
                    <tr>
                      <th>Visit</th><th>Date</th><th>Disease</th><th>Medicine</th><th>Risk</th><th>Sprays</th><th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.v.id ?? r.i}>
                        <td>{r.i + 1}</td>
                        <td>{fmtDate(r.v.scannedAt)}</td>
                        <td>{prettyDisease(r.v.disease)}</td>
                        <td>
                          {r.sick ? r.t.medicine || "Not available" : "None needed"}
                          {r.sick && r.t.dose && <div className="hp-muted">{r.t.dose}</div>}
                        </td>
                        <td>
                          {r.v.risk}%
                          {r.i > 0 && r.diff !== 0 && (
                            <b className={r.diff < 0 ? "good" : "bad"}> {r.diff < 0 ? "▼" : "▲"}{Math.abs(r.diff)}</b>
                          )}
                        </td>
                        <td>{r.sprayList.length || "-"}</td>
                        <td className={r.tone}>{r.result}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button className="hp-link" onClick={() => setShowDetails((x) => !x)}>
                {showDetails ? "Hide visit details" : `Show visit details (${s.visits.length})`}
              </button>

              {showDetails && (
                <ol className="hp-timeline">
                  {rows.map((r) => {
                    const { v, i, diff, sick, t, sprayList } = r;
                    const sev = severity(v.risk);
                    const isLast = i === rows.length - 1;
                    return (
                      <li key={v.id ?? i}>
                        <span className="hp-dot" />
                        <div className="hp-scan">
                          <div className="hp-scan-top">
                            <div>
                              <span className="hp-tag">{i === 0 ? "Visit 1 · Initial scan" : `Visit ${i + 1} · Follow-up`}</span>
                              {isLast && <span className="hp-tag hp-latest">Latest</span>}
                              <strong>{prettyDisease(v.disease)}</strong>
                            </div>
                            <span className={`hp-sev hp-${sev.toLowerCase()}`}>{sev}</span>
                          </div>
                          <div className="hp-muted">{fmtDateTime(v.scannedAt)}</div>
                          <div className="hp-chips">
                            <span>AI {v.confidence}% conf.</span>
                            <span>{v.temp}°C</span>
                            <span>{v.humidity}% humidity</span>
                            <span>{v.rain ?? 0} mm rain</span>
                            <span>
                              Disease risk: {v.risk}%
                              {i > 0 && diff !== 0 && (
                                <b className={diff < 0 ? "good" : "bad"}> {diff < 0 ? "▼" : "▲"} {Math.abs(diff)}</b>
                              )}
                            </span>
                          </div>

                          {sick ? (
                            <div className="hp-rx">
                              <div><small>Medicine</small> {t.medicine || "Not available"}</div>
                              {t.dose && <div><small>Dose</small> {t.dose}</div>}
                              {r.result === "Not improving" && (
                                <div className="bad">
                                  Risk has not dropped. Repeat the spray, and if it stays the same at the next visit, show the crop to your local agri officer.
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className={`hp-rx ${r.tone}`}>
                              {confirmedHealthy(v)
                                ? "Healthy at this visit. No treatment needed."
                                : "Marked healthy, but AI confidence is low. Re-scan to confirm."}
                            </div>
                          )}

                          {sprayList.length > 0 && (
                            <div className="hp-spray">
                              ✓ {sprayList.length} spray{sprayList.length > 1 ? "s" : ""} recorded · last on{" "}
                              {fmtDate(sprayList[sprayList.length - 1].date)}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </>
          )}
        </section>

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
            <p className="hp-muted">{s.eligible ? "Verified healthy. You can record this harvest." : s.reason}</p>
          </aside>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   4. STYLES - scoped under .hp
------------------------------------------------------------------- */
const CSS = `
.hp{--bg:#05261d;--card:#0a3a2d;--card2:#0d4a38;--line:#14634b;--mint:#2ee6a6;--text:#e8fff6;--mute:#9cc4b4;
  --bad:#c0392b;--warn:#a88b1f;color:var(--text);font-family:Inter,system-ui,sans-serif;padding:20px;box-sizing:border-box}
.hp *{box-sizing:border-box}
.hp-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:20px;align-items:start}
.hp-grid:has(> .hp-main:only-child){grid-template-columns:minmax(0,1fr)}
@media(max-width:900px){.hp-grid{grid-template-columns:1fr}}
.hp-card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:20px}
.hp h2{margin:2px 0;font-size:28px}.hp h3{margin:0;font-size:15px;color:var(--mint)}
.hp-muted{color:var(--mute);font-size:13px}
.hp-head{display:flex;gap:14px;align-items:center;margin-bottom:8px}
.hp-icon{width:56px;height:56px;border-radius:16px;background:var(--card2);border:1px solid var(--mint);display:grid;place-items:center;font-size:26px}
.hp-title{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:22px 0 12px}
.hp-title:first-child{margin-top:0}
.hp-pill{background:var(--card2);color:var(--text);padding:5px 12px;border-radius:999px;font-size:12px;width:fit-content}
.hp-pill.ok{background:var(--mint);color:#04261d;font-weight:700}
.hp-sumgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
.hp-stat{background:var(--card2);border:1px solid var(--line);border-radius:14px;padding:10px 12px}
.hp-stat small{display:block;color:var(--mute);font-size:12px;margin-bottom:2px}.hp-stat b{font-size:15px}
.hp-tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:14px;background:#08322a}
.hp-table{width:100%;border-collapse:collapse;font-size:13px;min-width:600px}
.hp-table th{text-align:left;color:var(--mute);font-weight:600;padding:10px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
.hp-table td{padding:10px 12px;border-bottom:1px solid #0f5240;vertical-align:top}
.hp-table tr:last-child td{border-bottom:0}
.hp-link{background:none;border:1px solid var(--line);color:var(--mint);border-radius:999px;padding:8px 16px;cursor:pointer;margin-top:16px;font-weight:600}
.hp-timeline{list-style:none;margin:16px 0 0;padding:0 0 0 28px;position:relative}
.hp-timeline:before{content:"";position:absolute;left:8px;top:14px;bottom:14px;width:2px;background:var(--mint);opacity:.6}
.hp-timeline li{position:relative;margin-bottom:12px}
.hp-dot{position:absolute;left:-26px;top:18px;width:14px;height:14px;border-radius:50%;background:var(--mint);border:3px solid var(--card)}
.hp-scan{background:var(--card2);border:1px solid var(--line);border-radius:16px;padding:14px;width:100%}
.hp-scan-top{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:4px}
.hp-tag{background:#0a3a2d;border-radius:999px;padding:3px 10px;font-size:12px;margin-right:8px;display:inline-block}
.hp-latest{background:var(--mint);color:#04261d;font-weight:700}
.hp-sev{padding:5px 14px;border-radius:999px;font-size:12px;font-weight:700}
.hp-high{background:var(--bad)}.hp-medium{background:var(--warn)}.hp-low{background:#1e8f5f}
.hp-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.hp-chips span{background:#0a3a2d;border-radius:999px;padding:5px 11px;font-size:12px}
.hp-rx{margin-top:12px;padding:10px 12px;border-radius:12px;background:#08322a;font-size:14px;display:grid;gap:4px}
.hp-rx small{color:var(--mute);margin-right:6px}
.hp-spray{margin-top:8px;font-size:13px;color:var(--mint)}
.good{color:var(--mint)}.bad{color:#ff9a8a}
.hp-follow,.hp-clear{margin-top:20px;padding:16px;border:1px solid var(--line);border-radius:16px;width:100%}
.hp-clear{border-color:var(--mint);background:#0b4535}
.hp-clear h3{font-size:18px;margin-bottom:4px}.hp-clear .hp-sumgrid{margin-top:12px}
.hp-todo{margin-top:10px;padding:12px;border-radius:12px;background:#08322a;border:1px dashed var(--mint);font-size:14px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.hp-done{margin-top:10px;font-size:14px;color:var(--mint)}
.hp-follow-row{display:flex;flex-wrap:wrap;gap:20px;align-items:center;margin-top:12px}
.hp-big{font-size:17px;font-weight:600}
.hp-btn{background:var(--mint);color:#04261d;border:0;border-radius:999px;padding:12px 22px;font-weight:700;cursor:pointer}
.hp-btn:disabled{background:#2a5a4b;color:#7aa597;cursor:not-allowed}
.hp-sm{padding:9px 16px}
.hp-wide{width:100%;margin:14px 0 10px}.hp-top{margin-top:14px}
.hp-side{display:flex;flex-direction:column;gap:6px}
.hp-side label{font-size:13px;color:var(--mute);margin-top:10px}
.hp-side input,.hp-side select{background:#062a21;color:var(--text);border:1px solid var(--line);border-radius:12px;padding:10px;font-size:15px}
`;
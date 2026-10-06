export default function RiskBadge({ level, label, t }) {
  const normalizedLevel = String(level || "low").toLowerCase();
  const displayLabel =
    label ||
    (t
      ? normalizedLevel === "high"
        ? t.riskHigh
        : normalizedLevel.includes("mod")
        ? t.riskMod
        : t.riskLow
      : level || "");
  return (
    <span className={`badge risk-${normalizedLevel}`}>
      {displayLabel}
    </span>
  );
}

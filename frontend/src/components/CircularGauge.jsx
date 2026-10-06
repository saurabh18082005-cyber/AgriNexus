export default function CircularGauge({
  value = 0,
  size = 110,
  strokeWidth = 9,
  label = "",
  subLabel = "",
  gradientId = "gauge-grad",
  color = "#16a34a",
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedValue = Math.min(100, Math.max(0, value));
  const strokeDashoffset = circumference - (clampedValue / 100) * circumference;

  return (
    <div className="circular-gauge-container" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4ade80" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        {/* Track Background */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(22, 101, 52, 0.12)"
          strokeWidth={strokeWidth}
        />
        {/* Animated Progress Ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.16, 1, 0.3, 1)" }}
        />
      </svg>
      <div className="gauge-center-content">
        <span className="gauge-val-big">{Math.round(clampedValue)}%</span>
        {label && <span className="gauge-label-mini">{label}</span>}
        {subLabel && <span className="gauge-sub-mini">{subLabel}</span>}
      </div>
    </div>
  );
}

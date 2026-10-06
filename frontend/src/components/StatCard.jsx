export default function StatCard({ icon, label, value, sub, tag }) {
  return (
    <div className="stat-card-elevated">
      <div className="stat-card-top">
        <div className="stat-icon-wrap" aria-hidden="true">
          {icon}
        </div>
        {tag && <span className="stat-tag-badge">{tag}</span>}
      </div>
      <div className="stat-info-wrap">
        <div className="stat-big-val">{value}</div>
        <div className="stat-card-label">{label}</div>
        {sub && <div className="stat-sub-text">{sub}</div>}
      </div>
    </div>
  );
}

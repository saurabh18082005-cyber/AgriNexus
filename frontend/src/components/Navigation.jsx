import { LANG } from "../translations";

export default function Navigation({ page, nav, lang, setLang, t }) {
  const tabs = [
    { id: "home", label: t.navHome, icon: "🌱" },
    { id: "scan", label: t.navScan, icon: "🔬" },
    { id: "passport", label: t.navPassport, icon: "🪪" },
    { id: "market", label: t.navMarket, icon: "🤝" },
  ];

  return (
    <>
      {/* Floating Glass Top Navigation Bar */}
      <header className="topbar">
        <button
          type="button"
          className="brand-btn"
          onClick={() => nav("home")}
          aria-label={t.navHome}
        >
          <span className="brand-logo-icon" aria-hidden="true">🌱</span>
          <span className="brand-title">
            Agri<span className="accent">Nexus</span>
          </span>
          <span className="brand-living-dot" aria-hidden="true" />
        </button>

        <nav className="nav-pill-group" aria-label={t.workflowTitle}>
          {tabs.map((tab) => {
            const isActive = page === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                className={`nav-tab-btn ${isActive ? "active" : ""}`}
                onClick={() => nav(tab.id)}
              >
                <span className="nav-tab-icon" aria-hidden="true">{tab.icon}</span>
                <span>{tab.label}</span>
                {isActive && <span className="nav-active-indicator" aria-hidden="true" />}
              </button>
            );
          })}
        </nav>

        <div className="header-right">
          <div className="lang-selector-wrap">
            <span className="lang-globe-icon" aria-hidden="true">🌐</span>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              aria-label={t.name}
            >
              {Object.entries(LANG).map(([code, item]) => (
                <option key={code} value={code}>
                  {item.name}
                </option>
              ))}
            </select>
            <span className="lang-icon-arrow" aria-hidden="true">▼</span>
          </div>
        </div>
      </header>

      {/* Floating Mobile Bottom Navigation Dock */}
      <nav className="mobile-bottom-dock" aria-label={t.workflowTitle}>
        {tabs.map((tab) => {
          const isActive = page === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`mobile-dock-btn ${isActive ? "active" : ""}`}
              onClick={() => nav(tab.id)}
            >
              <span className="dock-icon" aria-hidden="true">{tab.icon}</span>
              <span className="dock-label">{tab.label}</span>
              {isActive && <span className="dock-active-glow" aria-hidden="true" />}
            </button>
          );
        })}
      </nav>
    </>
  );
}

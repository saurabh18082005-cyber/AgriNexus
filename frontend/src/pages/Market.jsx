import BuyerCard from "../components/BuyerCard";

export default function Market({
  t,
  fill,
  cropTitle,
  result,
  openPassport,
  buyers,
  setMessage,
  setPage,
}) {
  const handleConnect = (buyer) => {
    setMessage(fill(t.msgInterest, { name: t.buyers?.[buyer.name] || buyer.name }));
  };

  const isHealthy = result?.disease?.toLowerCase().includes("healthy");

  return (
    <section className="page-section marketplace-experience">
      <div className="page-head-banner">
        <div className="eyebrow">{t.marketEyebrow}</div>
        <h1>{t.market}</h1>
        <p>{t.marketDesc}</p>
      </div>

      <div className="market-split-layout">
        {/* Crop Lot Trade Manifest Card */}
        <div className="market-produce-card">
          <div className="market-manifest-header">
            <span className="tag-pill">✓ {t.verifiedReady}</span>
            <span className="lot-number-tag">{t.marketProduceLot}</span>
          </div>

          <h2>{fill(t.marketCropLot, { crop: t.crops?.[cropTitle] || cropTitle })}</h2>
          <p>{t.marketNote}</p>

          <div className="market-quality-grid">
            <div className="market-stat-box">
              <span>{t.healthStatus}</span>
              <b className={isHealthy ? "text-emerald" : "text-amber"}>
                {result?.disease ? (t.diseases?.[result.disease] || result.disease) : t.awaitingScan}
              </b>
            </div>
            <div className="market-stat-box">
              <span>{t.stepRisk}</span>
              <b>{result ? `${result.risk?.score ?? 0}%` : "—"}</b>
            </div>
          </div>

          <div className="manifest-trust-callout">
            <span>{t.marketTrustCallout}</span>
          </div>

          <button
            type="button"
            className="btn-outline btn-full manifest-passport-btn"
            onClick={openPassport}
          >
            📔 {t.viewPassport}
          </button>
        </div>

        {/* Verified Commercial Buyer Opportunities */}
        <div className="market-buyers-column">
          <div className="buyers-column-header">
            <div>
              <h3>{t.marketMatchesHeading}</h3>
              <p className="buyers-subtitle">{t.marketMatchesSubtitle}</p>
            </div>
            <span className="buyers-count-chip">{fill(t.marketMatchesActive, { count: buyers?.length || 0 })}</span>
          </div>

          <div className="buyer-cards-stack">
            {buyers && buyers.length > 0 ? (
              buyers.map((buyer, idx) => (
                <BuyerCard
                  key={buyer.name}
                  buyer={buyer}
                  onConnect={handleConnect}
                  t={t}
                  fill={fill}
                  index={idx}
                />
              ))
            ) : (
              <div className="empty-placeholder-view">
                <div className="empty-view-icon" aria-hidden="true">
                  🛒
                </div>
                <h2>{t.noBuyersTitle}</h2>
                <p>{t.noBuyersText}</p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setPage("scan")}
                >
                  🌱 {t.scanCrop}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

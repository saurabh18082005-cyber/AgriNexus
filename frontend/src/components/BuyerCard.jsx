export default function BuyerCard({ buyer, onConnect, t, fill, index = 0 }) {
  const gradeLabel = fill(t.acceptsGrade, { grade: buyer.min_grade });

  const cropIcons = {
    Tomato: "🍅",
    Potato: "🥔",
    Pepper: "🫑",
    Grape: "🍇",
    Corn: "🌽",
  };

  const cropIcon = cropIcons[buyer.crop] || "🌾";

  // Market benchmarks & procurement volumes
  const tradeDetails = {
    Tomato: { price: "₹24 – ₹28 / kg", vol: "850 kg / wk", match: 94 },
    Potato: { price: "₹18 – ₹22 / kg", vol: "2,400 kg / wk", match: 91 },
    Pepper: { price: "₹45 – ₹52 / kg", vol: "600 kg / wk", match: 88 },
    Grape: { price: "₹65 – ₹78 / kg", vol: "1,100 kg / wk", match: 95 },
    Corn: { price: "₹20 – ₹25 / kg", vol: "3,000 kg / wk", match: 92 },
  };

  const details = tradeDetails[buyer.crop] || {
    price: "₹22 – ₹30 / kg",
    vol: "1,000 kg / wk",
    match: 90 - index * 3,
  };

  return (
    <div
      className="buyer-trade-ticket"
      style={{ animationDelay: `${index * 120}ms` }}
    >
      <div className="ticket-top-row">
        <div className="ticket-match-badge">
          <span className="match-pulse-dot" />
          <span>{fill(t.buyerMatchPill, { match: details.match })}</span>
        </div>
        <span className="ticket-price-pill">{details.price.replace("kg", t.unitKg)}</span>
      </div>

      <div className="ticket-main-grid">
        <div className="ticket-crop-avatar" aria-hidden="true">
          <span>{cropIcon}</span>
        </div>

        <div className="ticket-info-group">
          <div className="ticket-buyer-header">
            <h3>{t.buyers?.[buyer.name] || buyer.name}</h3>
            <span className="ticket-verified-tag">{t.buyerVerifiedProcure}</span>
          </div>

          <div className="ticket-specs-row">
            <span>📍 {t.locations?.[buyer.location] || buyer.location}</span>
            <span>📦 {fill(t.buyerDemanding, { vol: details.vol.replace("kg", t.unitKg).replace("wk", t.perWeek) })}</span>
            <span className="ticket-grade-pill">{gradeLabel}</span>
          </div>

          <p className="ticket-interest-desc">{t.buyerInterests?.[buyer.interest] || buyer.interest}</p>
        </div>
      </div>

      <div className="ticket-action-bar">
        <div className="ticket-guarantee-tag">
          <span>{t.buyerEscrow}</span>
        </div>
        <button
          type="button"
          className="btn-primary btn-sm ticket-connect-btn"
          onClick={() => onConnect(buyer)}
        >
          <span>🤝 {t.connect}</span>
        </button>
      </div>
    </div>
  );
}

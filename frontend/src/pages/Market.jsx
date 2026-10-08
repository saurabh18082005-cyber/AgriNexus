import { useState, useEffect, useCallback } from "react";
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
  apiUrl = "http://127.0.0.1:8000",
  onOpenDealRoom
}) {
  const [listings, setListings] = useState([]);
  const [offers, setOffers] = useState([]);
  const [deals, setDeals] = useState([]);
  const [counterOfferId, setCounterOfferId] = useState(null);
  const [counterPrice, setCounterPrice] = useState("");
  const [counterQty, setCounterQty] = useState("");
  const [submittingCounter, setSubmittingCounter] = useState(false);

  const loadMarketData = useCallback(async () => {
    try {
      const resListings = await fetch(`${apiUrl}/api/market/listings`);
      if (resListings.ok) {
        setListings(await resListings.json());
      }
      const resOffers = await fetch(`${apiUrl}/api/offers`);
      if (resOffers.ok) {
        setOffers(await resOffers.json());
      }
      const resDeals = await fetch(`${apiUrl}/api/deals`);
      if (resDeals.ok) {
        setDeals(await resDeals.json());
      }
    } catch (e) {
      console.error(e);
    }
  }, [apiUrl]);

  useEffect(() => {
    loadMarketData();
  }, [loadMarketData]);

  const handleConnect = (buyer) => {
    setMessage(fill(t.msgInterest, { name: t.buyers?.[buyer.name] || buyer.name }));
  };

  const handleUpdateOfferStatus = async (offerId, status) => {
    try {
      const res = await fetch(`${apiUrl}/api/offers/${offerId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to update offer");

      setMessage(`Offer #${offerId} ${status.toLowerCase()} successfully!`);
      loadMarketData();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleSubmitCounter = async (e, offer) => {
    e.preventDefault();
    setSubmittingCounter(true);
    try {
      const payload = {
        buyer_request_id: offer.buyer_request_id,
        listing_id: offer.listing_id,
        quantity: Number(counterQty),
        price_per_kg: Number(counterPrice),
        parent_offer_id: offer.id
      };

      const res = await fetch(`${apiUrl}/api/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to submit counter offer");

      setMessage(`Counter offer #${data.id} sent!`);
      setCounterOfferId(null);
      loadMarketData();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSubmittingCounter(false);
    }
  };

  const isHealthy = result?.disease?.toLowerCase().includes("healthy");
  const getDealForOffer = (offerId) => deals.find((d) => d.offer_id === offerId);

  return (
    <section className="page-section marketplace-experience">
      <div className="page-head-banner">
        <div className="eyebrow">{t.marketEyebrow}</div>
        <h1>{t.market} — Farmer Portal</h1>
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

        {/* Incoming Offers & Farmer Active Listings */}
        <div className="market-buyers-column">
          {/* Section: Incoming Buyer Offers */}
          <div style={{ marginBottom: "24px" }}>
            <div className="buyers-column-header">
              <div>
                <h3>📥 Incoming Buyer Offers</h3>
                <p className="buyers-subtitle">Review, accept, counter or reject incoming procurement offers.</p>
              </div>
              <span className="buyers-count-chip">{offers.length} Offers</span>
            </div>

            {offers.length === 0 ? (
              <div className="empty-placeholder-view" style={{ padding: "20px" }}>
                <div className="empty-view-icon" aria-hidden="true">📩</div>
                <h4>No incoming offers yet</h4>
                <p>When buyers submit offers for your listed crops, they will appear here.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "12px" }}>
                {offers.map((off) => {
                  const associatedDeal = getDealForOffer(off.id);
                  const isCountering = counterOfferId === off.id;

                  return (
                    <div key={off.id} className="panel" style={{ border: "1px solid var(--line-glass-highlight)", background: "var(--canvas-card)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <b style={{ fontSize: "15px" }}>Offer #{off.id} for Listing #{off.listing_id}</b>
                        </div>
                        <span className={`status-pill status-${off.status.toLowerCase()}`}>
                          {off.status}
                        </span>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", margin: "10px 0", fontSize: "13px" }}>
                        <div>
                          <span style={{ color: "var(--ink-muted)", fontSize: "11px", display: "block" }}>QUANTITY</span>
                          <b>{off.quantity} kg</b>
                        </div>
                        <div>
                          <span style={{ color: "var(--ink-muted)", fontSize: "11px", display: "block" }}>PRICE/KG</span>
                          <b>₹{off.price_per_kg}</b>
                        </div>
                        <div>
                          <span style={{ color: "var(--ink-muted)", fontSize: "11px", display: "block" }}>TOTAL VALUE</span>
                          <b style={{ color: "var(--emerald-vibrant)" }}>₹{(off.quantity * off.price_per_kg).toLocaleString()}</b>
                        </div>
                      </div>

                      {/* Action buttons for PENDING offers */}
                      {off.status === "PENDING" && !isCountering && (
                        <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                          <button
                            className="btn-primary btn-sm"
                            onClick={() => handleUpdateOfferStatus(off.id, "ACCEPTED")}
                          >
                            ✓ Accept Offer
                          </button>
                          <button
                            className="btn-outline btn-sm"
                            onClick={() => {
                              setCounterOfferId(off.id);
                              setCounterPrice(off.price_per_kg);
                              setCounterQty(off.quantity);
                            }}
                          >
                            💬 Counter
                          </button>
                          <button
                            className="btn-outline btn-sm"
                            style={{ borderColor: "rgba(244,63,94,0.4)", color: "#f87171" }}
                            onClick={() => handleUpdateOfferStatus(off.id, "REJECTED")}
                          >
                            ✕ Reject
                          </button>
                        </div>
                      )}

                      {/* Counter Form */}
                      {isCountering && (
                        <form onSubmit={(e) => handleSubmitCounter(e, off)} style={{ marginTop: "12px", padding: "12px", background: "var(--canvas-surface)", borderRadius: "8px", display: "flex", gap: "10px", alignItems: "center" }}>
                          <input
                            type="number"
                            placeholder="Counter Qty (kg)"
                            value={counterQty}
                            onChange={(e) => setCounterQty(e.target.value)}
                            required
                            style={{ width: "110px", padding: "6px", borderRadius: "6px", background: "var(--canvas-card)", color: "#fff", border: "1px solid var(--line-glass)" }}
                          />
                          <input
                            type="number"
                            placeholder="Counter ₹/kg"
                            value={counterPrice}
                            onChange={(e) => setCounterPrice(e.target.value)}
                            required
                            step="0.5"
                            style={{ width: "110px", padding: "6px", borderRadius: "6px", background: "var(--canvas-card)", color: "#fff", border: "1px solid var(--line-glass)" }}
                          />
                          <button type="submit" className="btn-primary btn-sm" disabled={submittingCounter}>
                            {submittingCounter ? "..." : "Send Counter"}
                          </button>
                          <button type="button" className="btn-outline btn-sm" onClick={() => setCounterOfferId(null)}>
                            Cancel
                          </button>
                        </form>
                      )}

                      {/* Open Deal Room if offer ACCEPTED or deal exists */}
                      {(off.status === "ACCEPTED" || associatedDeal) && (
                        <div style={{ marginTop: "10px" }}>
                          <button
                            className="btn-primary btn-sm"
                            style={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)" }}
                            onClick={() => onOpenDealRoom && onOpenDealRoom(associatedDeal ? associatedDeal.id : null)}
                          >
                            🤝 Open Deal Room {associatedDeal ? `#${associatedDeal.id}` : ""}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Verified Commercial Buyer Opportunities */}
          <div>
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
                  <div className="empty-view-icon" aria-hidden="true">🛒</div>
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
      </div>
    </section>
  );
}

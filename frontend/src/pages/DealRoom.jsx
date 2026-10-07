import { useState, useEffect, useCallback } from "react";

export default function DealRoom({ dealId: initialDealId, apiUrl, setMessage }) {
  const [deals, setDeals] = useState([]);
  const [selectedDealId, setSelectedDealId] = useState(initialDealId || null);
  const [dealDetail, setDealDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Load all deals for deal selector dropdown
  const loadDealsList = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/deals`);
      if (res.ok) {
        const data = await res.json();
        setDeals(data);
        if (data.length > 0 && !selectedDealId) {
          setSelectedDealId(data[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }, [apiUrl, selectedDealId]);

  useEffect(() => {
    loadDealsList();
  }, [loadDealsList]);

  // Fetch full details of the selected deal from GET /api/deals/{deal_id}
  const loadDealDetail = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/deals/${id}`);
      if (res.ok) {
        const data = await res.json();
        setDealDetail(data);
      } else {
        setMessage(`Deal #${id} not found.`);
      }
    } catch (err) {
      setMessage(`Error loading deal: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, setMessage]);

  useEffect(() => {
    if (selectedDealId) {
      loadDealDetail(selectedDealId);
    }
  }, [selectedDealId, loadDealDetail]);

  const handleUpdateStatus = async (newStatus) => {
    if (!selectedDealId) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`${apiUrl}/api/deals/${selectedDealId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to update deal status");

      setMessage(`Deal #${selectedDealId} updated to ${newStatus}`);
      await loadDealDetail(selectedDealId);
      await loadDealsList();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const getNextStatusAction = (currentStatus) => {
    switch (currentStatus) {
      case "CONFIRMED":
        return { next: "READY_FOR_PICKUP", label: "📦 Mark Ready for Pickup", canCancel: true };
      case "READY_FOR_PICKUP":
        return { next: "PICKED_UP", label: "🚚 Mark Picked Up", canCancel: true };
      case "PICKED_UP":
        return { next: "DELIVERED", label: "📍 Mark Delivered", canCancel: false };
      case "DELIVERED":
        return { next: "COMPLETED", label: "✅ Complete Deal", canCancel: false };
      default:
        return null;
    }
  };

  const totalValue = dealDetail ? dealDetail.quantity * dealDetail.price_per_kg : 0;
  const actionInfo = dealDetail ? getNextStatusAction(dealDetail.status) : null;

  const timelineSteps = [
    { key: "CONFIRMED", label: "Deal Confirmed", icon: "🤝" },
    { key: "READY_FOR_PICKUP", label: "Ready for Pickup", icon: "📦" },
    { key: "PICKED_UP", label: "In Transit / Picked Up", icon: "🚚" },
    { key: "DELIVERED", label: "Delivered to Buyer", icon: "📍" },
    { key: "COMPLETED", label: "Deal Completed", icon: "✅" }
  ];

  const currentStepIdx = dealDetail ? timelineSteps.findIndex(s => s.key === dealDetail.status) : -1;

  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <div className="eyebrow">SLICED EXECUTION · DIGITAL AGRI NEXUS</div>
          <h1>Deal Room</h1>
          <p>Real-time execution dashboard for confirmed produce deals between farmers and commercial buyers.</p>
        </div>
      </div>

      {/* Deal Selection Bar */}
      <div className="panel" style={{ marginBottom: "20px", display: "flex", gap: "16px", alignItems: "center" }}>
        <span style={{ fontSize: "20px" }}>💼</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "11px", color: "var(--ink-muted)", fontWeight: "bold" }}>SELECT ACTIVE DEAL ROOM</div>
          {deals.length === 0 ? (
            <div style={{ fontSize: "14px", color: "var(--ink-muted)" }}>No active deals created yet. Accept an offer to create a deal.</div>
          ) : (
            <select
              value={selectedDealId || ""}
              onChange={(e) => setSelectedDealId(Number(e.target.value))}
              style={{
                background: "var(--canvas-surface)",
                color: "var(--ink-primary)",
                border: "1px solid var(--line-glass-highlight)",
                padding: "8px 12px",
                borderRadius: "8px",
                fontWeight: "600",
                fontSize: "14px",
                width: "100%",
                marginTop: "4px"
              }}
            >
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  Deal Room #{d.id} — Status: {d.status} ({d.quantity} kg @ ₹{d.price_per_kg}/kg)
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {!selectedDealId || !dealDetail ? (
        <div className="panel empty-state" style={{ padding: "40px" }}>
          <div>🤝</div>
          <h2>No Deal Selected</h2>
          <p>Create or select a deal from the dropdown above to view room details.</p>
        </div>
      ) : loading ? (
        <div className="panel empty-state">
          <h3>Loading Deal Room #{selectedDealId}...</h3>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "24px" }}>
          
          {/* Main Deal Details */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            
            {/* Header Card */}
            <div className="panel" style={{ border: "1px solid var(--emerald-primary)", background: "linear-gradient(135deg, var(--canvas-card) 0%, rgba(16, 185, 129, 0.05) 100%)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                <div>
                  <div style={{ fontSize: "12px", color: "var(--emerald-light)", fontWeight: "bold" }}>VERIFIED ESCROW TRADE CONTRACT</div>
                  <h2 style={{ fontSize: "24px", margin: "4px 0" }}>Deal Room #{dealDetail.id}</h2>
                  <p style={{ margin: 0, color: "var(--ink-secondary)", fontSize: "14px" }}>
                    {dealDetail.crop?.crop_type} ({dealDetail.crop?.variety || "Standard"}) · Grade {dealDetail.crop?.quality_grade || "A"}
                  </p>
                </div>
                <span className={`status-pill status-${dealDetail.status.toLowerCase()}`} style={{ fontSize: "14px", padding: "6px 14px" }}>
                  {dealDetail.status}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", padding: "16px", background: "var(--canvas-surface)", borderRadius: "12px", border: "1px solid var(--line-glass)" }}>
                <div>
                  <span style={{ fontSize: "11px", color: "var(--ink-muted)", display: "block" }}>QUANTITY</span>
                  <b style={{ fontSize: "18px", color: "var(--ink-primary)" }}>{dealDetail.quantity} kg</b>
                </div>
                <div>
                  <span style={{ fontSize: "11px", color: "var(--ink-muted)", display: "block" }}>PRICE / KG</span>
                  <b style={{ fontSize: "18px", color: "var(--ink-primary)" }}>₹{dealDetail.price_per_kg}</b>
                </div>
                <div>
                  <span style={{ fontSize: "11px", color: "var(--ink-muted)", display: "block" }}>TOTAL VALUE</span>
                  <b style={{ fontSize: "18px", color: "var(--emerald-vibrant)" }}>₹{totalValue.toLocaleString()}</b>
                </div>
                <div>
                  <span style={{ fontSize: "11px", color: "var(--ink-muted)", display: "block" }}>CURRENT STATUS</span>
                  <b style={{ fontSize: "16px", color: "var(--amber-gold)" }}>{dealDetail.status}</b>
                </div>
              </div>
            </div>

            {/* Parties & Crop Breakdown */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div className="panel">
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                  <span style={{ fontSize: "18px" }}>🌾</span>
                  <h3 style={{ margin: 0, fontSize: "16px" }}>Producer (Farmer)</h3>
                </div>
                <div style={{ fontSize: "14px", color: "var(--ink-primary)", fontWeight: "bold" }}>
                  {dealDetail.farmer?.name || "Verified Farmer"}
                </div>
                <div style={{ fontSize: "12px", color: "var(--ink-muted)", marginTop: "4px" }}>
                  📍 {dealDetail.farmer?.location || "Regional Farm Facility"}
                </div>
              </div>

              <div className="panel">
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                  <span style={{ fontSize: "18px" }}>🏢</span>
                  <h3 style={{ margin: 0, fontSize: "16px" }}>Procurement Buyer</h3>
                </div>
                <div style={{ fontSize: "14px", color: "var(--ink-primary)", fontWeight: "bold" }}>
                  {dealDetail.buyer?.name || "Commercial Buyer"}
                </div>
                <div style={{ fontSize: "12px", color: "var(--ink-muted)", marginTop: "4px" }}>
                  📍 {dealDetail.buyer?.location || "Central Procurement Hub"}
                </div>
              </div>
            </div>

            {/* Visual Lifecycle Timeline Progress */}
            <div className="panel">
              <h3 style={{ fontSize: "16px", marginBottom: "16px" }}>📅 Fulfillment Lifecycle Timeline</h3>
              {dealDetail.status === "CANCELLED" ? (
                <div style={{ padding: "16px", background: "rgba(244, 63, 94, 0.1)", border: "1px solid rgba(244, 63, 94, 0.3)", borderRadius: "10px", color: "#f87171" }}>
                  <b>❌ Deal Cancelled</b>
                  <p style={{ margin: "4px 0 0", fontSize: "13px" }}>This deal has been cancelled and inventory was restored to market listing.</p>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between", position: "relative", padding: "10px 0" }}>
                  {timelineSteps.map((step, idx) => {
                    const isPassed = idx <= currentStepIdx;
                    const isCurrent = idx === currentStepIdx;
                    return (
                      <div key={step.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, zIndex: 2 }}>
                        <div
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "50%",
                            background: isCurrent ? "var(--emerald-primary)" : isPassed ? "var(--canvas-surface)" : "var(--canvas-deep)",
                            border: isPassed ? "2px solid var(--emerald-vibrant)" : "2px solid var(--line-glass)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "16px",
                            color: isPassed ? "#fff" : "var(--ink-muted)"
                          }}
                        >
                          {step.icon}
                        </div>
                        <div style={{ fontSize: "11px", fontWeight: isCurrent ? "bold" : "normal", color: isCurrent ? "var(--emerald-light)" : isPassed ? "var(--ink-primary)" : "var(--ink-muted)", marginTop: "8px", textAlign: "center" }}>
                          {step.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* Right Column: Execution Controls & Dates */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            
            {/* Action Panel */}
            <div className="panel" style={{ border: "1px solid var(--line-glass-highlight)" }}>
              <h3 style={{ fontSize: "16px", marginTop: 0 }}>⚡ Lifecycle Actions</h3>
              <p style={{ fontSize: "12px", color: "var(--ink-muted)" }}>
                Advance the deal state according to fulfillment progress.
              </p>

              {dealDetail.status === "COMPLETED" ? (
                <div style={{ padding: "12px", background: "rgba(34, 197, 94, 0.15)", borderRadius: "8px", color: "var(--emerald-light)", textAlign: "center", fontWeight: "bold" }}>
                  ✅ Deal Execution Completed
                </div>
              ) : dealDetail.status === "CANCELLED" ? (
                <div style={{ padding: "12px", background: "rgba(244, 63, 94, 0.15)", borderRadius: "8px", color: "var(--rose-alert)", textAlign: "center", fontWeight: "bold" }}>
                  ❌ Deal Cancelled
                </div>
              ) : actionInfo ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <button
                    className="btn-primary"
                    onClick={() => handleUpdateStatus(actionInfo.next)}
                    disabled={updatingStatus}
                    style={{ width: "100%" }}
                  >
                    {updatingStatus ? "Updating..." : actionInfo.label}
                  </button>

                  {actionInfo.canCancel && (
                    <button
                      className="btn-outline"
                      onClick={() => handleUpdateStatus("CANCELLED")}
                      disabled={updatingStatus}
                      style={{ width: "100%", borderColor: "rgba(244, 63, 94, 0.4)", color: "#f87171" }}
                    >
                      🚫 Cancel Deal
                    </button>
                  )}
                </div>
              ) : null}
            </div>

            {/* Schedule & Window Dates */}
            <div className="panel">
              <h3 style={{ fontSize: "15px", marginTop: 0 }}>🕒 Schedule Windows</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "12px" }}>
                <div>
                  <span style={{ color: "var(--ink-muted)" }}>Buyer Preferred Window:</span>
                  <div style={{ color: "var(--ink-primary)", fontWeight: "500", marginTop: "2px" }}>
                    {dealDetail.timeline?.buyer_window_start ? new Date(dealDetail.timeline.buyer_window_start).toLocaleDateString() : "Immediate"} — {dealDetail.timeline?.buyer_window_end ? new Date(dealDetail.timeline.buyer_window_end).toLocaleDateString() : "Flexible"}
                  </div>
                </div>
                <div style={{ borderTop: "1px solid var(--line-glass)", paddingTop: "8px" }}>
                  <span style={{ color: "var(--ink-muted)" }}>Harvest Ready Window:</span>
                  <div style={{ color: "var(--ink-primary)", fontWeight: "500", marginTop: "2px" }}>
                    {dealDetail.timeline?.ready_from ? new Date(dealDetail.timeline.ready_from).toLocaleDateString() : "Ready Now"} — {dealDetail.timeline?.ready_to ? new Date(dealDetail.timeline.ready_to).toLocaleDateString() : "Open"}
                  </div>
                </div>
              </div>
            </div>

          </div>

        </div>
      )}
    </section>
  );
}

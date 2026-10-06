import { useState } from "react";

export default function HarvestForm({ cropId, onDone, t, apiUrl }) {
  const [quantity, setQuantity] = useState(100);
  const [grade, setGrade] = useState("A");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);

    try {
      const res = await fetch(`${apiUrl}/api/harvest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          crop_id: cropId,
          quantity: Number(quantity),
          unit: "kg",
          quality_grade: grade,
        }),
      });

      if (!res.ok) throw new Error(t.harvestFailedError || "Harvest verification failed");
      await onDone();
    } catch {
      alert(t.msgHarvestFail);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="harvest-form-grid" onSubmit={handleSubmit}>
      <label>
        {t.qtyKg}
        <input
          type="number"
          min="1"
          step="any"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          required
        />
      </label>

      <label>
        {t.quality}
        <select value={grade} onChange={(e) => setGrade(e.target.value)}>
          <option value="A">{t.gradeA}</option>
          <option value="B">{t.gradeB}</option>
          <option value="C">{t.gradeC}</option>
        </select>
      </label>

      <button
        type="submit"
        className="btn-primary btn-full"
        disabled={busy}
      >
        {busy ? t.saving : `✓ ${t.verifyHarvest}`}
      </button>
    </form>
  );
}

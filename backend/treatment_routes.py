"""Treatment recommendation + dosage calculator for AgriNexus.

New, self-contained file. It does not change any existing code.
Hook it up in backend/app.py with two lines:

    from treatment_routes import router as treatment_router
    app.include_router(treatment_router)
"""
import json
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

DATA = json.loads((Path(__file__).parent / "treatments.json").read_text(encoding="utf-8"))
NORMALIZED_DATA = {
    re.sub(r"[\s_]+", " ", key.strip().lower()): value
    for key, value in DATA.items()
}

def get_treatment_entry(disease: str):
    normalized = re.sub(r"[\s_]+", " ", disease.strip().lower())
    return NORMALIZED_DATA.get(normalized)

# 1 acre = 40 guntha, 1 hectare = 2.471 acre
ACRES_PER_UNIT = {"acre": 1.0, "guntha": 1 / 40, "hectare": 2.471}


def _fmt(amount: float, unit: str) -> str:
    """Show 1250 g as '1.25 kg' and 1250 ml as '1.25 L'."""
    if amount >= 1000:
        return f"{amount / 1000:.2f} {'kg' if unit == 'g' else 'L'}"
    return f"{amount:.0f} {unit}" if amount >= 10 else f"{amount:.1f} {unit}"


@router.get("/treatment")
def get_treatment(
    disease: str,
    area: float = Query(..., gt=0, description="Field size"),
    unit: str = "acre",
):
    entry = get_treatment_entry(disease)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"No treatment entry for '{disease}'")

    unit = unit.lower()
    if unit not in ACRES_PER_UNIT:
        raise HTTPException(status_code=400, detail="unit must be acre, guntha or hectare")

    acres = round(area * ACRES_PER_UNIT[unit], 3)
    base = {
        "disease": disease,
        "type": entry["type"],
        "advice": entry["advice"],
        "verified": entry.get("verified", False),
        "source": entry.get("source", ""),
        "acres": acres,
    }

    # Healthy and virus classes have no medicine plan
    if entry["medicine"] is None:
        return {**base, "medicine": None}

    water_per_spray = entry["water_l_per_acre"] * acres          # litres of spray water
    medicine_per_spray = entry["dose"] * water_per_spray         # g or ml
    medicine_total = medicine_per_spray * entry["sprays"]

    return {
        **base,
        "medicine": entry["medicine"],
        "dose_per_litre": f"{entry['dose']} {entry['dose_unit']} per litre of water",
        "water_per_spray_litres": round(water_per_spray, 1),
        "medicine_per_spray": _fmt(medicine_per_spray, entry["dose_unit"]),
        "medicine_total": _fmt(medicine_total, entry["dose_unit"]),
        "sprays": entry["sprays"],
        "interval_days": entry["interval_days"],
        "wait_days": entry["wait_days"],
        "organic": entry["organic"],
    }
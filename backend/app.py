from __future__ import annotations

import hashlib
import io
import json
import os

import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, File, HTTPException, Query, UploadFile, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database.connection import engine, Base, get_db
from database import models
from PIL import Image, UnidentifiedImageError
from treatment_routes import router as treatment_router

try:
    from ai_edge_litert.interpreter import Interpreter
except Exception:  # Optional at development time; demo fallback keeps the app runnable.
    Interpreter = None

ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "models" / "crop_disease_model.tflite"


CLASS_NAMES = [
    "Tomato___Bacterial_spot",
    "Tomato___Early_blight",
    "Tomato___Late_blight",
    "Tomato___Leaf_Mold",
    "Tomato___Septoria_leaf_spot",
    "Tomato___Spider_mites Two-spotted_spider_mite",
    "Tomato___Target_Spot",
    "Tomato___Tomato_Yellow_Leaf_Curl_Virus",
    "Tomato___Tomato_mosaic_virus",
    "Tomato___healthy",
    "Potato___Early_blight",
    "Potato___healthy",
    "Pepper,_bell___Bacterial_spot",
    "Pepper,_bell___healthy",
    "Grape___Black_rot",
    "Grape___healthy",
    "Corn_(maize)___Northern_Leaf_Blight",
    "Corn_(maize)___healthy",
]

DISPLAY_NAMES = {
    "Tomato___Bacterial_spot": ("Tomato", "Bacterial Spot"),
    "Tomato___Early_blight": ("Tomato", "Early Blight"),
    "Tomato___Late_blight": ("Tomato", "Late Blight"),
    "Tomato___Leaf_Mold": ("Tomato", "Leaf Mold"),
    "Tomato___Septoria_leaf_spot": ("Tomato", "Septoria Leaf Spot"),
    "Tomato___Spider_mites Two-spotted_spider_mite": ("Tomato", "Spider Mites"),
    "Tomato___Target_Spot": ("Tomato", "Target Spot"),
    "Tomato___Tomato_Yellow_Leaf_Curl_Virus": ("Tomato", "Yellow Leaf Curl Virus"),
    "Tomato___Tomato_mosaic_virus": ("Tomato", "Mosaic Virus"),
    "Tomato___healthy": ("Tomato", "Healthy"),
    "Potato___Early_blight": ("Potato", "Early Blight"),
    "Potato___healthy": ("Potato", "Healthy"),
    "Pepper,_bell___Bacterial_spot": ("Pepper", "Bacterial Spot"),
    "Pepper,_bell___healthy": ("Pepper", "Healthy"),
    "Grape___Black_rot": ("Grape", "Black Rot"),
    "Grape___healthy": ("Grape", "Healthy"),
    "Corn_(maize)___Northern_Leaf_Blight": ("Corn", "Northern Leaf Blight"),
    "Corn_(maize)___healthy": ("Corn", "Healthy"),
}

app = FastAPI(title="AgriNexus API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(treatment_router)



Base.metadata.create_all(bind=engine)

interpreter = None
input_details: list[dict[str, Any]] = []
output_details: list[dict[str, Any]] = []
MODEL_MODE = "demo"


def load_model() -> None:
    global interpreter, input_details, output_details, MODEL_MODE
    if Interpreter is None or not MODEL_PATH.exists():
        return
    try:
        interpreter = Interpreter(model_path=str(MODEL_PATH))
        interpreter.allocate_tensors()
        input_details = interpreter.get_input_details()
        output_details = interpreter.get_output_details()
        MODEL_MODE = "tflite"
    except Exception:
        interpreter = None
        MODEL_MODE = "demo"


load_model()


def preprocess_image(image_bytes: bytes) -> np.ndarray:
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=400, detail="The uploaded file is not a valid image.") from exc
    if img.width < 32 or img.height < 32:
        raise HTTPException(status_code=400, detail="Please upload a clearer image (at least 32×32 pixels).")
    # Same centre-crop + resize as training. The v2 model takes raw 0-255 pixels (no /255).
    side = min(img.size)
    left, top = (img.width - side) // 2, (img.height - side) // 2
    img = img.crop((left, top, left + side, top + side)).resize((224, 224), Image.BILINEAR)
    return np.expand_dims(np.asarray(img, dtype=np.float32), axis=0)


def tflite_predict(image_bytes: bytes) -> tuple[str, float, str]:
    if interpreter is None:
        # Deterministic demo fallback. It is explicitly marked as demo mode in the API response.
        digest = hashlib.sha256(image_bytes).digest()
        idx = digest[0] % len(CLASS_NAMES)
        raw_conf = 0.74 + (digest[1] / 2550.0)
        label = CLASS_NAMES[idx]
        return label, round(min(raw_conf, 0.84) * 100, 2), "demo"

    arr = preprocess_image(image_bytes)
    detail = input_details[0]
    dtype = detail["dtype"]
    if dtype in (np.uint8, np.int8):
        scale, zero = detail.get("quantization", (0.0, 0))
        if scale:
            arr = arr / scale + zero
        arr = np.clip(arr, np.iinfo(dtype).min, np.iinfo(dtype).max).astype(dtype)
    else:
        arr = arr.astype(dtype)
    interpreter.set_tensor(detail["index"], arr)
    interpreter.invoke()
    output = interpreter.get_tensor(output_details[0]["index"])[0]
    output = np.asarray(output, dtype=np.float32)
    if output.size == 0:
        raise HTTPException(status_code=500, detail="The model returned no prediction.")
    # Softmax only when output does not look like probabilities.
    if output.min() < 0 or output.max() > 1.01 or abs(float(output.sum()) - 1.0) > 0.05:
        exp = np.exp(output - np.max(output))
        output = exp / exp.sum()
    idx = int(np.argmax(output))
    return CLASS_NAMES[idx] if idx < len(CLASS_NAMES) else f"class_{idx}", round(float(output[idx]) * 100, 2), "tflite"


def weather_fallback(lat: float, lon: float) -> dict[str, Any]:
    return {"temperature": 28.0, "humidity": 78.0, "rainfall": 2.0, "source": "demo-fallback", "latitude": lat, "longitude": lon}


def get_weather(lat: float, lon: float) -> dict[str, Any]:
    params = urllib.parse.urlencode({
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,rain",
        "timezone": "auto",
    })
    url = f"https://api.open-meteo.com/v1/forecast?{params}"
    try:
        with urllib.request.urlopen(url, timeout=4) as response:
            payload = json.loads(response.read().decode("utf-8"))
        current = payload.get("current", {})
        return {
            "temperature": float(current.get("temperature_2m", 28.0)),
            "humidity": float(current.get("relative_humidity_2m", 78.0)),
            "rainfall": float(current.get("rain", 0.0)),
            "source": "Open-Meteo",
            "latitude": lat,
            "longitude": lon,
        }
    except Exception:
        return weather_fallback(lat, lon)


def risk_engine(disease: str, confidence: float, temperature: float, humidity: float, rainfall: float) -> dict[str, Any]:
    healthy = "healthy" in disease.lower()
    if healthy:
        base = 8.0
    else:
        base = 35.0 + min(confidence * 0.25, 25.0)
    moisture = max(0.0, min((humidity - 55.0) * 0.7, 28.0))
    rain_factor = max(0.0, min(rainfall * 2.0, 12.0))
    temp_factor = 8.0 if 20 <= temperature <= 32 and not healthy else 0.0
    score = round(min(98.0, base + moisture + rain_factor + temp_factor), 1)
    if score >= 70:
        level = "High"
        action = "Inspect affected leaves today, isolate visibly infected plants, improve airflow, and follow locally approved crop-protection guidance."
    elif score >= 40:
        level = "Moderate"
        action = "Monitor the crop closely for the next 24–48 hours, reduce excess leaf wetness, and inspect nearby plants."
    else:
        level = "Low"
        action = "Continue routine monitoring and maintain balanced irrigation, nutrition, and field hygiene."
    if healthy:
        action = "Crop appears healthy in this scan. Continue routine monitoring and rescan if symptoms appear."
    return {"score": score, "level": level, "recommendation": action}


def ensure_crop(pg_db: Session, crop_type: str, location: str, farmer_name: str = "Demo Farmer") -> int:
    crop = pg_db.query(models.Crop).filter(
        models.Crop.crop_type == crop_type,
        models.Crop.location == location
    ).order_by(models.Crop.id).first()
    if crop:
        return crop.id

    new_crop = models.Crop(
        farmer_name=farmer_name,
        crop_type=crop_type,
        location=location
    )
    pg_db.add(new_crop)
    pg_db.commit()
    pg_db.refresh(new_crop)
    return new_crop.id


def label_parts(label: str) -> tuple[str, str]:
    return DISPLAY_NAMES.get(label, (label.split("___")[0].replace("_", " ").title(), label.split("___")[-1].replace("_", " ").title()))


@app.get("/")
def root() -> dict[str, Any]:
    return {"name": "AgriNexus API", "status": "running", "model_mode": MODEL_MODE, "database": "PostgreSQL"}


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "model": MODEL_MODE, "model_file": MODEL_PATH.exists()}


@app.get("/api/weather")
def weather(latitude: float = Query(12.9716), longitude: float = Query(77.5946)) -> dict[str, Any]:
    return get_weather(latitude, longitude)


@app.post("/api/scan")
async def scan(
    file: UploadFile = File(...),
    latitude: float = Query(12.9716),
    longitude: float = Query(77.5946),
    location: str = Query("Bengaluru"),
    farmer_name: str = Query("Demo Farmer"),
    pg_db: Session = Depends(get_db)
) -> dict[str, Any]:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image file.")
    image_bytes = await file.read()
    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image must be smaller than 10 MB.")
    label, confidence, model_source = tflite_predict(image_bytes)
    crop_type, disease = label_parts(label)
    wx = get_weather(latitude, longitude)
    risk = risk_engine(label, confidence, wx["temperature"], wx["humidity"], wx["rainfall"])

    crop_id = ensure_crop(pg_db, crop_type, location, farmer_name)

    new_scan = models.Scan(
        crop_id=crop_id,
        disease=disease,
        crop_type=crop_type,
        confidence=confidence,
        risk_score=risk["score"],
        risk_level=risk["level"],
        recommendation=risk["recommendation"],
        temperature=wx["temperature"],
        humidity=wx["humidity"],
        rainfall=wx["rainfall"],
        latitude=latitude,
        longitude=longitude,
        source=model_source
    )
    pg_db.add(new_scan)
    pg_db.commit()
    pg_db.refresh(new_scan)

    return {
        "scan_id": new_scan.id,
        "crop_id": crop_id,
        "crop": crop_type,
        "disease": disease,
        "disease_class": label,
        "prediction": label,
        "confidence": confidence,
        "model_source": model_source,
        "risk": risk,
        "weather": wx,
        "location": location,
        "created_at": new_scan.created_at,
    }


@app.post("/predict")
async def predict(file: UploadFile = File(...)) -> dict[str, Any]:
    """Backward-compatible endpoint for the original prototype."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image file")
    image_bytes = await file.read()
    label, confidence, model_source = tflite_predict(image_bytes)
    return {"prediction": label, "confidence": confidence, "model_source": model_source}


@app.get("/api/crops")
def crops(pg_db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = pg_db.query(models.Crop).order_by(models.Crop.id.desc()).all()
    return [
        {
            "id": r.id,
            "farmer_name": r.farmer_name,
            "crop_type": r.crop_type,
            "variety": r.variety,
            "location": r.location,
            "planted_on": r.planted_on,
            "created_at": r.created_at
        } for r in rows
    ]


@app.get("/api/passport/{crop_id}")
def passport(crop_id: int, pg_db: Session = Depends(get_db)) -> dict[str, Any]:
    crop = pg_db.query(models.Crop).filter(models.Crop.id == crop_id).first()
    if not crop:
        raise HTTPException(status_code=404, detail="Crop passport not found.")

    scans = pg_db.query(models.Scan).filter(models.Scan.crop_id == crop_id).order_by(models.Scan.id.desc()).all()
    harvest = pg_db.query(models.Harvest).filter(models.Harvest.crop_id == crop_id).order_by(models.Harvest.id.desc()).first()

    def to_dict(obj):
        if not obj: return None
        return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}

    return {
        "crop": to_dict(crop),
        "scans": [to_dict(s) for s in scans],
        "harvest": to_dict(harvest)
    }


@app.get("/api/dashboard")
def dashboard(pg_db: Session = Depends(get_db)) -> dict[str, Any]:
    crop_count = pg_db.query(models.Crop).count()
    scan_count = pg_db.query(models.Scan).count()
    high_risk = pg_db.query(models.Scan).filter(models.Scan.risk_level == 'High').count()
    recent = pg_db.query(models.Scan).order_by(models.Scan.id.desc()).limit(5).all()

    def to_dict(obj):
        return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}

    return {
        "crops": crop_count,
        "scans": scan_count,
        "high_risk": high_risk,
        "recent": [to_dict(r) for r in recent]
    }


@app.post("/api/harvest")
def create_harvest(payload: dict[str, Any], pg_db: Session = Depends(get_db)) -> dict[str, Any]:
    crop_id = int(payload.get("crop_id", 0))
    quantity = float(payload.get("quantity", 0))
    unit = str(payload.get("unit", "kg"))
    grade = str(payload.get("quality_grade", "A"))
    notes = str(payload.get("notes", ""))

    if crop_id <= 0 or quantity <= 0:
        raise HTTPException(status_code=400, detail="Crop and harvest quantity are required.")

    crop = pg_db.query(models.Crop).filter(models.Crop.id == crop_id).first()
    if not crop:
        raise HTTPException(status_code=404, detail="Crop not found.")

    scan_count = pg_db.query(models.Scan).filter(models.Scan.crop_id == crop_id).count()
    if scan_count > 0:
        v_status = "VERIFIED"
        v_reason = "Crop has a verifiable health scan history."
        is_verified = 1
    else:
        v_status = "REJECTED"
        v_reason = "No health scans found for this crop."
        is_verified = 0

    new_harvest = models.Harvest(
        crop_id=crop_id,
        quantity=quantity,
        unit=unit,
        quality_grade=grade,
        notes=notes,
        verified=is_verified,
        verification_status=v_status,
        verification_reason=v_reason
    )
    pg_db.add(new_harvest)
    pg_db.commit()
    pg_db.refresh(new_harvest)

    return {
        "id": new_harvest.id,
        "verified": bool(is_verified),
        "verification_status": v_status,
        "message": v_reason
    }


@app.get("/api/buyers")

def buyers(crop: str = Query("Tomato"), pg_db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    if pg_db.query(models.Buyer).count() == 0:
        demo_buyers = [
            models.Buyer(name="Karnataka Fresh Foods", location="Bengaluru", interest="Fresh produce", min_grade="B"),
            models.Buyer(name="South India Agro Hub", location="Mysuru", interest="Vegetables & bulk supply", min_grade="A"),
            models.Buyer(name="GreenBasket Wholesale", location="Bengaluru", interest="Retail-grade produce", min_grade="A"),
        ]
        pg_db.add_all(demo_buyers)
        pg_db.commit()

    db_buyers = pg_db.query(models.Buyer).all()
    results = []
    for b in db_buyers:
        results.append({
            "id": b.id,
            "name": b.name,
            "location": b.location,
            "interest": b.interest,
            "min_grade": b.min_grade,
            "crop": crop
        })
    return results


@app.get("/api/market/listings")
def get_listings(pg_db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    listings = pg_db.query(models.MarketListing).order_by(models.MarketListing.id.desc()).all()
    def to_dict(obj):
        return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}
    return [to_dict(l) for l in listings]


@app.post("/api/market/listings")
def create_listing(payload: dict[str, Any], pg_db: Session = Depends(get_db)) -> dict[str, Any]:
    harvest_id = int(payload.get("harvest_id", 0))
    if harvest_id <= 0:
        raise HTTPException(status_code=400, detail="harvest_id is required.")

    harvest = pg_db.query(models.Harvest).filter(models.Harvest.id == harvest_id).first()
    if not harvest:
        raise HTTPException(status_code=404, detail="Harvest not found.")

    if harvest.verification_status != "VERIFIED":
        raise HTTPException(status_code=400, detail="Only VERIFIED harvests can be listed on the market.")

    listing = models.MarketListing(
        harvest_id=harvest.id,
        crop_type=harvest.crop.crop_type,
        quantity=harvest.quantity,
        unit=harvest.unit,
        quality_grade=harvest.quality_grade,
        status="AVAILABLE"
    )
    pg_db.add(listing)
    pg_db.commit()
    pg_db.refresh(listing)

    return {"id": listing.id, "message": "Market listing created successfully."}

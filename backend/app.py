from __future__ import annotations

import hashlib
import io
import json
import os
from datetime import datetime, timedelta, timezone

import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

import httpx
from typing import Any, Optional
from pydantic import BaseModel
import numpy as np
from fastapi import FastAPI, File, HTTPException, Query, UploadFile, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database.connection import engine, Base, get_db
from database import models
from PIL import Image, UnidentifiedImageError
from treatment_routes import get_treatment_entry, router as treatment_router

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


SPRAY_WEATHER_THRESHOLDS = {
    "rain_probability_max": 30,
    "wind_speed_max": 15,
    "temperature_max": 35,
    "rain_alert_probability": 50,
}
SPRAY_WEATHER_CACHE_TTL = timedelta(minutes=30)
spray_weather_cache: dict[tuple[float, float], tuple[datetime, dict[str, Any]]] = {}
PASSPORT_GAP_DAYS = 7

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


DISEASE_BASE = {
    "Grape___Black_rot": 65,
    "Tomato___Late_blight": 65,
    "Tomato___Tomato_Yellow_Leaf_Curl_Virus": 60,
    "Tomato___Tomato_mosaic_virus": 55,
}
DEFAULT_DISEASE_BASE = 45
HEALTHY_BASE = 8


def risk_engine(disease: str, confidence: float, temperature: float, humidity: float, rainfall: float) -> dict[str, Any]:
    healthy = "healthy" in disease.lower()
    base = HEALTHY_BASE if healthy else DISEASE_BASE.get(disease, DEFAULT_DISEASE_BASE)
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


def verified_follow_up_interval(recommendation: Any, verified: bool) -> int | None:
    if not verified or not isinstance(recommendation, dict):
        return None
    interval = recommendation.get("follow_up_interval_days")
    if interval is None:
        interval = recommendation.get("interval_days")
    if isinstance(interval, int) and not isinstance(interval, bool) and interval > 0:
        return interval
    return None


@app.get("/")
def root() -> dict[str, Any]:
    return {"name": "AgriNexus API", "status": "running", "model_mode": MODEL_MODE, "database": "PostgreSQL"}


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "model": MODEL_MODE, "model_file": MODEL_PATH.exists()}


@app.get("/api/weather")
def weather(latitude: float = Query(12.9716), longitude: float = Query(77.5946)) -> dict[str, Any]:
    return get_weather(latitude, longitude)


@app.get("/api/spray-advice")
def spray_advice(latitude: float, longitude: float) -> dict[str, Any]:
    cache_key = (round(latitude, 2), round(longitude, 2))
    now = datetime.now(timezone.utc)
    cached = spray_weather_cache.get(cache_key)
    if cached and now - cached[0] < SPRAY_WEATHER_CACHE_TTL:
        return cached[1]

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": "precipitation_probability,precipitation,wind_speed_10m,temperature_2m,relative_humidity_2m",
        "forecast_days": 2,
        "timezone": "auto",
    }
    try:
        response = httpx.get(
            "https://api.open-meteo.com/v1/forecast",
            params=params,
            timeout=8,
        )
        response.raise_for_status()
        hourly = response.json()["hourly"]
        rows = []
        for index, timestamp in enumerate(hourly["time"][:48]):
            rain_pct = float(hourly["precipitation_probability"][index])
            rain_mm = float(hourly["precipitation"][index])
            wind_kmh = float(hourly["wind_speed_10m"][index])
            temp_c = float(hourly["temperature_2m"][index])
            humidity = float(hourly["relative_humidity_2m"][index])
            rows.append({
                "time": timestamp,
                "rain_pct": rain_pct,
                "rain_mm": rain_mm,
                "wind_kmh": wind_kmh,
                "temp_c": temp_c,
                "humidity": humidity,
                "ok": (
                    rain_pct < SPRAY_WEATHER_THRESHOLDS["rain_probability_max"]
                    and rain_mm == 0
                    and wind_kmh < SPRAY_WEATHER_THRESHOLDS["wind_speed_max"]
                    and temp_c < SPRAY_WEATHER_THRESHOLDS["temperature_max"]
                ),
            })
        if not rows:
            raise ValueError("Open-Meteo returned no hourly forecast.")

        best_window = None
        for index in range(len(rows) - 2):
            if all(row["ok"] for row in rows[index:index + 3]):
                best_window = {
                    "start": rows[index]["time"],
                    "end": rows[index + 2]["time"],
                }
                break
        next_rain = next(
            (
                {"time": row["time"], "rain_pct": row["rain_pct"], "rain_mm": row["rain_mm"]}
                for row in rows
                if row["rain_pct"] >= SPRAY_WEATHER_THRESHOLDS["rain_alert_probability"] or row["rain_mm"] > 0
            ),
            None,
        )
        result = {
            "hourly": rows,
            "best_window": best_window,
            "next_rain": next_rain,
            "updated_at": now.isoformat(),
            "stale": False,
        }
        spray_weather_cache[cache_key] = (now, result)
        return result
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError):
        if cached:
            return {**cached[1], "stale": True}
        return {"error": "Spray weather forecast is unavailable.", "updated_at": now.isoformat()}


@app.post("/api/scan")
async def scan(
    file: UploadFile = File(...),
    latitude: float = Query(12.9716),
    longitude: float = Query(77.5946),
    location: str = Query("Bengaluru"),
    farmer_name: str = Query("Demo Farmer"),
    crop_id: int | None = Query(None, gt=0),
    treatment_course_id: int | None = Query(None, gt=0),
    new_passport: bool = Query(False),
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

    treatment_course = None
    if treatment_course_id is not None:
        treatment_course = pg_db.query(models.TreatmentCourse).filter(
            models.TreatmentCourse.id == treatment_course_id
        ).first()
        if not treatment_course:
            raise HTTPException(status_code=404, detail="Treatment course not found.")
        if crop_id is not None and crop_id != treatment_course.crop_id:
            raise HTTPException(status_code=400, detail="Treatment course does not belong to this Passport.")
        crop_id = treatment_course.crop_id

    if crop_id is not None:
        requested_crop = pg_db.query(models.Crop).filter(models.Crop.id == crop_id).first()
        if not requested_crop:
            raise HTTPException(status_code=404, detail="Crop passport not found.")
        if requested_crop.crop_type.casefold() != crop_type.casefold():
            raise HTTPException(status_code=400, detail="Uploaded crop does not match the selected Passport.")

    crop = None
    if not new_passport:
        matching_crops = pg_db.query(models.Crop).filter(
            models.Crop.crop_type == crop_type,
            models.Crop.location == location,
        ).all()
        now = datetime.now(timezone.utc)
        eligible_passports = []
        for candidate in matching_crops:
            last_scan = pg_db.query(models.Scan).filter(
                models.Scan.crop_id == candidate.id
            ).order_by(models.Scan.created_at.desc(), models.Scan.id.desc()).first()
            if not last_scan or not last_scan.created_at:
                continue

            last_scan_at = last_scan.created_at
            if last_scan_at.tzinfo is None:
                last_scan_at = last_scan_at.replace(tzinfo=timezone.utc)
            scan_age = now - last_scan_at
            if scan_age < timedelta(0) or scan_age > timedelta(days=PASSPORT_GAP_DAYS):
                continue

            harvest = pg_db.query(models.Harvest).filter(
                models.Harvest.crop_id == candidate.id
            ).order_by(models.Harvest.id.desc()).first()
            harvest_verified = bool(
                harvest and (
                    harvest.verified
                    or (harvest.verification_status or "").upper() == "VERIFIED"
                )
            )
            if not harvest_verified:
                eligible_passports.append((last_scan_at, candidate))

        if eligible_passports:
            crop = max(eligible_passports, key=lambda item: item[0])[1]

    if crop is None:
        crop = models.Crop(
            farmer_name=farmer_name,
            crop_type=crop_type,
            location=location,
        )
        pg_db.add(crop)
        pg_db.flush()
    crop_id = crop.id

    if treatment_course is not None and treatment_course.crop_id != crop_id:
        treatment_course = None

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
    pg_db.flush()

    if treatment_course is not None:
        treatment_course.status = (
            "healthy"
            if label.rsplit("___", 1)[-1].casefold() == "healthy"
            else "disease_detected"
        )
        pg_db.add(models.TreatmentCourseScan(
            scan_id=new_scan.id,
            treatment_course_id=treatment_course.id,
            role="follow_up",
        ))
    elif label.rsplit("___", 1)[-1].casefold() != "healthy":
        recommendation_entry = get_treatment_entry(label)
        recommendation_verified = bool(
            recommendation_entry and recommendation_entry.get("verified") is True
        )
        follow_up_interval = verified_follow_up_interval(
            recommendation_entry,
            recommendation_verified,
        )
        treatment_course = models.TreatmentCourse(
            crop_id=crop_id,
            disease_class=label,
            status="under_treatment",
            recommendation_snapshot=(
                json.dumps(recommendation_entry, ensure_ascii=False)
                if recommendation_entry is not None else None
            ),
            recommendation_verified=recommendation_verified,
            follow_up_interval_days=follow_up_interval,
        )
        pg_db.add(treatment_course)
        pg_db.flush()
        pg_db.add(models.TreatmentCourseScan(
            scan_id=new_scan.id,
            treatment_course_id=treatment_course.id,
            role="initial",
        ))

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
        "treatment_course": (
            treatment_course_payload(pg_db, treatment_course)
            if treatment_course is not None else None
        ),
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

    scans = pg_db.query(models.Scan).filter(
        models.Scan.crop_id == crop_id
    ).order_by(models.Scan.created_at.asc(), models.Scan.id.asc()).all()
    harvest = pg_db.query(models.Harvest).filter(models.Harvest.crop_id == crop_id).order_by(models.Harvest.id.desc()).first()
    treatment_courses = pg_db.query(models.TreatmentCourse).filter(
        models.TreatmentCourse.crop_id == crop_id
    ).order_by(models.TreatmentCourse.id.desc()).all()

    def to_dict(obj):
        if not obj: return None
        return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}

    timeline = []
    timeline.append({
        "event_type": "crop_created",
        "timestamp": crop.created_at,
        "details": f"Passport created for {crop.crop_type}"
    })

    for s in scans:
        timeline.append({
            "event_type": "scan_recorded",
            "timestamp": s.created_at,
            "details": f"Scan recorded: {s.disease}"
        })

    if harvest:
        timeline.append({
            "event_type": "harvest_recorded",
            "timestamp": harvest.created_at,
            "details": f"Harvest recorded: {harvest.quantity} {harvest.unit}"
        })
        timeline.append({
            "event_type": "harvest_verification",
            "timestamp": harvest.created_at,
            "details": f"Harvest verification updated: {harvest.verification_status}"
        })

    for course in treatment_courses:
        timeline.append({
            "event_type": "treatment_started",
            "timestamp": course.created_at,
            "details": f"Treatment course started for {course.disease_class}"
        })
        applications = pg_db.query(models.TreatmentApplication).filter(
            models.TreatmentApplication.treatment_course_id == course.id
        ).order_by(models.TreatmentApplication.applied_at.asc()).all()
        for application in applications:
            timeline.append({
                "event_type": "treatment_application",
                "timestamp": application.applied_at,
                "details": "Treatment application recorded"
            })

    # Sort timeline by timestamp ascending, empty last
    timeline.sort(key=lambda x: (not x["timestamp"], str(x["timestamp"] or "")))

    return {
        "crop": to_dict(crop),
        "scans": [to_dict(s) for s in scans],
        "harvest": to_dict(harvest),
        "treatment_courses": [
            treatment_course_payload(pg_db, course)
            for course in treatment_courses
        ],
        "timeline": timeline
    }


def treatment_course_payload(pg_db: Session, course: models.TreatmentCourse) -> dict[str, Any]:
    recommendation = (
        json.loads(course.recommendation_snapshot)
        if course.recommendation_snapshot else None
    )
    applications = pg_db.query(models.TreatmentApplication).filter(
        models.TreatmentApplication.treatment_course_id == course.id
    ).order_by(models.TreatmentApplication.applied_at.asc()).all()
    linked_scans = pg_db.query(
        models.TreatmentCourseScan,
        models.Scan,
    ).join(
        models.Scan,
        models.Scan.id == models.TreatmentCourseScan.scan_id,
    ).filter(
        models.TreatmentCourseScan.treatment_course_id == course.id
    ).order_by(models.Scan.created_at.asc(), models.Scan.id.asc()).all()
    latest_course_scan = linked_scans[-1][1] if linked_scans else None
    follow_up_interval = course.follow_up_interval_days
    if follow_up_interval is None:
        follow_up_interval = verified_follow_up_interval(
            recommendation,
            course.recommendation_verified,
        )
    next_follow_up_at = None
    follow_up_due = False
    follow_up_required = bool(
        course.status != "healthy"
        and latest_course_scan is not None
    )
    if (
        follow_up_required
        and course.recommendation_verified
        and isinstance(follow_up_interval, int)
        and follow_up_interval > 0
    ):
        scan_time = latest_course_scan.created_at
        if scan_time.tzinfo is None:
            scan_time = scan_time.replace(tzinfo=timezone.utc)
        next_follow_up_at = scan_time + timedelta(days=follow_up_interval)
        follow_up_due = course.status != "healthy" and next_follow_up_at <= datetime.now(timezone.utc)

    total_applications = None
    if recommendation:
        configured_total = recommendation.get("sprays")
        if isinstance(configured_total, int) and not isinstance(configured_total, bool) and configured_total > 0:
            total_applications = configured_total

    return {
        "id": course.id,
        "crop_id": course.crop_id,
        "disease_class": course.disease_class,
        "status": course.status,
        "recommendation_verified": course.recommendation_verified,
        "recommendation": recommendation,
        "follow_up_interval_days": follow_up_interval,
        "next_follow_up_at": next_follow_up_at,
        "follow_up_required": follow_up_required,
        "follow_up_due": follow_up_due,
        "total_applications": total_applications,
        "completed_applications": len(applications),
        "applications_complete": (
            total_applications is not None
            and len(applications) >= total_applications
        ),
        "applications": [
            {
                "id": application.id,
                "applied_at": application.applied_at,
            }
            for application in applications
        ],
        "scans": [
            {
                "role": link.role,
                "scan": {
                    column.name: getattr(scan, column.name)
                    for column in scan.__table__.columns
                },
            }
            for link, scan in linked_scans
        ],
        "created_at": course.created_at,
    }


@app.post("/api/treatment-courses/{course_id}/applications")
def record_treatment_application(course_id: int, pg_db: Session = Depends(get_db)) -> dict[str, Any]:
    course = pg_db.query(models.TreatmentCourse).filter(
        models.TreatmentCourse.id == course_id
    ).with_for_update().first()
    if not course:
        raise HTTPException(status_code=404, detail="Treatment course not found.")

    current_progress = pg_db.query(models.TreatmentApplication).filter(
        models.TreatmentApplication.treatment_course_id == course.id
    ).count()
    recommendation = (
        json.loads(course.recommendation_snapshot)
        if course.recommendation_snapshot else None
    )
    total = recommendation.get("sprays") if recommendation else None
    if not isinstance(total, int) or isinstance(total, bool) or total <= 0:
        raise HTTPException(status_code=409, detail="The treatment application limit is unavailable.")
    if current_progress >= total:
        raise HTTPException(status_code=409, detail="All required applications are already recorded.")

    application = models.TreatmentApplication(treatment_course_id=course.id)
    pg_db.add(application)
    pg_db.commit()
    pg_db.refresh(application)
    return treatment_course_payload(pg_db, course)


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

    ask_price = float(payload.get("ask_price_per_kg", 0.0))
    # Parse dates if they exist, otherwise leave as None
    ready_from_str = payload.get("ready_from")
    ready_to_str = payload.get("ready_to")

    from datetime import datetime
    def parse_iso(dt_str):
        if not dt_str: return None
        try:
            return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        except ValueError:
            return None

    ready_from = parse_iso(ready_from_str)
    ready_to = parse_iso(ready_to_str)

    listing = models.MarketListing(
        harvest_id=harvest.id,
        crop_type=harvest.crop.crop_type,
        quantity=harvest.quantity,
        unit=harvest.unit,
        quality_grade=harvest.quality_grade,
        ask_price_per_kg=ask_price,
        quantity_remaining=harvest.quantity,
        ready_from=ready_from,
        ready_to=ready_to,
        status="AVAILABLE"
    )
    pg_db.add(listing)
    pg_db.commit()
    pg_db.refresh(listing)

    return {"id": listing.id, "message": "Market listing created successfully."}

@app.post("/api/buyers/requests")
def create_buyer_request(payload: dict[str, Any], pg_db: Session = Depends(get_db)) -> dict[str, Any]:
    buyer_id = int(payload.get("buyer_id", 0))
    if buyer_id <= 0:
        raise HTTPException(status_code=400, detail="buyer_id is required.")

    buyer = pg_db.query(models.Buyer).filter(models.Buyer.id == buyer_id).first()
    if not buyer:
        raise HTTPException(status_code=404, detail="Buyer not found.")

    crop_type = payload.get("crop_type")
    quantity = float(payload.get("quantity", 0))
    if not crop_type or quantity <= 0:
        raise HTTPException(status_code=400, detail="crop_type and positive quantity are required.")

    price_min = payload.get("price_min")
    price_max = payload.get("price_max")
    if price_min is not None and float(price_min) < 0:
        raise HTTPException(status_code=400, detail="price_min must be >= 0.")
    if price_max is not None and float(price_max) < 0:
        raise HTTPException(status_code=400, detail="price_max must be >= 0.")
    if price_min is not None and price_max is not None and float(price_min) > float(price_max):
        raise HTTPException(status_code=400, detail="price_min cannot be greater than price_max.")

    from datetime import datetime
    def parse_iso(dt_str):
        if not dt_str: return None
        try:
            return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid ISO format for date: {dt_str}")

    new_req = models.BuyerRequest(
        buyer_id=buyer.id,
        crop_type=crop_type,
        quantity=quantity,
        unit=payload.get("unit", "kg"),
        min_grade=payload.get("min_grade", "A"),
        location=payload.get("location", ""),
        window_start=parse_iso(payload.get("window_start")),
        window_end=parse_iso(payload.get("window_end")),
        price_min=float(price_min) if price_min is not None else None,
        price_max=float(price_max) if price_max is not None else None,
        status="OPEN",
        expires_at=parse_iso(payload.get("expires_at"))
    )
    pg_db.add(new_req)
    pg_db.commit()
    pg_db.refresh(new_req)
    return {"id": new_req.id, "message": "Buyer request created successfully."}

@app.get("/api/buyers/requests")
def get_buyer_requests(status: str = Query("OPEN"), pg_db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    requests = pg_db.query(models.BuyerRequest).filter(models.BuyerRequest.status == status).order_by(models.BuyerRequest.id.desc()).all()
    def to_dict(obj):
        return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}
    return [to_dict(r) for r in requests]

@app.get("/api/buyers/requests/{request_id}/match")
def match_buyer_request(request_id: int, pg_db: Session = Depends(get_db)):
    req = pg_db.query(models.BuyerRequest).filter(models.BuyerRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Buyer request not found.")

    from sqlalchemy import func
    # Case-insensitive crop type matching
    listings = pg_db.query(models.MarketListing).filter(
        func.lower(models.MarketListing.crop_type) == req.crop_type.lower()
    ).all()

    grade_map = {"A": 3, "B": 2, "C": 1}
    req_grade_val = grade_map.get(req.min_grade.upper())

    # If buyer requested an invalid grade, the match fails safely.
    if req_grade_val is None:
        raise HTTPException(status_code=400, detail=f"Invalid buyer request grade: {req.min_grade}")

    eligible = []
    excluded = []

    for l in listings:
        if l.status != "AVAILABLE" or l.quantity_remaining <= 0:
            continue

        harvest = l.harvest

        if not harvest or harvest.verification_status != "VERIFIED":
            farmer = harvest.crop.farmer_name if harvest and harvest.crop else "Unknown"
            excluded.append({"listing_id": l.id, "farmer_name": farmer, "available_quantity": l.quantity_remaining, "reason": "Excluded: Harvest is not VERIFIED."})
            continue

        farmer_name = harvest.crop.farmer_name or "Unknown"

        l_grade_val = grade_map.get(l.quality_grade.upper())
        if l_grade_val is None:
            excluded.append({"listing_id": l.id, "farmer_name": farmer_name, "available_quantity": l.quantity_remaining, "reason": f"Excluded: Unrecognized crop quality grade '{l.quality_grade}'."})
            continue

        if l_grade_val < req_grade_val:
            excluded.append({"listing_id": l.id, "farmer_name": farmer_name, "available_quantity": l.quantity_remaining, "reason": f"Excluded: Grade '{l.quality_grade}' does not meet minimum '{req.min_grade}'."})
            continue

        if req.price_max is not None and l.ask_price_per_kg > req.price_max:
            excluded.append({"listing_id": l.id, "farmer_name": farmer_name, "available_quantity": l.quantity_remaining, "reason": f"Excluded: Asking price {l.ask_price_per_kg} exceeds maximum {req.price_max}."})
            continue

        # Invalid window check
        if l.ready_from and l.ready_to and l.ready_from > l.ready_to:
            excluded.append({"listing_id": l.id, "farmer_name": farmer_name, "available_quantity": l.quantity_remaining, "reason": "Excluded: Invalid availability window (ready_from is after ready_to)."})
            continue

        # Date availability check
        has_req_window = req.window_start or req.window_end
        if has_req_window:
            if not l.ready_from or not l.ready_to:
                excluded.append({"listing_id": l.id, "farmer_name": farmer_name, "available_quantity": l.quantity_remaining, "reason": "Excluded: Buyer requires a delivery window, but listing provides none."})
                continue
            # Must overlap: Listing start <= Req end AND Listing end >= Req start
            r_start = req.window_start or datetime.min.replace(tzinfo=timezone.utc)
            r_end = req.window_end or datetime.max.replace(tzinfo=timezone.utc)
            if l.ready_from > r_end or l.ready_to < r_start:
                excluded.append({"listing_id": l.id, "farmer_name": farmer_name, "available_quantity": l.quantity_remaining, "reason": f"Excluded: Listing window ({l.ready_from.date()} to {l.ready_to.date()}) does not overlap buyer window."})
                continue

        if req.location and harvest.crop.location and req.location.lower() not in harvest.crop.location.lower():
            excluded.append({"listing_id": l.id, "farmer_name": farmer_name, "available_quantity": l.quantity_remaining, "reason": "Excluded: Location mismatch."})
            continue

        eligible.append(l)

    max_date = datetime.max.replace(tzinfo=timezone.utc)
    # Sort: Price ASC, Quantity DESC, Grade DESC, Date Readiness ASC
    eligible.sort(key=lambda x: (x.ask_price_per_kg, -x.quantity_remaining, -grade_map.get(x.quality_grade.upper(), 1), x.ready_from or max_date))

    allocations = []
    remaining_qty = req.quantity

    for l in eligible:
        if remaining_qty <= 0: break
        allocate_qty = min(l.quantity_remaining, remaining_qty)
        remaining_qty -= allocate_qty

        reasons = [
            f"₹{l.ask_price_per_kg}/kg is within maximum budget",
            f"Grade {l.quality_grade} meets minimum '{req.min_grade}'",
            f"Provides {allocate_qty} kg out of {l.quantity_remaining} kg available",
            "Delivery window aligns" if (req.window_start or req.window_end) else "Immediate availability"
        ]

        allocations.append({
            "listing_id": l.id,
            "farmer_name": l.harvest.crop.farmer_name,
            "allocated_quantity": allocate_qty,
            "price_per_kg": l.ask_price_per_kg,
            "quality_grade": l.quality_grade,
            "location": l.harvest.crop.location,
            "reasons": reasons
        })

    matched_qty = req.quantity - remaining_qty
    return {
        "request_id": req.id,
        "crop_type": req.crop_type,
        "requested_quantity": req.quantity,
        "matched_quantity": matched_qty,
        "remaining_quantity": remaining_qty,
        "coverage_percentage": round((matched_qty / req.quantity) * 100, 1) if req.quantity > 0 else 0.0,
        "allocations": allocations,
        "excluded": excluded
    }


class OfferCreatePayload(BaseModel):
    buyer_request_id: int
    listing_id: int
    quantity: float
    price_per_kg: float
    parent_offer_id: Optional[int] = None

class OfferStatusUpdate(BaseModel):
    status: str

@app.post("/api/offers")
def create_offer(payload: OfferCreatePayload, pg_db: Session = Depends(get_db)):
    req = pg_db.query(models.BuyerRequest).filter(models.BuyerRequest.id == payload.buyer_request_id).first()
    if not req:
        raise HTTPException(status_code=400, detail="BuyerRequest not found")

    if req.status == "FULFILLED":
        raise HTTPException(status_code=400, detail="Buyer request is already FULFILLED")

    listing = pg_db.query(models.MarketListing).filter(models.MarketListing.id == payload.listing_id).first()
    if not listing:
        raise HTTPException(status_code=400, detail="MarketListing not found")

    if listing.status != "AVAILABLE":
        raise HTTPException(status_code=400, detail="Listing is not AVAILABLE")

    harvest = listing.harvest
    if not harvest or harvest.verification_status != "VERIFIED":
        raise HTTPException(status_code=400, detail="Linked harvest is not VERIFIED")

    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be > 0")

    from sqlalchemy.sql import func
    fulfilled_qty_val = pg_db.query(func.sum(models.Deal.quantity)).filter(
        models.Deal.buyer_request_id == req.id,
        models.Deal.status != "CANCELLED"
    ).scalar() or 0.0

    if payload.quantity > (req.quantity - fulfilled_qty_val):
        raise HTTPException(status_code=400, detail="Quantity exceeds remaining buyer request capacity")

    if payload.quantity > listing.quantity_remaining:
        raise HTTPException(status_code=400, detail="Quantity exceeds quantity_remaining")

    if payload.price_per_kg < 0:
        raise HTTPException(status_code=400, detail="Price cannot be negative")

    counter_count = 0

    if payload.parent_offer_id:
        parent = pg_db.query(models.Offer).filter(models.Offer.id == payload.parent_offer_id).first()
        if not parent:
            raise HTTPException(status_code=400, detail="Parent offer not found")
        if parent.buyer_request_id != payload.buyer_request_id or parent.listing_id != payload.listing_id:
            raise HTTPException(status_code=400, detail="Parent offer must belong to the same request and listing")
        if parent.status != "PENDING":
            raise HTTPException(status_code=400, detail="Parent offer must be PENDING")
        if parent.counter_count >= 1:
            raise HTTPException(status_code=400, detail="Only one counter round is allowed")

        counter_count = parent.counter_count + 1
        parent.status = "COUNTERED"
    else:
        if req.price_max is not None and payload.price_per_kg > req.price_max:
            raise HTTPException(status_code=400, detail="Price exceeds buyer maximum")

    new_offer = models.Offer(
        buyer_request_id=payload.buyer_request_id,
        listing_id=payload.listing_id,
        quantity=payload.quantity,
        price_per_kg=payload.price_per_kg,
        status="PENDING",
        parent_offer_id=payload.parent_offer_id,
        counter_count=counter_count
    )
    pg_db.add(new_offer)
    pg_db.commit()
    pg_db.refresh(new_offer)

    return {"id": new_offer.id, "status": new_offer.status}

@app.get("/api/offers")
def get_offers(buyer_request_id: Optional[int] = None, listing_id: Optional[int] = None, pg_db: Session = Depends(get_db)):
    query = pg_db.query(models.Offer)
    if buyer_request_id is not None:
        query = query.filter(models.Offer.buyer_request_id == buyer_request_id)
    if listing_id is not None:
        query = query.filter(models.Offer.listing_id == listing_id)

    offers = query.order_by(models.Offer.id.desc()).all()
    def to_dict(obj):
        return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}
    return [to_dict(o) for o in offers]

@app.patch("/api/offers/{offer_id}/status")
def update_offer_status(offer_id: int, payload: OfferStatusUpdate, pg_db: Session = Depends(get_db)):
    offer = pg_db.query(models.Offer).filter(models.Offer.id == offer_id).first()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    if offer.status != "PENDING":
        raise HTTPException(status_code=400, detail="Only PENDING offers can be updated")

    if payload.status not in ["ACCEPTED", "REJECTED"]:
        raise HTTPException(status_code=400, detail="Invalid status transition")

    if payload.status == "ACCEPTED":
        # Lock the buyer_request row
        req = pg_db.query(models.BuyerRequest).with_for_update().filter(models.BuyerRequest.id == offer.buyer_request_id).first()
        if not req:
            pg_db.rollback()
            raise HTTPException(status_code=404, detail="Buyer request not found")

        from sqlalchemy.sql import func
        fulfilled_qty_val = pg_db.query(func.sum(models.Deal.quantity)).filter(
            models.Deal.buyer_request_id == req.id,
            models.Deal.status != "CANCELLED"
        ).scalar() or 0.0

        if offer.quantity > (req.quantity - fulfilled_qty_val):
            pg_db.rollback()
            raise HTTPException(status_code=400, detail="Acceptance would exceed remaining buyer request capacity")

        # Lock the market_listing row
        listing = pg_db.query(models.MarketListing).with_for_update().filter(models.MarketListing.id == offer.listing_id).first()

        if not listing:
            pg_db.rollback()
            raise HTTPException(status_code=404, detail="Listing not found")

        if listing.status != "AVAILABLE":
            pg_db.rollback()
            raise HTTPException(status_code=400, detail="Listing is no longer AVAILABLE")

        harvest = listing.harvest
        if not harvest or harvest.verification_status != "VERIFIED":
            pg_db.rollback()
            raise HTTPException(status_code=400, detail="Linked harvest is not VERIFIED")

        if offer.quantity <= 0:
            pg_db.rollback()
            raise HTTPException(status_code=400, detail="Offer quantity must be > 0")

        if offer.quantity > listing.quantity_remaining:
            pg_db.rollback()
            raise HTTPException(status_code=400, detail="Offer quantity exceeds listing remaining quantity")

        existing_deal = pg_db.query(models.Deal).filter(models.Deal.offer_id == offer_id).first()
        if existing_deal:
            pg_db.rollback()
            raise HTTPException(status_code=400, detail="Deal already exists for this offer")

        listing.quantity_remaining -= offer.quantity
        if listing.quantity_remaining <= 0:
            listing.status = "SOLD_OUT"

        deal = models.Deal(
            offer_id=offer.id,
            buyer_request_id=offer.buyer_request_id,
            listing_id=offer.listing_id,
            quantity=offer.quantity,
            price_per_kg=offer.price_per_kg,
            status="CONFIRMED"
        )
        pg_db.add(deal)

        new_fulfilled = fulfilled_qty_val + offer.quantity
        if new_fulfilled >= req.quantity:
            req.status = "FULFILLED"

    offer.status = payload.status
    pg_db.commit()
    return {"id": offer.id, "status": offer.status}

class DealStatusUpdate(BaseModel):
    status: str

@app.get("/api/deals")
def get_deals(pg_db: Session = Depends(get_db)):
    deals = pg_db.query(models.Deal).order_by(models.Deal.id.desc()).all()
    def to_dict(obj):
        return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}
    return [to_dict(d) for d in deals]

@app.get("/api/deals/{deal_id}")
def get_deal(deal_id: int, pg_db: Session = Depends(get_db)):
    deal = pg_db.query(models.Deal).filter(models.Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    buyer = deal.buyer_request.buyer
    listing = deal.listing
    crop = listing.harvest.crop
    request = deal.buyer_request

    result = {c.name: getattr(deal, c.name) for c in deal.__table__.columns}

    result["buyer"] = {
        "id": buyer.id,
        "name": buyer.name,
        "location": buyer.location
    }

    result["farmer"] = {
        "name": crop.farmer_name,
        "location": crop.location
    }

    result["crop"] = {
        "id": crop.id,
        "crop_type": crop.crop_type,
        "variety": crop.variety,
        "quality_grade": listing.quality_grade
    }

    result["timeline"] = {
        "buyer_window_start": request.window_start.isoformat() if request.window_start else None,
        "buyer_window_end": request.window_end.isoformat() if request.window_end else None,
        "ready_from": listing.ready_from.isoformat() if listing.ready_from else None,
        "ready_to": listing.ready_to.isoformat() if listing.ready_to else None
    }

    return result

@app.patch("/api/deals/{deal_id}/status")
def update_deal_status(deal_id: int, payload: DealStatusUpdate, pg_db: Session = Depends(get_db)):
    deal = pg_db.query(models.Deal).filter(models.Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    valid_transitions = {
        "CONFIRMED": ["READY_FOR_PICKUP", "CANCELLED"],
        "READY_FOR_PICKUP": ["PICKED_UP", "CANCELLED"],
        "PICKED_UP": ["DELIVERED"],
        "DELIVERED": ["COMPLETED"]
    }

    allowed = valid_transitions.get(deal.status, [])
    if payload.status not in allowed:
        raise HTTPException(status_code=400, detail="Invalid status transition")

    if payload.status == "CANCELLED":
        listing = pg_db.query(models.MarketListing).with_for_update().filter(models.MarketListing.id == deal.listing_id).first()
        req = pg_db.query(models.BuyerRequest).with_for_update().filter(models.BuyerRequest.id == deal.buyer_request_id).first()

        if listing:
            listing.quantity_remaining += deal.quantity
            if listing.status == "SOLD_OUT":
                listing.status = "AVAILABLE"

        deal.status = "CANCELLED"
        pg_db.flush()

        if req:
            from sqlalchemy.sql import func
            fulfilled_qty_val = pg_db.query(func.sum(models.Deal.quantity)).filter(
                models.Deal.buyer_request_id == req.id,
                models.Deal.status != "CANCELLED"
            ).scalar() or 0.0

            if fulfilled_qty_val < req.quantity:
                req.status = "OPEN"
    else:
        deal.status = payload.status

    pg_db.commit()
    return {"id": deal.id, "status": deal.status}

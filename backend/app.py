from __future__ import annotations

import hashlib
import io
import json
import os
import sqlite3
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError

try:
    from ai_edge_litert.interpreter import Interpreter
except Exception:  # Optional at development time; demo fallback keeps the app runnable.
    Interpreter = None

ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "models" / "crop_disease_model.tflite"
DB_PATH = ROOT / "data" / "agrinexus.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

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


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS crops (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                farmer_name TEXT NOT NULL,
                crop_type TEXT NOT NULL,
                variety TEXT DEFAULT '',
                location TEXT DEFAULT '',
                planted_on TEXT DEFAULT '',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS scans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                crop_id INTEGER NOT NULL,
                disease TEXT NOT NULL,
                crop_type TEXT NOT NULL,
                confidence REAL NOT NULL,
                risk_score REAL NOT NULL,
                risk_level TEXT NOT NULL,
                recommendation TEXT NOT NULL,
                temperature REAL,
                humidity REAL,
                rainfall REAL,
                latitude REAL,
                longitude REAL,
                source TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(crop_id) REFERENCES crops(id)
            );
            CREATE TABLE IF NOT EXISTS harvests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                crop_id INTEGER NOT NULL,
                quantity REAL NOT NULL,
                unit TEXT NOT NULL,
                quality_grade TEXT NOT NULL,
                verified INTEGER NOT NULL DEFAULT 0,
                notes TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY(crop_id) REFERENCES crops(id)
            );
            """
        )


init_db()

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


def ensure_crop(crop_type: str, location: str, farmer_name: str = "Demo Farmer") -> int:
    with db() as conn:
        row = conn.execute("SELECT id FROM crops WHERE crop_type=? AND location=? ORDER BY id LIMIT 1", (crop_type, location)).fetchone()
        if row:
            return int(row["id"])
        cur = conn.execute(
            "INSERT INTO crops (farmer_name,crop_type,location,created_at) VALUES (?,?,?,?)",
            (farmer_name, crop_type, location, datetime.now(timezone.utc).isoformat()),
        )
        return int(cur.lastrowid)


def label_parts(label: str) -> tuple[str, str]:
    return DISPLAY_NAMES.get(label, (label.split("___")[0].replace("_", " ").title(), label.split("___")[-1].replace("_", " ").title()))


@app.get("/")
def root() -> dict[str, Any]:
    return {"name": "AgriNexus API", "status": "running", "model_mode": MODEL_MODE, "database": str(DB_PATH.name)}


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
    crop_id = ensure_crop(crop_type, location, farmer_name)
    now = datetime.now(timezone.utc).isoformat()
    with db() as conn:
        cur = conn.execute(
            """INSERT INTO scans
            (crop_id,disease,crop_type,confidence,risk_score,risk_level,recommendation,temperature,humidity,rainfall,latitude,longitude,source,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (crop_id, disease, crop_type, confidence, risk["score"], risk["level"], risk["recommendation"], wx["temperature"], wx["humidity"], wx["rainfall"], latitude, longitude, model_source, now),
        )
        scan_id = int(cur.lastrowid)
    return {
        "scan_id": scan_id,
        "crop_id": crop_id,
        "crop": crop_type,
        "disease": disease,
        "prediction": label,
        "confidence": confidence,
        "model_source": model_source,
        "risk": risk,
        "weather": wx,
        "location": location,
        "created_at": now,
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
def crops() -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute("SELECT * FROM crops ORDER BY id DESC").fetchall()
    return [dict(r) for r in rows]


@app.get("/api/passport/{crop_id}")
def passport(crop_id: int) -> dict[str, Any]:
    with db() as conn:
        crop = conn.execute("SELECT * FROM crops WHERE id=?", (crop_id,)).fetchone()
        scans = conn.execute("SELECT * FROM scans WHERE crop_id=? ORDER BY id DESC", (crop_id,)).fetchall()
        harvest = conn.execute("SELECT * FROM harvests WHERE crop_id=? ORDER BY id DESC LIMIT 1", (crop_id,)).fetchone()
    if not crop:
        raise HTTPException(status_code=404, detail="Crop passport not found.")
    return {"crop": dict(crop), "scans": [dict(r) for r in scans], "harvest": dict(harvest) if harvest else None}


@app.get("/api/dashboard")
def dashboard() -> dict[str, Any]:
    with db() as conn:
        crop_count = conn.execute("SELECT COUNT(*) AS c FROM crops").fetchone()["c"]
        scan_count = conn.execute("SELECT COUNT(*) AS c FROM scans").fetchone()["c"]
        high_risk = conn.execute("SELECT COUNT(*) AS c FROM scans WHERE risk_level='High'").fetchone()["c"]
        recent = conn.execute("SELECT * FROM scans ORDER BY id DESC LIMIT 5").fetchall()
    return {"crops": crop_count, "scans": scan_count, "high_risk": high_risk, "recent": [dict(r) for r in recent]}


@app.post("/api/harvest")
def create_harvest(payload: dict[str, Any]) -> dict[str, Any]:
    crop_id = int(payload.get("crop_id", 0))
    quantity = float(payload.get("quantity", 0))
    unit = str(payload.get("unit", "kg"))
    grade = str(payload.get("quality_grade", "A"))
    notes = str(payload.get("notes", ""))
    if crop_id <= 0 or quantity <= 0:
        raise HTTPException(status_code=400, detail="Crop and harvest quantity are required.")
    with db() as conn:
        if not conn.execute("SELECT 1 FROM crops WHERE id=?", (crop_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Crop not found.")
        cur = conn.execute(
            "INSERT INTO harvests (crop_id,quantity,unit,quality_grade,verified,notes,created_at) VALUES (?,?,?,?,?,?,?)",
            (crop_id, quantity, unit, grade, 1, notes, datetime.now(timezone.utc).isoformat()),
        )
        hid = int(cur.lastrowid)
    return {"id": hid, "verified": True, "message": "Harvest recorded and marked demo-verified."}


@app.get("/api/buyers")
def buyers(crop: str = Query("Tomato")) -> list[dict[str, Any]]:
    base = [
        {"name": "Karnataka Fresh Foods", "location": "Bengaluru", "interest": "Fresh produce", "min_grade": "B"},
        {"name": "South India Agro Hub", "location": "Mysuru", "interest": "Vegetables & bulk supply", "min_grade": "A"},
        {"name": "GreenBasket Wholesale", "location": "Bengaluru", "interest": "Retail-grade produce", "min_grade": "A"},
    ]
    for item in base:
        item["crop"] = crop
    return base
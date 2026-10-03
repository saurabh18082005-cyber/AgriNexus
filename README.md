# AgriNexus 🌱

**From First Symptom to Final Sale — AI Connecting Crop Health to Market Access**

AgriNexus is a hackathon MVP that connects crop-leaf disease detection, weather-aware disease risk, a digital Crop Health Passport, harvest verification, and a simple buyer handoff.

## Architecture

```text
React + Vite
    │
    ▼
FastAPI
 ┌──┼───────────────┐
 ▼  ▼               ▼
TFLite  Open-Meteo  SQLite
 │      │           │
 └──────┴────┬──────┘
              ▼
       Risk + Passport
              │
              ▼
         Buyer Handoff
```

## Existing ML model

The repository ships the existing `backend/models/crop_disease_model.tflite` from the supplied prototype. It covers the 10 classes mapped in `backend/app.py` (potato, tomato, pepper, grape and corn healthy/disease classes).

If `ai-edge-litert` is installed and the model loads, scans use the TFLite model. If it cannot be loaded, the API intentionally falls back to **demo inference mode** so the UI and end-to-end hackathon demo remain runnable. The result is labelled as demo mode; it should not be presented as a real diagnosis.

## Backend setup

```bash
cd backend
python -m venv .venv
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
# macOS/Linux
# source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

API: `http://127.0.0.1:8000`

Swagger: `http://127.0.0.1:8000/docs`

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Vite normally starts at `http://127.0.0.1:5173`.

If the backend runs elsewhere, create `frontend/.env.local`:

```env
VITE_API_URL=http://127.0.0.1:8000
```

## Main API routes

- `GET /api/health`
- `GET /api/weather?latitude=...&longitude=...`
- `POST /api/scan?latitude=...&longitude=...&location=...`
- `GET /api/dashboard`
- `GET /api/crops`
- `GET /api/passport/{crop_id}`
- `POST /api/harvest`
- `GET /api/buyers?crop=...`
- `POST /predict` — backward-compatible endpoint from the original prototype

## Demo flow

1. Open **Scan Crop**.
2. Upload a clear crop-leaf image.
3. Enter/confirm the field location.
4. Analyze the image.
5. Review disease + confidence + weather + risk + recommendation.
6. Open the Crop Health Passport.
7. Record a demo-verified harvest.
8. Open Market Access and show the buyer handoff.

## Important

- Do not commit `.env` files, secrets, `venv`, `node_modules`, or local database files.
- The bundled `.tflite` model is intentionally kept in Git because it is the application inference asset.
- Weather uses Open-Meteo when reachable and a clearly labelled fallback when offline.

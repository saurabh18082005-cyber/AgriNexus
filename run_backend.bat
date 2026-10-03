@echo off
cd /d "%~dp0backend"
if not exist .venv\Scripts\python.exe (
  py -m venv .venv
  call .venv\Scripts\activate
  python -m pip install -r requirements.txt
) else (
  call .venv\Scripts\activate
)
python -m uvicorn app:app --reload --port 8000

#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/backend"
if [ ! -x ".venv/bin/python" ]; then
  python3 -m venv .venv
  . .venv/bin/activate
  python -m pip install -r requirements.txt
else
  . .venv/bin/activate
fi
python -m uvicorn app:app --reload --port 8000

import sys
import os
import requests

sys.path.append(os.path.join(os.path.dirname(__file__)))
from database.connection import SessionLocal
from database import models

BASE_URL = "http://localhost:8000"

def print_res(name, res):
    print(f"\n--- {name} ---")
    print(f"Status: {res.status_code}")
    try:
        print(res.json())
    except:
        print("No JSON response")

def test_deal_lifecycle():
    db = SessionLocal()

    # Get any existing deal to start with
    deal = db.query(models.Deal).first()
    if not deal:
        print("No deal found. Please ensure there is a deal in the database (e.g. from test_deals_v1.py)")
        return

    deal_id = deal.id

    # Since the deal might be in any state, let's artificially reset it to CONFIRMED for the test
    deal.status = "CONFIRMED"
    db.commit()

    # 1. Get existing deal
    r_get = requests.get(f"{BASE_URL}/api/deals/{deal_id}")
    print_res("Get existing deal", r_get)

    # 2. Valid progression through every status
    r_ready = requests.patch(f"{BASE_URL}/api/deals/{deal_id}/status", json={"status": "READY_FOR_PICKUP"})
    print_res("Transition to READY_FOR_PICKUP", r_ready)

    # 3. Attempt to skip a status -> 400
    r_skip = requests.patch(f"{BASE_URL}/api/deals/{deal_id}/status", json={"status": "DELIVERED"})
    print_res("Attempt to skip a status (DELIVERED)", r_skip)

    # 4. Attempt backward transition -> 400
    r_backward = requests.patch(f"{BASE_URL}/api/deals/{deal_id}/status", json={"status": "CONFIRMED"})
    print_res("Attempt backward transition (CONFIRMED)", r_backward)

    # Continue valid transitions
    r_picked = requests.patch(f"{BASE_URL}/api/deals/{deal_id}/status", json={"status": "PICKED_UP"})
    print_res("Transition to PICKED_UP", r_picked)

    r_delivered = requests.patch(f"{BASE_URL}/api/deals/{deal_id}/status", json={"status": "DELIVERED"})
    print_res("Transition to DELIVERED", r_delivered)

    r_completed = requests.patch(f"{BASE_URL}/api/deals/{deal_id}/status", json={"status": "COMPLETED"})
    print_res("Transition to COMPLETED", r_completed)

    # Any transition after COMPLETED -> 400
    r_after = requests.patch(f"{BASE_URL}/api/deals/{deal_id}/status", json={"status": "CONFIRMED"})
    print_res("Attempt transition after COMPLETED", r_after)

    # 5. Nonexistent deal -> 404
    r_notfound = requests.patch(f"{BASE_URL}/api/deals/9999/status", json={"status": "READY_FOR_PICKUP"})
    print_res("Nonexistent deal", r_notfound)

if __name__ == "__main__":
    test_deal_lifecycle()

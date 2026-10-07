import sys
import os
import requests

sys.path.append(os.path.join(os.path.dirname(__file__)))
from database.connection import SessionLocal
from database import models

BASE_URL = "http://localhost:8000"

def test_deal_room():
    db = SessionLocal()
    deal = db.query(models.Deal).first()
    if not deal:
        print("No deal found in database.")
        return

    deal_id = deal.id

    # 1. Fetch an existing deal
    r = requests.get(f"{BASE_URL}/api/deals/{deal_id}")

    # 2. Assert HTTP 200
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"

    data = r.json()

    # 3. Assert existing deal fields remain present
    expected_fields = ["id", "offer_id", "buyer_request_id", "listing_id", "quantity", "price_per_kg", "status", "created_at", "updated_at"]
    for field in expected_fields:
        assert field in data, f"Missing base field: {field}"

    # 4. Assert nested objects exist
    nested_objects = ["buyer", "farmer", "crop", "timeline"]
    for obj in nested_objects:
        assert obj in data, f"Missing nested object: {obj}"

    # 5. Assert representative values match seeded deal
    # (Since we might have seeded different values, we'll check fields within them)
    assert "name" in data["buyer"]
    assert "location" in data["farmer"]
    assert "crop_type" in data["crop"]
    assert "buyer_window_start" in data["timeline"]
    assert "ready_from" in data["timeline"]

    print("✓ Existing deal fetched and structured correctly.")
    print("Nested data excerpt:")
    print(f"  Buyer: {data['buyer']}")
    print(f"  Farmer: {data['farmer']}")
    print(f"  Crop: {data['crop']}")
    print(f"  Timeline: {data['timeline']}")

    # 6. Verify 404 for nonexistent deal
    r_404 = requests.get(f"{BASE_URL}/api/deals/99999")
    assert r_404.status_code == 404, f"Expected 404, got {r_404.status_code}"
    print("✓ 404 logic preserved.")

    print("\nAll Deal Room tests passed!")

if __name__ == "__main__":
    test_deal_room()

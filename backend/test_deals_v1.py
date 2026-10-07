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

def test_deals():
    db = SessionLocal()

    # Clean up old deals and offers to ensure a clean slate
    db.query(models.Deal).delete()
    db.query(models.Offer).delete()
    db.commit()

    # Setup basic test data
    buyer = models.Buyer(name="Test Buyer Deal", location="Loc", interest="Tomato", min_grade="A")
    db.add(buyer)
    db.commit()

    req = models.BuyerRequest(buyer_id=buyer.id, crop_type="Tomato", quantity=200.0, min_grade="A", price_max=50.0, status="OPEN")
    db.add(req)

    crop = models.Crop(farmer_name="Test Farmer Deal", crop_type="Tomato")
    db.add(crop)
    db.commit()

    harvest = models.Harvest(crop_id=crop.id, quantity=100.0, unit="kg", quality_grade="A", verification_status="VERIFIED")
    db.add(harvest)
    db.commit()

    listing = models.MarketListing(harvest_id=harvest.id, crop_type="Tomato", quantity=100.0, unit="kg", quality_grade="A", ask_price_per_kg=40.0, quantity_remaining=100.0, status="AVAILABLE")
    db.add(listing)
    db.commit()

    req_id = req.id
    l_valid_id = listing.id

    # 1. Accept valid offer
    # First create it
    r = requests.post(f"{BASE_URL}/api/offers", json={
        "buyer_request_id": req_id,
        "listing_id": l_valid_id,
        "quantity": 60.0,
        "price_per_kg": 40.0
    })
    valid_offer_id = r.json().get("id")

    r_accept = requests.patch(f"{BASE_URL}/api/offers/{valid_offer_id}/status", json={"status": "ACCEPTED"})
    print_res("Accept valid offer", r_accept)

    db.refresh(listing)
    print(f"Inventory remaining (should be 40.0): {listing.quantity_remaining}")

    deal1 = db.query(models.Deal).filter(models.Deal.offer_id == valid_offer_id).first()
    print(f"Deal created: {deal1 is not None}, quantity: {deal1.quantity if deal1 else None}")

    # 2. Accept same offer again -> 400
    r_accept2 = requests.patch(f"{BASE_URL}/api/offers/{valid_offer_id}/status", json={"status": "ACCEPTED"})
    print_res("Accept same offer again", r_accept2)

    # 3. Reject pending offer -> still works, inventory unchanged
    r_pending = requests.post(f"{BASE_URL}/api/offers", json={
        "buyer_request_id": req_id,
        "listing_id": l_valid_id,
        "quantity": 10.0,
        "price_per_kg": 40.0
    })
    pending_offer_id = r_pending.json().get("id")

    r_reject = requests.patch(f"{BASE_URL}/api/offers/{pending_offer_id}/status", json={"status": "REJECTED"})
    print_res("Reject pending offer", r_reject)
    db.refresh(listing)
    print(f"Inventory remaining (should be 40.0): {listing.quantity_remaining}")

    # 4. Accept offer whose quantity exceeds remaining inventory -> 400
    r_large = requests.post(f"{BASE_URL}/api/offers", json={
        "buyer_request_id": req_id,
        "listing_id": l_valid_id,
        "quantity": 40.0,
        "price_per_kg": 40.0
    })
    large_offer_id = r_large.json().get("id")

    # Someone else sneaks in and takes 10
    r_sneak = requests.post(f"{BASE_URL}/api/offers", json={
        "buyer_request_id": req_id,
        "listing_id": l_valid_id,
        "quantity": 10.0,
        "price_per_kg": 40.0
    })
    sneak_offer_id = r_sneak.json().get("id")
    requests.patch(f"{BASE_URL}/api/offers/{sneak_offer_id}/status", json={"status": "ACCEPTED"})

    r_large_accept = requests.patch(f"{BASE_URL}/api/offers/{large_offer_id}/status", json={"status": "ACCEPTED"})
    print_res("Accept offer exceeding remaining inventory", r_large_accept)

    # 5. Accept offer on non-AVAILABLE listing
    # Let's take the remaining 30 to make it SOLD_OUT
    r_last = requests.post(f"{BASE_URL}/api/offers", json={
        "buyer_request_id": req_id,
        "listing_id": l_valid_id,
        "quantity": 30.0,
        "price_per_kg": 40.0
    })
    last_offer_id = r_last.json().get("id")
    r_last_accept = requests.patch(f"{BASE_URL}/api/offers/{last_offer_id}/status", json={"status": "ACCEPTED"})
    print_res("Accept final offer (depleting inventory)", r_last_accept)

    db.refresh(listing)
    print(f"Listing status (should be SOLD_OUT): {listing.status}")
    print(f"Inventory remaining (should be 0.0): {listing.quantity_remaining}")

    # Now try to accept the large_offer_id which is still PENDING
    r_large_accept_again = requests.patch(f"{BASE_URL}/api/offers/{large_offer_id}/status", json={"status": "ACCEPTED"})
    print_res("Accept offer on SOLD_OUT listing", r_large_accept_again)

    # 7. Verify existing counter-offer behavior still works
    # We need a new listing because the old one is SOLD_OUT
    listing2 = models.MarketListing(harvest_id=harvest.id, crop_type="Tomato", quantity=100.0, unit="kg", quality_grade="A", ask_price_per_kg=40.0, quantity_remaining=100.0, status="AVAILABLE")
    db.add(listing2)
    db.commit()

    r_orig = requests.post(f"{BASE_URL}/api/offers", json={
        "buyer_request_id": req_id,
        "listing_id": listing2.id,
        "quantity": 20.0,
        "price_per_kg": 40.0
    })
    orig_id = r_orig.json().get("id")

    r_counter = requests.post(f"{BASE_URL}/api/offers", json={
        "buyer_request_id": req_id,
        "listing_id": listing2.id,
        "quantity": 20.0,
        "price_per_kg": 45.0,
        "parent_offer_id": orig_id
    })
    counter_id = r_counter.json().get("id")

    r_counter_accept = requests.patch(f"{BASE_URL}/api/offers/{counter_id}/status", json={"status": "ACCEPTED"})
    print_res("Accept counter offer", r_counter_accept)

    db.refresh(listing2)
    print(f"Inventory remaining on listing2 (should be 80.0): {listing2.quantity_remaining}")

if __name__ == "__main__":
    test_deals()

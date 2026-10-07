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

def test_execution():
    db = SessionLocal()

    db.query(models.Deal).delete()
    db.query(models.Offer).delete()
    db.commit()

    buyer = models.Buyer(name="Exec Test Buyer", location="Loc", interest="Tomato", min_grade="A")
    db.add(buyer)
    db.commit()

    req = models.BuyerRequest(buyer_id=buyer.id, crop_type="Tomato", quantity=100.0, min_grade="A", price_max=50.0, status="OPEN")
    db.add(req)

    crop = models.Crop(farmer_name="Exec Test Farmer", crop_type="Tomato")
    db.add(crop)
    db.commit()

    harvest = models.Harvest(crop_id=crop.id, quantity=100.0, unit="kg", quality_grade="A", verification_status="VERIFIED")
    db.add(harvest)
    db.commit()

    listing = models.MarketListing(harvest_id=harvest.id, crop_type="Tomato", quantity=100.0, unit="kg", quality_grade="A", ask_price_per_kg=40.0, quantity_remaining=100.0, status="AVAILABLE")
    db.add(listing)
    db.commit()

    # A. Cancellation refund
    # 1. create offer
    r_off1 = requests.post(f"{BASE_URL}/api/offers", json={
        "buyer_request_id": req.id, "listing_id": listing.id, "quantity": 40.0, "price_per_kg": 40.0
    })
    off1_id = r_off1.json()["id"]

    # 2. accept offer
    r_acc1 = requests.patch(f"{BASE_URL}/api/offers/{off1_id}/status", json={"status": "ACCEPTED"})
    print_res("A. Accept offer", r_acc1)
    db.refresh(listing)
    print(f"Listing remaining (expected 60.0): {listing.quantity_remaining}")

    deal1 = db.query(models.Deal).filter(models.Deal.offer_id == off1_id).first()

    # 3. cancel deal
    r_cancel1 = requests.patch(f"{BASE_URL}/api/deals/{deal1.id}/status", json={"status": "CANCELLED"})
    print_res("A. Cancel deal", r_cancel1)
    db.refresh(listing)
    print(f"Listing remaining (expected 100.0): {listing.quantity_remaining}")

    # B. SOLD_OUT restoration
    r_off2 = requests.post(f"{BASE_URL}/api/offers", json={
        "buyer_request_id": req.id, "listing_id": listing.id, "quantity": 100.0, "price_per_kg": 40.0
    })
    off2_id = r_off2.json()["id"]
    requests.patch(f"{BASE_URL}/api/offers/{off2_id}/status", json={"status": "ACCEPTED"})

    db.refresh(listing)
    print(f"\nB. Listing status (expected SOLD_OUT): {listing.status}")

    deal2 = db.query(models.Deal).filter(models.Deal.offer_id == off2_id).first()
    requests.patch(f"{BASE_URL}/api/deals/{deal2.id}/status", json={"status": "CANCELLED"})

    db.refresh(listing)
    print(f"B. Listing status (expected AVAILABLE): {listing.status}")
    print(f"B. Listing remaining (expected 100.0): {listing.quantity_remaining}")

    # C. Invalid cancellation
    r_off3 = requests.post(f"{BASE_URL}/api/offers", json={
        "buyer_request_id": req.id, "listing_id": listing.id, "quantity": 10.0, "price_per_kg": 40.0
    })
    print("r_off3:", r_off3.json())
    off3_id = r_off3.json()["id"]
    requests.patch(f"{BASE_URL}/api/offers/{off3_id}/status", json={"status": "ACCEPTED"})
    deal3 = db.query(models.Deal).filter(models.Deal.offer_id == off3_id).first()

    requests.patch(f"{BASE_URL}/api/deals/{deal3.id}/status", json={"status": "READY_FOR_PICKUP"})
    requests.patch(f"{BASE_URL}/api/deals/{deal3.id}/status", json={"status": "PICKED_UP"})

    r_invalid_cancel = requests.patch(f"{BASE_URL}/api/deals/{deal3.id}/status", json={"status": "CANCELLED"})
    print_res("C. Invalid cancellation (PICKED_UP -> CANCELLED)", r_invalid_cancel)

    # D. Buyer capacity
    # Currently 10.0 is fulfilled. We can fulfill 90 more.
    # Let's use up 80 to make it 90 total.
    r_off4 = requests.post(f"{BASE_URL}/api/offers", json={
        "buyer_request_id": req.id, "listing_id": listing.id, "quantity": 80.0, "price_per_kg": 40.0
    })
    off4_id = r_off4.json()["id"]
    requests.patch(f"{BASE_URL}/api/offers/{off4_id}/status", json={"status": "ACCEPTED"})

    # Now fulfilled = 90. remaining capacity = 10.
    # Try to accept offer for 20. But first we need a listing that has 20.
    # Current listing has 100 - 10 - 80 = 10 remaining. Let's make a new listing.
    listing2 = models.MarketListing(harvest_id=harvest.id, crop_type="Tomato", quantity=100.0, unit="kg", quality_grade="A", ask_price_per_kg=40.0, quantity_remaining=100.0, status="AVAILABLE")
    db.add(listing2)
    db.commit()

    # Try to make offer for 20, which exceeds 10 capacity -> 400 at creation
    r_off_exceed = requests.post(f"{BASE_URL}/api/offers", json={
        "buyer_request_id": req.id, "listing_id": listing2.id, "quantity": 20.0, "price_per_kg": 40.0
    })
    print_res("D. Offer creation exceeding buyer capacity", r_off_exceed)

    # Try to accept an offer that was created earlier when capacity was available
    # We don't have one, let's artificially set an offer up that bypasses creation check
    # (or we could have just made it earlier, but we didn't. Let's make an offer for 10)

    # E. Exact fulfillment
    # We have 10 capacity left. Let's fulfill exactly 10.
    r_off5 = requests.post(f"{BASE_URL}/api/offers", json={
        "buyer_request_id": req.id, "listing_id": listing2.id, "quantity": 10.0, "price_per_kg": 40.0
    })
    off5_id = r_off5.json()["id"]
    requests.patch(f"{BASE_URL}/api/offers/{off5_id}/status", json={"status": "ACCEPTED"})

    db.refresh(req)
    print(f"\nE. BuyerRequest status (expected FULFILLED): {req.status}")

    # G. Fulfilled request rejects new offers
    r_off_fulfilled = requests.post(f"{BASE_URL}/api/offers", json={
        "buyer_request_id": req.id, "listing_id": listing2.id, "quantity": 5.0, "price_per_kg": 40.0
    })
    print_res("G. Offer on FULFILLED request", r_off_fulfilled)

    # F. Cancellation reopens capacity
    deal5 = db.query(models.Deal).filter(models.Deal.offer_id == off5_id).first()
    requests.patch(f"{BASE_URL}/api/deals/{deal5.id}/status", json={"status": "CANCELLED"})

    db.refresh(req)
    print(f"\nF. BuyerRequest status (expected OPEN): {req.status}")

    # H. Acceptance-time capacity enforcement
    # We create a new request for 50
    req2 = models.BuyerRequest(buyer_id=buyer.id, crop_type="Tomato", quantity=50.0, min_grade="A", price_max=50.0, status="OPEN")
    db.add(req2)
    db.commit()

    # Create first offer for 40 (valid)
    r_off_h1 = requests.post(f"{BASE_URL}/api/offers", json={
        "buyer_request_id": req2.id, "listing_id": listing2.id, "quantity": 40.0, "price_per_kg": 40.0
    })
    off_h1_id = r_off_h1.json()["id"]

    # Create second offer for 30 (valid at creation time because 40 + 30 = 70 which exceeds 50, but neither is ACCEPTED yet)
    # Wait, the capacity at creation time only considers SUM(Deal.quantity). Since neither is accepted, both see remaining capacity = 50.
    r_off_h2 = requests.post(f"{BASE_URL}/api/offers", json={
        "buyer_request_id": req2.id, "listing_id": listing2.id, "quantity": 30.0, "price_per_kg": 40.0
    })
    off_h2_id = r_off_h2.json()["id"]

    # Accept the second one (consumes 30, leaving 20 capacity)
    requests.patch(f"{BASE_URL}/api/offers/{off_h2_id}/status", json={"status": "ACCEPTED"})

    db.refresh(listing2)
    listing2_qty_before = listing2.quantity_remaining

    # Attempt to accept the first one (needs 40, but only 20 capacity remaining)
    r_acc_h1 = requests.patch(f"{BASE_URL}/api/offers/{off_h1_id}/status", json={"status": "ACCEPTED"})
    print_res("H. Accept exceeding offer at acceptance-time", r_acc_h1)

    # Verify rejection
    assert r_acc_h1.status_code == 400, "Should be rejected"

    # Verify the offer wasn't accepted
    off_h1 = db.query(models.Offer).filter(models.Offer.id == off_h1_id).first()
    print(f"H. Offer status (expected PENDING): {off_h1.status}")
    assert off_h1.status == "PENDING"

    # Verify no deal was created
    deal_h1 = db.query(models.Deal).filter(models.Deal.offer_id == off_h1_id).first()
    print(f"H. Deal created (expected None): {deal_h1}")
    assert deal_h1 is None

    # Verify listing inventory was unchanged
    db.refresh(listing2)
    print(f"H. Listing inventory unchanged: {listing2.quantity_remaining == listing2_qty_before} ({listing2.quantity_remaining})")
    assert listing2.quantity_remaining == listing2_qty_before

    print("\nAll execution tests finished.")
if __name__ == "__main__":
    test_execution()

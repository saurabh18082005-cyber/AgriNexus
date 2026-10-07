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
    print(res.json())

def test_offers():
    db = SessionLocal()

    # Clean up previous state for a clean run if needed
    db.query(models.Offer).delete()
    db.commit()

    # Setup test data
    buyer = models.Buyer(name="Test Buyer", location="Loc", interest="Tomato", min_grade="A")
    db.add(buyer)
    db.commit()

    req = models.BuyerRequest(buyer_id=buyer.id, crop_type="Tomato", quantity=100.0, min_grade="A", price_max=50.0, status="OPEN")
    db.add(req)

    crop = models.Crop(farmer_name="Test Farmer", crop_type="Tomato")
    crop2 = models.Crop(farmer_name="Farmer 2", crop_type="Tomato")
    db.add(crop)
    db.add(crop2)
    db.commit()

    harvest = models.Harvest(crop_id=crop.id, quantity=100.0, unit="kg", quality_grade="A", verification_status="VERIFIED")
    harvest_unverified = models.Harvest(crop_id=crop.id, quantity=100.0, unit="kg", quality_grade="A", verification_status="PENDING")
    harvest2 = models.Harvest(crop_id=crop2.id, quantity=200.0, unit="kg", quality_grade="A", verification_status="VERIFIED")
    db.add(harvest)
    db.add(harvest_unverified)
    db.add(harvest2)
    db.commit()

    listing_valid = models.MarketListing(harvest_id=harvest.id, crop_type="Tomato", quantity=100.0, unit="kg", quality_grade="A", ask_price_per_kg=40.0, quantity_remaining=100.0, status="AVAILABLE")
    listing_unavail = models.MarketListing(harvest_id=harvest.id, crop_type="Tomato", quantity=100.0, unit="kg", quality_grade="A", ask_price_per_kg=40.0, quantity_remaining=100.0, status="SOLD_OUT")
    listing_unver = models.MarketListing(harvest_id=harvest_unverified.id, crop_type="Tomato", quantity=100.0, unit="kg", quality_grade="A", ask_price_per_kg=40.0, quantity_remaining=100.0, status="AVAILABLE")
    listing2_valid = models.MarketListing(harvest_id=harvest2.id, crop_type="Tomato", quantity=200.0, unit="kg", quality_grade="A", ask_price_per_kg=35.0, quantity_remaining=200.0, status="AVAILABLE")

    db.add(listing_valid)
    db.add(listing_unavail)
    db.add(listing_unver)
    db.add(listing2_valid)
    db.commit()

    req_id = req.id
    l_valid_id = listing_valid.id
    l_unavail_id = listing_unavail.id
    l_unver_id = listing_unver.id
    l2_valid_id = listing2_valid.id

    # Store initial qty
    initial_qty = listing_valid.quantity_remaining

    # Test: Valid Offer
    r = requests.post(f"{BASE_URL}/api/offers", json={
        "buyer_request_id": req_id,
        "listing_id": l_valid_id,
        "quantity": 50.0,
        "price_per_kg": 40.0
    })
    print_res("Valid offer", r)
    valid_offer_id = r.json().get("id")

    # Verify original offer is PENDING
    offer1 = db.query(models.Offer).get(valid_offer_id)
    print(f"Original offer status: {offer1.status}")

    # Verify quantity is unchanged
    db.refresh(listing_valid)
    print(f"Quantity unchanged after offer: {listing_valid.quantity_remaining == initial_qty} ({listing_valid.quantity_remaining})")

    # Test: Counter against a DIFFERENT AVAILABLE listing
    r = requests.post(f"{BASE_URL}/api/offers", json={
        "buyer_request_id": req_id,
        "listing_id": l2_valid_id,
        "quantity": 50.0,
        "price_per_kg": 45.0,
        "parent_offer_id": valid_offer_id
    })
    print_res("Counter on DIFFERENT AVAILABLE listing", r)

    # Test: Valid counter
    r = requests.post(f"{BASE_URL}/api/offers", json={
        "buyer_request_id": req_id,
        "listing_id": l_valid_id,
        "quantity": 50.0,
        "price_per_kg": 45.0,
        "parent_offer_id": valid_offer_id
    })
    print_res("Valid counter", r)
    counter_id = r.json().get("id")

    # Verify original is COUNTERED, counter is PENDING
    db.refresh(offer1)
    offer2 = db.query(models.Offer).get(counter_id)
    print(f"Original offer status after counter: {offer1.status}")
    print(f"Counter offer status: {offer2.status}")

    # Verify quantity is still unchanged
    db.refresh(listing_valid)
    print(f"Quantity unchanged after counter: {listing_valid.quantity_remaining == initial_qty} ({listing_valid.quantity_remaining})")

    # Test: Reject original (should fail)
    r = requests.patch(f"{BASE_URL}/api/offers/{valid_offer_id}/status", json={"status": "REJECTED"})
    print_res("Reject original (should fail)", r)

    # Test: Accept counter
    r = requests.patch(f"{BASE_URL}/api/offers/{counter_id}/status", json={"status": "ACCEPTED"})
    print_res("Accept counter", r)

    # Verify final states
    db.refresh(offer2)
    print(f"Counter offer status after accept: {offer2.status}")

    # Test: invalid status transition directly to COUNTERED via PATCH
    r = requests.patch(f"{BASE_URL}/api/offers/{counter_id}/status", json={"status": "COUNTERED"})
    print_res("Invalid PATCH to COUNTERED", r)

    # Test: quantity > req.quantity
    r = requests.post(f"{BASE_URL}/api/offers", json={
        "buyer_request_id": req_id,
        "listing_id": l2_valid_id,
        "quantity": 150.0,
        "price_per_kg": 35.0
    })
    print_res("Quantity exceeds buyer request quantity", r)

    # Test: negative price
    r = requests.post(f"{BASE_URL}/api/offers", json={
        "buyer_request_id": req_id,
        "listing_id": l_valid_id,
        "quantity": 50.0,
        "price_per_kg": -10.0
    })
    print_res("Negative price", r)

if __name__ == "__main__":
    test_offers()

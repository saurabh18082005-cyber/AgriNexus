import uuid
from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .connection import Base

def generate_public_code():
    return uuid.uuid4().hex[:8]

class Crop(Base):
    __tablename__ = "crops"

    id = Column(Integer, primary_key=True, index=True)
    farmer_name = Column(String, nullable=False)
    crop_type = Column(String, nullable=False)
    variety = Column(String, default="")
    location = Column(String, default="")
    planted_on = Column(String, default="")
    public_code = Column(String, unique=True, index=True, nullable=False, default=generate_public_code)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    scans = relationship("Scan", back_populates="crop")
    harvests = relationship("Harvest", back_populates="crop")

class Scan(Base):
    __tablename__ = "scans"

    id = Column(Integer, primary_key=True, index=True)
    crop_id = Column(Integer, ForeignKey("crops.id"), nullable=False)
    disease = Column(String, nullable=False)
    crop_type = Column(String, nullable=False)
    confidence = Column(Float, nullable=False)
    risk_score = Column(Float, nullable=False)
    risk_level = Column(String, nullable=False)
    recommendation = Column(String, nullable=False)
    temperature = Column(Float)
    humidity = Column(Float)
    rainfall = Column(Float)
    latitude = Column(Float)
    longitude = Column(Float)
    source = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    crop = relationship("Crop", back_populates="scans")

class Harvest(Base):
    __tablename__ = "harvests"

    id = Column(Integer, primary_key=True, index=True)
    crop_id = Column(Integer, ForeignKey("crops.id"), nullable=False)
    quantity = Column(Float, nullable=False)
    unit = Column(String, nullable=False)
    quality_grade = Column(String, nullable=False)
    verified = Column(Integer, default=0)
    verification_status = Column(String, default="PENDING")
    verification_reason = Column(String, default="")
    notes = Column(String, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    crop = relationship("Crop", back_populates="harvests")
    listings = relationship("MarketListing", back_populates="harvest")

class Buyer(Base):
    __tablename__ = "buyers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    location = Column(String, nullable=False)
    district = Column(String, default="")
    interest = Column(String, nullable=False)
    min_grade = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    requests = relationship("BuyerRequest", back_populates="buyer")

class BuyerRequest(Base):
    __tablename__ = "buyer_requests"

    id = Column(Integer, primary_key=True, index=True)
    buyer_id = Column(Integer, ForeignKey("buyers.id"), nullable=False)
    crop_type = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    unit = Column(String, default="kg")
    min_grade = Column(String, nullable=False)
    location = Column(String, default="")
    window_start = Column(DateTime(timezone=True), nullable=True)
    window_end = Column(DateTime(timezone=True), nullable=True)
    price_min = Column(Float, nullable=True)
    price_max = Column(Float, nullable=True)
    status = Column(String, default="OPEN", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)

    buyer = relationship("Buyer", back_populates="requests")

class MarketListing(Base):
    __tablename__ = "market_listings"

    id = Column(Integer, primary_key=True, index=True)
    harvest_id = Column(Integer, ForeignKey("harvests.id"), nullable=False)
    crop_type = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    unit = Column(String, nullable=False)
    quality_grade = Column(String, nullable=False)
    ask_price_per_kg = Column(Float, default=0.0)
    quantity_remaining = Column(Float, nullable=False)
    ready_from = Column(DateTime(timezone=True), nullable=True)
    ready_to = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, default="AVAILABLE")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    harvest = relationship("Harvest", back_populates="listings")

class Offer(Base):
    __tablename__ = "offers"

    id = Column(Integer, primary_key=True, index=True)
    buyer_request_id = Column(Integer, ForeignKey("buyer_requests.id"), nullable=False)
    listing_id = Column(Integer, ForeignKey("market_listings.id"), nullable=False)
    quantity = Column(Float, nullable=False)
    price_per_kg = Column(Float, nullable=False)
    status = Column(String, default="PENDING", index=True)
    parent_offer_id = Column(Integer, ForeignKey("offers.id"), nullable=True)
    counter_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    buyer_request = relationship("BuyerRequest")
    listing = relationship("MarketListing")
    parent_offer = relationship("Offer", remote_side=[id])

class Deal(Base):
    __tablename__ = "deals"

    id = Column(Integer, primary_key=True, index=True)
    offer_id = Column(Integer, ForeignKey("offers.id"), nullable=False, unique=True)
    buyer_request_id = Column(Integer, ForeignKey("buyer_requests.id"), nullable=False)
    listing_id = Column(Integer, ForeignKey("market_listings.id"), nullable=False)
    quantity = Column(Float, nullable=False)
    price_per_kg = Column(Float, nullable=False)
    status = Column(String, default="CONFIRMED", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    offer = relationship("Offer")
    buyer_request = relationship("BuyerRequest")
    listing = relationship("MarketListing")

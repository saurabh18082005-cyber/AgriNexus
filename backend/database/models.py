from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .connection import Base

class Crop(Base):
    __tablename__ = "crops"

    id = Column(Integer, primary_key=True, index=True)
    farmer_name = Column(String, nullable=False)
    crop_type = Column(String, nullable=False)
    variety = Column(String, default="")
    location = Column(String, default="")
    planted_on = Column(String, default="")
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
    interest = Column(String, nullable=False)
    min_grade = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class MarketListing(Base):
    __tablename__ = "market_listings"

    id = Column(Integer, primary_key=True, index=True)
    harvest_id = Column(Integer, ForeignKey("harvests.id"), nullable=False)
    crop_type = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    unit = Column(String, nullable=False)
    quality_grade = Column(String, nullable=False)
    status = Column(String, default="AVAILABLE")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    harvest = relationship("Harvest", back_populates="listings")

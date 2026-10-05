import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Load the database URL from the environment.
# Fallback to the local setup if not provided.
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://rakeshmalagi@localhost:5432/agrinexus")

# create_engine sets up the connection pool to the database
engine = create_engine(DATABASE_URL)

# SessionLocal is a factory for generating database sessions per request
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for our ORM models to inherit from
Base = declarative_base()

# Dependency to yield a database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

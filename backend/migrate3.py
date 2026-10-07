import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__)))

from database.connection import engine
from database.models import Offer

def migrate():
    # Because we are just adding one table, we can just call create_all for Offer
    Offer.__table__.create(engine, checkfirst=True)
    print("Migration successful: created offers table.")

if __name__ == "__main__":
    migrate()

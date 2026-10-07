import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__)))

from database.connection import engine
from database.models import Deal

def migrate():
    # Create deals table
    Deal.__table__.create(engine, checkfirst=True)
    print("Migration successful: created deals table.")

if __name__ == "__main__":
    migrate()

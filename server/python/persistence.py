"""
persistence.py
--------------
MongoDB persistence layer for prediction history (Part C).

Every time the dashboard loads, the current prediction is saved.
The history endpoint returns all saved predictions, allowing a
growing timeline of past predictions vs actual prices.

Uses PyMongo directly (no ORM overhead for this simple schema).
"""

from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional
import os

from pymongo import MongoClient, DESCENDING
from dotenv import load_dotenv

load_dotenv()

MONGO_URI  = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
DB_NAME    = os.getenv("MONGO_DB",  "alphai_btc")
COLLECTION = "predictions"

_client: Optional[MongoClient] = None


def _get_collection():
    global _client
    if _client is None:
        _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    return _client[DB_NAME][COLLECTION]


def save_prediction(pred: dict) -> str:
    """
    Persist a prediction to MongoDB.
    Adds a UTC timestamp. Returns inserted document id as string.
    """
    col = _get_collection()
    doc = {
        "timestamp":     datetime.now(timezone.utc).isoformat(),
        "current_price": pred.get("current_price"),
        "low_95":        pred.get("low_95"),
        "high_95":       pred.get("high_95"),
        "width":         pred.get("width"),
        "sigma":         pred.get("sigma"),
        "actual":        None,   # filled in retrospectively
    }
    result = col.insert_one(doc)
    return str(result.inserted_id)


def load_recent_predictions(limit: int = 200) -> list[dict]:
    """Return most recent `limit` predictions, newest first."""
    col = _get_collection()
    docs = col.find({}, {"_id": 0}).sort("timestamp", DESCENDING).limit(limit)
    return list(docs)


def update_actual(timestamp: str, actual_price: float) -> None:
    """Retrospectively fill in the actual close price for a prediction."""
    col = _get_collection()
    col.update_one(
        {"timestamp": timestamp},
        {"$set": {"actual": actual_price}},
    )

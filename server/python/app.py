"""
app.py
------
Flask microservice — exposes internal Python endpoints.
Only called by the Express.js API gateway (not the browser directly).

Endpoints:
  GET /internal/prediction        → live GBM prediction
  GET /internal/chart-data        → last 50 bars + ribbon
  GET /internal/backtest-metrics  → pre-computed Part A metrics
  GET /internal/charts            → matplotlib/seaborn PNGs as base64
  POST /internal/run-backtest     → trigger backtest (one-time setup)
"""

import json
import sys
from pathlib import Path

from flask import Flask, jsonify, request
from flask_cors import CORS

sys.path.insert(0, str(Path(__file__).parent))

from binance_data import fetch_klines
from gbm_model import predict_range
from backtest import run_backtest, load_backtest_predictions, load_backtest_metrics
from charts import generate_all_charts

try:
    from persistence import save_prediction, load_recent_predictions
    MONGO_AVAILABLE = True
except Exception:
    MONGO_AVAILABLE = False

app = Flask(__name__)
CORS(app, origins="*")


# ──────────────────────────────────────────────
# Health check
# ──────────────────────────────────────────────

@app.get("/internal/health")
def health():
    return jsonify({"status": "ok", "mongo": MONGO_AVAILABLE})


# ──────────────────────────────────────────────
# Live prediction
# ──────────────────────────────────────────────

@app.get("/internal/prediction")
def get_prediction():
    """
    Fetch last 500 bars, run GBM, return 95% range.
    Optionally persists to MongoDB if available.
    """
    df   = fetch_klines(limit=500)
    pred = predict_range(df["close"].values)

    if MONGO_AVAILABLE:
        try:
            save_prediction(pred)
        except Exception as e:
            print(f"[persistence] write failed: {e}")

    return jsonify(pred)


# ──────────────────────────────────────────────
# Chart data (last 50 bars + prediction ribbon)
# ──────────────────────────────────────────────

@app.get("/internal/chart-data")
def get_chart_data():
    """Last 50 OHLCV bars + current 95% ribbon for the React chart."""
    df   = fetch_klines(limit=51)
    bars = (
        df.tail(50)
        .copy()
        .assign(open_time=lambda x: x["open_time"].astype(str))
        [["open_time", "open", "high", "low", "close", "volume"]]
        .to_dict("records")
    )
    pred = predict_range(df["close"].values)
    return jsonify({"bars": bars, "ribbon": pred})


# ──────────────────────────────────────────────
# Pre-computed backtest metrics
# ──────────────────────────────────────────────

@app.get("/internal/backtest-metrics")
def get_metrics():
    """Load pre-computed Part A metrics from disk (fast — no re-run)."""
    metrics = load_backtest_metrics()
    if not metrics:
        return jsonify({"error": "Backtest not yet run. POST /internal/run-backtest first."}), 404
    return jsonify(metrics)


# ──────────────────────────────────────────────
# matplotlib + seaborn charts
# ──────────────────────────────────────────────

@app.get("/internal/charts")
def get_charts():
    """Generate and return all three charts as base64 PNG strings."""
    predictions = load_backtest_predictions()
    if not predictions:
        return jsonify({"error": "No backtest data found."}), 404
    charts = generate_all_charts(predictions)
    return jsonify(charts)


# ──────────────────────────────────────────────
# Trigger backtest (admin — run once)
# ──────────────────────────────────────────────

@app.post("/internal/run-backtest")
def trigger_backtest():
    """Run the full backtest (blocking — takes ~60s). Call once at setup."""
    try:
        metrics = run_backtest(verbose=False)
        return jsonify({"status": "done", **metrics})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ──────────────────────────────────────────────
# Prediction history (Part C)
# ──────────────────────────────────────────────

@app.get("/internal/history")
def get_history():
    if not MONGO_AVAILABLE:
        return jsonify({"predictions": [], "error": "MongoDB not configured"}), 200
    preds = load_recent_predictions(limit=200)
    return jsonify({"predictions": preds})


# ──────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────

if __name__ == "__main__":
    print("🐍 Flask microservice running on http://localhost:5001")
    app.run(host="0.0.0.0", port=5001, debug=False)

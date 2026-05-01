"""
app.py
------
Flask microservice — exposes internal Python endpoints.
Only called by the Express.js API gateway (not the browser directly).

Endpoints:
  GET /internal/health            → service health
  GET /internal/prediction        → live GBM prediction (+ saves to history)
  GET /internal/chart-data        → last 50 bars + ribbon
  GET /internal/backtest-metrics  → pre-computed Part A metrics
  GET /internal/charts            → matplotlib/seaborn PNGs as base64
  GET /internal/history           → saved prediction history (file + mongo)
  POST /internal/run-backtest     → trigger backtest (one-time setup)
"""

import json
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

from flask import Flask, jsonify, request
from flask_cors import CORS

sys.path.insert(0, str(Path(__file__).parent))

from binance_data import fetch_klines
from gbm_model import predict_range
from backtest import run_backtest, load_backtest_predictions, load_backtest_metrics
from charts import generate_all_charts

# ──────────────────────────────────────────────
# Optional MongoDB persistence
# ──────────────────────────────────────────────
try:
    from persistence import save_prediction, load_recent_predictions
    MONGO_AVAILABLE = True
except Exception:
    MONGO_AVAILABLE = False

# ──────────────────────────────────────────────
# File-based prediction history (always available)
# ──────────────────────────────────────────────
HISTORY_PATH = Path(__file__).parents[2] / "data" / "prediction_history.jsonl"
HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)


def save_to_file(pred: dict) -> None:
    """Append a prediction to the local JSONL history file."""
    record = {
        "timestamp":     datetime.now(timezone.utc).isoformat(),
        "current_price": pred.get("current_price"),
        "low_95":        pred.get("low_95"),
        "high_95":       pred.get("high_95"),
        "width":         pred.get("width"),
        "sigma":         pred.get("sigma"),
        "actual":        None,
    }
    with open(HISTORY_PATH, "a") as f:
        f.write(json.dumps(record) + "\n")


def load_rows_from_file() -> list:
    """Load ALL rows from JSONL history (oldest first)."""
    if not HISTORY_PATH.exists():
        return []
    rows = []
    with open(HISTORY_PATH) as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    rows.append(json.loads(line))
                except Exception:
                    pass
    return rows


def fill_actuals_from_binance() -> None:
    """
    Retrospectively fill actual close prices for history predictions.

    A prediction made at time T is forecasting the NEXT 1h bar, i.e. the bar
    whose open_time = floor(T to hour) + 1h.  We fill `actual` with that
    bar's close price once the bar has finished (open_time + 1h <= now).

    Reads from and writes back to HISTORY_PATH.
    """
    rows = load_rows_from_file()
    pending = [r for r in rows if r.get("actual") is None]
    if not pending:
        return

    # Fetch enough bars to cover all pending predictions
    try:
        df = fetch_klines(limit=500)
    except Exception as e:
        print(f"[fill_actuals] Binance fetch failed: {e}")
        return

    # Build open_time_ms → close price lookup
    bar_map: dict[int, float] = {}
    for _, bar in df.iterrows():
        ts_ms = int(bar["open_time"].timestamp()) * 1000
        bar_map[ts_ms] = float(bar["close"])

    now_utc = datetime.now(timezone.utc)
    changed = False

    for row in rows:
        if row.get("actual") is not None:
            continue
        try:
            pred_dt = datetime.fromisoformat(row["timestamp"])
            if pred_dt.tzinfo is None:
                pred_dt = pred_dt.replace(tzinfo=timezone.utc)
        except Exception:
            continue

        # The bar we predicted opens at the next hour boundary after prediction time
        hour_floor  = pred_dt.replace(minute=0, second=0, microsecond=0)
        target_open = hour_floor + timedelta(hours=1)   # bar we predicted
        target_close_time = target_open + timedelta(hours=1)  # when it closes

        # Don't fill if the bar hasn't closed yet
        if target_close_time > now_utc:
            continue

        target_ms = int(target_open.timestamp()) * 1000
        if target_ms in bar_map:
            row["actual"] = bar_map[target_ms]
            changed = True

    if changed:
        with open(HISTORY_PATH, "w") as f:
            for row in rows:
                f.write(json.dumps(row) + "\n")


def load_from_file(limit: int = 200) -> list:
    """Load recent predictions, fill actuals first, return newest-first."""
    try:
        fill_actuals_from_binance()
    except Exception as e:
        print(f"[fill_actuals] error: {e}")
    rows = load_rows_from_file()
    return list(reversed(rows[-limit:]))


app = Flask(__name__)
CORS(app, origins="*")


# ──────────────────────────────────────────────
# Health check
# ──────────────────────────────────────────────

@app.get("/internal/health")
def health():
    return jsonify({"status": "ok", "mongo": MONGO_AVAILABLE,
                    "file_history": HISTORY_PATH.exists()})


# ──────────────────────────────────────────────
# Live prediction
# ──────────────────────────────────────────────

@app.get("/internal/prediction")
def get_prediction():
    """
    Fetch last 500 bars, run GBM, return 95% range.
    ALWAYS saves to local file. Optionally saves to MongoDB too.
    """
    df   = fetch_klines(limit=500)
    pred = predict_range(df["close"].values)

    # ── Always persist to file (Part C — no config needed) ──
    try:
        save_to_file(pred)
    except Exception as e:
        print(f"[file history] write failed: {e}")

    # ── Also persist to MongoDB if configured ──
    if MONGO_AVAILABLE:
        try:
            save_prediction(pred)
        except Exception as e:
            print(f"[mongo] write failed: {e}")

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
    """
    Return prediction history with actuals filled from Binance.
    Priority: MongoDB → local file.
    """
    if MONGO_AVAILABLE:
        try:
            preds = load_recent_predictions(limit=200)
            if preds:
                return jsonify({"predictions": preds, "source": "mongodb"})
        except Exception as e:
            print(f"[mongo] history load failed: {e}")

    # File-based (fills actuals from Binance before returning)
    preds = load_from_file(limit=200)
    return jsonify({"predictions": preds, "source": "file"})


# ──────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────

if __name__ == "__main__":
    print("🐍 Flask microservice running on http://localhost:5001")
    app.run(host="0.0.0.0", port=5001, debug=False)

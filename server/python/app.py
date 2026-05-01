"""
app.py  (production-ready)
--------------------------
Flask microservice — exposes internal Python endpoints.

Production improvements:
  - fill_actuals cached (TTL 5 min) — no Binance fetch on every /history call
  - Save rate-limited: one record per 60s max per process
  - History file pruned to last MAX_HISTORY_ROWS rows after each write
  - Robust error handling throughout
"""

import json
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

from flask import Flask, jsonify
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
HISTORY_PATH     = Path(__file__).parents[2] / "data" / "prediction_history.jsonl"
MAX_HISTORY_ROWS = 500          # keep only the latest N records on disk
SAVE_INTERVAL_S  = 60           # minimum seconds between file saves (rate-limit)
FILL_CACHE_TTL   = 300          # seconds to cache Binance bars for fill_actuals

HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)

_last_save_ts:  float = 0.0    # epoch seconds of last save_to_file call
_fill_cache_ts: float = 0.0    # epoch seconds of last fill_actuals run
_fill_cache_hit_map: dict = {} # open_time_ms → close price, filled by last run


# ── helpers ───────────────────────────────────────────────

def _read_all_rows() -> list:
    """Read all JSONL rows from disk (oldest first)."""
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


def _write_rows(rows: list) -> None:
    """Write rows to disk, pruning to MAX_HISTORY_ROWS."""
    rows = rows[-MAX_HISTORY_ROWS:]
    with open(HISTORY_PATH, "w") as f:
        for row in rows:
            f.write(json.dumps(row) + "\n")


def save_to_file(pred: dict) -> None:
    """
    Append one prediction to the history file.
    Rate-limited: at most one save per SAVE_INTERVAL_S seconds.
    """
    global _last_save_ts
    now = time.time()
    if now - _last_save_ts < SAVE_INTERVAL_S:
        return                              # too soon — skip this save
    _last_save_ts = now

    record = {
        "timestamp":     datetime.now(timezone.utc).isoformat(),
        "current_price": pred.get("current_price"),
        "low_95":        pred.get("low_95"),
        "high_95":       pred.get("high_95"),
        "width":         pred.get("width"),
        "sigma":         pred.get("sigma"),
        "actual":        None,
    }
    rows = _read_all_rows()
    rows.append(record)
    _write_rows(rows)


def fill_actuals_from_binance() -> None:
    """
    Fill actual close prices for predictions whose target 1h bar has closed.

    A prediction made at time T predicts the bar that opens at:
        target_open = floor(T to hour) + 1h

    The actual is that bar's close price (target_open + 1h must be <= now).

    Results are cached for FILL_CACHE_TTL seconds — Binance is NOT fetched
    on every call to /api/history.
    """
    global _fill_cache_ts, _fill_cache_hit_map

    rows = _read_all_rows()
    pending = [r for r in rows if r.get("actual") is None]
    if not pending:
        return

    # Use cached bar_map if still fresh
    now = time.time()
    if now - _fill_cache_ts < FILL_CACHE_TTL and _fill_cache_hit_map:
        bar_map = _fill_cache_hit_map
    else:
        try:
            df = fetch_klines(limit=500)
        except Exception as e:
            print(f"[fill_actuals] Binance fetch failed: {e}")
            return
        bar_map = {}
        for _, bar in df.iterrows():
            ts_ms = int(bar["open_time"].timestamp() * 1000)
            bar_map[ts_ms] = float(bar["close"])
        _fill_cache_hit_map = bar_map
        _fill_cache_ts = now

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

        # Bar being predicted: opens at the next hour boundary
        hour_floor       = pred_dt.replace(minute=0, second=0, microsecond=0)
        target_open      = hour_floor + timedelta(hours=1)
        target_close_utc = target_open + timedelta(hours=1)

        if target_close_utc > now_utc:
            continue                        # bar hasn't closed yet — stay pending

        target_ms = int(target_open.timestamp() * 1000)
        if target_ms in bar_map:
            row["actual"] = bar_map[target_ms]
            changed = True

    if changed:
        _write_rows(rows)


def load_from_file(limit: int = 200) -> list:
    """Fill actuals, then return newest-first, capped at limit."""
    try:
        fill_actuals_from_binance()
    except Exception as e:
        print(f"[fill_actuals] error: {e}")
    rows = _read_all_rows()
    return list(reversed(rows[-limit:]))


# ──────────────────────────────────────────────
app = Flask(__name__)
CORS(app, origins="*")


@app.get("/internal/health")
def health():
    rows    = _read_all_rows()
    filled  = sum(1 for r in rows if r.get("actual") is not None)
    pending = len(rows) - filled
    return jsonify({
        "status":       "ok",
        "mongo":        MONGO_AVAILABLE,
        "file_history": HISTORY_PATH.exists(),
        "history_rows": len(rows),
        "filled":       filled,
        "pending":      pending,
    })


@app.get("/internal/prediction")
def get_prediction():
    """Fetch last 500 bars, run GBM, save to file (+MongoDB), return result."""
    df   = fetch_klines(limit=500)
    pred = predict_range(df["close"].values)

    try:
        save_to_file(pred)          # rate-limited, file-based
    except Exception as e:
        print(f"[file history] write failed: {e}")

    if MONGO_AVAILABLE:
        try:
            save_prediction(pred)
        except Exception as e:
            print(f"[mongo] write failed: {e}")

    return jsonify(pred)


@app.get("/internal/chart-data")
def get_chart_data():
    """Last 50 OHLCV bars + current 95% ribbon."""
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


@app.get("/internal/backtest-metrics")
def get_metrics():
    """Load pre-computed Part A metrics (fast — no re-run)."""
    metrics = load_backtest_metrics()
    if not metrics:
        return jsonify({"error": "Run POST /internal/run-backtest first."}), 404
    return jsonify(metrics)


@app.get("/internal/charts")
def get_charts():
    """Return all three matplotlib/seaborn charts as base64 PNGs."""
    predictions = load_backtest_predictions()
    if not predictions:
        return jsonify({"error": "No backtest data found."}), 404
    return jsonify(generate_all_charts(predictions))


@app.post("/internal/run-backtest")
def trigger_backtest():
    """Run full backtest (blocking ~60s). Call once at setup."""
    try:
        metrics = run_backtest(verbose=False)
        return jsonify({"status": "done", **metrics})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.get("/internal/history")
def get_history():
    """
    Return prediction history.
    Actuals are filled from Binance historical bars (cached 5 min).
    Priority: MongoDB → local file.
    """
    if MONGO_AVAILABLE:
        try:
            preds = load_recent_predictions(limit=200)
            if preds:
                return jsonify({"predictions": preds, "source": "mongodb"})
        except Exception as e:
            print(f"[mongo] history load failed: {e}")

    preds = load_from_file(limit=200)
    return jsonify({"predictions": preds, "source": "file"})


if __name__ == "__main__":
    print("🐍 Flask microservice running on http://localhost:5001")
    app.run(host="0.0.0.0", port=5001, debug=False)

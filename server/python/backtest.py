"""
backtest.py
-----------
Walk-forward 30-day backtest on BTCUSDT 1h bars.

CRITICAL: No-peek rule enforced by slicing closes[:i+1].
Bar i+1's data is NEVER available when predicting bar i+1.

Output: data/backtest_results.jsonl (one prediction per line)
"""

import json
import os
import sys
from pathlib import Path

import numpy as np

# Allow running from project root or server/python/
sys.path.insert(0, str(Path(__file__).parent))

from binance_data import fetch_klines
from gbm_model import predict_range
from evaluate import evaluate


# ──────────────────────────────────────────────
# Config
# ──────────────────────────────────────────────
LOOKBACK = 100       # minimum history bars before first prediction
VOL_WINDOW = 20      # rolling volatility window
N_SIMS = 10_000      # Monte Carlo paths
T_DF = 5             # Student-t degrees of freedom
BARS_TO_FETCH = 720  # ~30 days of 1h bars

JSONL_PATH = Path(__file__).parents[2] / "data" / "backtest_results.jsonl"
METRICS_PATH = Path(__file__).parents[2] / "data" / "backtest_metrics.json"


# ──────────────────────────────────────────────
# Backtest runner
# ──────────────────────────────────────────────

def run_backtest(
    lookback:   int = LOOKBACK,
    vol_window: int = VOL_WINDOW,
    n_sims:     int = N_SIMS,
    df_param:   int = T_DF,
    verbose:    bool = True,
) -> dict:
    """
    Walk-forward backtest over ~720 bars.

    At each bar i (from lookback to len-2):
      - history  = closes[0 : i+1]  ← strict no-peek slice
      - actual   = closes[i+1]       ← the future bar we predict
      - predict  = predict_range(history)

    Saves predictions to JSONL and metrics to JSON.
    Returns metrics dict.
    """
    if verbose:
        print("📡 Fetching BTCUSDT 1h bars from Binance Vision API...")
    df = fetch_klines(limit=BARS_TO_FETCH)
    closes = df["close"].values

    if verbose:
        print(f"✅ Fetched {len(closes)} bars | "
              f"{df['open_time'].iloc[0].strftime('%Y-%m-%d')} → "
              f"{df['open_time'].iloc[-1].strftime('%Y-%m-%d')}")
        print(f"🔄 Running walk-forward backtest (lookback={lookback})...\n")

    predictions = []
    total = len(closes) - lookback - 1

    for i in range(lookback, len(closes) - 1):
        # ── NO-PEEK: only bars 0..i are visible ──────────────────────────
        history      = closes[: i + 1]
        actual_next  = float(closes[i + 1])
        # ─────────────────────────────────────────────────────────────────

        pred = predict_range(
            history,
            window=vol_window,
            n_sims=n_sims,
            df=df_param,
        )

        record = {
            "bar_index":     i,
            "timestamp":     str(df.iloc[i]["open_time"]),
            "current_price": pred["current_price"],
            "low_95":        pred["low_95"],
            "high_95":       pred["high_95"],
            "sigma":         pred["sigma"],
            "width":         pred["width"],
            "actual":        actual_next,
        }
        predictions.append(record)

        if verbose and (i - lookback) % 100 == 0:
            pct = (i - lookback) / total * 100
            hit = pred["low_95"] <= actual_next <= pred["high_95"]
            print(f"  [{pct:5.1f}%] bar {i} | "
                  f"range ${pred['low_95']:,.0f}–${pred['high_95']:,.0f} | "
                  f"actual ${actual_next:,.0f} | {'✅' if hit else '❌'}")

    # Save JSONL
    JSONL_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(JSONL_PATH, "w") as f:
        for rec in predictions:
            f.write(json.dumps(rec) + "\n")

    # Compute and save metrics
    metrics = evaluate(predictions)

    with open(METRICS_PATH, "w") as f:
        json.dump(metrics, f, indent=2)

    if verbose:
        print(f"\n{'─'*50}")
        print(f"  ✅ Backtest complete! {metrics['n_predictions']} predictions")
        print(f"  Coverage  : {metrics['coverage_95']:.4f}  (target ~0.95)")
        print(f"  Avg Width : ${metrics['avg_width']:,.2f}")
        print(f"  Winkler   : ${metrics['mean_winkler_95']:,.2f}  (lower = better)")
        print(f"  Saved to  : {JSONL_PATH}")
        print(f"{'─'*50}\n")

    return metrics


def load_backtest_predictions() -> list[dict]:
    """Load saved JSONL predictions from disk."""
    if not JSONL_PATH.exists():
        return []
    with open(JSONL_PATH) as f:
        return [json.loads(line) for line in f if line.strip()]


def load_backtest_metrics() -> dict:
    """Load pre-computed metrics from disk (fast path for the API)."""
    if not METRICS_PATH.exists():
        return {}
    with open(METRICS_PATH) as f:
        return json.load(f)


if __name__ == "__main__":
    run_backtest()

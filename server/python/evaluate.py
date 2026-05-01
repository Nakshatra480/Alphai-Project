"""
evaluate.py
-----------
Compute the three evaluation metrics used by AlphaI:
  1. coverage_95    — fraction of actuals inside the predicted 95% CI
  2. avg_width      — mean width of predicted ranges in USD
  3. mean_winkler_95 — Winkler score (accuracy + tightness combined)

Lower Winkler = better. Coverage target ≈ 0.95.
"""

from __future__ import annotations


def evaluate(predictions: list[dict]) -> dict:
    """
    Evaluate a list of walk-forward predictions.

    Each prediction dict must have:
        low_95   : lower bound of 95% CI
        high_95  : upper bound of 95% CI
        actual   : the true next-bar close price

    Returns
    -------
    dict with coverage_95, avg_width, mean_winkler_95, n_predictions
    """
    alpha = 0.05  # 95% CI → alpha = 0.05

    widths, hits, winklers = [], [], []

    for p in predictions:
        lo     = float(p["low_95"])
        hi     = float(p["high_95"])
        actual = float(p["actual"])
        width  = hi - lo
        hit    = lo <= actual <= hi

        # Winkler interval score
        # • Hit   → score = width  (penalised only by how wide we are)
        # • Miss  → score = width + (2/α) * distance outside interval
        if hit:
            winkler = width
        elif actual < lo:
            winkler = width + (2.0 / alpha) * (lo - actual)
        else:
            winkler = width + (2.0 / alpha) * (actual - hi)

        widths.append(width)
        hits.append(int(hit))
        winklers.append(winkler)

    n = len(predictions)
    return {
        "coverage_95":      round(sum(hits)     / n, 4),
        "avg_width":        round(sum(widths)   / n, 2),
        "mean_winkler_95":  round(sum(winklers) / n, 2),
        "n_predictions":    n,
    }


if __name__ == "__main__":
    # Sanity check with dummy data
    dummy = [
        {"low_95": 67000, "high_95": 67800, "actual": 67500},  # hit
        {"low_95": 67000, "high_95": 67800, "actual": 68400},  # miss high
        {"low_95": 67000, "high_95": 67800, "actual": 66000},  # miss low
    ]
    metrics = evaluate(dummy)
    print(metrics)

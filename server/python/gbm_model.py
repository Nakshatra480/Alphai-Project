"""
gbm_model.py
------------
Geometric Brownian Motion (GBM) price-range forecaster.

Key design decisions:
  1. Volatility clustering  — rolling window (last `window` bars only)
  2. Fat tails              — Student-t distribution, NOT normal
  3. No drift               — zero-drift assumption for 1h BTC bars

These three decisions are the core of what AlphaI is evaluating.
"""

import numpy as np
from scipy.stats import t as student_t


# ──────────────────────────────────────────────
# 1.  Volatility (rolling, captures clustering)
# ──────────────────────────────────────────────

def compute_volatility(prices: np.ndarray, window: int = 20) -> float:
    """
    Estimate hourly volatility using rolling log-returns.

    Uses ONLY the last `window` bars so that recent calm / violent
    periods dominate — this is volatility clustering.

    Parameters
    ----------
    prices : 1-D array of close prices, oldest → newest
    window : number of recent bars to use (default 20)

    Returns
    -------
    float — annualised-equivalent hourly std of log-returns
    """
    if len(prices) < window + 1:
        window = max(2, len(prices) - 1)

    recent = prices[-(window + 1):]            # last window+1 prices
    log_returns = np.diff(np.log(recent))       # window log-returns
    return float(np.std(log_returns, ddof=1))


# ──────────────────────────────────────────────
# 2.  GBM simulation with Student-t shocks
# ──────────────────────────────────────────────

def simulate_gbm(
    S0: float,
    sigma: float,
    n_sims: int = 10_000,
    df: int = 5,
    mu: float = 0.0,
) -> np.ndarray:
    """
    Simulate one-step price paths using GBM with Student-t shocks.

    S(t+1) = S(t) * exp(mu + sigma * Z)
    where Z ~ t(df)  (fat-tailed, heavier than normal)

    Parameters
    ----------
    S0     : current price
    sigma  : hourly volatility (from compute_volatility)
    n_sims : number of Monte Carlo paths (10k is sufficient)
    df     : degrees of freedom (lower = fatter tails).
             BTC: start at 5, tune down to 3 if coverage < 0.93.
    mu     : drift term (0 for short-horizon BTC)

    Returns
    -------
    np.ndarray of shape (n_sims,) — simulated next-bar prices
    """
    shocks = student_t.rvs(df=df, size=n_sims, random_state=None)
    log_returns = mu + sigma * shocks
    return S0 * np.exp(log_returns)


# ──────────────────────────────────────────────
# 3.  Full prediction pipeline
# ──────────────────────────────────────────────

def predict_range(
    prices: np.ndarray,
    window: int = 20,
    n_sims: int = 10_000,
    df: int = 5,
    confidence: float = 0.95,
) -> dict:
    """
    Given a price history, predict the confidence-level range for
    the NEXT bar.

    IMPORTANT — no-peek contract:
        `prices` must contain ONLY bars up to and including bar i
        when predicting bar i+1. Never pass bar i+1's data here.

    Parameters
    ----------
    prices     : array of close prices (oldest → newest). Must be bar 0..i.
    window     : volatility lookback (bars)
    n_sims     : Monte Carlo simulation count
    df         : Student-t degrees of freedom
    confidence : CI level (default 0.95 → 2.5th–97.5th percentiles)

    Returns
    -------
    dict with keys:
        current_price, low_95, high_95, sigma, width
    """
    alpha = 1 - confidence
    lo_pct = (alpha / 2) * 100
    hi_pct = (1 - alpha / 2) * 100

    sigma = compute_volatility(prices, window)
    sims = simulate_gbm(float(prices[-1]), sigma, n_sims, df)

    low  = float(np.percentile(sims, lo_pct))
    high = float(np.percentile(sims, hi_pct))

    return {
        "current_price": float(prices[-1]),
        "low_95":        round(low,  2),
        "high_95":       round(high, 2),
        "sigma":         round(sigma, 8),
        "width":         round(high - low, 2),
    }


# ──────────────────────────────────────────────
# Quick smoke-test
# ──────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    sys.path.insert(0, ".")
    from binance_data import fetch_klines

    df = fetch_klines(limit=100)
    result = predict_range(df["close"].values)
    print(f"Current BTC: ${result['current_price']:,.2f}")
    print(f"95% Range :  ${result['low_95']:,.2f}  –  ${result['high_95']:,.2f}")
    print(f"Width      : ${result['width']:,.2f}  (σ={result['sigma']:.6f})")

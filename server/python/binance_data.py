"""
binance_data.py
---------------
Fetch BTCUSDT 1-hour OHLCV bars from Binance Vision API.
Uses data-api.binance.vision (not api.binance.com) — no geo-block in India.
No API key required — fully public endpoint.
"""

import requests
import pandas as pd
from datetime import datetime


BASE_URL = "https://data-api.binance.vision/api/v3/klines"


def fetch_klines(
    symbol: str = "BTCUSDT",
    interval: str = "1h",
    limit: int = 720,
) -> pd.DataFrame:
    """
    Fetch recent OHLCV bars for the given symbol and interval.

    Parameters
    ----------
    symbol   : trading pair, e.g. "BTCUSDT"
    interval : bar size, e.g. "1h"
    limit    : number of bars to fetch (max 1000)

    Returns
    -------
    pd.DataFrame with columns:
        open_time, open, high, low, close, volume
    Sorted ascending by open_time.
    """
    params = {
        "symbol":   symbol,
        "interval": interval,
        "limit":    limit,
    }

    try:
        resp = requests.get(BASE_URL, params=params, timeout=15)
        resp.raise_for_status()
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"Binance API error: {e}") from e

    raw = resp.json()

    cols = [
        "open_time", "open", "high", "low", "close", "volume",
        "close_time", "quote_asset_volume", "num_trades",
        "taker_buy_base", "taker_buy_quote", "ignore",
    ]
    df = pd.DataFrame(raw, columns=cols)

    # Convert types
    df["open_time"] = pd.to_datetime(df["open_time"], unit="ms", utc=True)
    for col in ["open", "high", "low", "close", "volume"]:
        df[col] = df[col].astype(float)

    # Keep only useful columns
    df = df[["open_time", "open", "high", "low", "close", "volume"]]
    df = df.sort_values("open_time").reset_index(drop=True)

    return df


def get_latest_close(symbol: str = "BTCUSDT") -> float:
    """Return the most recent closed 1h bar's close price."""
    df = fetch_klines(symbol=symbol, limit=2)
    return float(df.iloc[-1]["close"])


if __name__ == "__main__":
    df = fetch_klines(limit=10)
    print(df.tail())
    print(f"\nLatest close: ${get_latest_close():,.2f}")

"""
charts.py
---------
matplotlib + seaborn chart generators for the dashboard.
All charts are rendered server-side and returned as base64-encoded PNG
strings — no file I/O needed by the Express / React layer.

Uses Agg (non-interactive) matplotlib backend — required for servers.
"""

import io
import base64

import matplotlib
matplotlib.use("Agg")  # MUST be before pyplot import — server-safe backend

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import seaborn as sns
import numpy as np
import pandas as pd


# ──────────────────────────────────────────────
# Theme
# ──────────────────────────────────────────────
BG      = "#0d1117"
SURFACE = "#161b22"
BORDER  = "#30363d"
TEXT    = "#c9d1d9"
BLUE    = "#58a6ff"
GREEN   = "#3fb950"
RED     = "#f85149"
YELLOW  = "#d29922"

sns.set_theme(style="darkgrid")
plt.rcParams.update({
    "figure.facecolor":  BG,
    "axes.facecolor":    SURFACE,
    "axes.edgecolor":    BORDER,
    "axes.labelcolor":   TEXT,
    "xtick.color":       TEXT,
    "ytick.color":       TEXT,
    "text.color":        TEXT,
    "grid.color":        BORDER,
    "grid.linewidth":    0.5,
    "font.family":       "DejaVu Sans",
})


def _to_base64(fig: plt.Figure) -> str:
    """Render a matplotlib figure to a base64-encoded PNG string."""
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=110,
                facecolor=fig.get_facecolor(), bbox_inches="tight")
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode()


# ──────────────────────────────────────────────
# Chart 1: 30-day backtest line + ribbon
# ──────────────────────────────────────────────

def generate_backtest_chart(predictions: list[dict]) -> str:
    """
    Line chart of actual BTC prices over the backtest period
    with the 95% predicted ribbon shaded in green.

    Returns base64 PNG string.
    """
    df = pd.DataFrame(predictions)
    x  = df["bar_index"].values

    fig, ax = plt.subplots(figsize=(14, 5), facecolor=BG)
    ax.set_facecolor(SURFACE)

    # Shaded ribbon
    ax.fill_between(x, df["low_95"], df["high_95"],
                    alpha=0.20, color=GREEN, label="95% Predicted Range")

    # Actual price line
    ax.plot(x, df["actual"], color=BLUE, lw=1.4, label="Actual BTC Close")

    # Highlight misses
    miss_mask = ~((df["actual"] >= df["low_95"]) & (df["actual"] <= df["high_95"]))
    ax.scatter(x[miss_mask], df["actual"][miss_mask],
               color=RED, s=12, zorder=5, label="Miss", alpha=0.8)

    ax.set_title("30-Day Walk-Forward Backtest: Actual vs 95% Predicted Range",
                 color=TEXT, fontsize=13, pad=12)
    ax.set_xlabel("Bar Index", color=TEXT)
    ax.set_ylabel("BTC Price (USD)", color=TEXT)
    ax.legend(facecolor=SURFACE, edgecolor=BORDER, labelcolor=TEXT, fontsize=9)
    ax.spines[:].set_color(BORDER)

    fig.tight_layout()
    return _to_base64(fig)


# ──────────────────────────────────────────────
# Chart 2: Prediction width distribution
# ──────────────────────────────────────────────

def generate_width_distribution(predictions: list[dict]) -> str:
    """
    Seaborn histogram of prediction widths coloured by hit/miss.

    Returns base64 PNG string.
    """
    df = pd.DataFrame(predictions)
    df["hit"]   = (df["actual"] >= df["low_95"]) & (df["actual"] <= df["high_95"])
    df["width"] = df["high_95"] - df["low_95"]

    fig, ax = plt.subplots(figsize=(10, 4), facecolor=BG)
    ax.set_facecolor(SURFACE)

    sns.histplot(
        data=df, x="width", hue="hit", bins=40, ax=ax,
        palette={True: GREEN, False: RED}, alpha=0.75,
        edgecolor=BORDER, linewidth=0.4,
    )

    hit_count  = df["hit"].sum()
    miss_count = len(df) - hit_count
    ax.set_title(
        f"Prediction Width Distribution  |  ✅ Hits: {hit_count}  ❌ Misses: {miss_count}",
        color=TEXT, fontsize=12, pad=10,
    )
    ax.set_xlabel("Range Width (USD)", color=TEXT)
    ax.set_ylabel("Count", color=TEXT)
    ax.spines[:].set_color(BORDER)

    legend = ax.get_legend()
    if legend:
        legend.get_frame().set_facecolor(SURFACE)
        legend.get_frame().set_edgecolor(BORDER)
        for text in legend.get_texts():
            text.set_color(TEXT)

    fig.tight_layout()
    return _to_base64(fig)


# ──────────────────────────────────────────────
# Chart 3: Sigma (volatility) over backtest
# ──────────────────────────────────────────────

def generate_volatility_chart(predictions: list[dict]) -> str:
    """
    Seaborn line chart of rolling sigma across the backtest window.
    Shows volatility clustering visually.

    Returns base64 PNG string.
    """
    df = pd.DataFrame(predictions)
    x  = df["bar_index"].values
    y  = df["sigma"].values * 100   # convert to percentage

    fig, ax = plt.subplots(figsize=(14, 3), facecolor=BG)
    ax.set_facecolor(SURFACE)

    sns.lineplot(x=x, y=y, ax=ax, color=YELLOW, lw=1.2)
    ax.fill_between(x, y, alpha=0.15, color=YELLOW)

    ax.set_title("Hourly Volatility (σ) — Clustering Visible",
                 color=TEXT, fontsize=12, pad=10)
    ax.set_xlabel("Bar Index", color=TEXT)
    ax.set_ylabel("σ (%)", color=TEXT)
    ax.spines[:].set_color(BORDER)

    fig.tight_layout()
    return _to_base64(fig)


# ──────────────────────────────────────────────
# Convenience: generate all charts at once
# ──────────────────────────────────────────────

def generate_all_charts(predictions: list[dict]) -> dict:
    return {
        "backtest_chart":    generate_backtest_chart(predictions),
        "width_distribution": generate_width_distribution(predictions),
        "volatility_chart":  generate_volatility_chart(predictions),
    }

/**
 * PredictionCard.jsx
 * ------------------
 * Shows the current BTC price, the 95% predicted range for the next hour,
 * and a visual slider showing where the range sits relative to current price.
 */

import React from "react";
import { Bitcoin, ArrowRight, TrendingUp } from "lucide-react";

function fmt(n) {
  if (n == null) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PredictionCard({ prediction }) {
  const current = prediction?.current_price;
  const low     = prediction?.low_95;
  const high    = prediction?.high_95;
  const width   = prediction?.width;
  const sigma   = prediction?.sigma;

  // Position of current price within the range (0–1) for the indicator
  const pct = (current != null && low != null && high != null && high !== low)
    ? Math.max(0, Math.min(1, (current - low) / (high - low)))
    : 0.5;

  return (
    <div className="card glow-blue">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bitcoin size={18} className="text-yellow" />
          <span className="text-sm font-semibold text-text">BTC / USDT</span>
          <span className="badge badge-blue">1h bar</span>
        </div>
        <div className="flex items-center gap-1.5">
          <TrendingUp size={13} className="text-muted" />
          <span className="text-xs text-muted font-mono">
            σ = {sigma != null ? sigma.toFixed(5) : "—"}
          </span>
        </div>
      </div>

      {/* Current price */}
      <div className="mb-5">
        <p className="text-xs text-muted uppercase tracking-wider mb-1">Current Price</p>
        <p className="text-4xl font-bold font-mono text-gradient">{fmt(current)}</p>
      </div>

      {/* Range row */}
      <div className="mb-4">
        <p className="text-xs text-muted uppercase tracking-wider mb-2">
          Next Hour — 95% Confidence Range
        </p>
        <div className="flex items-center gap-3">
          <span className="text-lg font-mono font-semibold text-red/80">{fmt(low)}</span>
          <ArrowRight size={16} className="text-muted flex-shrink-0" />
          <span className="text-lg font-mono font-semibold text-green/90">{fmt(high)}</span>
        </div>
      </div>

      {/* Visual bar */}
      <div className="relative mt-3">
        <div className="h-2 rounded-full bg-border overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              background: "linear-gradient(90deg, rgba(248,81,73,0.6), rgba(63,185,80,0.6))",
              width: "100%",
            }}
          />
        </div>
        {/* Current price indicator */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue border-2 border-bg shadow-lg"
          style={{ left: `calc(${pct * 100}% - 6px)` }}
          title={`Current: ${fmt(current)}`}
        />
        {/* Labels */}
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] text-muted font-mono">Low</span>
          <span className="text-[10px] text-blue font-mono">▲ Now</span>
          <span className="text-[10px] text-muted font-mono">High</span>
        </div>
      </div>

      {/* Width */}
      <div className="mt-4 pt-4 border-t border-border flex justify-between text-xs text-muted">
        <span>Range width</span>
        <span className="font-mono text-text">{fmt(width)}</span>
      </div>
    </div>
  );
}

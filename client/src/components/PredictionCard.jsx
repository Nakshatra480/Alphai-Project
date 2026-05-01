/**
 * PredictionCard.jsx
 * ------------------
 * Shows the current BTC price, the 95% predicted range for the next hour,
 * and a visual slider showing where current price sits within the predicted range.
 */

import React from "react";
import { Bitcoin, ArrowRight, Clock } from "lucide-react";

function fmt(n, decimals = 2) {
  if (n == null) return "—";
  return "$" + Number(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function PredictionCard({ prediction }) {
  const current = prediction?.current_price;
  const low     = prediction?.low_95;
  const high    = prediction?.high_95;
  const width   = prediction?.width;
  const sigma   = prediction?.sigma;

  // σ per-hour as a percentage (human readable)
  const sigmaHourly = sigma != null ? (sigma * 100).toFixed(3) + "%" : "—";
  // Annualised volatility (sigma * sqrt(8760 hours/year))
  const sigmaAnnPct = sigma != null
    ? (sigma * Math.sqrt(8760) * 100).toFixed(1) + "%"
    : "—";

  // Position of current price within the predicted range (clamped 3%–97%)
  const pct = (current != null && low != null && high != null && high !== low)
    ? Math.max(0.03, Math.min(0.97, (current - low) / (high - low)))
    : 0.5;

  return (
    <div className="card glow-blue h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bitcoin size={18} className="text-yellow" />
          <span className="text-sm font-semibold text-text">BTC / USDT</span>
          <span className="badge badge-blue">1h bar</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="live-dot" />
          <span className="text-xs text-muted">Live</span>
        </div>
      </div>

      {/* Current price */}
      <div className="mb-5">
        <p className="text-xs text-muted uppercase tracking-wider mb-1">Current Price</p>
        <p className="text-4xl font-bold font-mono text-gradient">{fmt(current)}</p>
      </div>

      {/* Range */}
      <div className="mb-5">
        <div className="flex items-center gap-1.5 mb-2">
          <Clock size={11} className="text-muted" />
          <p className="text-xs text-muted uppercase tracking-wider">
            Next 1h — 95% Confidence Interval
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className="text-[10px] text-muted mb-0.5">Floor</p>
            <span className="text-base font-mono font-semibold text-red/80">{fmt(low)}</span>
          </div>
          <ArrowRight size={14} className="text-muted flex-shrink-0 mx-1" />
          <div className="text-center">
            <p className="text-[10px] text-muted mb-0.5">Ceiling</p>
            <span className="text-base font-mono font-semibold text-green/90">{fmt(high)}</span>
          </div>
        </div>
      </div>

      {/* Visual slider — current price position within predicted range */}
      <div className="relative mt-2 mb-1 pt-6">
        {/* Floating label tracks the dot */}
        <div
          className="absolute top-0 transition-all duration-700"
          style={{ left: `calc(${pct * 100}% - 18px)` }}
        >
          <span className="text-[9px] font-mono text-blue whitespace-nowrap">▼ now</span>
        </div>
        {/* Track */}
        <div className="h-2 rounded-full overflow-hidden" style={{
          background: "linear-gradient(90deg, rgba(248,81,73,0.45) 0%, rgba(88,166,255,0.2) 50%, rgba(63,185,80,0.45) 100%)"
        }} />
        {/* Dot */}
        <div
          className="absolute w-3.5 h-3.5 rounded-full bg-blue border-2 border-bg shadow-lg transition-all duration-700"
          style={{ left: `calc(${pct * 100}% - 7px)`, top: "calc(1.5rem + 1px)" }}
          title={`Current: ${fmt(current)}`}
        />
        {/* Edge labels */}
        <div className="flex justify-between mt-2">
          <span className="text-[10px] text-red/60 font-mono">
            {low != null ? "$" + Math.round(low).toLocaleString() : "—"}
          </span>
          <span className="text-[10px] text-green/60 font-mono">
            {high != null ? "$" + Math.round(high).toLocaleString() : "—"}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-auto pt-4 border-t border-border grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-muted mb-0.5">Range Width</p>
          <p className="font-mono text-text font-medium">{fmt(width, 0)}</p>
        </div>
        <div>
          <p className="text-muted mb-0.5">Hourly Volatility</p>
          <p className="font-mono text-text font-medium" title={`Annualised: ${sigmaAnnPct}/yr`}>
            {sigmaHourly}
            <span className="text-muted ml-1 text-[10px]">≈{sigmaAnnPct}/yr</span>
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * MetricsBar.jsx
 * --------------
 * Headline metric cards: Coverage | Avg Width | Winkler Score | N Predictions
 * Colour-coded: green if coverage near 0.95, yellow if off.
 */

import React from "react";
import { TrendingUp, Maximize2, Target, BarChart2 } from "lucide-react";

function clamp(v, lo, hi) {
  if (v == null) return null;
  return Math.max(lo, Math.min(hi, v));
}

function coverageColor(c) {
  if (c == null) return "text-muted";
  const diff = Math.abs(c - 0.95);
  if (diff <= 0.015) return "text-green";
  if (diff <= 0.03)  return "text-yellow";
  return "text-red";
}

function MetricCard({ icon: Icon, label, value, sub, valueClass = "text-text" }) {
  return (
    <div className="metric-card">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="text-muted" />
        <span className="metric-label">{label}</span>
      </div>
      <span className={`metric-value ${valueClass}`}>{value ?? "—"}</span>
      {sub && <span className="text-xs text-muted mt-0.5">{sub}</span>}
    </div>
  );
}

export default function MetricsBar({ metrics }) {
  const coverage = metrics?.coverage_95;
  const width    = metrics?.avg_width;
  const winkler  = metrics?.mean_winkler_95;
  const n        = metrics?.n_predictions;

  const coveragePct = coverage != null ? (coverage * 100).toFixed(1) + "%" : null;
  const widthFmt    = width    != null ? "$" + width.toLocaleString("en-US", { maximumFractionDigits: 0 }) : null;
  const winklerFmt  = winkler  != null ? "$" + winkler.toLocaleString("en-US", { maximumFractionDigits: 0 }) : null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <MetricCard
        icon={Target}
        label="Coverage (95% CI)"
        value={coveragePct}
        sub="Target: ~95.0%"
        valueClass={coverageColor(coverage)}
      />
      <MetricCard
        icon={Maximize2}
        label="Avg Range Width"
        value={widthFmt}
        sub="Narrower = better"
        valueClass="text-blue"
      />
      <MetricCard
        icon={TrendingUp}
        label="Mean Winkler Score"
        value={winklerFmt}
        sub="Lower = better"
        valueClass="text-purple"
      />
      <MetricCard
        icon={BarChart2}
        label="Predictions Tested"
        value={n?.toLocaleString() ?? "—"}
        sub="30-day backtest"
        valueClass="text-text"
      />
    </div>
  );
}

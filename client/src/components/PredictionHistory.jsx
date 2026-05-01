/**
 * PredictionHistory.jsx  (Part C — production-ready)
 * ----------------------------------------------------
 * Timeline table of every saved GBM prediction with verified hit/miss badges.
 *
 * Data flow:
 *   Flask fills `actual` from Binance history for any bar that has closed.
 *   Predictions < 1h old remain "Pending" — that is correct, not a bug.
 *
 * Coverage formula: hits / withActual  (excludes pending rows)
 */

import React from "react";
import {
  Clock, CheckCircle, XCircle, Database, FileText, AlertCircle,
} from "lucide-react";

// ── Formatters ────────────────────────────────────────────

function fmt(n, dec = 2) {
  if (n == null) return "—";
  return "$" + Number(n).toLocaleString("en-US", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function fmtTime(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("en-IN", {
      month:  "short",
      day:    "numeric",
      hour:   "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(ts).slice(0, 16).replace("T", " ");
  }
}

// ── Sub-components ────────────────────────────────────────

function HitBadge({ actual, low, high }) {
  if (actual == null) {
    return (
      <span className="badge badge-yellow" title="Predicted bar hasn't closed yet">
        <Clock size={9} /> Pending
      </span>
    );
  }
  const hit = actual >= low && actual <= high;
  return hit
    ? <span className="badge badge-green"><CheckCircle size={9} /> Hit</span>
    : <span className="badge badge-red"><XCircle size={9} /> Miss</span>;
}

function SourceBadge({ source }) {
  if (source === "mongodb") {
    return (
      <span className="badge badge-purple" title="Stored in MongoDB Atlas">
        <Database size={9} /> MongoDB
      </span>
    );
  }
  return (
    <span className="badge badge-blue" title="Stored in local JSONL file">
      <FileText size={9} /> Local file
    </span>
  );
}

function CoverageBar({ pct }) {
  if (pct == null) return null;
  const color = pct >= 93 ? "bg-green/60" : pct >= 88 ? "bg-yellow/60" : "bg-red/60";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 rounded-full bg-border overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-text">{pct.toFixed(2)}%</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────

export default function PredictionHistory({ history }) {
  const source      = history?.source ?? "file";
  const predictions = history?.predictions ?? [];

  // Split into resolved and pending
  const withActual  = predictions.filter(p => p.actual != null);
  const pending     = predictions.filter(p => p.actual == null);
  const hits        = withActual.filter(p => p.actual >= p.low_95 && p.actual <= p.high_95);
  const coveragePct = withActual.length > 0
    ? (hits.length / withActual.length) * 100
    : null;

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Clock size={15} className="text-muted" />
        <p className="section-title mb-0">Prediction History</p>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <SourceBadge source={source} />

          {/* Counts */}
          <span className="badge badge-blue">{predictions.length} saved</span>
          {pending.length > 0 && (
            <span className="badge badge-yellow" title="Bar hasn't closed yet — will fill automatically">
              <Clock size={9} /> {pending.length} pending
            </span>
          )}

          {/* Coverage */}
          {coveragePct != null && (
            <div className="flex items-center gap-1.5">
              <CheckCircle size={11} className="text-green" />
              <span className="text-xs text-muted">Live coverage:</span>
              <CoverageBar pct={coveragePct} />
            </div>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {withActual.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-lg bg-green/5 border border-green/10 p-3 text-center">
            <p className="text-xs text-muted mb-0.5">Hits</p>
            <p className="text-lg font-bold text-green">{hits.length}</p>
          </div>
          <div className="rounded-lg bg-red/5 border border-red/10 p-3 text-center">
            <p className="text-xs text-muted mb-0.5">Misses</p>
            <p className="text-lg font-bold text-red">{withActual.length - hits.length}</p>
          </div>
          <div className="rounded-lg bg-blue/5 border border-blue/10 p-3 text-center">
            <p className="text-xs text-muted mb-0.5">Coverage</p>
            <p className="text-lg font-bold text-blue">
              {coveragePct != null ? coveragePct.toFixed(1) + "%" : "—"}
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      {!predictions.length ? (
        <div className="py-8 text-center">
          <AlertCircle size={28} className="text-muted mx-auto mb-2" />
          <p className="text-sm text-muted">No history yet.</p>
          <p className="text-xs text-muted mt-1">
            Predictions are saved automatically (at most once per minute).
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="text-left   py-2 pr-3 font-medium">Time (IST)</th>
                <th className="text-right  py-2 pr-3 font-medium">BTC at Prediction</th>
                <th className="text-right  py-2 pr-3 font-medium">Floor (low 95%)</th>
                <th className="text-right  py-2 pr-3 font-medium">Ceiling (high 95%)</th>
                <th className="text-right  py-2 pr-3 font-medium">Width</th>
                <th className="text-right  py-2 pr-3 font-medium">Actual Close</th>
                <th className="text-right  py-2      font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {predictions.map((p, i) => {
                const hit    = p.actual != null && p.actual >= p.low_95 && p.actual <= p.high_95;
                const rowCls = p.actual == null
                  ? ""
                  : hit
                    ? "border-l-2 border-green/30"
                    : "border-l-2 border-red/30";

                return (
                  <tr
                    key={i}
                    className={`border-b border-border/40 hover:bg-white/[0.025] transition-colors ${rowCls}`}
                  >
                    <td className="py-2 pr-3 text-muted font-mono whitespace-nowrap pl-2">
                      {fmtTime(p.timestamp)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-blue">
                      {fmt(p.current_price)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-red/70">
                      {fmt(p.low_95)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-green/70">
                      {fmt(p.high_95)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-muted">
                      {fmt(p.width, 0)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono">
                      {p.actual != null
                        ? <span className="text-text">{fmt(p.actual)}</span>
                        : <span className="text-muted italic">awaiting close…</span>
                      }
                    </td>
                    <td className="py-2 text-right">
                      <HitBadge actual={p.actual} low={p.low_95} high={p.high_95} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-border/40 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted">
        <span>
          💾 <code className="font-mono">data/prediction_history.jsonl</code> (max 500 rows)
        </span>
        <span>
          🔄 Actuals auto-filled from Binance once the predicted 1h bar closes
        </span>
        <span>
          ⏱ Saved at most once/min &nbsp;|&nbsp; ☁️ Connect MongoDB Atlas for cloud persistence
        </span>
      </div>
    </div>
  );
}

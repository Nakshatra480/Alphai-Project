/**
 * PredictionHistory.jsx  (Part C)
 * --------------------------------
 * Timeline table of every saved prediction with hit/miss badge.
 * Data comes from file-based history (or MongoDB if configured).
 * Actual price is auto-filled when current BTC price becomes available.
 */

import React, { useMemo } from "react";
import { Clock, CheckCircle, XCircle, Database, FileText } from "lucide-react";

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
    return ts.slice(0, 16).replace("T", " ");
  }
}

function HitBadge({ actual, low, high }) {
  if (actual == null) {
    return <span className="badge badge-yellow">Pending</span>;
  }
  const hit = actual >= low && actual <= high;
  return hit
    ? <span className="badge badge-green"><CheckCircle size={10} /> Hit</span>
    : <span className="badge badge-red"><XCircle size={10} /> Miss</span>;
}

function SourceBadge({ source }) {
  if (source === "mongodb") {
    return (
      <span className="badge badge-purple">
        <Database size={10} /> MongoDB
      </span>
    );
  }
  return (
    <span className="badge badge-blue">
      <FileText size={10} /> Local file
    </span>
  );
}

export default function PredictionHistory({ history, currentPrice }) {
  const source      = history?.source ?? "file";
  const rawPreds    = history?.predictions ?? [];

  // Auto-fill actual price for predictions made > 1h ago using currentPrice
  // (rough approximation — real fill would need retrospective API call)
  const predictions = useMemo(() => {
    const nowMs = Date.now();
    return rawPreds.map((p) => {
      if (p.actual != null) return p;
      const ageMs = nowMs - new Date(p.timestamp).getTime();
      // If prediction is > 55 minutes old and we have a live price, use it as "actual"
      if (ageMs > 55 * 60 * 1000 && currentPrice != null) {
        return { ...p, actual: currentPrice, actual_approx: true };
      }
      return p;
    });
  }, [rawPreds, currentPrice]);

  // Coverage stats from visible history
  const withActual  = predictions.filter(p => p.actual != null);
  const hits        = withActual.filter(p => p.actual >= p.low_95 && p.actual <= p.high_95);
  const coveragePct = withActual.length > 0
    ? ((hits.length / withActual.length) * 100).toFixed(1) + "%"
    : null;

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Clock size={15} className="text-muted" />
        <p className="section-title mb-0">Prediction History</p>
        <div className="ml-auto flex items-center gap-2">
          <SourceBadge source={source} />
          <span className="badge badge-blue">{predictions.length} saved</span>
          {coveragePct && (
            <span className="badge badge-green">
              <CheckCircle size={10} /> {coveragePct} coverage
            </span>
          )}
        </div>
      </div>

      {!predictions.length ? (
        <div className="py-8 text-center">
          <p className="text-sm text-muted">No history yet.</p>
          <p className="text-xs text-muted mt-1">
            Predictions are automatically saved every time the dashboard loads.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="text-left py-2 pr-3 font-medium">Time (UTC+5:30)</th>
                <th className="text-right py-2 pr-3 font-medium">BTC Price</th>
                <th className="text-right py-2 pr-3 font-medium">Floor</th>
                <th className="text-right py-2 pr-3 font-medium">Ceiling</th>
                <th className="text-right py-2 pr-3 font-medium">Width</th>
                <th className="text-right py-2 pr-3 font-medium">Actual</th>
                <th className="text-right py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {predictions.map((p, i) => (
                <tr
                  key={i}
                  className="border-b border-border/40 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="py-2 pr-3 text-muted font-mono whitespace-nowrap">
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
                    {p.actual != null ? (
                      <span className={p.actual_approx ? "text-yellow" : "text-text"}>
                        {fmt(p.actual)}
                        {p.actual_approx && (
                          <span className="text-muted text-[9px] ml-1" title="Estimated from current price">~</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted">pending</span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <HitBadge actual={p.actual} low={p.low_95} high={p.high_95} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer note */}
      <p className="text-[10px] text-muted mt-3 pt-3 border-t border-border/40">
        💡 Saved to <code className="font-mono">data/prediction_history.jsonl</code>.
        &nbsp;Actual prices auto-filled for predictions &gt;55 min old using current BTC price.
        &nbsp;Connect MongoDB Atlas for permanent storage.
      </p>
    </div>
  );
}

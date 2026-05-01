/**
 * PredictionHistory.jsx  (Part C)
 * --------------------------------
 * Timeline table of every saved prediction with hit/miss badge.
 * Data comes from MongoDB via Express /api/history.
 */

import React from "react";
import { Clock, CheckCircle, XCircle } from "lucide-react";

function fmt(n, decimals = 0) {
  if (n == null) return "—";
  return "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: decimals });
}

function fmtTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-IN", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function HitBadge({ actual, low, high }) {
  if (actual == null) return <span className="badge badge-yellow">Pending</span>;
  const hit = actual >= low && actual <= high;
  return hit
    ? <span className="badge badge-green"><CheckCircle size={10} /> Hit</span>
    : <span className="badge badge-red"><XCircle size={10} /> Miss</span>;
}

export default function PredictionHistory({ history }) {
  const predictions = history?.predictions ?? [];

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={15} className="text-muted" />
        <p className="section-title mb-0">Prediction History</p>
        <span className="badge badge-blue ml-auto">{predictions.length} saved</span>
      </div>

      {!predictions.length ? (
        <p className="text-sm text-muted text-center py-8">
          No history yet — predictions are saved on each dashboard visit.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="text-left py-2 pr-4 font-medium">Time</th>
                <th className="text-right py-2 pr-4 font-medium">Price</th>
                <th className="text-right py-2 pr-4 font-medium">Low 95%</th>
                <th className="text-right py-2 pr-4 font-medium">High 95%</th>
                <th className="text-right py-2 pr-4 font-medium">Actual</th>
                <th className="text-right py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {predictions.map((p, i) => (
                <tr
                  key={i}
                  className="border-b border-border/50 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="py-2 pr-4 text-muted font-mono">{fmtTime(p.timestamp)}</td>
                  <td className="py-2 pr-4 text-right font-mono text-blue">{fmt(p.current_price)}</td>
                  <td className="py-2 pr-4 text-right font-mono text-red/80">{fmt(p.low_95)}</td>
                  <td className="py-2 pr-4 text-right font-mono text-green/80">{fmt(p.high_95)}</td>
                  <td className="py-2 pr-4 text-right font-mono">{fmt(p.actual)}</td>
                  <td className="py-2 text-right">
                    <HitBadge actual={p.actual} low={p.low_95} high={p.high_95} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

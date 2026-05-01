/**
 * PriceChart.jsx
 * --------------
 * Recharts ComposedChart showing:
 *   • 50-bar BTC close price line (blue)
 *   • Shaded 95% ribbon for the NEXT bar (green band)
 *   • Candlestick-style bar info in tooltip
 *
 * The ribbon is rendered as two Area layers stacked:
 *   bottom area (low_95 → transparent) clipped by top area (high_95).
 */

import React, { useMemo } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

const COLORS = {
  bg:      "#0d1117",
  surface: "#161b22",
  border:  "#30363d",
  text:    "#c9d1d9",
  muted:   "#8b949e",
  blue:    "#58a6ff",
  green:   "#3fb950",
  red:     "#f85149",
};

function fmtTime(str) {
  if (!str) return "";
  const d = new Date(str);
  // Show date only every few bars — just time is fine for 50 bars
  return d.toLocaleTimeString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

function fmtPrice(v) {
  if (v == null) return "—";
  return "$" + Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload || {};
  return (
    <div style={{
      background: COLORS.surface, border: `1px solid ${COLORS.border}`,
      borderRadius: 8, padding: "10px 14px", fontSize: 12, color: COLORS.text,
    }}>
      <p style={{ color: COLORS.muted, marginBottom: 6 }}>{label}</p>
      <p>Close: <strong style={{ color: COLORS.blue }}>{fmtPrice(d.close)}</strong></p>
      {d.high_95 != null && (
        <>
          <p>High 95%: <span style={{ color: COLORS.green }}>{fmtPrice(d.high_95)}</span></p>
          <p>Low 95%: <span style={{ color: COLORS.red }}>{fmtPrice(d.low_95)}</span></p>
        </>
      )}
    </div>
  );
};

export default function PriceChart({ chartData }) {
  const bars   = chartData?.bars   || [];
  const ribbon = chartData?.ribbon || null;

  const chartPoints = useMemo(() => {
    if (!bars.length) return [];

    const points = bars.map((b, i) => ({
      time:  fmtTime(b.open_time),
      close: b.close,
      // ribbon only on the last point (prediction for next bar)
      high_95: i === bars.length - 1 ? ribbon?.high_95 : undefined,
      low_95:  i === bars.length - 1 ? ribbon?.low_95  : undefined,
    }));

    // Append a "next bar" point carrying only the ribbon
    if (ribbon) {
      points.push({
        time:    "Next →",
        close:   null,
        high_95: ribbon.high_95,
        low_95:  ribbon.low_95,
      });
    }

    return points;
  }, [bars, ribbon]);

  const prices = bars.map(b => b.close).filter(Boolean);
  const allLows  = prices.concat(ribbon?.low_95  != null ? [ribbon.low_95]  : []);
  const allHighs = prices.concat(ribbon?.high_95 != null ? [ribbon.high_95] : []);
  const yMin = allLows.length  ? Math.min(...allLows)  * 0.9985 : "auto";
  const yMax = allHighs.length ? Math.max(...allHighs) * 1.0015 : "auto";

  if (!bars.length) {
    return (
      <div className="card h-72 flex items-center justify-center text-muted text-sm">
        Loading chart data…
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <p className="section-title mb-0">Last 50 Bars + Predicted Range</p>
        <div className="flex items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-blue inline-block rounded" /> Price
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded" style={{ background: "rgba(63,185,80,0.25)" }} />
            95% Range
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={chartPoints} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
          <defs>
            <linearGradient id="ribbonGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.green} stopOpacity={0.3} />
              <stop offset="100%" stopColor={COLORS.green} stopOpacity={0.05} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />

          <XAxis
            dataKey="time"
            tick={{ fill: COLORS.muted, fontSize: 10 }}
            axisLine={{ stroke: COLORS.border }}
            tickLine={false}
            interval={9}
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fill: COLORS.muted, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => "$" + (v / 1000).toFixed(1) + "k"}
            width={56}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Ribbon — upper bound */}
          <Area
            dataKey="high_95"
            stroke="none"
            fill="url(#ribbonGrad)"
            isAnimationActive={false}
            connectNulls
          />
          {/* Ribbon — lower bound (clips bottom of ribbon) */}
          <Area
            dataKey="low_95"
            stroke="none"
            fill={COLORS.bg}
            isAnimationActive={false}
            connectNulls
          />

          {/* Price line */}
          <Line
            dataKey="close"
            stroke={COLORS.blue}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: COLORS.blue, strokeWidth: 0 }}
            isAnimationActive={false}
            connectNulls={false}
          />

          {/* Vertical divider before next bar */}
          <ReferenceLine
            x="Next →"
            stroke={COLORS.border}
            strokeDasharray="4 2"
            label={{ value: "Now →", position: "insideTopRight", fill: COLORS.muted, fontSize: 10 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * App.jsx
 * -------
 * Main dashboard layout.
 * Wires together all components using the useDashboard hook.
 */

import React from "react";
import { RefreshCw, Bitcoin, Activity, Github } from "lucide-react";
import { useDashboard } from "./hooks/useDashboard";
import MetricsBar        from "./components/MetricsBar";
import PredictionCard    from "./components/PredictionCard";
import PriceChart        from "./components/PriceChart";
import BacktestCharts    from "./components/BacktestCharts";
import PredictionHistory from "./components/PredictionHistory";

function Header({ lastRefresh, onRefresh, loading }) {
  const timeStr = lastRefresh
    ? lastRefresh.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

  return (
    <header className="border-b border-border bg-surface/60 backdrop-blur-sm sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue/10 border border-blue/20 flex items-center justify-center">
            <Bitcoin size={16} className="text-blue" />
          </div>
          <div>
            <span className="font-semibold text-sm text-text">AlphaI BTC Forecaster</span>
            <span className="ml-2 text-xs text-muted hidden sm:inline">
              × Polaris Challenge
            </span>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted">
            <Activity size={11} className="text-green" />
            <span>Last update: <span className="font-mono text-text">{timeStr}</span></span>
          </div>
          <button
            id="refresh-button"
            onClick={onRefresh}
            disabled={loading}
            className="btn-ghost"
            title="Refresh now"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function ErrorBanner({ error }) {
  return (
    <div className="bg-red/10 border border-red/20 rounded-lg px-4 py-3 text-sm text-red flex items-center gap-2">
      <span className="font-semibold">Connection error:</span>
      <span>{error}</span>
      <span className="text-muted ml-1">— Make sure Flask and Express are running.</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-surface border border-border" />
        ))}
      </div>
      <div className="h-48 rounded-xl bg-surface border border-border" />
      <div className="h-72 rounded-xl bg-surface border border-border" />
    </div>
  );
}

export default function App() {
  const { data, loading, error, lastRefresh, refresh } = useDashboard(60_000);

  const prediction = data?.prediction ?? null;
  const chartData  = data?.chartData  ?? null;
  const charts     = data?.charts     ?? null;
  const history    = data?.history    ?? null;

  // Metrics come from prediction response (which merges /api/backtest-metrics)
  const metrics = prediction ? {
    coverage_95:     prediction.coverage_95,
    avg_width:       prediction.avg_width,
    mean_winkler_95: prediction.mean_winkler_95,
    n_predictions:   prediction.n_predictions,
  } : null;

  return (
    <div className="min-h-screen bg-bg">
      <Header lastRefresh={lastRefresh} onRefresh={refresh} loading={loading} />

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 flex flex-col gap-6">

        {/* Refresh auto-notice */}
        <div className="flex items-center gap-2 text-xs text-muted">
          <div className="live-dot" />
          <span>Auto-refreshes every <strong className="text-text">60 seconds</strong> — one candle period</span>
        </div>

        {/* Error */}
        {error && <ErrorBanner error={error} />}

        {/* Loading skeleton */}
        {loading && !data && <LoadingSkeleton />}

        {data && (
          <>
            {/* ── Row 1: Metrics ── */}
            <section id="metrics">
              <p className="section-title">Part A — 30-Day Backtest Metrics</p>
              <MetricsBar metrics={metrics} />
            </section>

            {/* ── Row 2: Prediction + Chart side by side on large screens ── */}
            <section id="live" className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-1">
                <p className="section-title">Part B — Live Prediction</p>
                <PredictionCard prediction={prediction} />
              </div>
              <div className="lg:col-span-2">
                <p className="section-title">Last 50 Bars + 95% Ribbon</p>
                <PriceChart chartData={chartData} />
              </div>
            </section>

            {/* ── Row 3: matplotlib / seaborn backtest analysis ── */}
            <section id="analysis">
              <BacktestCharts charts={charts} />
            </section>

            {/* ── Row 4: Prediction history (Part C) ── */}
            <section id="history">
              <PredictionHistory history={history} />
            </section>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12 py-5">
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex items-center justify-between text-xs text-muted">
          <span>AlphaI × Polaris Build Challenge — BTC 95% CI Forecaster</span>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 hover:text-text transition-colors"
          >
            <Github size={13} /> Source
          </a>
        </div>
      </footer>
    </div>
  );
}

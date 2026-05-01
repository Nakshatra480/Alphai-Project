/**
 * useDashboard.js  (production-ready)
 * ------------------------------------
 * Single hook that drives the entire dashboard.
 *
 * Fetch strategy:
 *   - prediction + chart-data + history → every refresh (live data, 60s)
 *   - charts (matplotlib PNGs)          → once on mount only (static backtest output)
 *     Charts are ~207KB base64 — no reason to re-fetch every minute.
 *
 * Error handling: Promise.allSettled so one failing endpoint
 * doesn't prevent the rest of the dashboard from rendering.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_BASE || "";

// Fetch live endpoints (called every refresh)
async function fetchLive() {
  const [predRes, chartDataRes, historyRes] = await Promise.allSettled([
    axios.get(`${API}/api/prediction`,   { timeout: 20_000 }),
    axios.get(`${API}/api/chart-data`,   { timeout: 20_000 }),
    axios.get(`${API}/api/history`,      { timeout: 20_000 }),
  ]);

  return {
    prediction: predRes.status      === "fulfilled" ? predRes.value.data      : null,
    chartData:  chartDataRes.status === "fulfilled" ? chartDataRes.value.data : null,
    history:    historyRes.status   === "fulfilled" ? historyRes.value.data   : null,
  };
}

// Fetch static charts (called once — backtest doesn't change between refreshes)
async function fetchCharts() {
  try {
    const res = await axios.get(`${API}/api/charts`, { timeout: 30_000 });
    return res.data;
  } catch {
    return null;
  }
}

export function useDashboard(refreshMs = 60_000) {
  const [data,        setData]        = useState(null);
  const [charts,      setCharts]      = useState(null);   // separate — fetched once
  const [loading,     setLoading]     = useState(true);
  const [chartsReady, setChartsReady] = useState(false);
  const [error,       setError]       = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const timerRef = useRef(null);

  // Live data refresh
  const loadLive = useCallback(async () => {
    try {
      setError(null);
      const result = await fetchLive();
      setData(prev => ({ ...prev, ...result }));
      setLastRefresh(new Date());
    } catch (e) {
      setError(e.message || "Failed to fetch live data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Charts fetch — once on mount
  const loadCharts = useCallback(async () => {
    const result = await fetchCharts();
    setCharts(result);
    setChartsReady(true);
  }, []);

  useEffect(() => {
    // Initial load: live data + charts in parallel
    loadLive();
    loadCharts();

    // Auto-refresh: live data only
    timerRef.current = setInterval(loadLive, refreshMs);
    return () => clearInterval(timerRef.current);
  }, [loadLive, loadCharts, refreshMs]);

  // Merge charts into data object for BacktestCharts component
  // charts=null → still loading; charts={} → error; charts={...} → ready
  const merged = data ? { ...data, charts: chartsReady ? charts : null } : null;

  return {
    data:        merged,
    loading,
    error,
    lastRefresh,
    refresh:     loadLive,   // manual refresh only hits live endpoints
  };
}

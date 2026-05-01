/**
 * useDashboard.js
 * ------------------------------------
 * Single hook that drives the entire dashboard.
 *
 * Fetch strategy:
 *   - prediction + chart-data + history → every refresh (live data, 60s)
 *   - charts (matplotlib PNGs)          → once on mount only (static backtest output)
 *
 * Timeouts are set to 90s to survive Render free-tier cold starts (~50s wake time).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_BASE || "";

// Render free tier can take up to 50s to wake from sleep
const LIVE_TIMEOUT   = 90_000;   // 90s — covers cold start
const CHARTS_TIMEOUT = 120_000;  // 120s — charts are heavier (matplotlib render)

// Fetch live endpoints (called every refresh)
async function fetchLive() {
  const [predRes, chartDataRes, historyRes] = await Promise.allSettled([
    axios.get(`${API}/api/prediction`,   { timeout: LIVE_TIMEOUT }),
    axios.get(`${API}/api/chart-data`,   { timeout: LIVE_TIMEOUT }),
    axios.get(`${API}/api/history`,      { timeout: LIVE_TIMEOUT }),
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
    const res = await axios.get(`${API}/api/charts`, { timeout: CHARTS_TIMEOUT });
    return res.data;
  } catch {
    return null;
  }
}

export function useDashboard(refreshMs = 60_000) {
  const [data,        setData]        = useState(null);
  const [charts,      setCharts]      = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [chartsReady, setChartsReady] = useState(false);
  const [error,       setError]       = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [elapsed,     setElapsed]     = useState(0);   // seconds since load started
  const timerRef   = useRef(null);
  const elapsedRef = useRef(null);

  // Live data refresh
  const loadLive = useCallback(async () => {
    setLoading(true);
    setError(null);
    setElapsed(0);

    // Tick elapsed counter every second while loading
    elapsedRef.current = setInterval(() => {
      setElapsed(s => s + 1);
    }, 1000);

    try {
      const result = await fetchLive();
      setData(prev => ({ ...prev, ...result }));
      setLastRefresh(new Date());
    } catch (e) {
      setError(e.message || "Failed to fetch live data");
    } finally {
      clearInterval(elapsedRef.current);
      setLoading(false);
      setElapsed(0);
    }
  }, []);

  // Charts fetch — once on mount
  const loadCharts = useCallback(async () => {
    const result = await fetchCharts();
    setCharts(result);
    setChartsReady(true);
  }, []);

  useEffect(() => {
    loadLive();
    loadCharts();
    timerRef.current = setInterval(loadLive, refreshMs);
    return () => {
      clearInterval(timerRef.current);
      clearInterval(elapsedRef.current);
    };
  }, [loadLive, loadCharts, refreshMs]);

  const merged = data ? { ...data, charts: chartsReady ? charts : null } : null;

  return {
    data:        merged,
    loading,
    error,
    lastRefresh,
    elapsed,     // seconds elapsed since load started (for cold-start UX)
    refresh:     loadLive,
  };
}

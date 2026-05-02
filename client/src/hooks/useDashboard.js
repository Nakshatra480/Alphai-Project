/**
 * useDashboard.js
 * ------------------------------------
 * Single hook that drives the entire dashboard.
 *
 * Fetch strategy:
 *   - prediction + chart-data + history → every refresh (live data, 60s)
 *   - charts (matplotlib PNGs)          → once on mount only
 *
 * Cold-start resilience:
 *   - Timeouts are 90s to survive Render free-tier wake (~50s)
 *   - If Flask hasn't finished initializing, prediction returns null.
 *     We auto-retry up to MAX_RETRIES times with RETRY_DELAY between
 *     each attempt — no manual page reload needed.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_BASE || "";

const LIVE_TIMEOUT   = 90_000;   // 90s — covers Render cold start
const CHARTS_TIMEOUT = 120_000;  // 120s — matplotlib render is heavier
const MAX_RETRIES    = 6;        // retry up to 6× before giving up
const RETRY_DELAY    = 5_000;    // 5s between retries

// Fetch live endpoints
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

// Fetch static charts once on mount
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
  const [elapsed,     setElapsed]     = useState(0);

  const timerRef      = useRef(null);  // auto-refresh interval
  const elapsedRef    = useRef(null);  // elapsed seconds interval
  const retryTimer    = useRef(null);  // retry setTimeout
  const retryCount    = useRef(0);     // how many retries attempted

  const loadLive = useCallback(async () => {
    setLoading(true);
    setError(null);
    setElapsed(0);

    // Tick elapsed every second while loading
    clearInterval(elapsedRef.current);
    elapsedRef.current = setInterval(() => setElapsed(s => s + 1), 1000);

    try {
      const result = await fetchLive();

      if (result.prediction) {
        // ✅ Flask is ready — update state normally
        retryCount.current = 0;
        setData(prev => ({ ...prev, ...result }));
        setLastRefresh(new Date());
        clearInterval(elapsedRef.current);
        setLoading(false);
        setElapsed(0);
      } else if (retryCount.current < MAX_RETRIES) {
        // ⏳ Flask not ready yet — silent retry
        retryCount.current += 1;
        clearInterval(elapsedRef.current);
        // Keep loading=true, schedule another attempt
        clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => loadLive(), RETRY_DELAY);
      } else {
        // ❌ Exhausted retries — show whatever we got
        retryCount.current = 0;
        setData(prev => ({ ...prev, ...result }));
        setLastRefresh(new Date());
        clearInterval(elapsedRef.current);
        setLoading(false);
        setElapsed(0);
      }
    } catch (e) {
      clearInterval(elapsedRef.current);
      setError(e.message || "Failed to fetch live data");
      setLoading(false);
      setElapsed(0);
    }
  }, []);

  // Charts — once on mount
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
      clearTimeout(retryTimer.current);
    };
  }, [loadLive, loadCharts, refreshMs]);

  const merged = data ? { ...data, charts: chartsReady ? charts : null } : null;

  return {
    data:        merged,
    loading,
    error,
    lastRefresh,
    elapsed,
    refresh:     loadLive,
  };
}

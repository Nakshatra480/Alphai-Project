/**
 * useDashboard.js
 * ---------------
 * Single hook that drives the entire dashboard.
 * Fetches prediction, chart data, and backtest charts in parallel.
 * Auto-refreshes every 60 seconds (one candle period).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_BASE || "";

async function fetchAll() {
  const [predRes, chartRes, chartsRes, historyRes] = await Promise.allSettled([
    axios.get(`${API}/api/prediction`),
    axios.get(`${API}/api/chart-data`),
    axios.get(`${API}/api/charts`),
    axios.get(`${API}/api/history`),
  ]);

  return {
    prediction: predRes.status   === "fulfilled" ? predRes.value.data   : null,
    chartData:  chartRes.status  === "fulfilled" ? chartRes.value.data  : null,
    charts:     chartsRes.status === "fulfilled" ? chartsRes.value.data : null,
    history:    historyRes.status=== "fulfilled" ? historyRes.value.data: null,
  };
}

export function useDashboard(refreshMs = 60_000) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const result = await fetchAll();
      setData(result);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e.message || "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, refreshMs);
    return () => clearInterval(timerRef.current);
  }, [load, refreshMs]);

  return { data, loading, error, lastRefresh, refresh: load };
}

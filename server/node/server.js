const express  = require("express");
const axios    = require("axios");
const cors     = require("cors");
const mongoose = require("mongoose");
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const app        = express();
const PORT       = process.env.PORT       || 5000;
const FLASK_URL  = process.env.FLASK_URL  || "http://localhost:5001";
const MONGO_URI  = process.env.MONGO_URI  || "";

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────
// MongoDB connection (graceful — not required)
// ─────────────────────────────────────────────
if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(() => console.log("🍃 MongoDB connected"))
    .catch(err => console.warn("⚠️  MongoDB skipped:", err.message));
}

// ─────────────────────────────────────────────
// Mongoose Schema — Prediction history (Part C)
// ─────────────────────────────────────────────
const PredictionSchema = new mongoose.Schema({
  timestamp:     { type: String, default: () => new Date().toISOString() },
  current_price: Number,
  low_95:        Number,
  high_95:       Number,
  width:         Number,
  sigma:         Number,
  actual:        { type: Number, default: null },
}, { collection: "predictions" });

const Prediction = mongoose.model("Prediction", PredictionSchema);

// ─────────────────────────────────────────────
// Helper: proxy call to Flask
// ─────────────────────────────────────────────
async function flaskGet(path) {
  const { data } = await axios.get(`${FLASK_URL}${path}`, { timeout: 30_000 });
  return data;
}

// ─────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────

// Health check
app.get("/api/health", async (_req, res) => {
  try {
    const flask = await flaskGet("/internal/health");
    res.json({ express: "ok", flask });
  } catch (e) {
    res.status(503).json({ express: "ok", flask: "unreachable", error: e.message });
  }
});

// GET /api/prediction
// Live BTC prediction + backtest metrics + saves to MongoDB
app.get("/api/prediction", async (_req, res) => {
  try {
    const [pred, metrics] = await Promise.all([
      flaskGet("/internal/prediction"),
      flaskGet("/internal/backtest-metrics").catch(() => ({})),
    ]);

    // Persist to MongoDB (Part C) — non-blocking
    if (mongoose.connection.readyState === 1) {
      new Prediction(pred).save().catch(e => console.warn("MongoDB save:", e.message));
    }

    res.json({ ...pred, ...metrics });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/chart-data
// Last 50 OHLCV bars + 95% ribbon for Recharts
app.get("/api/chart-data", async (_req, res) => {
  try {
    const data = await flaskGet("/internal/chart-data");
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/backtest-metrics
// Pre-computed Part A metrics from disk
app.get("/api/backtest-metrics", async (_req, res) => {
  try {
    const data = await flaskGet("/internal/backtest-metrics");
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/charts
// matplotlib + seaborn base64 PNG charts
app.get("/api/charts", async (_req, res) => {
  try {
    const data = await flaskGet("/internal/charts");
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/run-backtest
// Trigger the full 30-day backtest (one-time, ~60s)
app.post("/api/run-backtest", async (_req, res) => {
  try {
    const data = await axios.post(`${FLASK_URL}/internal/run-backtest`, {}, { timeout: 300_000 });
    res.json(data.data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/history
// All saved predictions from MongoDB (Part C)
app.get("/api/history", async (_req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      // Fallback to Flask persistence
      const data = await flaskGet("/internal/history");
      return res.json(data);
    }
    const predictions = await Prediction.find({}, { _id: 0 })
      .sort({ timestamp: -1 })
      .limit(200)
      .lean();
    res.json({ predictions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🟩 Express API gateway → http://localhost:${PORT}`);
  console.log(`   Proxying Flask at   → ${FLASK_URL}`);
});

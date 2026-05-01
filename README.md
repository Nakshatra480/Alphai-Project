# AlphaI BTC Forecaster

> **AlphaI × Polaris Build Challenge** — Bitcoin Next-Hour 95% Confidence Interval Forecaster

Live dashboard predicting BTC's next-hour price range using Geometric Brownian Motion with Student-t fat tails.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React.js + Tailwind CSS + Recharts |
| API Gateway | Node.js + Express.js |
| ML Engine | Python + Flask + numpy + pandas + scipy |
| Charts | matplotlib + seaborn (server-rendered) |
| Database | MongoDB Atlas (prediction history) |
| Hosting | Render (backend) + Vercel (frontend) |

---

## Project Structure

```
alphai-btc-forecaster/
├── server/
│   ├── python/         # GBM model, backtest, Flask API
│   └── node/           # Express API gateway
├── client/             # React.js dashboard
├── data/               # backtest_results.jsonl + metrics
├── start.sh            # Runs Flask + Express together
└── .env.example
```

---

## Quick Start

### 1. Environment setup

```bash
cp .env.example .env
# Fill in MONGO_URI from MongoDB Atlas
```

### 2. Install Python dependencies

```bash
cd server/python
pip3 install -r requirements.txt --break-system-packages
```

### 3. Install Node dependencies

```bash
cd server/node
npm install
```

### 4. Install React dependencies

```bash
cd client
npm install
```

### 5. Run the 30-day backtest (one-time, ~60 seconds)

```bash
cd server/python
python3 backtest.py
```

This generates `data/backtest_results.jsonl` and `data/backtest_metrics.json`.

### 6. Start all services (3 terminals)

**Terminal 1 — Flask:**
```bash
cd server/python && python3 app.py
```

**Terminal 2 — Express:**
```bash
cd server/node && node server.js
```

**Terminal 3 — React:**
```bash
cd client && npm run dev
```

Open **http://localhost:5173** 🚀

---

## Part A — Backtest Results

After running `python3 backtest.py`, check the printed metrics:

| Metric | Value | Target |
|--------|-------|--------|
| Coverage 95% | (run to see) | ~0.95 |
| Avg Width | (run to see) | As narrow as possible |
| Mean Winkler | (run to see) | Lower = better |

---

## Deployment

### Backend (Render)

1. Connect repo → new Web Service
2. Root: `/`
3. Start command: `bash start.sh`
4. Add env vars: `MONGO_URI`, `PORT=5000`, `FLASK_URL=http://localhost:5001`

### Frontend (Vercel)

1. Connect repo → import project
2. Root: `client/`
3. Build: `npm run build`, Output: `dist/`
4. Add env var: `VITE_API_BASE=https://your-render-url.onrender.com`

---

## Key Design Decisions

1. **No data leakage** — backtest slices `closes[:i+1]` strictly
2. **Student-t distribution** — fatter tails than normal, critical for BTC
3. **Rolling volatility** — uses last 20 bars, captures clustering
4. **Python charts via base64** — matplotlib/seaborn rendered server-side, no client SVG overhead

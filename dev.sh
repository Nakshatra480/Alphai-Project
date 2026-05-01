#!/bin/bash
# dev.sh — Start all 3 services in separate background processes
# Usage: bash dev.sh
# Stop all: bash dev.sh stop

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

stop_all() {
  echo "🛑 Stopping all AlphaI services..."
  pkill -f "python3 app.py" 2>/dev/null && echo "   ✅ Flask stopped"
  pkill -f "node server.js" 2>/dev/null && echo "   ✅ Express stopped"
  pkill -f "vite --port 5173" 2>/dev/null && echo "   ✅ React stopped"
  exit 0
}

[ "$1" = "stop" ] && stop_all

echo ""
echo "🚀 AlphaI BTC Forecaster — Starting all services"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Kill any stale processes first
pkill -f "python3 app.py" 2>/dev/null
pkill -f "node server.js" 2>/dev/null
pkill -f "vite --port 5173" 2>/dev/null
sleep 1

# 1. Flask
echo "🐍 Starting Flask microservice on :5001..."
cd "$PROJECT_ROOT/server/python"
python3 app.py > "$PROJECT_ROOT/data/flask.log" 2>&1 &
FLASK_PID=$!

sleep 3  # wait for Flask to boot

# Check Flask
if curl -s http://localhost:5001/internal/health > /dev/null 2>&1; then
  echo "   ✅ Flask is up (PID $FLASK_PID)"
else
  echo "   ❌ Flask failed to start — check data/flask.log"
  cat "$PROJECT_ROOT/data/flask.log"
  exit 1
fi

# 2. Express
echo "🟩 Starting Express API gateway on :4000..."
cd "$PROJECT_ROOT/server/node"
node server.js > "$PROJECT_ROOT/data/express.log" 2>&1 &
EXPRESS_PID=$!

sleep 2

if curl -s http://localhost:4000/api/health > /dev/null 2>&1; then
  echo "   ✅ Express is up (PID $EXPRESS_PID)"
else
  echo "   ❌ Express failed to start — check data/express.log"
  cat "$PROJECT_ROOT/data/express.log"
  exit 1
fi

# 3. React
echo "⚛️  Starting React dev server on :5173..."
cd "$PROJECT_ROOT/client"
npm run dev > "$PROJECT_ROOT/data/react.log" 2>&1 &
REACT_PID=$!

sleep 3

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All services running!"
echo ""
echo "   Flask   → http://localhost:5001 (PID $FLASK_PID)"
echo "   Express → http://localhost:4000 (PID $EXPRESS_PID)"
echo "   React   → http://localhost:5173 (PID $REACT_PID)"
echo ""
echo "   Dashboard → http://localhost:5173"
echo ""
echo "   Logs: data/flask.log | data/express.log | data/react.log"
echo "   Stop all: bash dev.sh stop"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Open browser
open "http://localhost:5173" 2>/dev/null || true

# Keep script alive so CTRL+C stops everything
wait

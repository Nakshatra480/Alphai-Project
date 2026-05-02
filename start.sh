#!/bin/bash
# start.sh — launch Flask + Express together (for Render deployment)
# Flask runs in background on port 5001, Express runs in foreground on PORT

echo "🐍 Starting Flask microservice on port 5001..."
cd server/python
python3 app.py &
FLASK_PID=$!

echo "   Flask PID: $FLASK_PID"
echo "   Waiting 20s for Flask to fully initialize (fetching Binance data + backtest)..."
sleep 20

echo "🟩 Starting Express API gateway..."
cd ../../server/node
node server.js

# If Express exits, kill Flask too
kill $FLASK_PID 2>/dev/null

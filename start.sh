#!/bin/bash
# start.sh — launch Flask + Express together (for Render deployment)
# Flask runs in background on port 5001, Express runs in foreground on PORT

echo "🐍 Starting Flask microservice on port 5001..."
cd server/python
python3 app.py &
FLASK_PID=$!

echo "   Flask PID: $FLASK_PID"
echo "   Waiting 3s for Flask to boot..."
sleep 3

echo "🟩 Starting Express API gateway..."
cd ../../server/node
node server.js

# If Express exits, kill Flask too
kill $FLASK_PID 2>/dev/null

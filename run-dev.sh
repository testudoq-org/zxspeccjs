#!/usr/bin/env sh
# POSIX shell script to install dependencies and start dev server
# Usage: ./run-dev.sh

set -e

echo "Installing npm dependencies..."
npm install --legacy-peer-deps

echo "Starting dev server (npm run dev)..."
npm run dev &

echo "Dev server started. Open http://localhost:8080 in your browser."
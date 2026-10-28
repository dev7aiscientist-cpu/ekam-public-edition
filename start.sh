#!/bin/sh
# EKAM - Public Edition launcher (Mac / Linux)
cd "$(dirname "$0")"

if ! command -v bun >/dev/null 2>&1; then
  echo ""
  echo "  EKAM needs one free program to run: Bun."
  echo "  Install it free from https://bun.sh (one-time), then run this again:"
  echo "    sh start.sh"
  echo ""
  exit 1
fi

if [ ! -d node_modules ]; then
  echo ""
  echo "  First run: installing EKAM's parts (one-time, needs internet)..."
  echo ""
  bun install || { echo "  Installing EKAM's parts failed - check your internet connection and try again."; exit 1; }
fi

echo ""
echo "  Starting EKAM... your browser will open by itself when it is ready."
echo "  KEEP THIS TERMINAL OPEN - it is EKAM's engine. Ctrl+C stops it."
echo ""

( for i in $(seq 1 40); do
    if [ -f ekam-port.txt ]; then
      P=$(cat ekam-port.txt)
      (xdg-open "http://localhost:$P" >/dev/null 2>&1 || open "http://localhost:$P" >/dev/null 2>&1) &
      break
    fi
    sleep 1
  done ) &

bun run start

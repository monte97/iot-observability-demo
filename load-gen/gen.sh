#!/bin/sh
# load-gen/gen.sh - POST continui al gateway con device_id e valori finti
set -e
URL="${TARGET:-http://device-gateway:8080/ingest}"
i=0
while true; do
  i=$((i+1))
  dev="dev-$(printf '%03d' $((i % 20)))"
  val=$(awk 'BEGIN{srand(); print int(rand()*100)}')
  wget -q -O /dev/null --header='Content-Type: application/json' \
    --post-data="{\"device_id\":\"$dev\",\"value\":$val}" "$URL" || true
  sleep "${INTERVAL:-0.5}"
done

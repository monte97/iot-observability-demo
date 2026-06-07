#!/bin/sh
# load-gen/gen.sh - POST continui al gateway, autenticati come "device" (service
# account) via OIDC client-credentials su Keycloak. Il token scade (~5m): lo
# rinfreschiamo prima della scadenza. È il flusso machine-to-machine: i device
# hanno un'identità, non sono client anonimi.
set -e
URL="${TARGET:-http://device-gateway:8080/ingest}"
TOKEN_URL="${TOKEN_URL:-http://keycloak:8080/auth/realms/iot-demo/protocol/openid-connect/token}"
CLIENT_ID="${CLIENT_ID:-iot-device}"
CLIENT_SECRET="${CLIENT_SECRET:-device-secret}"

get_token() {
  resp=$(wget -qO- --header='Content-Type: application/x-www-form-urlencoded' \
    --post-data="grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}" \
    "$TOKEN_URL" 2>/dev/null || true)
  echo "$resp" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p'
}

# Attende che Keycloak sia pronto e ottiene il primo token (al primo avvio KC
# impiega ~30s a importare il realm).
TOKEN=""
while [ -z "$TOKEN" ]; do
  TOKEN=$(get_token)
  [ -z "$TOKEN" ] && { echo "load-gen: attendo Keycloak per il token..."; sleep 3; }
done
echo "load-gen: token ottenuto, parto."

i=0
while true; do
  i=$((i + 1))
  # Rinfresca ogni ~200s (400 iterazioni a 0.5s), prima della scadenza (~300s).
  if [ $((i % 400)) -eq 0 ]; then T=$(get_token); [ -n "$T" ] && TOKEN="$T"; fi
  dev="dev-$(printf '%03d' $((i % 20)))"
  val=$(awk 'BEGIN{srand(); print int(rand()*100)}')
  wget -q -O /dev/null --header='Content-Type: application/json' \
    --header="Authorization: Bearer $TOKEN" \
    --post-data="{\"device_id\":\"$dev\",\"value\":$val}" "$URL" || true
  sleep "${INTERVAL:-0.5}"
done

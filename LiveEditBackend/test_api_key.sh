#!/bin/bash
# Usage: ./test_api_key.sh YOUR_NEW_KEY_HERE
KEY="${1:-}"

if [ -z "$KEY" ]; then
  echo "Usage: ./test_api_key.sh YOUR_API_KEY"
  exit 1
fi

echo "Testing key: ${KEY:0:20}..."
echo ""

RESULT=$(curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$KEY" \
  -H 'Content-Type: application/json' \
  -d '{"contents":[{"parts":[{"text":"Reply with only the word: WORKING"}]}]}')

if echo "$RESULT" | grep -q '"text"'; then
  echo "✅ KEY WORKS — this key is on a billed project!"
  echo ""
  echo "Updating .env automatically..."
  sed -i "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=$KEY|" "$(dirname "$0")/.env"
  echo "✅ .env updated. Restart the backend now."
elif echo "$RESULT" | grep -q "limit: 0"; then
  echo "❌ FREE-TIER EXHAUSTED — this is still an AI Studio / free-tier key."
  echo "   You need a key from the GCP project linked to your billing account."
elif echo "$RESULT" | grep -q "API_KEY_INVALID"; then
  echo "❌ INVALID KEY — check you copied the full key without spaces."
elif echo "$RESULT" | grep -q "PERMISSION_DENIED"; then
  echo "❌ PERMISSION DENIED — Generative Language API not enabled on this project."
  echo "   Enable it at: https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com"
else
  echo "❌ UNKNOWN ERROR:"
  echo "$RESULT" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('error',{}).get('message','?')[:300])" 2>/dev/null || echo "$RESULT"
fi

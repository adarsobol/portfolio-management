#!/bin/bash
# Script that waits for the migration endpoint to be deployed, then runs it

set -e

API_URL="https://pmworkplan-1061531245530.us-east4.run.app"
ENDPOINT="/api/admin/migrate-dependencies"
MAX_WAIT=600  # 10 minutes max wait
CHECK_INTERVAL=30  # Check every 30 seconds

echo "⏳ Waiting for migration endpoint to be deployed..."
echo "   (This can take 2-5 minutes after code push)"
echo ""

# Get token from user
if [ -z "$1" ]; then
    echo "Usage: $0 <auth-token>"
    echo ""
    echo "To get your auth token:"
    echo "1. Open https://pmworkplan-1061531245530.us-east4.run.app in your browser"
    echo "2. Open Developer Tools (F12) > Application > Local Storage"
    echo "3. Copy the value of 'portfolio-auth-token'"
    echo ""
    exit 1
fi

TOKEN=$1
ELAPSED=0

while [ $ELAPSED -lt $MAX_WAIT ]; do
    echo -n "Checking endpoint... "
    
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${API_URL}${ENDPOINT}" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${TOKEN}" 2>/dev/null || echo "000")
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo "✅ Endpoint is ready!"
        echo ""
        echo "Running migration..."
        echo ""
        
        RESPONSE=$(curl -s -X POST "${API_URL}${ENDPOINT}" \
          -H "Content-Type: application/json" \
          -H "Authorization: Bearer ${TOKEN}")
        
        echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
        echo ""
        echo "✅ Migration complete!"
        exit 0
        
    elif [ "$HTTP_CODE" = "404" ]; then
        echo "⏳ Not deployed yet (waiting ${CHECK_INTERVAL}s...)"
        sleep $CHECK_INTERVAL
        ELAPSED=$((ELAPSED + CHECK_INTERVAL))
    elif [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
        echo "❌ Authentication failed. Check your token."
        exit 1
    else
        echo "⚠️  Unexpected status: $HTTP_CODE"
        sleep $CHECK_INTERVAL
        ELAPSED=$((ELAPSED + CHECK_INTERVAL))
    fi
done

echo ""
echo "❌ Timeout: Endpoint not available after ${MAX_WAIT} seconds"
echo "   The deployment might still be in progress. Check Cloud Build status."
exit 1

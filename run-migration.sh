#!/bin/bash
# Script to run the dependencies migration endpoint
# Make sure you're logged into the app first to get your auth token

set -e

API_URL="https://pmworkplan-1061531245530.us-east4.run.app"
ENDPOINT="/api/admin/migrate-dependencies"

echo "🔧 Dependencies Migration Tool"
echo "=============================="
echo ""
echo "This will convert all dependencies from old format to JSON."
echo ""

# Check if token is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <auth-token>"
    echo ""
    echo "To get your auth token:"
    echo "1. Open the app in your browser"
    echo "2. Open Developer Tools (F12)"
    echo "3. Go to Application/Storage > Local Storage"
    echo "4. Find 'portfolio-auth-token' and copy its value"
    echo ""
    echo "Then run: $0 <your-token>"
    exit 1
fi

TOKEN=$1

echo "Calling migration endpoint..."
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Status: $HTTP_CODE"
echo ""
echo "Response:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"

if [ "$HTTP_CODE" = "200" ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Verify the dependencies column in Google Sheets contains JSON arrays"
    echo "2. The main fix is already deployed - users should now be able to access initiatives"
else
    echo ""
    echo "❌ Migration failed. Check the error message above."
    exit 1
fi

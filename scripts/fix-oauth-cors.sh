#!/bin/bash

# Script to help fix Google OAuth CORS issues
# This script provides instructions and can help update Google OAuth settings

set -e

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null)}"
SERVICE_NAME="${2:-portfolio-manager}"
REGION="${3:-us-central1}"

if [ -z "$PROJECT_ID" ]; then
  echo "❌ Error: PROJECT_ID not provided and couldn't detect from gcloud config"
  echo "Usage: $0 [PROJECT_ID] [SERVICE_NAME] [REGION]"
  exit 1
fi

echo "🔧 Google OAuth CORS Fix Helper"
echo "================================="
echo ""

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
  --region=$REGION \
  --project=$PROJECT_ID \
  --format='value(status.url)' 2>/dev/null || echo "")

if [ -z "$SERVICE_URL" ]; then
  echo "⚠️  Warning: Could not get service URL. Make sure the service exists."
  echo "   Service: $SERVICE_NAME"
  echo "   Region: $REGION"
  echo "   Project: $PROJECT_ID"
  echo ""
  read -p "Enter your Cloud Run service URL manually: " SERVICE_URL
fi

echo "📋 Configuration Details:"
echo "   Project ID: $PROJECT_ID"
echo "   Service URL: $SERVICE_URL"
echo "   OAuth Client ID: 1061531245530-an68apdgo6kmkvapvng0gc1g00nohc5v"
echo ""

echo "🔐 To fix Google OAuth CORS issues:"
echo ""
echo "1. Go to Google Cloud Console:"
echo "   https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"
echo ""
echo "2. Find OAuth 2.0 Client ID:"
echo "   1061531245530-an68apdgo6kmkvapvng0gc1g00nohc5v"
echo ""
echo "3. Click 'EDIT' and add the following:"
echo ""
echo "   Authorized JavaScript origins:"
echo "   ✅ $SERVICE_URL"
echo ""
echo "   Authorized redirect URIs:"
echo "   ✅ $SERVICE_URL"
echo ""
echo "4. Click 'SAVE'"
echo ""
echo "5. Wait 1-2 minutes for changes to propagate"
echo ""

# Also update CORS secret if needed
echo "📝 Also updating CORS_ALLOWED_ORIGINS secret..."
if gcloud secrets describe portfolio-cors-origins --project=$PROJECT_ID &>/dev/null; then
  echo -n "$SERVICE_URL" | gcloud secrets versions add portfolio-cors-origins \
    --data-file=- \
    --project=$PROJECT_ID 2>/dev/null && \
    echo "✅ CORS secret updated successfully" || \
    echo "⚠️  Could not update CORS secret (may need manual update)"
else
  echo "⚠️  CORS secret 'portfolio-cors-origins' not found. Creating..."
  echo -n "$SERVICE_URL" | gcloud secrets create portfolio-cors-origins \
    --data-file=- \
    --project=$PROJECT_ID 2>/dev/null && \
    echo "✅ CORS secret created successfully" || \
    echo "❌ Could not create CORS secret"
fi

echo ""
echo "✅ Next steps:"
echo "   1. Update Google OAuth settings (see instructions above)"
echo "   2. Restart Cloud Run service if needed:"
echo "      gcloud run services update $SERVICE_NAME --region=$REGION --project=$PROJECT_ID"
echo "   3. Test login at: $SERVICE_URL"
echo ""


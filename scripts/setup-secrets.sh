#!/bin/bash
# Setup script for Google Secret Manager
# This script helps create and configure secrets for Cloud Run deployment

set -e

PROJECT_ID=${1:-$(gcloud config get-value project)}
REGION=${2:-us-central1}

if [ -z "$PROJECT_ID" ]; then
  echo "Error: PROJECT_ID is required"
  echo "Usage: $0 [PROJECT_ID] [REGION]"
  exit 1
fi

echo "Setting up secrets for project: $PROJECT_ID"
echo "Region: $REGION"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
  echo "Error: gcloud CLI is not installed"
  exit 1
fi

# Enable Secret Manager API
echo "Enabling Secret Manager API..."
gcloud services enable secretmanager.googleapis.com --project=$PROJECT_ID

# Create JWT Secret
echo ""
echo "Creating JWT secret..."
if gcloud secrets describe portfolio-jwt-secret --project=$PROJECT_ID &> /dev/null; then
  echo "Secret 'portfolio-jwt-secret' already exists. Skipping creation."
  read -p "Do you want to update it? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    openssl rand -base64 32 | gcloud secrets versions add portfolio-jwt-secret \
      --data-file=- \
      --project=$PROJECT_ID
  fi
else
  openssl rand -base64 32 | gcloud secrets create portfolio-jwt-secret \
    --data-file=- \
    --replication-policy="automatic" \
    --project=$PROJECT_ID
fi

# Create CORS Origins Secret
echo ""
echo "Creating CORS origins secret..."
read -p "Enter allowed CORS origins (comma-separated, e.g., https://example.com,https://www.example.com): " CORS_ORIGINS

if gcloud secrets describe portfolio-cors-origins --project=$PROJECT_ID &> /dev/null; then
  echo "Secret 'portfolio-cors-origins' already exists. Updating..."
  echo -n "$CORS_ORIGINS" | gcloud secrets versions add portfolio-cors-origins \
    --data-file=- \
    --project=$PROJECT_ID
else
  echo -n "$CORS_ORIGINS" | gcloud secrets create portfolio-cors-origins \
    --data-file=- \
    --replication-policy="automatic" \
    --project=$PROJECT_ID
fi

# Create Google OAuth Client ID Secret (Optional)
echo ""
read -p "Do you want to create Google OAuth Client ID secret? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  read -p "Enter Google OAuth Client ID: " GOOGLE_CLIENT_ID
  
  if gcloud secrets describe portfolio-google-client-id --project=$PROJECT_ID &> /dev/null; then
    echo "Secret 'portfolio-google-client-id' already exists. Updating..."
    echo -n "$GOOGLE_CLIENT_ID" | gcloud secrets versions add portfolio-google-client-id \
      --data-file=- \
      --project=$PROJECT_ID
  else
    echo -n "$GOOGLE_CLIENT_ID" | gcloud secrets create portfolio-google-client-id \
      --data-file=- \
      --replication-policy="automatic" \
      --project=$PROJECT_ID
  fi
fi

# Grant access to service account
echo ""
echo "Granting secret access to service account..."
SERVICE_ACCOUNT="portfolio-manager@${PROJECT_ID}.iam.gserviceaccount.com"

for SECRET in portfolio-jwt-secret portfolio-cors-origins portfolio-google-client-id; do
  if gcloud secrets describe $SECRET --project=$PROJECT_ID &> /dev/null; then
    gcloud secrets add-iam-policy-binding $SECRET \
      --member="serviceAccount:${SERVICE_ACCOUNT}" \
      --role="roles/secretmanager.secretAccessor" \
      --project=$PROJECT_ID || echo "Warning: Could not grant access to $SECRET (service account may not exist yet)"
  fi
done

echo ""
echo "✅ Secret setup complete!"
echo ""
echo "Next steps:"
echo "1. Create service account: gcloud iam service-accounts create portfolio-manager --display-name=\"Portfolio Manager\""
echo "2. Deploy to Cloud Run with secrets configured"
echo "3. Verify secrets are accessible: gcloud run services describe portfolio-manager --region=$REGION"


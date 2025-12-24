#!/bin/bash
# Frontend deployment script for Cloud Storage + CDN
# This script builds the frontend and deploys it to Google Cloud Storage

set -e

PROJECT_ID=${1:-$(gcloud config get-value project)}
REGION=${2:-us-central1}
BUCKET_NAME=${3:-portfolio-manager-frontend}
API_ENDPOINT=${4:-""}

if [ -z "$PROJECT_ID" ]; then
  echo "Error: PROJECT_ID is required"
  echo "Usage: $0 [PROJECT_ID] [REGION] [BUCKET_NAME] [API_ENDPOINT]"
  echo ""
  echo "Example:"
  echo "  $0 my-project us-central1 portfolio-manager-frontend https://api.example.com"
  exit 1
fi

echo "Deploying frontend to $PROJECT_ID"
echo "Bucket: $BUCKET_NAME"
echo "Region: $REGION"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
  echo "Error: gcloud CLI is not installed"
  exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
  echo "Error: Node.js is not installed"
  exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
  echo "Error: npm is not installed"
  exit 1
fi

# Set API endpoint if provided
if [ -n "$API_ENDPOINT" ]; then
  echo "Setting VITE_API_ENDPOINT=$API_ENDPOINT"
  export VITE_API_ENDPOINT=$API_ENDPOINT
fi

# Build frontend
echo "Building frontend..."
npm run build

if [ ! -d "dist" ]; then
  echo "Error: Build failed - dist directory not found"
  exit 1
fi

# Enable Storage API
echo ""
echo "Enabling Storage API..."
gcloud services enable storage-api.googleapis.com --project=$PROJECT_ID

# Create bucket if it doesn't exist
echo ""
if gsutil ls -b gs://${BUCKET_NAME} &> /dev/null; then
  echo "Bucket $BUCKET_NAME already exists"
else
  echo "Creating bucket $BUCKET_NAME..."
  gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION gs://${BUCKET_NAME}
fi

# Set bucket permissions
echo ""
echo "Setting bucket permissions..."
gsutil iam ch allUsers:objectViewer gs://${BUCKET_NAME}

# Enable website hosting
echo ""
echo "Configuring bucket for website hosting..."
gsutil web set -m index.html -e index.html gs://${BUCKET_NAME}

# Upload files
echo ""
echo "Uploading files to bucket..."
gsutil -m cp -r dist/* gs://${BUCKET_NAME}/

# Set cache control for static assets
echo ""
echo "Setting cache headers..."
gsutil -m setmeta -h "Cache-Control:public, max-age=31536000" gs://${BUCKET_NAME}/assets/*.js
gsutil -m setmeta -h "Cache-Control:public, max-age=31536000" gs://${BUCKET_NAME}/assets/*.css
gsutil -m setmeta -h "Cache-Control:public, max-age=3600" gs://${BUCKET_NAME}/*.html

# Create CORS configuration
echo ""
echo "Setting CORS configuration..."
cat > /tmp/cors.json << EOF
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD"],
    "responseHeader": ["Content-Type", "Content-Length"],
    "maxAgeSeconds": 3600
  }
]
EOF

gsutil cors set /tmp/cors.json gs://${BUCKET_NAME}
rm /tmp/cors.json

# Get bucket URL
BUCKET_URL="https://storage.googleapis.com/${BUCKET_NAME}/index.html"
WEBSITE_URL="http://${BUCKET_NAME}.storage.googleapis.com"

echo ""
echo "✅ Frontend deployment complete!"
echo ""
echo "Bucket URL: $BUCKET_URL"
echo "Website URL: $WEBSITE_URL"
echo ""
echo "To set up Cloud CDN:"
echo "1. Create backend bucket: gcloud compute backend-buckets create ${BUCKET_NAME}-backend --gcs-bucket-name=${BUCKET_NAME}"
echo "2. Create URL map: gcloud compute url-maps create ${BUCKET_NAME}-map --default-backend-bucket=${BUCKET_NAME}-backend"
echo "3. Create HTTPS proxy: gcloud compute target-https-proxies create ${BUCKET_NAME}-proxy --url-map=${BUCKET_NAME}-map --ssl-certificates=YOUR_SSL_CERT"
echo "4. Create forwarding rule: gcloud compute forwarding-rules create ${BUCKET_NAME}-rule --global --target-https-proxy=${BUCKET_NAME}-proxy --ports=443"


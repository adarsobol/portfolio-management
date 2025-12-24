#!/bin/bash
# Build and push the Docker image to Google Container Registry
# This must be done BEFORE deploying to Cloud Run

set -e

PROJECT_ID="research-modeling-vertex-ai"
SERVICE_NAME="portfolio-manager"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest"

echo "🐳 Building and pushing Docker image..."
echo "Project: $PROJECT_ID"
echo "Image: $IMAGE_NAME"
echo ""

# Check gcloud
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI not found. Please install it first:"
    echo "   brew install google-cloud-sdk"
    exit 1
fi

# Set project
gcloud config set project $PROJECT_ID

# Build and push image
echo "Building Docker image (this may take 5-10 minutes)..."
gcloud builds submit --tag $IMAGE_NAME --project=$PROJECT_ID

echo ""
echo "✅ Image built and pushed successfully!"
echo ""
echo "Image URL: $IMAGE_NAME"
echo ""
echo "Now you can:"
echo "1. Deploy via Cloud Run console using: $IMAGE_NAME"
echo "2. Or run: ./QUICK_DEPLOY.sh (which will build and deploy)"
echo ""


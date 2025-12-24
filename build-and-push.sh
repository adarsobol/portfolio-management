#!/bin/bash
# Build and push Docker image to Google Container Registry
# Run this script to create the image that Cloud Run needs

set -e

PROJECT_ID="research-modeling-vertex-ai"
IMAGE_NAME="gcr.io/${PROJECT_ID}/portfolio-manager:latest"

echo "🐳 Building Docker image for Cloud Run"
echo "========================================"
echo "Project: $PROJECT_ID"
echo "Image: $IMAGE_NAME"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: gcloud CLI is not installed"
    echo ""
    echo "Please install it first:"
    echo "  brew install google-cloud-sdk"
    echo ""
    echo "Or download from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Set project
echo "Setting project to: $PROJECT_ID"
gcloud config set project $PROJECT_ID

# Check authentication
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo ""
    echo "🔐 Please authenticate..."
    gcloud auth login
    gcloud auth application-default login
fi

# Enable Cloud Build API if needed
echo ""
echo "Enabling Cloud Build API..."
gcloud services enable cloudbuild.googleapis.com --project=$PROJECT_ID

# Build and push
echo ""
echo "Building Docker image..."
echo "This will:"
echo "  1. Build your Docker container (5-10 minutes)"
echo "  2. Push it to Google Container Registry"
echo ""
echo "Starting build..."

gcloud builds submit --tag $IMAGE_NAME --project=$PROJECT_ID

echo ""
echo "✅ SUCCESS! Image built and pushed!"
echo ""
echo "Image URL: $IMAGE_NAME"
echo ""
echo "Now you can:"
echo "  1. Go to Cloud Run console"
echo "  2. Edit your 'portfoliowp' service"
echo "  3. Use image: $IMAGE_NAME"
echo "  4. Deploy!"
echo ""
echo "Or run: ./QUICK_DEPLOY.sh (to build and deploy automatically)"
echo ""


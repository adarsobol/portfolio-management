#!/bin/bash
# Build Docker image for Cloud Run
# This script sets up gcloud and builds your container image

set -e

# Add gcloud to PATH
export PATH="$HOME/google-cloud-sdk/bin:$PATH"
export CLOUDSDK_PYTHON=$(which python3)

PROJECT_ID="research-modeling-vertex-ai"
IMAGE_NAME="gcr.io/${PROJECT_ID}/portfolio-manager:latest"

echo "🐳 Building Docker Image for Cloud Run"
echo "======================================="
echo "Project: $PROJECT_ID"
echo "Image: $IMAGE_NAME"
echo ""

# Check if gcloud is available
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud not found. Please install it first:"
    echo "   curl https://sdk.cloud.google.com | bash"
    exit 1
fi

# Set project
echo "Setting project to: $PROJECT_ID"
gcloud config set project $PROJECT_ID

# Check authentication
echo ""
echo "Checking authentication..."
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "🔐 You need to authenticate..."
    echo "This will open a browser window for you to sign in."
    echo ""
    read -p "Press Enter to continue with authentication..."
    gcloud auth login
    gcloud auth application-default login
else
    ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -1)
    echo "✅ Authenticated as: $ACCOUNT"
fi

# Enable Cloud Build API
echo ""
echo "Enabling Cloud Build API..."
gcloud services enable cloudbuild.googleapis.com --project=$PROJECT_ID

# Build and push
echo ""
echo "Building Docker image..."
echo "This will take 5-10 minutes..."
echo ""
cd /Users/adar.sobol/portfolio-management

gcloud builds submit --tag $IMAGE_NAME --project=$PROJECT_ID

echo ""
echo "✅ SUCCESS! Image built and pushed!"
echo ""
echo "Image URL: $IMAGE_NAME"
echo ""
echo "Now you can deploy it in Cloud Run console using this image URL."
echo ""


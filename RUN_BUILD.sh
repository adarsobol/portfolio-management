#!/bin/bash
# Run this script to build your Docker image
# It will handle authentication and building

export PATH="$HOME/google-cloud-sdk/bin:$PATH"
export CLOUDSDK_PYTHON=$(which python3)

cd /Users/adar.sobol/portfolio-management

echo "🐳 Building Docker Image"
echo "========================"
echo ""

# Set project
gcloud config set project research-modeling-vertex-ai

# Authenticate if needed
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "🔐 Please authenticate (this will open a browser)..."
    gcloud auth login
    gcloud auth application-default login
fi

# Enable API
echo ""
echo "Enabling Cloud Build API..."
gcloud services enable cloudbuild.googleapis.com --project=research-modeling-vertex-ai

# Build
echo ""
echo "Building Docker image (5-10 minutes)..."
gcloud builds submit --tag gcr.io/research-modeling-vertex-ai/portfolio-manager:latest --project=research-modeling-vertex-ai

echo ""
echo "✅ Done! Image is at: gcr.io/research-modeling-vertex-ai/portfolio-manager:latest"
echo "You can now deploy it in Cloud Run console."


#!/bin/bash
# Deployment script for Cloud Run
# This script builds and deploys the application to Google Cloud Run

set -e

PROJECT_ID=${1:-$(gcloud config get-value project)}
REGION=${2:-us-central1}
SERVICE_NAME=${3:-portfolio-manager}
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

if [ -z "$PROJECT_ID" ]; then
  echo "Error: PROJECT_ID is required"
  echo "Usage: $0 [PROJECT_ID] [REGION] [SERVICE_NAME]"
  exit 1
fi

echo "Deploying $SERVICE_NAME to $PROJECT_ID in region $REGION"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
  echo "Error: gcloud CLI is not installed"
  exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
  echo "Error: Docker is not installed"
  exit 1
fi

# Enable required APIs
echo "Enabling required APIs..."
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  --project=$PROJECT_ID

# Build and push image using Cloud Build
echo ""
echo "Building and pushing Docker image..."
gcloud builds submit --tag ${IMAGE_NAME}:latest --project=$PROJECT_ID

# Get latest image SHA
IMAGE_SHA=$(gcloud container images describe ${IMAGE_NAME}:latest --format='value(image_summary.fully_qualified_digest)' --project=$PROJECT_ID 2>/dev/null || echo "")

if [ -z "$IMAGE_SHA" ]; then
  echo "Warning: Could not get image SHA, using 'latest' tag"
  IMAGE_TAG="latest"
else
  IMAGE_TAG=$(echo $IMAGE_SHA | cut -d'@' -f2 | cut -c1-12)
  echo "Tagging image with SHA: $IMAGE_TAG"
  gcloud container images add-tag ${IMAGE_NAME}:latest ${IMAGE_NAME}:${IMAGE_TAG} --project=$PROJECT_ID
fi

# Deploy to Cloud Run
echo ""
echo "Deploying to Cloud Run..."

# Check if service exists
if gcloud run services describe $SERVICE_NAME --region=$REGION --project=$PROJECT_ID &> /dev/null; then
  echo "Service exists, updating..."
  DEPLOY_CMD="gcloud run services update $SERVICE_NAME"
else
  echo "Service does not exist, creating..."
  DEPLOY_CMD="gcloud run deploy $SERVICE_NAME"
fi

$DEPLOY_CMD \
  --image ${IMAGE_NAME}:latest \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 10 \
  --timeout 300 \
  --session-affinity \
  --set-env-vars "NODE_ENV=production,PORT=8080,SERVE_STATIC=true,GCS_BUCKET_NAME=portfolio-manager-data,GCS_PROJECT_ID=${PROJECT_ID}" \
  --set-secrets "JWT_SECRET=portfolio-jwt-secret:latest,CORS_ALLOWED_ORIGINS=portfolio-cors-origins:latest" \
  --service-account portfolio-manager@${PROJECT_ID}.iam.gserviceaccount.com \
  --project=$PROJECT_ID

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)' --project=$PROJECT_ID)

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Service URL: $SERVICE_URL"
echo ""
echo "Test health endpoint:"
echo "curl $SERVICE_URL/api/sheets/health"
echo ""
echo "View logs:"
echo "gcloud run services logs read $SERVICE_NAME --region=$REGION --project=$PROJECT_ID"


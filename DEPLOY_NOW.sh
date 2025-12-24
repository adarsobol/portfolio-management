#!/bin/bash
# Complete deployment script for Cloud Run
# This script will guide you through the entire deployment process

set -e

echo "🚀 Portfolio Manager - Cloud Run Deployment"
echo "=============================================="
echo ""

# Check for gcloud CLI
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI is not installed."
    echo ""
    echo "Please install it first:"
    echo "  macOS: brew install google-cloud-sdk"
    echo "  Or download from: https://cloud.google.com/sdk/docs/install"
    echo ""
    echo "After installing, run this script again."
    exit 1
fi

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed."
    echo ""
    echo "Please install Docker Desktop from: https://www.docker.com/products/docker-desktop"
    echo "After installing, run this script again."
    exit 1
fi

# Get project ID (use provided or from gcloud config)
PROJECT_ID=${1:-"research-modeling-vertex-ai"}

# Set project in gcloud config
gcloud config set project $PROJECT_ID 2>/dev/null || true

echo ""
echo "✅ Using project: $PROJECT_ID"
echo ""

# Authenticate
echo "🔐 Authentication"
echo "----------------"
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "Please authenticate with Google Cloud..."
    gcloud auth login
    gcloud auth application-default login
else
    echo "✅ Already authenticated"
fi

echo ""
echo "📦 Step 1: Setting up infrastructure..."
echo "----------------------------------------"

# Enable APIs
echo "Enabling required APIs..."
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  storage-api.googleapis.com \
  storage-component.googleapis.com \
  --project=$PROJECT_ID

# Create service account if it doesn't exist
SERVICE_ACCOUNT="portfolio-manager@${PROJECT_ID}.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe $SERVICE_ACCOUNT --project=$PROJECT_ID &> /dev/null; then
    echo "Creating service account..."
    gcloud iam service-accounts create portfolio-manager \
      --display-name="Portfolio Manager Service Account" \
      --project=$PROJECT_ID
    
    echo "Granting permissions..."
    gcloud projects add-iam-policy-binding $PROJECT_ID \
      --member="serviceAccount:${SERVICE_ACCOUNT}" \
      --role="roles/secretmanager.secretAccessor" \
      --project=$PROJECT_ID
    
    gcloud projects add-iam-policy-binding $PROJECT_ID \
      --member="serviceAccount:${SERVICE_ACCOUNT}" \
      --role="roles/storage.objectAdmin" \
      --project=$PROJECT_ID
else
    echo "✅ Service account already exists"
fi

# Create GCS bucket if it doesn't exist
BUCKET_NAME="portfolio-manager-data"
if ! gsutil ls -b gs://${BUCKET_NAME} &> /dev/null; then
    echo "Creating GCS bucket..."
    gsutil mb -p $PROJECT_ID -c STANDARD -l us-central1 gs://${BUCKET_NAME}
    gsutil iam ch serviceAccount:${SERVICE_ACCOUNT}:objectAdmin gs://${BUCKET_NAME}
else
    echo "✅ GCS bucket already exists"
fi

echo ""
echo "🔐 Step 2: Setting up secrets..."
echo "---------------------------------"

# Create JWT secret if it doesn't exist
if ! gcloud secrets describe portfolio-jwt-secret --project=$PROJECT_ID &> /dev/null; then
    echo "Creating JWT secret..."
    openssl rand -base64 32 | gcloud secrets create portfolio-jwt-secret \
      --data-file=- \
      --replication-policy="automatic" \
      --project=$PROJECT_ID
    
    gcloud secrets add-iam-policy-binding portfolio-jwt-secret \
      --member="serviceAccount:${SERVICE_ACCOUNT}" \
      --role="roles/secretmanager.secretAccessor" \
      --project=$PROJECT_ID
else
    echo "✅ JWT secret already exists"
fi

# Create CORS origins secret
if ! gcloud secrets describe portfolio-cors-origins --project=$PROJECT_ID &> /dev/null; then
    echo ""
    echo "CORS Configuration:"
    echo "Enter allowed CORS origins (comma-separated)"
    echo "Example: https://example.com,https://www.example.com"
    echo "For testing, you can use: *"
    read -p "CORS origins: " CORS_ORIGINS
    
    if [ -z "$CORS_ORIGINS" ]; then
        CORS_ORIGINS="*"
        echo "Using default: * (you can update this later with your actual domain)"
    fi
    
    echo -n "$CORS_ORIGINS" | gcloud secrets create portfolio-cors-origins \
      --data-file=- \
      --replication-policy="automatic" \
      --project=$PROJECT_ID
    
    gcloud secrets add-iam-policy-binding portfolio-cors-origins \
      --member="serviceAccount:${SERVICE_ACCOUNT}" \
      --role="roles/secretmanager.secretAccessor" \
      --project=$PROJECT_ID
else
    echo "✅ CORS origins secret already exists"
fi

echo ""
echo "🐳 Step 3: Building and deploying container..."
echo "-----------------------------------------------"

REGION="us-central1"
SERVICE_NAME="portfolio-manager"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Build and push Docker image
echo "Building Docker image..."
gcloud builds submit --tag ${IMAGE_NAME}:latest --project=$PROJECT_ID

# Deploy to Cloud Run
echo ""
echo "Deploying to Cloud Run..."

if gcloud run services describe $SERVICE_NAME --region=$REGION --project=$PROJECT_ID &> /dev/null; then
    echo "Updating existing service..."
    DEPLOY_CMD="gcloud run services update $SERVICE_NAME"
else
    echo "Creating new service..."
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
  --set-env-vars "NODE_ENV=production,PORT=8080,SERVE_STATIC=true,GCS_BUCKET_NAME=${BUCKET_NAME},GCS_PROJECT_ID=${PROJECT_ID}" \
  --set-secrets "JWT_SECRET=portfolio-jwt-secret:latest,CORS_ALLOWED_ORIGINS=portfolio-cors-origins:latest" \
  --service-account ${SERVICE_ACCOUNT} \
  --project=$PROJECT_ID

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)' --project=$PROJECT_ID)

echo ""
echo "✅ Deployment complete!"
echo "======================"
echo ""
echo "🌐 Your app is live at:"
echo "   $SERVICE_URL"
echo ""
echo "🧪 Test the health endpoint:"
echo "   curl $SERVICE_URL/api/sheets/health"
echo ""
echo "📊 View logs:"
echo "   gcloud run services logs read $SERVICE_NAME --region=$REGION --project=$PROJECT_ID"
echo ""
echo "💡 Next steps:"
echo "   1. Update CORS origins secret with your actual service URL if needed"
echo "   2. Open $SERVICE_URL in your browser"
echo ""


#!/bin/bash
# Quick deployment script - Run this after gcloud is installed
# Project: research-modeling-vertex-ai

set -e

PROJECT_ID="research-modeling-vertex-ai"
REGION="us-central1"
SERVICE_NAME="portfolio-manager"
BUCKET_NAME="portfolio-manager-data"
SERVICE_ACCOUNT="portfolio-manager@${PROJECT_ID}.iam.gserviceaccount.com"

echo "🚀 Deploying Portfolio Manager to Cloud Run"
echo "Project: $PROJECT_ID"
echo ""

# Check gcloud
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI not found. Please install it first:"
    echo "   brew install google-cloud-sdk"
    echo "   Or: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Set project
gcloud config set project $PROJECT_ID

# Authenticate if needed
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "🔐 Please authenticate..."
    gcloud auth login
    gcloud auth application-default login
fi

echo ""
echo "📦 Step 1: Enabling APIs..."
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  storage-api.googleapis.com \
  storage-component.googleapis.com \
  --project=$PROJECT_ID

echo ""
echo "👤 Step 2: Creating service account..."
if ! gcloud iam service-accounts describe $SERVICE_ACCOUNT --project=$PROJECT_ID &> /dev/null; then
    gcloud iam service-accounts create portfolio-manager \
      --display-name="Portfolio Manager Service Account" \
      --project=$PROJECT_ID
    
    gcloud projects add-iam-policy-binding $PROJECT_ID \
      --member="serviceAccount:${SERVICE_ACCOUNT}" \
      --role="roles/secretmanager.secretAccessor" \
      --project=$PROJECT_ID
    
    gcloud projects add-iam-policy-binding $PROJECT_ID \
      --member="serviceAccount:${SERVICE_ACCOUNT}" \
      --role="roles/storage.objectAdmin" \
      --project=$PROJECT_ID
    echo "✅ Service account created"
else
    echo "✅ Service account already exists"
fi

echo ""
echo "🪣 Step 3: Creating GCS bucket..."
if ! gsutil ls -b gs://${BUCKET_NAME} &> /dev/null; then
    gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION gs://${BUCKET_NAME}
    gsutil iam ch serviceAccount:${SERVICE_ACCOUNT}:objectAdmin gs://${BUCKET_NAME}
    echo "✅ Bucket created"
else
    echo "✅ Bucket already exists"
fi

echo ""
echo "🔐 Step 4: Setting up secrets..."

# JWT Secret
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
    echo "✅ JWT secret created"
else
    echo "✅ JWT secret already exists"
fi

# CORS Origins
if ! gcloud secrets describe portfolio-cors-origins --project=$PROJECT_ID &> /dev/null; then
    echo "Creating CORS origins secret (using * for now)..."
    echo -n "*" | gcloud secrets create portfolio-cors-origins \
      --data-file=- \
      --replication-policy="automatic" \
      --project=$PROJECT_ID
    
    gcloud secrets add-iam-policy-binding portfolio-cors-origins \
      --member="serviceAccount:${SERVICE_ACCOUNT}" \
      --role="roles/secretmanager.secretAccessor" \
      --project=$PROJECT_ID
    echo "✅ CORS secret created (using * - update later with your domain)"
else
    echo "✅ CORS secret already exists"
fi

echo ""
echo "🐳 Step 5: Building and deploying container..."
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "Building Docker image (this may take a few minutes)..."
gcloud builds submit --tag ${IMAGE_NAME}:latest --project=$PROJECT_ID

echo ""
echo "Deploying to Cloud Run..."
if gcloud run services describe $SERVICE_NAME --region=$REGION --project=$PROJECT_ID &> /dev/null; then
    echo "Updating existing service..."
    gcloud run services update $SERVICE_NAME \
      --image ${IMAGE_NAME}:latest \
      --region $REGION \
      --project=$PROJECT_ID
else
    echo "Creating new service..."
    gcloud run deploy $SERVICE_NAME \
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
fi

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)' --project=$PROJECT_ID)

echo ""
echo "✅ Deployment complete!"
echo "======================"
echo ""
echo "🌐 Your app is live at:"
echo "   $SERVICE_URL"
echo ""
echo "🧪 Test it:"
echo "   curl $SERVICE_URL/api/sheets/health"
echo ""
echo "📊 View logs:"
echo "   gcloud run services logs read $SERVICE_NAME --region=$REGION --project=$PROJECT_ID"
echo ""


#!/bin/bash
# ============================================
# Complete GCS Backup Setup Script
# ============================================
# This script sets up the complete backup infrastructure:
# 1. Creates bucket if it doesn't exist
# 2. Enables object versioning
# 3. Applies lifecycle policies
# 4. Deploys backup Cloud Function
# 5. Sets up Cloud Scheduler for daily backups
#
# Prerequisites:
# - Google Cloud SDK installed and authenticated
# - GCS_BUCKET_NAME and GCS_PROJECT_ID environment variables set
# - Or pass them as arguments
#
# Usage:
#   ./scripts/setup-gcs-backup-complete.sh [bucket-name] [project-id]
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get configuration
BUCKET_NAME="${1:-${GCS_BUCKET_NAME}}"
PROJECT_ID="${2:-${GCS_PROJECT_ID}}"
REGION="${3:-us-central1}"

if [ -z "$BUCKET_NAME" ] || [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: Bucket name and project ID are required${NC}"
    echo "Usage: $0 [bucket-name] [project-id] [region]"
    echo "Or set environment variables: GCS_BUCKET_NAME and GCS_PROJECT_ID"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIFECYCLE_CONFIG="$SCRIPT_DIR/gcs-lifecycle-config.json"

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}Complete GCS Backup Setup${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo -e "Bucket: ${GREEN}gs://${BUCKET_NAME}${NC}"
echo -e "Project: ${GREEN}${PROJECT_ID}${NC}"
echo -e "Region: ${GREEN}${REGION}${NC}"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed${NC}"
    echo "Install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Set project
gcloud config set project "$PROJECT_ID" --quiet

# Enable required APIs
echo -e "${YELLOW}Enabling required APIs...${NC}"
gcloud services enable cloudfunctions.googleapis.com --quiet 2>/dev/null || true
gcloud services enable cloudbuild.googleapis.com --quiet 2>/dev/null || true
gcloud services enable cloudscheduler.googleapis.com --quiet 2>/dev/null || true
gcloud services enable storage-api.googleapis.com --quiet 2>/dev/null || true
echo -e "${GREEN}✓ APIs enabled${NC}"

# ============================================
# Step 1: Create Bucket (if needed)
# ============================================
echo -e "${YELLOW}Step 1: Checking bucket...${NC}"

if gsutil ls -b "gs://${BUCKET_NAME}" &> /dev/null; then
    echo -e "${GREEN}✓ Bucket already exists${NC}"
else
    echo "Creating bucket..."
    gsutil mb -p "$PROJECT_ID" -l "$REGION" -c STANDARD "gs://${BUCKET_NAME}"
    echo -e "${GREEN}✓ Bucket created${NC}"
fi

# ============================================
# Step 2: Enable Object Versioning
# ============================================
echo ""
echo -e "${YELLOW}Step 2: Enabling object versioning...${NC}"

gsutil versioning set on "gs://${BUCKET_NAME}"

VERSIONING_STATUS=$(gsutil versioning get "gs://${BUCKET_NAME}" | grep -o "Enabled\|Suspended")
if [ "$VERSIONING_STATUS" == "Enabled" ]; then
    echo -e "${GREEN}✓ Object versioning enabled${NC}"
else
    echo -e "${RED}✗ Failed to enable versioning${NC}"
    exit 1
fi

# ============================================
# Step 3: Apply Lifecycle Policy
# ============================================
echo ""
echo -e "${YELLOW}Step 3: Applying lifecycle policy...${NC}"

if [ ! -f "$LIFECYCLE_CONFIG" ]; then
    echo "Creating lifecycle config..."
    cat > "$LIFECYCLE_CONFIG" << 'EOF'
{
  "lifecycle": {
    "rule": [
      {
        "action": {
          "type": "Delete"
        },
        "condition": {
          "age": 365,
          "isLive": false
        }
      },
      {
        "action": {
          "type": "SetStorageClass",
          "storageClass": "NEARLINE"
        },
        "condition": {
          "age": 30,
          "isLive": false,
          "matchesStorageClass": ["STANDARD"]
        }
      },
      {
        "action": {
          "type": "SetStorageClass",
          "storageClass": "COLDLINE"
        },
        "condition": {
          "age": 90,
          "isLive": false,
          "matchesStorageClass": ["NEARLINE"]
        }
      }
    ]
  }
}
EOF
fi

gsutil lifecycle set "$LIFECYCLE_CONFIG" "gs://${BUCKET_NAME}"
echo -e "${GREEN}✓ Lifecycle policy applied${NC}"

# ============================================
# Step 4: Create Backup Folder Structure
# ============================================
echo ""
echo -e "${YELLOW}Step 4: Creating backup folder structure...${NC}"

echo '{"created": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'", "type": "backup_directory_marker"}' | \
    gsutil cp - "gs://${BUCKET_NAME}/backups/.metadata.json" 2>/dev/null || true

echo -e "${GREEN}✓ Backup folder structure ready${NC}"

# ============================================
# Step 5: Deploy Backup Cloud Function
# ============================================
echo ""
echo -e "${YELLOW}Step 5: Deploying backup Cloud Function...${NC}"

cd "$SCRIPT_DIR/../functions/backup"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Build
echo "Building function..."
npm run build

# Deploy function
echo "Deploying function..."
gcloud functions deploy backup-daily \
    --gen2 \
    --runtime=nodejs20 \
    --trigger-http \
    --allow-unauthenticated=false \
    --entry-point=backupDaily \
    --source=. \
    --region="$REGION" \
    --set-env-vars="GCS_BUCKET_NAME=${BUCKET_NAME},GCS_PROJECT_ID=${PROJECT_ID}" \
    --service-account="${PROJECT_ID}@appspot.gserviceaccount.com" \
    --quiet

FUNCTION_URL=$(gcloud functions describe backup-daily --gen2 --region="$REGION" --format="value(serviceConfig.uri)" 2>/dev/null || echo "")

if [ -n "$FUNCTION_URL" ]; then
    echo -e "${GREEN}✓ Cloud Function deployed${NC}"
    echo "  URL: $FUNCTION_URL"
else
    echo -e "${YELLOW}⚠ Function deployed but URL not retrieved${NC}"
fi

cd - > /dev/null

# ============================================
# Step 6: Set Up Cloud Scheduler
# ============================================
echo ""
echo -e "${YELLOW}Step 6: Setting up Cloud Scheduler...${NC}"

# Get service account for scheduler
SERVICE_ACCOUNT="${PROJECT_ID}@appspot.gserviceaccount.com"

# Check if scheduler job already exists
if gcloud scheduler jobs describe backup-daily-job --location="$REGION" &> /dev/null; then
    echo "Scheduler job already exists, updating..."
    gcloud scheduler jobs update http backup-daily-job \
        --location="$REGION" \
        --schedule="0 2 * * *" \
        --uri="$FUNCTION_URL" \
        --http-method=POST \
        --oidc-service-account-email="$SERVICE_ACCOUNT" \
        --time-zone="America/New_York" \
        --quiet
    echo -e "${GREEN}✓ Scheduler job updated${NC}"
else
    echo "Creating scheduler job..."
    gcloud scheduler jobs create http backup-daily-job \
        --location="$REGION" \
        --schedule="0 2 * * *" \
        --uri="$FUNCTION_URL" \
        --http-method=POST \
        --oidc-service-account-email="$SERVICE_ACCOUNT" \
        --time-zone="America/New_York" \
        --quiet
    echo -e "${GREEN}✓ Scheduler job created${NC}"
fi

# ============================================
# Step 7: Grant Permissions
# ============================================
echo ""
echo -e "${YELLOW}Step 7: Setting up permissions...${NC}"

# Grant Cloud Function service account access to bucket
gsutil iam ch serviceAccount:"${PROJECT_ID}@appspot.gserviceaccount.com":objectAdmin "gs://${BUCKET_NAME}"
echo -e "${GREEN}✓ Permissions configured${NC}"

# ============================================
# Summary
# ============================================
echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo "✅ Configuration applied:"
echo "  • Bucket: gs://${BUCKET_NAME}"
echo "  • Object versioning: ENABLED"
echo "  • Lifecycle policy: 365-day retention"
echo "  • Cloud Function: Deployed"
echo "  • Cloud Scheduler: Daily at 2 AM"
echo ""
echo "📋 Backup Features:"
echo "  • Automatic daily backups at 2 AM"
echo "  • Manual backups via Admin Panel"
echo "  • Object versioning (365-day retention)"
echo "  • Storage class optimization (cost savings)"
echo ""
echo "🧪 Test the backup:"
echo "  gcloud scheduler jobs run backup-daily-job --location=$REGION"
echo ""
echo "📊 View backups:"
echo "  gsutil ls -r gs://${BUCKET_NAME}/backups/"
echo ""
echo "🎉 Your backup system is now active!"


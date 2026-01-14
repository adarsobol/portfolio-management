#!/bin/bash
# ============================================
# GCS Backup Setup Script
# ============================================
# This script enables object versioning and lifecycle policies
# for your GCS bucket to support data backup and recovery.
#
# Prerequisites:
# - Google Cloud SDK installed and authenticated
# - Appropriate permissions on the bucket
#
# Usage:
#   ./scripts/setup-gcs-backup.sh <bucket-name> [backup-bucket-name]
#
# Examples:
#   ./scripts/setup-gcs-backup.sh portfolio-manager-data
#   ./scripts/setup-gcs-backup.sh portfolio-manager-data portfolio-manager-backup
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check arguments
if [ -z "$1" ]; then
    echo -e "${RED}Error: Bucket name is required${NC}"
    echo "Usage: $0 <bucket-name> [backup-bucket-name]"
    exit 1
fi

PRIMARY_BUCKET="$1"
BACKUP_BUCKET="${2:-${PRIMARY_BUCKET}-backup}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIFECYCLE_CONFIG="$SCRIPT_DIR/gcs-lifecycle-config.json"

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}GCS Backup Setup${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo -e "Primary Bucket: ${GREEN}gs://${PRIMARY_BUCKET}${NC}"
echo -e "Backup Bucket:  ${GREEN}gs://${BACKUP_BUCKET}${NC}"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed${NC}"
    echo "Install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if gsutil is installed
if ! command -v gsutil &> /dev/null; then
    echo -e "${RED}Error: gsutil is not installed${NC}"
    echo "It should come with the Google Cloud SDK"
    exit 1
fi

# Get current project
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: No GCP project configured${NC}"
    echo "Run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi
echo -e "GCP Project: ${GREEN}${PROJECT_ID}${NC}"
echo ""

# ============================================
# Step 1: Enable Object Versioning
# ============================================
echo -e "${YELLOW}Step 1: Enabling object versioning on primary bucket...${NC}"

# Check if bucket exists
if ! gsutil ls -b "gs://${PRIMARY_BUCKET}" &> /dev/null; then
    echo -e "${RED}Error: Bucket gs://${PRIMARY_BUCKET} does not exist${NC}"
    echo "Create it first with: gsutil mb -l US-CENTRAL1 gs://${PRIMARY_BUCKET}"
    exit 1
fi

# Enable versioning
gsutil versioning set on "gs://${PRIMARY_BUCKET}"

# Verify
VERSIONING_STATUS=$(gsutil versioning get "gs://${PRIMARY_BUCKET}" | grep -o "Enabled\|Suspended")
if [ "$VERSIONING_STATUS" == "Enabled" ]; then
    echo -e "${GREEN}✓ Object versioning enabled${NC}"
else
    echo -e "${RED}✗ Failed to enable versioning${NC}"
    exit 1
fi

# ============================================
# Step 2: Apply Lifecycle Policy
# ============================================
echo ""
echo -e "${YELLOW}Step 2: Applying lifecycle policy (1-year retention)...${NC}"

if [ ! -f "$LIFECYCLE_CONFIG" ]; then
    echo -e "${RED}Error: Lifecycle config not found at ${LIFECYCLE_CONFIG}${NC}"
    echo "Creating default lifecycle config..."
    
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

gsutil lifecycle set "$LIFECYCLE_CONFIG" "gs://${PRIMARY_BUCKET}"
echo -e "${GREEN}✓ Lifecycle policy applied${NC}"

# Show current lifecycle
echo ""
echo -e "${BLUE}Current lifecycle policy:${NC}"
gsutil lifecycle get "gs://${PRIMARY_BUCKET}"

# ============================================
# Step 3: Create Backup Bucket (Optional)
# ============================================
echo ""
echo -e "${YELLOW}Step 3: Setting up backup bucket for cross-region replication...${NC}"

# Check if backup bucket exists
if gsutil ls -b "gs://${BACKUP_BUCKET}" &> /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backup bucket already exists${NC}"
else
    echo "Creating backup bucket in US-EAST1 region..."
    gsutil mb -l US-EAST1 -c STANDARD "gs://${BACKUP_BUCKET}"
    echo -e "${GREEN}✓ Backup bucket created${NC}"
fi

# Enable versioning on backup bucket too
gsutil versioning set on "gs://${BACKUP_BUCKET}"
echo -e "${GREEN}✓ Versioning enabled on backup bucket${NC}"

# ============================================
# Step 4: Create backups folder structure
# ============================================
echo ""
echo -e "${YELLOW}Step 4: Creating backup folder structure...${NC}"

# Create a placeholder to establish the backups/ prefix
echo '{"created": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'", "type": "backup_directory_marker"}' | \
    gsutil cp - "gs://${PRIMARY_BUCKET}/backups/.metadata.json"

echo -e "${GREEN}✓ Backup folder structure created${NC}"

# ============================================
# Summary
# ============================================
echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo "Configuration applied:"
echo "  • Object versioning: ENABLED"
echo "  • Non-current version retention: 365 days"
echo "  • Storage class transitions:"
echo "    - After 30 days: NEARLINE (cheaper storage)"
echo "    - After 90 days: COLDLINE (even cheaper)"
echo "  • Backup bucket: gs://${BACKUP_BUCKET}"
echo ""
echo "Next steps:"
echo "  1. Deploy the backup Cloud Function:"
echo "     cd functions/backup && gcloud functions deploy backup-daily"
echo ""
echo "  2. Set up Cloud Scheduler for weekly backups (Thursday at 6 PM):"
echo "     gcloud scheduler jobs create http backup-weekly-job \\"
echo "       --schedule='0 18 * * 4' \\"
echo "       --uri='https://REGION-PROJECT_ID.cloudfunctions.net/backup-daily' \\"
echo "       --http-method=POST"
echo ""
echo "  3. (Optional) Set up Storage Transfer for cross-region replication:"
echo "     See: https://cloud.google.com/storage-transfer/docs"
echo ""


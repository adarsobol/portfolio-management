#!/bin/bash

# Script to download all database JSON files from Google Cloud Storage
# Usage: ./scripts/download-db-files.sh [bucket-name] [output-dir]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get bucket name from env or argument
BUCKET_NAME="${1:-${GCS_BUCKET_NAME:-portfolio-manager-data}}"
OUTPUT_DIR="${2:-db-backup}"

echo -e "${GREEN}📦 Downloading database files from GCS${NC}"
echo -e "Bucket: ${YELLOW}gs://${BUCKET_NAME}${NC}"
echo -e "Output: ${YELLOW}${OUTPUT_DIR}${NC}"
echo ""

# Check if gsutil is installed
if ! command -v gsutil &> /dev/null; then
    echo -e "${RED}❌ Error: gsutil is not installed${NC}"
    echo "Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if bucket exists
if ! gsutil ls -b "gs://${BUCKET_NAME}" &> /dev/null; then
    echo -e "${RED}❌ Error: Bucket gs://${BUCKET_NAME} does not exist or is not accessible${NC}"
    echo "Check your bucket name and permissions"
    exit 1
fi

# Create output directories
mkdir -p "${OUTPUT_DIR}"/{data,snapshots,support,logs/{activity,errors}}

echo -e "${YELLOW}Downloading main data files...${NC}"
# Download main data files (non-recursive, only JSON files in data/)
gsutil -m cp "gs://${BUCKET_NAME}/data/*.json" "${OUTPUT_DIR}/data/" 2>/dev/null || {
    echo -e "${YELLOW}⚠️  No files found in data/ directory${NC}"
}

# Download notifications directory
echo -e "${YELLOW}Downloading notifications...${NC}"
gsutil -m cp -r "gs://${BUCKET_NAME}/data/notifications/*" "${OUTPUT_DIR}/data/notifications/" 2>/dev/null || {
    echo -e "${YELLOW}⚠️  No notifications found${NC}"
    mkdir -p "${OUTPUT_DIR}/data/notifications"
}

# Download snapshots
echo -e "${YELLOW}Downloading snapshots...${NC}"
gsutil -m cp -r "gs://${BUCKET_NAME}/snapshots/*" "${OUTPUT_DIR}/snapshots/" 2>/dev/null || {
    echo -e "${YELLOW}⚠️  No snapshots found${NC}"
}

# Download support files
echo -e "${YELLOW}Downloading support files...${NC}"
gsutil -m cp "gs://${BUCKET_NAME}/support/*.json" "${OUTPUT_DIR}/support/" 2>/dev/null || {
    echo -e "${YELLOW}⚠️  No support files found${NC}"
}

# Download logs (optional, may be large)
echo -e "${YELLOW}Downloading logs (this may take a while)...${NC}"
read -p "Download logs? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    gsutil -m cp -r "gs://${BUCKET_NAME}/logs/*" "${OUTPUT_DIR}/logs/" 2>/dev/null || {
        echo -e "${YELLOW}⚠️  No logs found${NC}"
    }
fi

echo ""
echo -e "${GREEN}✅ Download complete!${NC}"
echo ""
echo "Files downloaded to: ${OUTPUT_DIR}/"
echo ""
echo "Summary:"
echo "  📄 Data files: $(find "${OUTPUT_DIR}/data" -name "*.json" 2>/dev/null | wc -l | tr -d ' ') files"
echo "  📸 Snapshots: $(find "${OUTPUT_DIR}/snapshots" -name "*.json" 2>/dev/null | wc -l | tr -d ' ') files"
echo "  🎫 Support files: $(find "${OUTPUT_DIR}/support" -name "*.json" 2>/dev/null | wc -l | tr -d ' ') files"
echo ""
echo "To view a file:"
echo "  cat ${OUTPUT_DIR}/data/initiatives.json | jq ."
echo "  cat ${OUTPUT_DIR}/data/users.json | jq ."


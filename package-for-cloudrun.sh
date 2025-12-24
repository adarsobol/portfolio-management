#!/bin/bash
# Package code for Cloud Run source code upload
# Creates a clean zip file with only necessary files

set -e

PROJECT_DIR="/Users/adar.sobol/portfolio-management"
OUTPUT_DIR="/tmp/portfolio-cloudrun-source"
ZIP_FILE="portfolio-manager-cloudrun-source.zip"

echo "📦 Packaging code for Cloud Run source upload..."
echo "================================================"
echo ""

# Clean up previous builds
rm -rf $OUTPUT_DIR
rm -f $PROJECT_DIR/$ZIP_FILE
mkdir -p $OUTPUT_DIR

cd $PROJECT_DIR

echo "📋 Copying essential files..."

# Copy source code directories
if [ -d "src" ]; then
  cp -r src/ $OUTPUT_DIR/
  echo "  ✓ src/ (frontend source)"
fi

if [ -d "server" ]; then
  cp -r server/ $OUTPUT_DIR/
  echo "  ✓ server/ (backend source)"
fi

# Copy configuration files
if [ -f "package.json" ]; then
  cp package.json $OUTPUT_DIR/
  echo "  ✓ package.json"
fi

if [ -f "package-lock.json" ]; then
  cp package-lock.json $OUTPUT_DIR/
  echo "  ✓ package-lock.json"
fi

if [ -f "tsconfig.json" ]; then
  cp tsconfig.json $OUTPUT_DIR/
  echo "  ✓ tsconfig.json"
fi

if [ -f "vite.config.ts" ]; then
  cp vite.config.ts $OUTPUT_DIR/
  echo "  ✓ vite.config.ts"
fi

if [ -f "index.html" ]; then
  cp index.html $OUTPUT_DIR/
  echo "  ✓ index.html"
fi

# Copy Dockerfile (essential!)
if [ -f "Dockerfile" ]; then
  cp Dockerfile $OUTPUT_DIR/
  echo "  ✓ Dockerfile"
fi

# Copy .gcloudignore if it exists
if [ -f ".gcloudignore" ]; then
  cp .gcloudignore $OUTPUT_DIR/
  echo "  ✓ .gcloudignore"
fi

# Copy cloudbuild.yaml if it exists (optional but useful)
if [ -f "cloudbuild.yaml" ]; then
  cp cloudbuild.yaml $OUTPUT_DIR/
  echo "  ✓ cloudbuild.yaml"
fi

# Copy any TypeScript config files
if [ -f "tsconfig.server.json" ]; then
  cp tsconfig.server.json $OUTPUT_DIR/
  echo "  ✓ tsconfig.server.json"
fi

# Create zip file
echo ""
echo "🗜️  Creating zip archive..."
cd $OUTPUT_DIR
zip -r $PROJECT_DIR/$ZIP_FILE . -q > /dev/null

# Get file size
FILE_SIZE=$(du -h $PROJECT_DIR/$ZIP_FILE | cut -f1)
FILE_COUNT=$(find . -type f | wc -l | tr -d ' ')

echo ""
echo "✅ Package created successfully!"
echo "================================"
echo ""
echo "📦 Package location:"
echo "   $PROJECT_DIR/$ZIP_FILE"
echo ""
echo "📊 Package details:"
echo "   Size: $FILE_SIZE"
echo "   Files: $FILE_COUNT"
echo ""
echo "📋 Contents:"
ls -la | grep -v "^total" | awk '{print "   " $9}' | grep -v "^$"
echo ""
echo "🚀 Ready to upload to Cloud Run!"
echo ""
echo "Next steps:"
echo "1. Go to Cloud Run Console: https://console.cloud.google.com/run"
echo "2. Click 'Create Service' or select existing service"
echo "3. Choose 'Deploy from source code'"
echo "4. Upload: $ZIP_FILE"
echo ""
echo "Or use gcloud command:"
echo "   gcloud run deploy portfolio-manager \\"
echo "     --source . \\"
echo "     --region us-central1 \\"
echo "     --platform managed"
echo ""


# Fix: Image Not Found Error

## The Problem
You tried to deploy to Cloud Run, but got this error:
```
Image 'gcr.io/research-modeling-vertex-ai/portfolio-manager:latest' not found
```

## Why This Happened
The image doesn't exist in Google Container Registry yet. You need to **build and push** the image first before Cloud Run can deploy it.

## Solution: Build the Image First

### Option 1: Use the Build Script (Easiest)
```bash
./BUILD_IMAGE.sh
```

This will:
1. Build your Docker image
2. Push it to `gcr.io/research-modeling-vertex-ai/portfolio-manager:latest`
3. Then you can deploy via Cloud Run console

### Option 2: Manual Build Command
```bash
gcloud builds submit --tag gcr.io/research-modeling-vertex-ai/portfolio-manager:latest --project=research-modeling-vertex-ai
```

### Option 3: Complete Deployment (Build + Deploy)
```bash
./QUICK_DEPLOY.sh
```

This builds the image AND deploys it automatically.

## After Building

Once the image is built, you can:

1. **Redeploy in Cloud Run Console:**
   - Go to your service "portfoliowp"
   - Click "Edit & Deploy New Revision"
   - The image URL should now work: `gcr.io/research-modeling-vertex-ai/portfolio-manager:latest`

2. **Or use the deployment script:**
   ```bash
   ./QUICK_DEPLOY.sh
   ```

## Verify Image Exists

Check if the image was created:
```bash
gcloud container images list --project=research-modeling-vertex-ai
```

You should see:
```
NAME
gcr.io/research-modeling-vertex-ai/portfolio-manager
```


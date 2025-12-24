# Cloud Run Source Code Upload Instructions

## ✅ Package Ready!

Your source code package has been created:
- **File**: `portfolio-manager-cloudrun-source.zip`
- **Size**: ~296KB
- **Location**: `/Users/adar.sobol/portfolio-management/portfolio-manager-cloudrun-source.zip`

## 📦 What's Included

The package contains all essential files for Cloud Run deployment:
- ✅ `src/` - Frontend React source code
- ✅ `server/` - Backend Express server code
- ✅ `package.json` & `package-lock.json` - Dependencies
- ✅ `Dockerfile` - Container build instructions
- ✅ `tsconfig.json` - TypeScript configuration
- ✅ `vite.config.ts` - Vite build configuration
- ✅ `index.html` - Frontend entry point
- ✅ `.gcloudignore` - Files to exclude during build
- ✅ `cloudbuild.yaml` - Cloud Build configuration (optional)

## 🚀 Upload Methods

### Method 1: Cloud Console UI (Easiest)

1. **Go to Cloud Run Console**
   - Visit: https://console.cloud.google.com/run
   - Select your project

2. **Create or Edit Service**
   - Click **"Create Service"** (new) or select existing service → **"Edit & Deploy New Revision"**

3. **Deploy from Source**
   - Under **"Container"**, select **"Deploy from source code"**
   - Click **"Browse"** or drag & drop
   - Upload: `portfolio-manager-cloudrun-source.zip`

4. **Configure Settings**
   - **Service name**: `portfolio-manager`
   - **Region**: `us-central1` (or your preferred region)
   - **Authentication**: Allow unauthenticated invocations (if public)
   - **Memory**: 512Mi
   - **CPU**: 1
   - **Min instances**: 1
   - **Max instances**: 10
   - **Timeout**: 300 seconds
   - **Session affinity**: Enabled (for Socket.IO)

5. **Set Environment Variables**
   ```
   NODE_ENV=production
   PORT=8080
   SERVE_STATIC=true
   GCS_BUCKET_NAME=portfolio-manager-data
   GCS_PROJECT_ID=YOUR_PROJECT_ID
   ```

6. **Set Secrets** (from Secret Manager)
   ```
   JWT_SECRET=portfolio-jwt-secret:latest
   CORS_ALLOWED_ORIGINS=portfolio-cors-origins:latest
   ```

7. **Service Account**
   - Use: `portfolio-manager@YOUR_PROJECT_ID.iam.gserviceaccount.com`

8. **Click "Deploy"**

### Method 2: gcloud CLI (Command Line)

```bash
# Extract the zip file
cd /tmp
unzip /Users/adar.sobol/portfolio-management/portfolio-manager-cloudrun-source.zip -d portfolio-source
cd portfolio-source

# Deploy from source
gcloud run deploy portfolio-manager \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 10 \
  --timeout 300 \
  --session-affinity \
  --set-env-vars "NODE_ENV=production,PORT=8080,SERVE_STATIC=true,GCS_BUCKET_NAME=portfolio-manager-data,GCS_PROJECT_ID=YOUR_PROJECT_ID" \
  --set-secrets "JWT_SECRET=portfolio-jwt-secret:latest,CORS_ALLOWED_ORIGINS=portfolio-cors-origins:latest" \
  --service-account portfolio-manager@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

### Method 3: Upload to Cloud Storage First

```bash
# Upload zip to Cloud Storage
gsutil cp portfolio-manager-cloudrun-source.zip gs://YOUR_BUCKET_NAME/

# Then extract and deploy from Cloud Shell
# In Cloud Shell:
gsutil cp gs://YOUR_BUCKET_NAME/portfolio-manager-cloudrun-source.zip .
unzip portfolio-manager-cloudrun-source.zip
gcloud run deploy portfolio-manager --source .
```

## ⚠️ Prerequisites

Before deploying, ensure you have:

1. **Service Account Created**
   ```bash
   gcloud iam service-accounts create portfolio-manager \
     --display-name="Portfolio Manager Service Account"
   ```

2. **Secrets Created in Secret Manager**
   ```bash
   # JWT Secret
   openssl rand -base64 32 | gcloud secrets create portfolio-jwt-secret \
     --data-file=- --replication-policy="automatic"
   
   # CORS Origins
   echo -n "https://your-domain.com" | gcloud secrets create portfolio-cors-origins \
     --data-file=- --replication-policy="automatic"
   ```

3. **GCS Bucket Created** (if using GCS storage)
   ```bash
   gsutil mb -p YOUR_PROJECT_ID -c STANDARD -l us-central1 gs://portfolio-manager-data
   ```

4. **APIs Enabled**
   ```bash
   gcloud services enable \
     cloudbuild.googleapis.com \
     run.googleapis.com \
     secretmanager.googleapis.com \
     storage-api.googleapis.com
   ```

## 📝 Notes

- The zip file excludes: `node_modules/`, `dist/`, `.git/`, test files, docs, etc.
- Dependencies will be installed during the Cloud Build process
- The Dockerfile handles the multi-stage build automatically
- Make sure to replace `YOUR_PROJECT_ID` with your actual GCP project ID

## 🔍 Verify Deployment

After deployment, test your service:

```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe portfolio-manager \
  --region us-central1 \
  --format='value(status.url)')

# Test health endpoint
curl $SERVICE_URL/api/sheets/health
```

## 📚 Additional Resources

- Full deployment guide: `docs/DEPLOYMENT.md`
- Quick setup guide: `docs/CLOUD_RUN_SETUP.md`
- Environment variables: `docs/ENVIRONMENT.md`


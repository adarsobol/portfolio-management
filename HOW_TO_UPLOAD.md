# How to Upload Zip File to Cloud Run

## 📦 Your Package
- **File**: `portfolio-manager-cloudrun-source.zip`
- **Location**: `~/Downloads/portfolio-manager-cloudrun-source.zip`
- **Size**: 295KB

---

## Method 1: Cloud Console UI (Easiest - Recommended)

### Step 1: Go to Cloud Run Console
1. Open your browser
2. Go to: **https://console.cloud.google.com/run**
3. Make sure you're in the correct project

### Step 2: Create New Service or Edit Existing
- **New Service**: Click **"CREATE SERVICE"** button (top)
- **Existing Service**: Click on service name → **"EDIT & DEPLOY NEW REVISION"**

### Step 3: Deploy from Source Code
1. Scroll down to **"Container"** section
2. Click **"Deploy from source code"** tab (not "Deploy one revision")
3. Click **"Browse"** button or drag & drop
4. Navigate to: `~/Downloads/portfolio-manager-cloudrun-source.zip`
5. Select the zip file and click **"Open"**

### Step 4: Configure Service Settings

**Basic Settings:**
- **Service name**: `portfolio-manager`
- **Region**: `us-central1` (or your preferred region)
- **Authentication**: 
  - ✅ **Allow unauthenticated invocations** (if you want public access)

**Container Settings:**
- **Memory**: `512 MiB`
- **CPU**: `1`
- **Request timeout**: `300 seconds`
- **Min instances**: `1`
- **Max instances**: `10`
- **Session affinity**: ✅ **Enabled** (important for Socket.IO)

### Step 5: Set Environment Variables
Click **"Variables & Secrets"** tab, then **"ADD VARIABLE"**:

```
NODE_ENV = production
PORT = 8080
SERVE_STATIC = true
GCS_BUCKET_NAME = portfolio-manager-data
GCS_PROJECT_ID = YOUR_PROJECT_ID
```

### Step 6: Set Secrets (from Secret Manager)
Click **"ADD SECRET"**:

```
JWT_SECRET = portfolio-jwt-secret:latest
CORS_ALLOWED_ORIGINS = portfolio-cors-origins:latest
```

### Step 7: Set Service Account
- **Service account**: `portfolio-manager@YOUR_PROJECT_ID.iam.gserviceaccount.com`

### Step 8: Deploy
1. Click **"CREATE"** (or **"DEPLOY"** if editing)
2. Wait 5-10 minutes for build and deployment
3. You'll see the service URL when done

---

## Method 2: gcloud CLI (Command Line)

### Step 1: Extract the Zip File
```bash
cd /tmp
unzip ~/Downloads/portfolio-manager-cloudrun-source.zip -d portfolio-source
cd portfolio-source
```

### Step 2: Deploy from Source
```bash
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

**Replace `YOUR_PROJECT_ID` with your actual GCP project ID!**

---

## Method 3: Upload to Cloud Storage First

### Step 1: Upload Zip to Cloud Storage
```bash
# Create bucket (if doesn't exist)
gsutil mb -p YOUR_PROJECT_ID -l us-central1 gs://your-deployment-bucket

# Upload zip file
gsutil cp ~/Downloads/portfolio-manager-cloudrun-source.zip gs://your-deployment-bucket/
```

### Step 2: Extract and Deploy from Cloud Shell
1. Go to **Cloud Shell**: https://shell.cloud.google.com/
2. Download and extract:
```bash
gsutil cp gs://your-deployment-bucket/portfolio-manager-cloudrun-source.zip .
unzip portfolio-manager-cloudrun-source.zip
```

3. Deploy:
```bash
gcloud run deploy portfolio-manager \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated
```

---

## ⚠️ Before Uploading - Prerequisites

Make sure you have:

1. **Service Account Created**
   ```bash
   gcloud iam service-accounts create portfolio-manager \
     --display-name="Portfolio Manager Service Account"
   ```

2. **Secrets Created**
   ```bash
   # JWT Secret
   openssl rand -base64 32 | gcloud secrets create portfolio-jwt-secret \
     --data-file=- --replication-policy="automatic"
   
   # CORS Origins
   echo -n "https://your-domain.com,*" | gcloud secrets create portfolio-cors-origins \
     --data-file=- --replication-policy="automatic"
   ```

3. **GCS Bucket Created** (if using GCS)
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

---

## ✅ After Upload - Verify Deployment

### Get Service URL
```bash
gcloud run services describe portfolio-manager \
  --region us-central1 \
  --format='value(status.url)'
```

### Test Health Endpoint
```bash
curl https://YOUR_SERVICE_URL/api/sheets/health
```

### View Logs
```bash
gcloud run services logs read portfolio-manager \
  --region us-central1 \
  --limit 50
```

---

## 🆘 Troubleshooting

**Build fails?**
- Check Cloud Build logs in Console
- Verify Dockerfile is correct
- Check package.json has all dependencies

**Service won't start?**
- Check environment variables are set correctly
- Verify secrets exist and service account has access
- Check service logs for errors

**CORS errors?**
- Update `portfolio-cors-origins` secret with your frontend URL
- Ensure CORS_ALLOWED_ORIGINS includes your domain

---

## 📝 Quick Reference

**File to upload**: `~/Downloads/portfolio-manager-cloudrun-source.zip`

**Cloud Run Console**: https://console.cloud.google.com/run

**Cloud Shell**: https://shell.cloud.google.com/

**Replace in commands**: `YOUR_PROJECT_ID` with your actual project ID


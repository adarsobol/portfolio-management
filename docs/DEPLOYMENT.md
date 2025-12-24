# Deployment Guide - Google Cloud Run

This guide walks you through deploying the Portfolio Manager application to Google Cloud Run.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Secret Manager Configuration](#secret-manager-configuration)
4. [Building and Deploying](#building-and-deploying)
5. [Frontend Deployment](#frontend-deployment)
6. [Post-Deployment Verification](#post-deployment-verification)
7. [Troubleshooting](#troubleshooting)

## Prerequisites

Before deploying, ensure you have:

- Google Cloud Project with billing enabled
- `gcloud` CLI installed and authenticated
- Docker installed (for local testing)
- Node.js 20+ installed (for building)

### Install gcloud CLI

```bash
# macOS
brew install google-cloud-sdk

# Or download from: https://cloud.google.com/sdk/docs/install
```

### Authenticate and Set Project

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud auth application-default login
```

## Initial Setup

### 1. Enable Required APIs

```bash
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  storage-api.googleapis.com \
  storage-component.googleapis.com
```

### 2. Create Service Account

```bash
# Create service account
gcloud iam service-accounts create portfolio-manager \
  --display-name="Portfolio Manager Service Account"

# Grant necessary permissions
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:portfolio-manager@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:portfolio-manager@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# Grant Cloud Run invoker permission (for public access)
gcloud run services add-iam-policy-binding portfolio-manager \
  --region=us-central1 \
  --member="allUsers" \
  --role="roles/run.invoker"
```

### 3. Create GCS Bucket (if using GCS for data storage)

```bash
gsutil mb -p YOUR_PROJECT_ID -c STANDARD -l us-central1 gs://portfolio-manager-data
gsutil iam ch serviceAccount:portfolio-manager@YOUR_PROJECT_ID.iam.gserviceaccount.com:objectAdmin gs://portfolio-manager-data
```

## Secret Manager Configuration

Store sensitive values in Google Secret Manager:

### 1. Create JWT Secret

```bash
# Generate a secure secret
openssl rand -base64 32 | gcloud secrets create portfolio-jwt-secret \
  --data-file=- \
  --replication-policy="automatic"
```

### 2. Create CORS Origins Secret

```bash
echo -n "https://your-app-domain.com,https://www.your-app-domain.com" | \
  gcloud secrets create portfolio-cors-origins \
  --data-file=- \
  --replication-policy="automatic"
```

### 3. Create Google OAuth Client ID Secret (Optional)

```bash
echo -n "your-google-oauth-client-id.apps.googleusercontent.com" | \
  gcloud secrets create portfolio-google-client-id \
  --data-file=- \
  --replication-policy="automatic"
```

### 4. Grant Secret Access

```bash
gcloud secrets add-iam-policy-binding portfolio-jwt-secret \
  --member="serviceAccount:portfolio-manager@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding portfolio-cors-origins \
  --member="serviceAccount:portfolio-manager@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Building and Deploying

### Option A: Manual Deployment

#### 1. Build Docker Image

```bash
# Build locally (for testing)
docker build -t portfolio-manager:latest .

# Or build in Cloud Build
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/portfolio-manager:latest
```

#### 2. Deploy to Cloud Run

```bash
gcloud run deploy portfolio-manager \
  --image gcr.io/YOUR_PROJECT_ID/portfolio-manager:latest \
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

### Option B: Automated CI/CD with Cloud Build

#### 1. Update cloudbuild.yaml

Edit `cloudbuild.yaml` and update:
- `_REGION`: Your preferred region (e.g., `us-central1`)
- `_SERVICE_ACCOUNT`: Your service account email

#### 2. Create Cloud Build Trigger

```bash
# Create trigger from GitHub (if using GitHub)
gcloud builds triggers create github \
  --name="portfolio-manager-deploy" \
  --repo-name="YOUR_REPO" \
  --repo-owner="YOUR_GITHUB_USERNAME" \
  --branch-pattern="^main$" \
  --build-config="cloudbuild.yaml"

# Or create trigger from Cloud Source Repositories
gcloud builds triggers create cloud-source-repositories \
  --name="portfolio-manager-deploy" \
  --repo="YOUR_REPO" \
  --branch-pattern="^main$" \
  --build-config="cloudbuild.yaml"
```

#### 3. Push to Trigger Deployment

```bash
git push origin main
```

## Frontend Deployment

The application can be deployed in two ways:

### Option 1: Serve from Cloud Run (Simpler)

The Dockerfile already includes the frontend build, and the server is configured to serve static files when `SERVE_STATIC=true`. This is the default configuration.

**Pros:**
- Single deployment
- Simpler setup
- No CDN configuration needed

**Cons:**
- Less efficient for static assets
- Higher Cloud Run costs for static file serving

### Option 2: Separate Frontend Deployment (Recommended for Production)

#### 1. Build Frontend

```bash
# Set API endpoint for production
export VITE_API_ENDPOINT=https://your-service.run.app
npm run build
```

#### 2. Deploy to Cloud Storage + CDN

```bash
# Create bucket for frontend
gsutil mb -p YOUR_PROJECT_ID -c STANDARD -l us-central1 gs://portfolio-manager-frontend

# Upload files
gsutil -m cp -r dist/* gs://portfolio-manager-frontend/

# Set bucket permissions
gsutil iam ch allUsers:objectViewer gs://portfolio-manager-frontend

# Enable website hosting
gsutil web set -m index.html -e 404.html gs://portfolio-manager-frontend

# Set CORS (if needed)
gsutil cors set cors.json gs://portfolio-manager-frontend
```

Create `cors.json`:
```json
[
  {
    "origin": ["https://your-app-domain.com"],
    "method": ["GET", "HEAD"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
```

#### 3. Set up Cloud CDN (Optional but Recommended)

```bash
# Create backend bucket
gcloud compute backend-buckets create portfolio-manager-frontend-backend \
  --gcs-bucket-name=portfolio-manager-frontend

# Create URL map
gcloud compute url-maps create portfolio-manager-frontend-map \
  --default-backend-bucket=portfolio-manager-frontend-backend

# Create HTTP(S) proxy
gcloud compute target-https-proxies create portfolio-manager-frontend-proxy \
  --url-map=portfolio-manager-frontend-map \
  --ssl-certificates=YOUR_SSL_CERT

# Create forwarding rule
gcloud compute forwarding-rules create portfolio-manager-frontend-rule \
  --global \
  --target-https-proxy=portfolio-manager-frontend-proxy \
  --ports=443
```

## Post-Deployment Verification

### 1. Test Health Endpoint

```bash
curl https://your-service.run.app/api/sheets/health
```

Expected response:
```json
{"status":"ok","configured":true}
```

### 2. Test Authentication

1. Open your deployed application URL
2. Try logging in with Google OAuth
3. Verify JWT token is stored in browser

### 3. Test Socket.IO

1. Open application in two browser tabs
2. Create/edit an initiative in one tab
3. Verify real-time update appears in the other tab

### 4. Test Data Persistence

1. Create a new initiative
2. Refresh the page
3. Verify the initiative persists

### 5. Check Logs

```bash
gcloud run services logs read portfolio-manager \
  --region us-central1 \
  --limit 50
```

## Troubleshooting

### Issue: Service fails to start

**Check:**
- Service account has correct permissions
- Secrets are accessible
- Environment variables are set correctly

**Debug:**
```bash
gcloud run services describe portfolio-manager --region us-central1
gcloud run services logs read portfolio-manager --region us-central1
```

### Issue: CORS errors

**Solution:**
- Verify `CORS_ALLOWED_ORIGINS` includes your frontend URL
- Check that frontend is calling the correct API endpoint
- Ensure credentials are included in requests

### Issue: Socket.IO not working

**Solution:**
- Verify session affinity is enabled: `--session-affinity`
- Check timeout is set to 300s: `--timeout 300`
- Ensure WebSocket connections are not blocked by firewall

### Issue: Static files not serving

**Solution:**
- Verify `SERVE_STATIC=true` is set
- Check that `dist/` folder exists in container
- Verify file permissions in Dockerfile

### Issue: Authentication fails

**Solution:**
- Verify `JWT_SECRET` is set correctly
- Check Google OAuth client ID matches production
- Ensure CORS allows credentials

## Environment Variables Reference

See [ENVIRONMENT.md](./ENVIRONMENT.md) for complete environment variable documentation.

## Cost Optimization

- **Min instances**: Set to 0 for cost savings (with cold start trade-off)
- **Max instances**: Adjust based on expected traffic
- **Memory**: Start with 512Mi, increase if needed
- **CPU**: 1 CPU is usually sufficient for moderate traffic
- **Timeout**: 300s for Socket.IO, can reduce if not using real-time features

## Monitoring

Set up monitoring and alerts:

```bash
# Create alert for high error rate
gcloud alpha monitoring policies create \
  --notification-channels=YOUR_CHANNEL_ID \
  --display-name="High Error Rate" \
  --condition-display-name="Error rate > 5%" \
  --condition-threshold-value=0.05 \
  --condition-threshold-duration=300s
```

## Rollback

To rollback to a previous revision:

```bash
# List revisions
gcloud run revisions list --service portfolio-manager --region us-central1

# Rollback to specific revision
gcloud run services update-traffic portfolio-manager \
  --region us-central1 \
  --to-revisions=REVISION_NAME=100
```

## Security Best Practices

1. **Never commit secrets** to version control
2. **Use Secret Manager** for all sensitive values
3. **Enable Cloud Armor** for DDoS protection
4. **Use least privilege** for service accounts
5. **Enable audit logs** for compliance
6. **Regular security updates** for dependencies

## Next Steps

- Set up monitoring dashboards
- Configure custom domain with SSL
- Set up automated backups
- Implement CI/CD pipeline
- Add performance monitoring


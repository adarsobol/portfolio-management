# Quick Start: Cloud Run Deployment

This is a quick reference guide for deploying to Cloud Run. For detailed instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md).

## Prerequisites Checklist

- [ ] Google Cloud Project with billing enabled
- [ ] `gcloud` CLI installed and authenticated
- [ ] Docker installed (for local testing)
- [ ] Node.js 20+ installed

## One-Command Setup

```bash
# 1. Set your project
export PROJECT_ID=your-project-id
gcloud config set project $PROJECT_ID

# 2. Run setup script
./scripts/setup-secrets.sh $PROJECT_ID

# 3. Deploy
./scripts/deploy.sh $PROJECT_ID
```

## Manual Setup Steps

### 1. Enable APIs

```bash
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  storage-api.googleapis.com \
  --project=$PROJECT_ID
```

### 2. Create Service Account

```bash
gcloud iam service-accounts create portfolio-manager \
  --display-name="Portfolio Manager" \
  --project=$PROJECT_ID

# Grant permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:portfolio-manager@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:portfolio-manager@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

### 3. Create Secrets

```bash
# JWT Secret
openssl rand -base64 32 | gcloud secrets create portfolio-jwt-secret \
  --data-file=- \
  --replication-policy="automatic" \
  --project=$PROJECT_ID

# CORS Origins
echo -n "https://your-domain.com" | gcloud secrets create portfolio-cors-origins \
  --data-file=- \
  --replication-policy="automatic" \
  --project=$PROJECT_ID

# Grant access
gcloud secrets add-iam-policy-binding portfolio-jwt-secret \
  --member="serviceAccount:portfolio-manager@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=$PROJECT_ID

gcloud secrets add-iam-policy-binding portfolio-cors-origins \
  --member="serviceAccount:portfolio-manager@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=$PROJECT_ID
```

### 4. Create GCS Bucket (if using GCS)

```bash
gsutil mb -p $PROJECT_ID -c STANDARD -l us-central1 gs://portfolio-manager-data
gsutil iam ch serviceAccount:portfolio-manager@${PROJECT_ID}.iam.gserviceaccount.com:objectAdmin gs://portfolio-manager-data
```

### 5. Deploy

```bash
# Build and push
gcloud builds submit --tag gcr.io/$PROJECT_ID/portfolio-manager:latest

# Deploy
gcloud run deploy portfolio-manager \
  --image gcr.io/$PROJECT_ID/portfolio-manager:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 10 \
  --timeout 300 \
  --session-affinity \
  --set-env-vars "NODE_ENV=production,PORT=8080,SERVE_STATIC=true,GCS_BUCKET_NAME=portfolio-manager-data,GCS_PROJECT_ID=$PROJECT_ID" \
  --set-secrets "JWT_SECRET=portfolio-jwt-secret:latest,CORS_ALLOWED_ORIGINS=portfolio-cors-origins:latest" \
  --service-account portfolio-manager@${PROJECT_ID}.iam.gserviceaccount.com
```

## Verify Deployment

```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe portfolio-manager \
  --region us-central1 \
  --format='value(status.url)')

# Test health endpoint
curl $SERVICE_URL/api/sheets/health
```

## Environment Variables

Required environment variables (set via `--set-env-vars` or Cloud Console):

- `NODE_ENV=production`
- `PORT=8080`
- `SERVE_STATIC=true` (to serve frontend from Cloud Run)
- `GCS_BUCKET_NAME=portfolio-manager-data` (if using GCS)
- `GCS_PROJECT_ID=$PROJECT_ID` (if using GCS)

Required secrets (set via `--set-secrets`):

- `JWT_SECRET=portfolio-jwt-secret:latest`
- `CORS_ALLOWED_ORIGINS=portfolio-cors-origins:latest`

## Troubleshooting

### Service won't start

```bash
# Check logs
gcloud run services logs read portfolio-manager --region us-central1 --limit 50

# Check service status
gcloud run services describe portfolio-manager --region us-central1
```

### CORS errors

- Verify `CORS_ALLOWED_ORIGINS` includes your frontend URL
- Check frontend is calling correct API endpoint
- Ensure credentials are included in requests

### Socket.IO not working

- Verify `--session-affinity` is set
- Check `--timeout 300` is configured
- Ensure WebSocket connections aren't blocked

## Next Steps

- Set up custom domain
- Configure Cloud CDN
- Set up monitoring and alerts
- Configure CI/CD pipeline

For detailed information, see [DEPLOYMENT.md](./DEPLOYMENT.md).


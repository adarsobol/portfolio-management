# Setup GCS Backup System - Quick Start

You've configured GCS variables! Now let's set up the complete backup system.

## 🚀 Quick Setup (One Command)

Run this script to set up everything:

```bash
./scripts/setup-gcs-backup-complete.sh
```

The script will:
1. ✅ Create bucket if it doesn't exist
2. ✅ Enable object versioning
3. ✅ Apply lifecycle policies (365-day retention)
4. ✅ Deploy backup Cloud Function
5. ✅ Set up Cloud Scheduler (weekly on Thursday at 6 PM)
6. ✅ Configure permissions

## 📋 Prerequisites

Make sure you have:
- ✅ Google Cloud SDK installed (`gcloud` command)
- ✅ Authenticated: `gcloud auth login`
- ✅ GCS variables set (you said you did this!)

## 🔧 Manual Setup (If Script Fails)

If you prefer to do it step by step:

### Step 1: Enable Object Versioning

```bash
# Get your bucket name from environment
BUCKET_NAME="portfolio-manager-data"  # or your bucket name
PROJECT_ID="research-modeling-vertex-ai"  # or your project

# Enable versioning
gsutil versioning set on "gs://${BUCKET_NAME}"
```

### Step 2: Apply Lifecycle Policy

```bash
gsutil lifecycle set scripts/gcs-lifecycle-config.json "gs://${BUCKET_NAME}"
```

### Step 3: Deploy Backup Function

```bash
cd functions/backup
npm install
npm run build

gcloud functions deploy backup-daily \
  --gen2 \
  --runtime=nodejs20 \
  --trigger-http \
  --allow-unauthenticated=false \
  --entry-point=backupDaily \
  --source=. \
  --region=us-central1 \
  --set-env-vars="GCS_BUCKET_NAME=${BUCKET_NAME},GCS_PROJECT_ID=${PROJECT_ID}"
```

### Step 4: Set Up Scheduler

```bash
# Get function URL first
FUNCTION_URL=$(gcloud functions describe backup-daily --gen2 --region=us-central1 --format="value(serviceConfig.uri)")

# Create scheduler job
gcloud scheduler jobs create http backup-weekly-job \
  --location=us-central1 \
  --schedule="0 18 * * 4" \
  --uri="${FUNCTION_URL}" \
  --http-method=POST \
  --oidc-service-account-email="${PROJECT_ID}@appspot.gserviceaccount.com" \
  --time-zone="America/New_York"
```

## ✅ Verify Setup

After running the script, verify everything works:

```bash
# Check bucket versioning
gsutil versioning get gs://portfolio-manager-data

# List Cloud Functions
gcloud functions list --gen2

# Check Scheduler jobs
gcloud scheduler jobs list --location=us-central1

# Test backup manually
gcloud scheduler jobs run backup-weekly-job --location=us-central1
```

## 🎯 What You Get

After setup, you'll have:

1. **Automatic Weekly Backups** - Runs every Thursday at 6 PM (end of day)
2. **Object Versioning** - Every file save creates a version (365-day retention)
3. **Manual Backups** - Create backups via Admin Panel anytime
4. **Cost Optimization** - Automatic storage class transitions

## 📊 View Your Backups

```bash
# List all backups
gsutil ls -r gs://portfolio-manager-data/backups/

# View a specific backup
gsutil cat gs://portfolio-manager-data/backups/2025-12-25/manifest.json | jq .
```

## 🔍 Troubleshooting

### Script fails with "permission denied"
- Make sure you're authenticated: `gcloud auth login`
- Check you have Storage Admin role on the bucket

### Function deployment fails
- Make sure Cloud Functions API is enabled:
  ```bash
  gcloud services enable cloudfunctions.googleapis.com
  gcloud services enable cloudbuild.googleapis.com
  ```

### Scheduler fails
- Make sure Cloud Scheduler API is enabled:
  ```bash
  gcloud services enable cloudscheduler.googleapis.com
  ```

## 🎉 Next Steps

Once setup is complete:
1. Your backups will run automatically every Thursday at 6 PM
2. You can create manual backups via Admin Panel
3. View backups in Google Cloud Console Storage browser
4. Restore from backups via Admin Panel or API

---

**Ready? Run:** `./scripts/setup-gcs-backup-complete.sh`


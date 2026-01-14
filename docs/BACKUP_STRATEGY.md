# Database Backup Strategy

This document describes the backup and recovery mechanisms for the Portfolio Manager application.

## Overview

The backup strategy provides multiple layers of data protection:

1. **GCS Object Versioning** - Automatic protection against accidental overwrites
2. **Daily Automated Backups** - Point-in-time recovery snapshots
3. **Manual Backups** - On-demand backup creation via Admin Panel
4. **Cross-Region Replication** - Disaster recovery (optional)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Primary Region                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Primary GCS Bucket                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │   │
│  │  │ data/       │  │ backups/    │  │ snapshots/      │  │   │
│  │  │ ├─ init.json│  │ ├─ 2025-12-25│  │ ├─ snap_001.json│  │   │
│  │  │ ├─ users.json│  │ ├─ 2025-12-24│  │ └─ ...         │  │   │
│  │  │ └─ ...      │  │ └─ ...      │  │                 │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │   │
│  │                                                          │   │
│  │  Object Versioning: ENABLED                              │   │
│  │  Lifecycle Policy: 1-year retention                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              │ Replicate                        │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Backup GCS Bucket (Optional)                │   │
│  │              Cross-region copy for DR                    │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Setup Instructions

### 1. Enable Object Versioning

Run the setup script to enable versioning and lifecycle policies:

```bash
# Make the script executable
chmod +x scripts/setup-gcs-backup.sh

# Run with your bucket name
./scripts/setup-gcs-backup.sh YOUR_BUCKET_NAME

# Or with a separate backup bucket
./scripts/setup-gcs-backup.sh YOUR_BUCKET_NAME YOUR_BACKUP_BUCKET_NAME
```

This will:
- Enable object versioning on your primary bucket
- Apply lifecycle policy (1-year retention)
- Create backup folder structure
- Optionally create a backup bucket in a different region

### 2. Deploy Daily Backup Function

```bash
cd functions/backup

# Install dependencies
npm install

# Build
npm run build

# Deploy to Cloud Functions
gcloud functions deploy backup-daily \
  --gen2 \
  --runtime=nodejs20 \
  --trigger-http \
  --allow-unauthenticated=false \
  --entry-point=backupDaily \
  --source=. \
  --region=us-central1 \
  --set-env-vars="GCS_BUCKET_NAME=YOUR_BUCKET,GCS_PROJECT_ID=YOUR_PROJECT"
```

### 3. Set Up Cloud Scheduler

```bash
# Create a scheduler job for weekly backups on Thursday at 6 PM (end of day)
gcloud scheduler jobs create http backup-weekly-job \
  --schedule="0 18 * * 4" \
  --uri="https://us-central1-YOUR_PROJECT.cloudfunctions.net/backup-daily" \
  --http-method=POST \
  --oidc-service-account-email=YOUR_SERVICE_ACCOUNT@YOUR_PROJECT.iam.gserviceaccount.com \
  --time-zone="America/New_York"
```

## Lifecycle Policy

The lifecycle policy automatically manages storage costs:

| Age | Action | Reason |
|-----|--------|--------|
| 0-30 days | Standard Storage | Fast access for recent backups |
| 30-90 days | Nearline Storage | 50% cheaper, infrequent access |
| 90-365 days | Coldline Storage | 75% cheaper, rare access |
| > 365 days | Delete | Beyond retention period |

## Backup Types

### Automated Weekly Backups

- **Frequency**: Weekly on Thursday at 6 PM (end of day)
- **Location**: `backups/YYYY-MM-DD/`
- **Contents**: All files from `data/` directory
- **Manifest**: `backups/YYYY-MM-DD/manifest.json`

### Manual Backups

- **Trigger**: Admin Panel or API
- **Location**: `backups/YYYY-MM-DD-manual-TIMESTAMP/`
- **Use Case**: Before major changes or deployments

### Object Versions

- **Automatic**: Every file save creates a new version
- **Retention**: 365 days for non-current versions
- **Use Case**: Recover from accidental overwrites

## Recovery Procedures

### Restore from Daily Backup (Admin Panel)

1. Navigate to Admin Panel
2. Scroll to "Backup Management" section
3. Find the backup date you want to restore
4. Click "Restore" button
5. Confirm the action

### Restore from Daily Backup (API)

```bash
# List available backups
curl -H "Authorization: Bearer $TOKEN" \
  https://your-app.com/api/backups

# Get backup details
curl -H "Authorization: Bearer $TOKEN" \
  https://your-app.com/api/backups/2025-12-24

# Restore from backup
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"confirm": true}' \
  https://your-app.com/api/backups/restore/2025-12-24
```

### Restore Specific Object Version (API)

```bash
# List versions of a file
curl -H "Authorization: Bearer $TOKEN" \
  https://your-app.com/api/backups/versions/initiatives.json

# Restore specific version
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"file": "initiatives.json", "versionId": "1234567890", "confirm": true}' \
  https://your-app.com/api/backups/restore-version
```

### Restore from GCS Console (Emergency)

If the application is unavailable:

1. Go to GCS Console
2. Navigate to your bucket
3. Find `backups/YYYY-MM-DD/`
4. Copy files back to `data/` directory

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/backups` | GET | List all available backups |
| `/api/backups/:date` | GET | Get backup details |
| `/api/backups/create` | POST | Create manual backup |
| `/api/backups/restore/:date` | POST | Restore from backup |
| `/api/backups/versions/:file` | GET | List object versions |
| `/api/backups/restore-version` | POST | Restore specific version |
| `/api/backups/:date/verify` | GET | Verify backup integrity |
| `/api/backups/:date/download` | GET | Get download URLs |

## Monitoring

### Slack Notifications

Configure `SLACK_WEBHOOK_URL` environment variable to receive backup notifications:

```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

### Backup Verification

Run periodic verification to ensure backups are intact:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://your-app.com/api/backups/2025-12-24/verify
```

## Cost Estimation

| Component | Estimated Monthly Cost |
|-----------|------------------------|
| Object Versioning | +10-20% storage |
| Daily Backups | ~$0.50-2.00 (depends on data size) |
| Cloud Function | ~$0.10 |
| Cross-Region Replication | +100% storage |

## Troubleshooting

### Backup Not Running

1. Check Cloud Scheduler job status
2. Verify Cloud Function logs
3. Check service account permissions

### Restore Failed

1. Check API response for error details
2. Verify backup manifest exists
3. Check bucket permissions

### Version Not Found

1. Verify object versioning is enabled
2. Check if version is within retention period
3. Confirm correct versionId format

## Best Practices

1. **Test Restores Regularly**: Verify backup integrity monthly
2. **Monitor Backup Status**: Check Slack notifications daily
3. **Keep Google Sheets Backup**: Don't disable legacy backup during transition
4. **Document Recovery Procedures**: Keep this document updated
5. **Rotate Service Account Keys**: Security best practice


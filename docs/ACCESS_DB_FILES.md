# How to Access Database JSON Files

This guide explains how to access the JSON database files stored in Google Cloud Storage (GCS).

## Overview

Your database files are stored in a GCS bucket with the following structure:

```
gs://your-bucket-name/
├── data/
│   ├── initiatives.json      # Main initiatives data
│   ├── changelog.json        # Change history
│   ├── config.json           # Application configuration
│   ├── users.json            # User accounts
│   └── notifications/        # User notifications
│       └── {userId}.json
├── snapshots/                # Backup snapshots
│   └── {snapshot-id}.json
├── support/
│   ├── tickets.json          # Support tickets
│   └── feedback.json         # User feedback
└── logs/                     # Activity and error logs
    ├── activity/
    │   └── YYYY-MM-DD.json
    └── errors/
        └── YYYY-MM-DD.json
```

## Method 1: Using gsutil Command Line Tool (Recommended)

### Prerequisites
1. Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install
2. Authenticate: `gcloud auth login`
3. Set your project: `gcloud config set project YOUR_PROJECT_ID`

### Download All Database Files

```bash
# Set your bucket name
BUCKET_NAME="portfolio-manager-data"
PROJECT_ID="research-modeling-vertex-ai"

# Create a local directory for the files
mkdir -p db-backup/data db-backup/snapshots db-backup/support db-backup/logs

# Download main data files
gsutil cp gs://${BUCKET_NAME}/data/*.json db-backup/data/

# Download snapshots
gsutil -m cp -r gs://${BUCKET_NAME}/snapshots/* db-backup/snapshots/

# Download support files
gsutil cp gs://${BUCKET_NAME}/support/*.json db-backup/support/

# Download logs (optional)
gsutil -m cp -r gs://${BUCKET_NAME}/logs/* db-backup/logs/
```

### Download Specific Files

```bash
# Download initiatives
gsutil cp gs://${BUCKET_NAME}/data/initiatives.json .

# Download users
gsutil cp gs://${BUCKET_NAME}/data/users.json .

# Download a specific snapshot
gsutil cp gs://${BUCKET_NAME}/snapshots/snap_001.json .
```

### List All Files

```bash
# List all files in the bucket
gsutil ls -r gs://${BUCKET_NAME}/

# List only data files
gsutil ls gs://${BUCKET_NAME}/data/

# List snapshots
gsutil ls gs://${BUCKET_NAME}/snapshots/
```

### View File Contents (without downloading)

```bash
# View initiatives file
gsutil cat gs://${BUCKET_NAME}/data/initiatives.json | jq .

# View users file
gsutil cat gs://${BUCKET_NAME}/data/users.json | jq .
```

## Method 2: Using Google Cloud Console Web UI

1. Go to: https://console.cloud.google.com/storage/browser
2. Select your project: `research-modeling-vertex-ai`
3. Click on your bucket: `portfolio-manager-data`
4. Navigate to the `data/` folder
5. Click on any JSON file to view/download it

## Method 3: Using the Provided Script

Run the provided script to download all files:

```bash
chmod +x scripts/download-db-files.sh
./scripts/download-db-files.sh
```

Or use the Node.js script:

```bash
npm run download-db
# or
npx tsx scripts/download-db-files.ts
```

## Method 4: Using Node.js Code

You can use the existing GCS storage class in your code:

```typescript
import { getGCSStorage } from './server/gcsStorage.js';

const storage = getGCSStorage();
if (storage) {
  // Load initiatives
  const initiatives = await storage.loadInitiatives();
  console.log(initiatives);
  
  // Load users
  const users = await storage.loadUsers();
  console.log(users);
}
```

## Method 5: Direct API Access (via your server)

If your server is running, you can access data via the API endpoints:

```bash
# Get initiatives (requires authentication)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8080/api/initiatives

# Get users (admin only)
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  http://localhost:8080/api/users
```

## Environment Variables

Make sure these are set in your `.env` file:

```bash
GCS_BUCKET_NAME=portfolio-manager-data
GCS_PROJECT_ID=research-modeling-vertex-ai
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account-key.json
```

## Troubleshooting

### Permission Denied
- Ensure you're authenticated: `gcloud auth login`
- Check bucket permissions: `gsutil iam get gs://${BUCKET_NAME}`
- Verify service account has Storage Object Viewer role

### Bucket Not Found
- Verify bucket name: `gsutil ls -b gs://${BUCKET_NAME}`
- Check project: `gcloud config get-value project`

### Files Don't Exist
- Files are created on first write
- Check if you're using GCS backend (not Google Sheets)
- Verify `GCS_BUCKET_NAME` is set correctly

## Quick Reference

| File | Path | Description |
|------|------|-------------|
| Initiatives | `data/initiatives.json` | Main portfolio data |
| Users | `data/users.json` | User accounts |
| Changelog | `data/changelog.json` | Change history |
| Config | `data/config.json` | App configuration |
| Snapshots | `snapshots/*.json` | Backup snapshots |
| Tickets | `support/tickets.json` | Support tickets |
| Feedback | `support/feedback.json` | User feedback |


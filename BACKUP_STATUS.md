# Backup Status & Mechanisms

## Current Status: Using Google Sheets (Not GCS)

**Your app is currently using Google Sheets as the primary storage**, which means:

### ✅ What IS Backed Up:

1. **Google Sheets Built-in Version History**
   - Google Sheets automatically keeps version history
   - You can access it: File → Version history → See version history
   - This is your **primary backup** right now

2. **Manual Snapshots in Sheets**
   - The app can create snapshot tabs in your spreadsheet
   - These are manual backups you can create via the Admin Panel
   - Stored as new tabs like `Snap_2025-12-25_Manual`

### ❌ What is NOT Active:

The **GCS Cloud Backup System** is NOT active because:
- Your app is using Google Sheets, not Google Cloud Storage
- GCS backup requires `GCS_BUCKET_NAME` and `GCS_PROJECT_ID` to be set
- These are not configured, so the backup service doesn't run

## Available Backup Systems (If You Enable GCS)

If you switch to GCS storage, you'll get:

### 1. **GCS Object Versioning** (Automatic)
- Every file save creates a new version
- Automatic protection against accidental overwrites
- 365-day retention

### 2. **Daily Automated Backups** (Cloud Function)
- Runs daily at 2 AM (configurable)
- Creates timestamped backups: `backups/YYYY-MM-DD/`
- Includes manifest with file metadata
- Requires Cloud Scheduler setup

### 3. **Manual Backups** (Admin Panel)
- Create on-demand backups before major changes
- Stored in: `backups/YYYY-MM-DD-manual-TIMESTAMP/`
- Accessible via Admin Panel → Backup Management

### 4. **Cross-Region Replication** (Optional)
- Disaster recovery option
- Copies data to a backup bucket in different region

## How to Check Your Current Backup Status

### Option 1: Check Google Sheets Version History

1. Open your spreadsheet: https://docs.google.com/spreadsheets/d/1mN4c67FfOzsp7KBrsivKrS1NFwTk_x75AQwkYenhIQM/edit
2. Go to **File** → **Version history** → **See version history**
3. You'll see all previous versions of your spreadsheet

### Option 2: Check if GCS Backup is Enabled

Run this to check:
```bash
npm run db:check
```

Or check your Cloud Run environment variables:
- Go to: https://console.cloud.google.com/run?project=research-modeling-vertex-ai
- Click your service → Variables & Secrets
- Look for `GCS_BUCKET_NAME` and `GCS_PROJECT_ID`

## Recommendations

### If Staying with Google Sheets:
- ✅ **You're already backed up** via Google Sheets version history
- ✅ Create manual snapshots before major changes
- ✅ Export data periodically as JSON/CSV for extra safety

### If Switching to GCS:
1. Create the bucket: `portfolio-manager-data`
2. Set environment variables in Cloud Run
3. Enable object versioning
4. Deploy the backup Cloud Function
5. Set up Cloud Scheduler for daily backups

## Summary

| Backup Type | Status | Location |
|------------|--------|----------|
| **Google Sheets Version History** | ✅ Active | Built into Google Sheets |
| **Manual Sheet Snapshots** | ✅ Available | New tabs in spreadsheet |
| **GCS Object Versioning** | ❌ Not Active | Requires GCS setup |
| **Daily GCS Backups** | ❌ Not Active | Requires GCS + Cloud Function |
| **Manual GCS Backups** | ❌ Not Active | Requires GCS setup |

**Bottom Line:** Your data IS backed up via Google Sheets version history. The advanced GCS backup system exists but isn't active because you're using Sheets, not GCS.


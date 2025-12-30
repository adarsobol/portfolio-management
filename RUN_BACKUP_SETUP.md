# 🚀 Run GCS Backup Setup

You've configured the GCS variables! Now run this to set up the complete backup system:

## Quick Command

```bash
./scripts/setup-gcs-backup-complete.sh portfolio-manager-data research-modeling-vertex-ai
```

Or if you have the environment variables set:

```bash
export GCS_BUCKET_NAME=portfolio-manager-data
export GCS_PROJECT_ID=research-modeling-vertex-ai
./scripts/setup-gcs-backup-complete.sh
```

## What It Does

The script will automatically:

1. ✅ **Create bucket** (if it doesn't exist)
2. ✅ **Enable object versioning** (365-day retention)
3. ✅ **Apply lifecycle policies** (cost optimization)
4. ✅ **Deploy backup Cloud Function** (runs backups)
5. ✅ **Set up Cloud Scheduler** (daily at 2 AM)
6. ✅ **Configure permissions** (so everything works)

## Expected Output

You should see:
```
============================================
Complete GCS Backup Setup
============================================

Bucket: gs://portfolio-manager-data
Project: research-modeling-vertex-ai
Region: us-central1

Step 1: Checking bucket...
✓ Bucket already exists

Step 2: Enabling object versioning...
✓ Object versioning enabled

Step 3: Applying lifecycle policy...
✓ Lifecycle policy applied

Step 4: Creating backup folder structure...
✓ Backup folder structure ready

Step 5: Deploying backup Cloud Function...
✓ Cloud Function deployed

Step 6: Setting up Cloud Scheduler...
✓ Scheduler job created

Step 7: Setting up permissions...
✓ Permissions configured

============================================
Setup Complete!
============================================
```

## After Setup

Your backup system will:
- ✅ Run automatic daily backups at 2 AM
- ✅ Keep 365 days of version history
- ✅ Allow manual backups via Admin Panel
- ✅ Optimize storage costs automatically

## Test It

After setup, test the backup:

```bash
# Run backup manually
gcloud scheduler jobs run backup-daily-job --location=us-central1

# Check backup was created
gsutil ls -r gs://portfolio-manager-data/backups/
```

## Need Help?

If the script fails:
1. Make sure you're authenticated: `gcloud auth login`
2. Check you have the right permissions
3. See `SETUP_BACKUP_NOW.md` for manual steps

---

**Ready? Run the command above!** 🎉


# Setup GCS Backup - Authentication Required

The backup setup script needs Google Cloud credentials. Here's how to set them up:

## Option 1: Use Service Account Key (Recommended)

1. **Download your service account key:**
   - Go to: https://console.cloud.google.com/iam-admin/serviceaccounts?project=research-modeling-vertex-ai
   - Find your service account (or create one)
   - Click **Keys** → **Add Key** → **Create new key** → **JSON**
   - Save the file (e.g., `service-account-key.json`)

2. **Set the environment variable:**
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
   ```

3. **Run the setup script:**
   ```bash
   node scripts/setup-gcs-backup-node.js portfolio-manager-data research-modeling-vertex-ai
   ```

## Option 2: Use gcloud Application Default Credentials

1. **Install Google Cloud SDK:**
   ```bash
   brew install google-cloud-sdk
   ```

2. **Authenticate:**
   ```bash
   gcloud auth application-default login
   ```

3. **Set project:**
   ```bash
   gcloud config set project research-modeling-vertex-ai
   ```

4. **Run the setup script:**
   ```bash
   node scripts/setup-gcs-backup-node.js portfolio-manager-data research-modeling-vertex-ai
   ```

## Option 3: Use the Shell Script (Easiest)

If you have gcloud installed, use the shell script instead:

```bash
./scripts/setup-gcs-backup-complete.sh portfolio-manager-data research-modeling-vertex-ai
```

## What the Script Does

Once authenticated, the script will:
1. ✅ Create bucket if needed
2. ✅ Enable object versioning
3. ✅ Apply lifecycle policies
4. ✅ Create backup folder structure
5. ✅ Provide instructions for Cloud Function deployment

## After Running the Script

You'll still need to:
1. Deploy the Cloud Function (instructions provided)
2. Set up Cloud Scheduler (instructions provided)

Or use the web console to complete these steps.

---

**Quick Start:** Set `GOOGLE_APPLICATION_CREDENTIALS` and run the script!


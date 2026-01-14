# Setup GCS Backup via Web Console

Since you already have the bucket open in Google Cloud Console, here's how to set it up via the web UI:

## ✅ Step 1: Enable Object Versioning

1. In your browser, you're already at: `portfolio-manager-data` bucket
2. Click the **"Configuration"** tab (at the bottom)
3. Scroll to **"Object versioning"** section
4. Click **"Edit"** button
5. Select **"Enable"**
6. Click **"Save"**

## ✅ Step 2: Set Lifecycle Policy

1. Still in the **"Configuration"** tab
2. Scroll to **"Lifecycle"** section
3. Click **"Add a rule"**
4. Configure the rule:
   - **Rule name**: `backup-lifecycle`
   - **Action**: Select **"Delete object"**
   - **Condition**: 
     - Check **"Age"** and set to **365** days
     - Check **"Is live version"** and select **"No"**
   - Click **"Continue"** → **"Create"**

5. Add another rule for storage class transitions:
   - Click **"Add a rule"** again
   - **Rule name**: `move-to-nearline`
   - **Action**: Select **"Set storage class to Nearline"**
   - **Condition**:
     - **Age**: **30** days
     - **Is live version**: **No**
     - **Matches storage class**: **Standard**
   - Click **"Continue"** → **"Create"**

6. Add one more rule:
   - Click **"Add a rule"**
   - **Rule name**: `move-to-coldline`
   - **Action**: Select **"Set storage class to Coldline"**
   - **Condition**:
     - **Age**: **90** days
     - **Is live version**: **No**
     - **Matches storage class**: **Nearline**
   - Click **"Continue"** → **"Create"**

## ✅ Step 3: Create Backup Folder Structure

1. Go back to the **"Objects"** tab
2. Click **"Create folder"** button
3. Name it: `backups`
4. Click **"Create"**
5. Inside `backups`, create a file called `.metadata.json`:
   - Click **"Upload"** → **"Select files"**
   - Create a file with this content:
   ```json
   {
     "created": "2025-12-29T14:00:00Z",
     "type": "backup_directory_marker"
   }
   ```
   - Upload it to the `backups/` folder

## ✅ Step 4: Deploy Cloud Function (via Console)

1. Go to Cloud Functions: https://console.cloud.google.com/functions?project=research-modeling-vertex-ai
2. Click **"Create Function"**
3. Configure:
   - **Function name**: `backup-daily`
   - **Region**: `us-central1`
   - **Trigger type**: **HTTP**
   - **Authentication**: **Require authentication**
   - Click **"Save"** → **"Next"**

4. **Runtime settings**:
   - **Runtime**: **Node.js 20**
   - **Entry point**: `backupDaily`
   - Click **"Next"**

5. **Code**:
   - **Source**: **Inline editor** (or upload from `functions/backup` folder)
   - Copy the code from `functions/backup/src/index.ts`
   - **Package.json**: Copy from `functions/backup/package.json`
   - Click **"Next"**

6. **Variables and Secrets**:
   - Add environment variables:
     - `GCS_BUCKET_NAME` = `portfolio-manager-data`
     - `GCS_PROJECT_ID` = `research-modeling-vertex-ai`
   - Click **"Deploy"**

## ✅ Step 5: Set Up Cloud Scheduler

1. Go to Cloud Scheduler: https://console.cloud.google.com/cloudscheduler?project=research-modeling-vertex-ai
2. Click **"Create Job"**
3. Configure:
   - **Name**: `backup-weekly-job`
   - **Region**: `us-central1`
   - **Frequency**: `0 18 * * 4` (weekly on Thursday at 6 PM - end of day)
   - **Timezone**: `America/New_York`
   - **Target type**: **HTTP**
   - **URL**: (get this from your Cloud Function - it's the trigger URL)
   - **HTTP method**: **POST**
   - **Auth header**: **Add OIDC token**
   - **Service account**: `research-modeling-vertex-ai@appspot.gserviceaccount.com`
   - Click **"Create"**

## ✅ Verify Setup

1. **Check versioning**: Go to bucket → Configuration → Object versioning should show "Enabled"
2. **Check lifecycle**: Go to bucket → Configuration → Lifecycle should show 3 rules
3. **Test backup**: Go to Cloud Scheduler → Click "Run now" on `backup-weekly-job`
4. **Check backup**: Go back to bucket → `backups/` folder → Should see a new folder with today's date

## 🎉 Done!

Your backup system is now set up:
- ✅ Object versioning enabled
- ✅ Lifecycle policies configured
- ✅ Cloud Function deployed
- ✅ Weekly backups scheduled (Thursday at 6 PM)

---

**Quick Links:**
- Bucket: https://console.cloud.google.com/storage/browser/portfolio-manager-data?project=research-modeling-vertex-ai
- Functions: https://console.cloud.google.com/functions?project=research-modeling-vertex-ai
- Scheduler: https://console.cloud.google.com/cloudscheduler?project=research-modeling-vertex-ai


# Bucket Not Found - Troubleshooting Guide

If you're seeing "bucket not found", here are the possible causes and solutions:

## 🔍 Step 1: Check if the Bucket Exists

### Option A: List All Buckets in Your Project

1. Go to: https://console.cloud.google.com/storage/browser?project=research-modeling-vertex-ai
2. After signing in, you'll see a list of ALL buckets in the project
3. Look for any bucket that might contain your data

**Common bucket names to look for:**
- `portfolio-manager-data`
- `portfolio-manager-backup`
- `portfolio-work-plan-manager`
- Any bucket with "portfolio" in the name

### Option B: Check if You're Using Google Sheets Instead

Your app might be using **Google Sheets** as the backend instead of GCS. Check:

1. Look at your Cloud Run service environment variables
2. If `GCS_BUCKET_NAME` is NOT set, you're using Google Sheets
3. Your data would be in a Google Sheet, not in GCS

**To check your Cloud Run service:**
- Go to: https://console.cloud.google.com/run?project=research-modeling-vertex-ai
- Click on your service (probably `portfolio-manager`)
- Go to "Variables & Secrets" tab
- Check if `GCS_BUCKET_NAME` is set

---

## ✅ Step 2: Create the Bucket (If It Doesn't Exist)

If the bucket doesn't exist, create it:

### Using Web Console:

1. Go to: https://console.cloud.google.com/storage/browser?project=research-modeling-vertex-ai
2. Click **"CREATE BUCKET"** button (top of page)
3. Fill in:
   - **Name**: `portfolio-manager-data`
   - **Location type**: Region
   - **Location**: `us-central1` (or your preferred region)
   - **Storage class**: Standard
   - **Access control**: Uniform
4. Click **"CREATE"**

### Using Command Line (if you have gcloud):

```bash
gsutil mb -p research-modeling-vertex-ai -c STANDARD -l us-central1 gs://portfolio-manager-data
```

---

## 🔐 Step 3: Check Permissions

Make sure you have access to the bucket:

1. Go to the bucket in the console
2. Click on **"PERMISSIONS"** tab
3. Make sure your account has **Storage Object Viewer** or **Storage Admin** role

---

## 📊 Step 4: Check Where Your Data Actually Is

### If Using Google Sheets:

Your data is in a Google Sheet, not in GCS. To access it:

1. Check your `.env` file for `GOOGLE_SPREADSHEET_ID`
2. Or check Cloud Run environment variables
3. Open the spreadsheet: https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID/edit

### If Using GCS:

The bucket should exist. If it doesn't, create it (see Step 2).

---

## 🛠️ Quick Check Script

Run this to check your setup:

```bash
# Check if bucket exists (requires gcloud SDK)
gsutil ls -b gs://portfolio-manager-data 2>&1

# Or use the Node.js script
npm run db:list
```

---

## 📝 Most Likely Scenarios

### Scenario 1: Bucket Never Created
**Solution**: Create the bucket (Step 2 above)

### Scenario 2: Using Google Sheets Backend
**Solution**: Your data is in Google Sheets, not GCS. Check your spreadsheet.

### Scenario 3: Wrong Project
**Solution**: Make sure you're looking in `research-modeling-vertex-ai` project

### Scenario 4: No Permissions
**Solution**: Ask your admin to grant you Storage Object Viewer access

---

## 🎯 Next Steps

1. **First**: Sign in to Google Cloud Console
2. **Then**: Go to Storage Browser and see what buckets exist
3. **If no bucket**: Create `portfolio-manager-data`
4. **If using Sheets**: Access your data via Google Sheets instead

Need help with any of these steps? Let me know!


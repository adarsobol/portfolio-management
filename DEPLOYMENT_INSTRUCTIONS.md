# Quick Deployment Instructions

## Your Project ID
**Project:** `research-modeling-vertex-ai`

## Step 1: Install gcloud CLI

If you don't have gcloud installed, run:

```bash
brew install google-cloud-sdk
```

Or download from: https://cloud.google.com/sdk/docs/install

## Step 2: Run the Deployment Script

Once gcloud is installed, simply run:

```bash
./QUICK_DEPLOY.sh
```

That's it! The script will:
1. ✅ Authenticate you with Google Cloud
2. ✅ Enable all required APIs
3. ✅ Create service account and permissions
4. ✅ Create GCS bucket for data storage
5. ✅ Set up secrets (JWT, CORS)
6. ✅ Build your Docker container
7. ✅ Deploy to Cloud Run
8. ✅ Give you the live URL

## What You'll Get

After deployment, you'll get a URL like:
```
https://portfolio-manager-xxxxx.run.app
```

## After Deployment

1. **Update CORS origins** (if you have a custom domain):
   ```bash
   echo -n "https://yourdomain.com" | gcloud secrets versions add portfolio-cors-origins --data-file=-
   ```

2. **View logs**:
   ```bash
   gcloud run services logs read portfolio-manager --region us-central1 --project research-modeling-vertex-ai
   ```

3. **Update deployment** (after code changes):
   ```bash
   ./QUICK_DEPLOY.sh
   ```

## Troubleshooting

If you get authentication errors:
```bash
gcloud auth login
gcloud auth application-default login
```

If you get permission errors, make sure billing is enabled on your project.


# Fixing Google OAuth CORS Issues

If you're seeing CORS errors when trying to log in with Google OAuth, follow these steps:

## Quick Fix Script

Run the helper script:
```bash
./scripts/fix-oauth-cors.sh [PROJECT_ID] [SERVICE_NAME] [REGION]
```

Or manually:

## Manual Steps

### 1. Get Your Cloud Run Service URL

```bash
gcloud run services describe portfolio-manager \
  --region=us-central1 \
  --format='value(status.url)'
```

### 2. Update Google OAuth Client Settings

1. Go to [Google Cloud Console - Credentials](https://console.cloud.google.com/apis/credentials)
2. Select your project
3. Find OAuth 2.0 Client ID: `1061531245530-an68apdgo6kmkvapvng0gc1g00nohc5v`
4. Click **EDIT**
5. Under **Authorized JavaScript origins**, click **ADD URI** and add:
   - `https://your-service-url.run.app` (your actual Cloud Run URL)
6. Under **Authorized redirect URIs**, click **ADD URI** and add:
   - `https://your-service-url.run.app`
7. Click **SAVE**
8. Wait 1-2 minutes for changes to propagate

### 3. Update CORS Secret (Optional but Recommended)

```bash
# Get your service URL
SERVICE_URL=$(gcloud run services describe portfolio-manager \
  --region=us-central1 \
  --format='value(status.url)')

# Update the secret
echo -n "$SERVICE_URL" | gcloud secrets versions add portfolio-cors-origins --data-file=-
```

### 4. Restart Cloud Run Service (if needed)

```bash
gcloud run services update portfolio-manager \
  --region=us-central1 \
  --project=YOUR_PROJECT_ID
```

## Verification

After completing these steps:
1. Clear your browser cache
2. Try logging in again
3. Check browser console for any remaining errors

## Common Issues

- **CORS error persists**: Make sure you added the exact URL (including `https://`)
- **401 Unauthorized**: Check that the OAuth client ID matches in both Google Console and your app
- **Popup blocked**: Check browser popup settings

## Notes

- The CORS fallback in the code will help with backend CORS, but Google OAuth requires manual configuration
- Changes in Google Cloud Console can take 1-2 minutes to propagate
- Make sure you're using the production OAuth client ID, not a development one


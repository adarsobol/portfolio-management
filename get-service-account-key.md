# How to Get Your Service Account Key

The key file was downloaded earlier but may have been moved or deleted. Here's how to get it again:

## Option 1: Download from Google Cloud Console

1. Go to: https://console.cloud.google.com/iam-admin/serviceaccounts?project=research-modeling-vertex-ai
2. Click on the service account: `sheets-sync@research-modeling-vertex-ai.iam.gserviceaccount.com`
3. Go to the **Keys** tab
4. Click **Add Key** → **Create new key**
5. Select **JSON** format
6. Click **Create** - the file will download
7. Move the file to your project: `mv ~/Downloads/research-modeling-vertex-ai-*.json .`
8. Run: `node setup-sheets-env.js`

## Option 2: Manual Setup

If you have the JSON file, extract the `private_key` field and update `.env`:

```bash
# Extract private key from JSON (replace \n with \\n)
cat your-key-file.json | jq -r '.private_key' | sed 's/\\n/\\\\n/g' >> temp_key.txt
# Then copy the content and paste it in .env as GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
```


# Quick Guide: Access Your Database JSON Files

## 🚀 Fastest Way: Use the Web Browser (No Installation Needed)

1. **Go to Google Cloud Console:**
   - Open: https://console.cloud.google.com/storage/browser?project=research-modeling-vertex-ai
   - Or navigate: Cloud Console → Storage → Browse

2. **Click on your bucket:** `portfolio-manager-data`

3. **Navigate to files:**
   - Click `data/` folder to see: `initiatives.json`, `users.json`, `changelog.json`, `config.json`
   - Click any file to view/download it

**That's it!** No installation needed. ✅

---

## 💻 Method 2: Use the Node.js Script (If You Have Credentials)

If you have Google Cloud credentials set up, you can use the script I created:

```bash
# List all files
npm run db:list

# View a specific file
npm run db:view data/initiatives.json

# Download all files
npm run db:download
```

**Setup credentials first:**
```bash
# Option 1: Use service account key file
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your-service-account-key.json"

# Option 2: Use gcloud auth (if you have gcloud installed)
gcloud auth application-default login
```

---

## 🔧 Method 3: Install Google Cloud SDK (For Command Line)

1. **Install Google Cloud SDK:**
   ```bash
   # macOS
   brew install google-cloud-sdk
   
   # Or download from: https://cloud.google.com/sdk/docs/install
   ```

2. **Authenticate:**
   ```bash
   gcloud auth login
   gcloud config set project research-modeling-vertex-ai
   ```

3. **Download files:**
   ```bash
   # Download all data files
   gsutil cp gs://portfolio-manager-data/data/*.json .
   
   # View a file
   gsutil cat gs://portfolio-manager-data/data/initiatives.json | jq .
   ```

---

## 📋 Your Database Files

| File | Path | What It Contains |
|------|------|------------------|
| **Initiatives** | `data/initiatives.json` | Your main portfolio/work plan data |
| **Users** | `data/users.json` | User accounts and authentication |
| **Changelog** | `data/changelog.json` | History of all changes |
| **Config** | `data/config.json` | Application settings |
| **Snapshots** | `snapshots/*.json` | Backup snapshots |
| **Support** | `support/tickets.json` | Support tickets |
| **Feedback** | `support/feedback.json` | User feedback |

---

## 🎯 Recommended: Start with Web Browser

**Just go here:** https://console.cloud.google.com/storage/browser?project=research-modeling-vertex-ai

Click `portfolio-manager-data` → `data` → click any `.json` file to view/download it!

No installation, no setup, works immediately. 🎉


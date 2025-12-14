# ✅ Google Sheets Integration Setup Complete!

## What Was Set Up

### 1. Google Cloud Project
- **Project**: Research Modeling Vertex AI
- **Google Sheets API**: ✅ Enabled
- **Service Account**: `sheets-sync@research-modeling-vertex-ai.iam.gserviceaccount.com`
- **Service Account ID**: `104628433235179540042`

### 2. Google Sheet Created
- **Spreadsheet Name**: Portfolio Work Plan Manager Sync
- **Spreadsheet ID**: `1mN4c67FfOzsp7KBrsivKrS1NFwTk_x75AQwkYenhIQM`
- **URL**: https://docs.google.com/spreadsheets/d/1mN4c67FfOzsp7KBrsivKrS1NFwTk_x75AQwkYenhIQM/edit
- **Shared with**: `sheets-sync@research-modeling-vertex-ai.iam.gserviceaccount.com` (Editor access)

### 3. Service Account Key
- **Key File**: `research-modeling-vertex-ai-4a2e063ae2b5.json`
- **Location**: Downloaded to your Downloads folder
- **⚠️ Important**: This file contains sensitive credentials. Keep it secure!

---

## Next Steps

### Step 1: Move the Key File to Project Root

```bash
# Move the downloaded key file to your project
mv ~/Downloads/research-modeling-vertex-ai-4a2e063ae2b5.json /Users/adar.sobol/portfolio-management/
```

### Step 2: Run the Setup Script

```bash
# This will automatically extract credentials and create .env file
node setup-sheets-env.js
```

**OR** manually create `.env` file:

```bash
# Create .env file with these values:
cat > .env << 'EOF'
GOOGLE_SPREADSHEET_ID=1mN4c67FfOzsp7KBrsivKrS1NFwTk_x75AQwkYenhIQM
GOOGLE_SERVICE_ACCOUNT_EMAIL=sheets-sync@research-modeling-vertex-ai.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=<paste private_key from JSON file, replacing \n with \\n>
EOF
```

### Step 3: Test the Integration

```bash
# Start both frontend and backend
npm run dev:all

# Or start them separately:
# Terminal 1: npm run dev
# Terminal 2: npm run server
```

### Step 4: Verify Connection

1. Open your app at `http://localhost:5173`
2. Make a change to an initiative
3. Wait 2 seconds (debounce delay)
4. Check your Google Sheet - the change should appear!

---

## How It Works

### Automatic Sync
- **Changes sync automatically** after 2 seconds of inactivity (debounced)
- **Initiatives**: Upserted to the "Initiatives" sheet
- **Change Logs**: Appended to the "ChangeLog" sheet
- **Snapshots**: Created as new tabs with timestamp

### Manual Controls
- **Sync Status Badge**: Bottom-right corner shows sync status
- **Push All**: Overwrites Google Sheets with all local data
- **Pull**: Restores local data from Google Sheets

### Sheet Structure
The server automatically creates these sheets with proper headers:
- **Initiatives**: Main data table
- **ChangeLog**: Append-only change history
- **Snap_***: Snapshot tabs (created automatically)

---

## Troubleshooting

### Server won't start
- Check that `.env` file exists and has all required variables
- Verify the JSON key file is in the project root
- Check that `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` has `\\n` for newlines

### "Failed to connect to Google Sheets"
- Verify the spreadsheet is shared with the service account email
- Check that the spreadsheet ID is correct
- Ensure Google Sheets API is enabled in Google Cloud Console

### Changes not syncing
- Check browser console for errors
- Verify the backend server is running (`npm run server`)
- Check the sync status badge in the app

---

## Security Notes

⚠️ **Important Security Reminders:**
1. **Never commit** `.env` or `.json` key files to git (they're in `.gitignore`)
2. **Never share** your service account key publicly
3. **Rotate keys** if accidentally exposed
4. The key file allows full access to your Google Sheet - keep it secure!

---

## API Endpoints

The backend server provides these endpoints:

- `GET  /api/sheets/health` - Check connection status
- `POST /api/sheets/initiatives` - Upsert initiatives
- `POST /api/sheets/changelog` - Append change records
- `POST /api/sheets/snapshot` - Create snapshot tab
- `GET  /api/sheets/pull` - Pull all data from Sheets
- `POST /api/sheets/push` - Push all data to Sheets
- `GET  /api/sheets/snapshots` - List snapshot tabs

---

## Success! 🎉

Your Google Sheets integration is ready to use. The app will automatically sync changes to your spreadsheet, and you can view/edit the data directly in Google Sheets for collaboration and backup purposes.


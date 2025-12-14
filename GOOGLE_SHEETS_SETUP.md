# Google Sheets Integration Setup Guide

This guide walks you through setting up the hybrid Google Sheets sync for your Portfolio Work Plan Manager.

## Overview

The app uses a **hybrid sync** approach:
- **localStorage** remains the primary data store (fast, offline-capable)
- **Google Sheets** provides secondary backup, collaboration view, and audit trail

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                    React App (Vite)                    │
│  ┌──────────────┐        ┌──────────────────────────┐  │
│  │ localStorage │ ←sync→ │ SheetsSyncManager        │  │
│  │  (Primary)   │        │ (Background sync queue)  │  │
│  └──────────────┘        └───────────┬──────────────┘  │
└──────────────────────────────────────┼─────────────────┘
                                       │ HTTP
                                       ▼
                        ┌──────────────────────────────┐
                        │   Express API Server (:3001) │
                        │   /api/sheets/*              │
                        └───────────────┬──────────────┘
                                        │ Google Sheets API
                                        ▼
                        ┌──────────────────────────────┐
                        │      Google Spreadsheet      │
                        │  • Initiatives tab           │
                        │  • ChangeLog tab             │
                        │  • Snapshot tabs (auto)      │
                        └──────────────────────────────┘
```

## Setup Steps

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (e.g., `portfolio-work-plan`)
3. Enable these APIs:
   - **Google Sheets API**
   - **Google Drive API**

### Step 2: Create Service Account

1. Go to **IAM & Admin → Service Accounts**
2. Click **Create Service Account**
3. Name: `sheets-sync` (or any name)
4. Click **Create and Continue**
5. Skip the role assignment (no roles needed for Sheets)
6. Click **Done**
7. Click on the created service account
8. Go to **Keys** tab → **Add Key** → **Create New Key** → **JSON**
9. Save the downloaded JSON file securely

### Step 3: Create Google Spreadsheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new spreadsheet
3. Name it (e.g., "Portfolio Work Plan Data")
4. **Important**: Share the spreadsheet with your service account email:
   - Click **Share**
   - Add the service account email (from the JSON file, `client_email` field)
   - Give **Editor** access
5. Copy the Spreadsheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
   ```

### Step 4: Configure Environment Variables

Create a `.env` file in the project root:

```env
# Client-side (Vite)
VITE_SHEETS_API_ENDPOINT=http://localhost:3001/api/sheets

# Server-side
GOOGLE_SPREADSHEET_ID=your-spreadsheet-id-from-url
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n"
PORT=3001
```

**Important for Private Key:**
- Copy the `private_key` value from your JSON file
- Replace actual newlines with `\n`
- Wrap in quotes

### Step 5: Install Dependencies

```bash
npm install
```

### Step 6: Run the Application

**Option A: Run both servers together**
```bash
npm run dev:all
```

**Option B: Run separately (in two terminals)**
```bash
# Terminal 1: Frontend
npm run dev

# Terminal 2: Backend API
npm run server
```

## Usage

### Automatic Sync
- All changes (initiatives, updates) automatically queue for sync
- Syncs happen every 2 seconds (debounced)
- Changes persist to localStorage immediately, then sync to Sheets

### Manual Controls
Click the sync badge (bottom-right corner) to:
- **Sync Now**: Force immediate sync of pending changes
- **Push All**: Overwrite Google Sheets with all local data
- **Pull**: Replace local data with Google Sheets data
- **Toggle**: Enable/disable auto-sync

### Snapshots
When you "Freeze Status" in the Admin panel:
- Creates a local snapshot
- Creates a new tab in Google Sheets with the frozen data
- Tab names: `Snap_2024-12-04T10-30-00_Status-Report`

## Google Sheets Structure

| Tab | Purpose | Structure |
|-----|---------|-----------|
| `Initiatives` | Main data | One row per initiative, all fields as columns |
| `ChangeLog` | Audit trail | Append-only log of all field changes |
| `Snap_*` | Snapshots | Auto-created tabs for each freeze |

## Troubleshooting

### "Failed to connect to Google Sheets"
- Check your `.env` file has all three Google credentials
- Verify the service account email has Editor access to the spreadsheet
- Check the spreadsheet ID is correct

### "Sync error" badge
- Click the badge to see the error details
- Common issues: network offline, credentials expired, rate limits

### Data not appearing in Sheets
- Check the backend server is running (`npm run server`)
- Check browser console for errors
- Verify `VITE_SHEETS_API_ENDPOINT` matches your server URL

### Pull not working
- Ensure the `Initiatives` tab exists in your spreadsheet
- Check that column headers match exactly (case-sensitive)

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sheets/health` | GET | Check connection status |
| `/api/sheets/initiatives` | POST | Upsert initiatives |
| `/api/sheets/changelog` | POST | Append change records |
| `/api/sheets/snapshot` | POST | Create snapshot tab |
| `/api/sheets/pull` | GET | Pull all data from Sheets |
| `/api/sheets/push` | POST | Push all data to Sheets |
| `/api/sheets/snapshots` | GET | List snapshot tabs |

## Security Notes

- Never commit your `.env` file or service account JSON
- The service account has access ONLY to spreadsheets explicitly shared with it
- Consider using Google Cloud Secret Manager for production
- For production, deploy the backend to a secure server (not localhost)


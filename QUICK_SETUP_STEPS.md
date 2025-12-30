# Quick Setup Steps (You're Already There!)

I see you have the bucket open in your browser! Here's the fastest way to set it up:

## Right Now - In Your Browser:

### 1. Enable Object Versioning (2 clicks)
- Click **"Configuration"** tab (bottom of page)
- Find **"Object versioning"** → Click **"Edit"** → Select **"Enable"** → **"Save"**

### 2. Set Lifecycle Policy (Quick)
- Still in **"Configuration"** tab
- Scroll to **"Lifecycle"** → Click **"Add a rule"**
- **Delete non-current versions after 365 days**
- **Save**

### 3. Create Backups Folder
- Go back to **"Objects"** tab
- Click **"Create folder"** → Name: `backups` → **"Create"**

## That's It for Basic Setup! ✅

The bucket is now ready for backups. The Cloud Function and Scheduler can be set up later, or follow the full guide in `SETUP_BACKUP_WEB_CONSOLE.md`.

**Your bucket is ready!** 🎉


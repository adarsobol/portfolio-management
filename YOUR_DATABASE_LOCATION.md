# Your Database Location

## ✅ Found Your Data!

Your database is stored in **Google Sheets**, not in Google Cloud Storage.

## 📊 Your Spreadsheet

**Spreadsheet ID:** `1mN4c67FfOzsp7KBrsivKrS1NFwTk_x75AQwkYenhIQM`

**Direct Link:**
https://docs.google.com/spreadsheets/d/1mN4c67FfOzsp7KBrsivKrS1NFwTk_x75AQwkYenhIQM/edit

## 📁 How Your Data is Organized

Your data is stored as **rows in Google Sheets tabs**, not as separate JSON files. The app uses these sheets:

- **Initiatives** - Your main portfolio/work plan data
- **Tasks** - Individual tasks within initiatives  
- **Users** - User accounts
- **Changelog** - Change history
- **Config** - Application settings

## 🔍 How to Access

1. **Sign in** to Google (you'll be redirected after clicking the link above)
2. **Open the spreadsheet** - You'll see tabs at the bottom
3. **Click each tab** to see your data:
   - Click "Initiatives" tab → see all your initiatives
   - Click "Tasks" tab → see all tasks
   - etc.

## 💾 Exporting Data

To export your data as JSON:

1. Open the spreadsheet
2. Go to **File** → **Download** → **JSON** (if available)
   - Or: **File** → **Download** → **CSV** (then convert to JSON)
   - Or: Use the API endpoints in your app to export

## 🔄 If You Want to Use GCS Instead

If you want to migrate from Google Sheets to Google Cloud Storage:

1. Create the bucket: `portfolio-manager-data`
2. Run the migration script: `npm run migrate:gcs`
3. Update Cloud Run environment variables to use GCS

But for now, **your data is safely in Google Sheets** and accessible via the link above!

---

**Quick Access:** Just click this link after signing in:
https://docs.google.com/spreadsheets/d/1mN4c67FfOzsp7KBrsivKrS1NFwTk_x75AQwkYenhIQM/edit


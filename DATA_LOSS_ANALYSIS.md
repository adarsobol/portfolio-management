# Data Loss Analysis: Missing Initiatives Investigation

## Problem Summary
25 out of 29 initiatives uploaded for Tal Michael (`u_tm`) were lost without being documented in backup sheets.

## Root Cause: Race Condition in Bulk Upload Sync

### The Bug

**Location**: `src/components/modals/InitiativeModal.tsx` (lines 694-747) and `src/App.tsx` (lines 1624-1627)

**What Happens**:
1. When bulk uploading 29 items, each item calls `onSave()` individually
2. Each `onSave()` triggers `sheetsSync.queueInitiativeSync(item)` 
3. **CRITICAL**: Each NEW initiative triggers `forceSyncNow()` (line 1626), which immediately flushes the sync queue
4. This causes **29 simultaneous sync requests** to hit the server

### Server-Side Race Condition

**Location**: `server/index.ts` (lines 1975-2002)

**The Problem**:
```typescript
// Get all rows and remove duplicates from sheet first
const rows = await sheet.getRows();
const seenSheetIds = new Set<string>();
const rowsToDelete: GoogleSpreadsheetRow[] = [];

// Identify duplicate rows in the sheet (keep first occurrence, mark others for deletion)
for (const row of rows) {
  const id = row.get('id');
  if (!id || id.startsWith('_meta_')) continue;
  
  if (seenSheetIds.has(id)) {
    rowsToDelete.push(row);  // ⚠️ Marks for deletion
  } else {
    seenSheetIds.add(id);
  }
}

// Delete duplicate rows from sheet
if (rowsToDelete.length > 0) {
  console.log(`[SERVER] Upsert: Removing ${rowsToDelete.length} duplicate rows from sheet`);
  for (const row of rowsToDelete) {
    await row.delete();  // ⚠️ DELETES ROWS
  }
}
```

**What Goes Wrong**:
- When 29 sync requests hit the server simultaneously, they all read the sheet state at nearly the same time
- Each request sees the same rows and tries to deduplicate
- Due to timing, legitimate items might be incorrectly identified as "duplicates"
- The deduplication logic keeps the "first occurrence" but with concurrent requests, "first" is ambiguous
- Items get deleted before they're even fully saved

### Why No Backup?

The backup/snapshot system only creates backups:
1. **Manually** via Admin Panel → Create Backup
2. **Automatically** via scheduled daily backups (if configured)

Since the bulk upload happened without creating a manual backup first, and the items were deleted before any automatic backup ran, they were lost.

## Evidence

1. **No items in Google Sheets**: Confirmed missing from main Initiatives sheet
2. **Not in Trash**: Not soft-deleted (would have `status='Deleted'`)
3. **Not in snapshots**: No backup was created before upload
4. **Console logs**: Check server logs for lines like:
   - `[SERVER] Upsert: Removing X duplicate rows from sheet`
   - `[SERVER] Upsert: Deduplicated incoming initiatives: X -> Y`

## Fix Required

### Immediate Fix (Prevent Future Loss)

1. **Batch bulk uploads**: Instead of syncing each item individually, collect all initiatives and sync them in a single batch
2. **Remove `forceSyncNow()` for bulk uploads**: Let the debounced sync handle it naturally
3. **Add transaction-like behavior**: Use a lock or queue to prevent concurrent syncs from interfering

### Code Changes Needed

**File**: `src/components/modals/InitiativeModal.tsx`

Change `handleBulkSubmit()` to batch sync:

```typescript
const handleBulkSubmit = () => {
  if (!validateBulkRows()) return;

  const now = new Date().toISOString().split('T')[0];
  const generatedInitiatives: Initiative[] = [...allInitiatives];
  const initiativesToSave: Initiative[] = [];

  bulkRows.forEach(row => {
    const initiative: Initiative = {
      // ... create initiative ...
    };
    generatedInitiatives.push(initiative);
    initiativesToSave.push(initiative);
  });

  // Save all initiatives at once, then sync in batch
  initiativesToSave.forEach(initiative => {
    onSave(initiative, undefined);
  });
  
  // Force ONE sync after all items are queued (not per-item)
  if (initiativesToSave.length > 0) {
    sheetsSync.forceSyncNow();
  }

  onClose();
};
```

**Better**: Modify `onSave` to accept a flag to skip immediate sync, or create a `handleBulkSave` function.

**File**: `src/App.tsx`

Modify `handleSave` to not force immediate sync for bulk operations:

```typescript
const handleSave = (item: Initiative, tradeOffAction?: TradeOffAction, skipImmediateSync = false) => {
  // ... existing code ...
  
  // Only force immediate sync for single saves, not bulk
  if (existingIndex === -1 && !skipImmediateSync) {
    sheetsSync.forceSyncNow();
  }
}
```

### Server-Side Protection

**File**: `server/index.ts`

Add a mutex/lock to prevent concurrent deduplication:

```typescript
let syncLock = false;

app.post('/api/sheets/initiatives', authenticateToken, validate(initiativesArraySchema), async (req, res) => {
  // Wait for lock
  while (syncLock) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  syncLock = true;
  try {
    // ... existing sync logic ...
  } finally {
    syncLock = false;
  }
});
```

## Recovery Options

1. **Check Google Sheets Version History**: 
   - File → Version history → See version history
   - Look for a version before the bulk upload
   - Restore that version

2. **Check localStorage**: 
   - Open browser console: `localStorage.getItem('portfolio-initiatives-cache')`
   - Might contain the lost items if they were saved locally but failed to sync

3. **Check Server Logs**: 
   - Look for deletion logs around the time of upload
   - May show which items were deleted and why

4. **Re-upload**: If recovery fails, re-upload the 25 missing items (after fixing the bug)

## Prevention

1. **Always create a backup before bulk uploads**
2. **Fix the bulk upload sync mechanism** (see fixes above)
3. **Add monitoring/alerts** for unexpected deletions
4. **Consider using transactions** for bulk operations


# Google Cloud Migration Proposal

## Current Architecture Issues

### Google Sheets Limitations
- **Not Transactional**: Race conditions possible when multiple users update simultaneously
- **No Real-time Updates**: Requires polling for changes, inefficient and slow
- **Limited Querying**: Can't efficiently query by role, lastLogin, or complex filters
- **Column Management**: Adding/updating columns requires row reloading, causing data loss
- **Not Ideal for User Management**: Authentication data should be in a proper database
- **Performance**: Slower as data grows, especially with many rows
- **Concurrency**: Multiple writes can conflict and fail silently

## Recommended Google Cloud Architecture

### 1. User Management → Cloud Firestore

**Why Firestore**:
- ✅ Real-time updates with listeners
- ✅ Transactional writes (no race conditions)
- ✅ Built-in authentication integration
- ✅ Powerful querying (by role, lastLogin, date ranges, etc.)
- ✅ Automatic scaling
- ✅ Offline support
- ✅ Better security with fine-grained access control

**Migration Path**:
1. Set up Firestore database with `users` collection
2. Create indexes for common queries (role, lastLogin, email)
3. Migrate existing user data from Sheets to Firestore
4. Update authentication endpoints to use Firestore
5. Keep Sheets as read-only backup/export (optional)

**Collection Structure**:
```typescript
users/
  {userId}/
    - id: string
    - email: string
    - name: string
    - role: 'Admin' | 'User'
    - avatar: string
    - passwordHash: string (encrypted)
    - lastLogin: Timestamp
    - createdAt: Timestamp
    - updatedAt: Timestamp
```

**Benefits**:
- Login timestamps persist reliably
- Real-time user presence tracking
- Efficient queries: "Get all admins", "Users who logged in this week"
- No more header/column management issues

### 2. Snapshots → Cloud Storage + Firestore Metadata

**Why Cloud Storage**:
- ✅ Designed for large data files
- ✅ Versioning support (automatic backup history)
- ✅ Lifecycle policies (auto-delete old snapshots)
- ✅ Better performance than Sheets tabs
- ✅ Multiple formats: JSON, CSV, Parquet
- ✅ Cost-effective storage
- ✅ Direct download URLs

**Architecture**:
- **Cloud Storage**: Store snapshot data as JSON files
  - Path: `gs://your-bucket/snapshots/{timestamp}-{name}.json`
  - Format: Array of initiative objects
- **Firestore**: Store snapshot metadata
  - Collection: `snapshots`
  - Fields: id, timestamp, name, createdBy, filePath, size, initiativeCount

**Cloud Function for Snapshots**:
```typescript
// Triggered by Cloud Scheduler (weekly) or HTTP (manual)
export async function createSnapshot(data: any, context: any) {
  // 1. Pull current initiatives from Firestore
  // 2. Create JSON file
  // 3. Upload to Cloud Storage
  // 4. Save metadata to Firestore
  // 5. Return success
}
```

**Benefits**:
- Snapshots are never empty (pulled from current state)
- Version history automatically maintained
- Can store large snapshots efficiently
- Easy to restore from any snapshot
- Lifecycle policies auto-cleanup old snapshots

### 3. Initiatives Data → Firestore (Primary) + Sheets (Export)

**Hybrid Approach**:

**Firestore (Primary Database)**:
- Real-time listeners for live collaboration
- Better querying and filtering
- Transactional updates (no conflicts)
- Offline support
- Better performance at scale

**Google Sheets (Export/Sync)**:
- Periodic sync (every 5-10 minutes via Cloud Function)
- Read-only for most users
- Excel export capability
- Backup/audit trail
- Familiar interface for non-technical users

**Migration Strategy**:
1. Set up Firestore `initiatives` collection
2. Create Cloud Function to sync Firestore → Sheets periodically
3. Update frontend to use Firestore real-time listeners
4. Gradually migrate writes to Firestore
5. Keep Sheets sync as backup

**Collection Structure**:
```typescript
initiatives/
  {initiativeId}/
    - id: string
    - title: string
    - status: string
    - ownerId: string
    - ... (all current fields)
    - createdAt: Timestamp
    - updatedAt: Timestamp
    - version: number
```

### 4. Cloud Functions for Automation

**Scheduled Snapshots**:
- Cloud Function triggered by Cloud Scheduler
- Runs weekly (configurable)
- Creates snapshot in Cloud Storage
- Updates Firestore metadata

**Data Sync**:
- Cloud Function syncs Firestore → Sheets
- Runs every 5-10 minutes
- Only syncs changed documents
- Handles conflicts gracefully

**Backup Automation**:
- Daily backups to Cloud Storage
- Compressed JSON format
- Lifecycle policy for retention
- Easy restore process

**User Activity Tracking**:
- Cloud Function logs login events
- Stores in Firestore `userActivity` collection
- Better than Sheets for analytics

## Implementation Phases

### Phase 1: User Management Migration (Priority: High)
**Timeline**: 1-2 weeks

1. Set up Firestore project
2. Create `users` collection with indexes
3. Write migration script (Sheets → Firestore)
4. Update authentication endpoints
5. Test thoroughly
6. Deploy and monitor

**Benefits**: Solves login timestamp issue immediately

### Phase 2: Snapshot Migration (Priority: Medium)
**Timeline**: 1 week

1. Create Cloud Storage bucket
2. Set up Cloud Function for snapshots
3. Update snapshot creation to use Cloud Storage
4. Store metadata in Firestore
5. Update UI to list snapshots from Firestore
6. Test snapshot creation and restore

**Benefits**: Reliable snapshots, never empty

### Phase 3: Initiatives Migration (Priority: Low - Optional)
**Timeline**: 2-3 weeks

1. Set up Firestore `initiatives` collection
2. Create Cloud Function for Firestore → Sheets sync
3. Migrate existing initiatives
4. Update frontend to use Firestore listeners
5. Gradually move writes to Firestore
6. Keep Sheets as export/backup

**Benefits**: Real-time collaboration, better performance

## Google Cloud Services Required

### Core Services
1. **Cloud Firestore**: Primary database for users and initiatives
2. **Cloud Storage**: Snapshot file storage
3. **Cloud Functions**: Automation and sync
4. **Cloud Scheduler**: Trigger scheduled tasks

### Supporting Services
5. **Cloud Logging**: Centralized logging and debugging
6. **Cloud Monitoring**: Alerts for failures
7. **Cloud IAM**: Fine-grained access control
8. **Cloud Build**: CI/CD for functions

## Cost Estimation

### Firestore
- **Free Tier**: 50K reads/day, 20K writes/day, 20K deletes/day
- **Paid**: $0.06 per 100K document reads, $0.18 per 100K writes
- **Estimated**: ~$10-50/month for typical usage

### Cloud Storage
- **Free Tier**: 5GB storage, 5GB egress/month
- **Paid**: $0.020 per GB/month (Standard storage)
- **Estimated**: ~$1-5/month for snapshots

### Cloud Functions
- **Free Tier**: 2M invocations/month, 400K GB-seconds
- **Paid**: $0.40 per 1M invocations
- **Estimated**: ~$1-10/month

### Total Estimated Cost
- **Low Usage**: ~$15-30/month
- **Medium Usage**: ~$50-100/month
- **High Usage**: ~$100-200/month

*Much more cost-effective than maintaining Sheets infrastructure issues*

## Migration Checklist

### Pre-Migration
- [ ] Set up Google Cloud Project
- [ ] Enable required APIs (Firestore, Storage, Functions, Scheduler)
- [ ] Set up billing and quotas
- [ ] Create service accounts with proper permissions
- [ ] Set up Cloud Logging and Monitoring

### User Management Migration
- [ ] Create Firestore `users` collection
- [ ] Create indexes (role, lastLogin, email)
- [ ] Write migration script
- [ ] Test migration on staging data
- [ ] Update authentication endpoints
- [ ] Deploy and verify
- [ ] Monitor for issues

### Snapshot Migration
- [ ] Create Cloud Storage bucket
- [ ] Set up bucket lifecycle policies
- [ ] Create Cloud Function for snapshots
- [ ] Set up Cloud Scheduler trigger
- [ ] Update snapshot creation endpoints
- [ ] Update UI to list from Firestore
- [ ] Test snapshot creation and restore

### Initiatives Migration (Optional)
- [ ] Create Firestore `initiatives` collection
- [ ] Create indexes for common queries
- [ ] Create Cloud Function for sync
- [ ] Migrate existing initiatives
- [ ] Update frontend listeners
- [ ] Test real-time updates
- [ ] Monitor sync performance

## Benefits Summary

### Immediate Benefits
1. ✅ Login timestamps persist reliably
2. ✅ Snapshots never empty
3. ✅ Better error handling and logging
4. ✅ No more column management issues

### Long-term Benefits
1. ✅ Real-time collaboration
2. ✅ Better performance at scale
3. ✅ Reduced maintenance overhead
4. ✅ Better security and access control
5. ✅ Cost-effective scaling
6. ✅ Professional architecture

## Next Steps

1. **Review this proposal** with team
2. **Set up Google Cloud Project** (if not already done)
3. **Start with Phase 1** (User Management) - highest priority
4. **Test thoroughly** before full migration
5. **Monitor and iterate** based on usage patterns

## Questions or Concerns?

- **Migration Risk**: Can be done gradually, keeping Sheets as backup
- **Cost**: Very reasonable, especially compared to maintenance time
- **Complexity**: Cloud Functions handle most complexity
- **Downtime**: Zero downtime migration possible
- **Rollback**: Easy to rollback if needed (keep Sheets as backup)


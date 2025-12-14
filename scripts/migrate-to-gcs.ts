#!/usr/bin/env npx tsx
/**
 * Data Migration Script: Google Sheets → Google Cloud Storage
 * 
 * This script migrates all data from Google Sheets to GCS.
 * 
 * Prerequisites:
 * 1. Install @google-cloud/storage: npm install @google-cloud/storage
 * 2. Set environment variables:
 *    - GOOGLE_SPREADSHEET_ID
 *    - GOOGLE_SERVICE_ACCOUNT_EMAIL
 *    - GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
 *    - GCS_BUCKET_NAME
 *    - GCS_PROJECT_ID
 * 
 * Usage:
 *   npx tsx scripts/migrate-to-gcs.ts [--dry-run]
 */

import dotenv from 'dotenv';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

dotenv.config();

// ============================================
// CONFIGURATION
// ============================================

const DRY_RUN = process.argv.includes('--dry-run');
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SERVICE_ACCOUNT_PRIVATE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');
const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;
const GCS_PROJECT_ID = process.env.GCS_PROJECT_ID;

// ============================================
// TYPES
// ============================================

interface Initiative {
  id: string;
  l1_assetClass: string;
  l2_pillar: string;
  l3_responsibility: string;
  l4_target: string;
  title: string;
  ownerId: string;
  secondaryOwner?: string;
  quarter: string;
  status: string;
  priority: number;
  estimatedEffort: number;
  originalEstimatedEffort: number;
  actualEffort: number;
  eta: string;
  originalEta: string;
  lastUpdated: string;
  dependencyTeams?: string[];
  workType: string;
  unplannedTags?: string[];
  riskActionLog?: string;
  comments?: unknown[];
  history?: unknown[];
}

interface ChangeRecord {
  id: string;
  initiativeId: string;
  initiativeTitle: string;
  field: string;
  oldValue: string;
  newValue: string;
  changedBy: string;
  timestamp: string;
}

// ============================================
// GOOGLE SHEETS CONNECTION
// ============================================

async function getSheetDoc(): Promise<GoogleSpreadsheet | null> {
  if (!SPREADSHEET_ID || !SERVICE_ACCOUNT_EMAIL || !SERVICE_ACCOUNT_PRIVATE_KEY) {
    console.error('Missing Google Sheets credentials');
    return null;
  }

  const serviceAccountAuth = new JWT({
    email: SERVICE_ACCOUNT_EMAIL,
    key: SERVICE_ACCOUNT_PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
  await doc.loadInfo();
  return doc;
}

// ============================================
// DATA EXTRACTION
// ============================================

async function extractInitiatives(doc: GoogleSpreadsheet): Promise<Initiative[]> {
  console.log('Extracting initiatives...');
  
  const sheet = doc.sheetsByTitle['Initiatives'];
  if (!sheet) {
    console.warn('No Initiatives sheet found');
    return [];
  }

  const rows = await sheet.getRows();
  const initiatives: Initiative[] = [];

  for (const row of rows) {
    try {
      const initiative: Initiative = {
        id: row.get('id') || '',
        l1_assetClass: row.get('l1_assetClass') || '',
        l2_pillar: row.get('l2_pillar') || '',
        l3_responsibility: row.get('l3_responsibility') || '',
        l4_target: row.get('l4_target') || '',
        title: row.get('title') || '',
        ownerId: row.get('ownerId') || '',
        secondaryOwner: row.get('secondaryOwner') || undefined,
        quarter: row.get('quarter') || '',
        status: row.get('status') || 'Not Started',
        priority: parseInt(row.get('priority')) || 3,
        estimatedEffort: parseFloat(row.get('estimatedEffort')) || 0,
        originalEstimatedEffort: parseFloat(row.get('originalEstimatedEffort')) || 0,
        actualEffort: parseFloat(row.get('actualEffort')) || 0,
        eta: row.get('eta') || '',
        originalEta: row.get('originalEta') || '',
        lastUpdated: row.get('lastUpdated') || new Date().toISOString().split('T')[0],
        workType: row.get('workType') || 'Planned',
        riskActionLog: row.get('riskActionLog') || undefined,
      };

      // Parse JSON fields
      try {
        const deps = row.get('dependencies');
        if (deps) {
          initiative.dependencyTeams = deps.split(',').map((d: string) => d.trim()).filter(Boolean);
        }
      } catch { /* ignore */ }

      try {
        const tags = row.get('unplannedTags');
        if (tags) {
          initiative.unplannedTags = JSON.parse(tags);
        }
      } catch { /* ignore */ }

      try {
        const comments = row.get('comments');
        if (comments) {
          initiative.comments = JSON.parse(comments);
        }
      } catch { /* ignore */ }

      try {
        const history = row.get('history');
        if (history) {
          initiative.history = JSON.parse(history);
        }
      } catch { /* ignore */ }

      if (initiative.id) {
        initiatives.push(initiative);
      }
    } catch (error) {
      console.warn('Failed to parse row:', error);
    }
  }

  console.log(`  Found ${initiatives.length} initiatives`);
  return initiatives;
}

async function extractChangelog(doc: GoogleSpreadsheet): Promise<ChangeRecord[]> {
  console.log('Extracting changelog...');
  
  const sheet = doc.sheetsByTitle['Changelog'];
  if (!sheet) {
    console.warn('No Changelog sheet found');
    return [];
  }

  const rows = await sheet.getRows();
  const changelog: ChangeRecord[] = [];

  for (const row of rows) {
    try {
      const change: ChangeRecord = {
        id: row.get('id') || '',
        initiativeId: row.get('initiativeId') || '',
        initiativeTitle: row.get('initiativeTitle') || '',
        field: row.get('field') || '',
        oldValue: row.get('oldValue') || '',
        newValue: row.get('newValue') || '',
        changedBy: row.get('changedBy') || '',
        timestamp: row.get('timestamp') || '',
      };

      if (change.id) {
        changelog.push(change);
      }
    } catch (error) {
      console.warn('Failed to parse changelog row:', error);
    }
  }

  console.log(`  Found ${changelog.length} changelog entries`);
  return changelog;
}

// ============================================
// GCS UPLOAD
// ============================================

async function uploadToGCS(data: { initiatives: Initiative[]; changelog: ChangeRecord[] }): Promise<boolean> {
  if (DRY_RUN) {
    console.log('\n=== DRY RUN ===');
    console.log('Would upload to GCS:');
    console.log(`  - ${data.initiatives.length} initiatives`);
    console.log(`  - ${data.changelog.length} changelog entries`);
    console.log('\nSample initiative:', JSON.stringify(data.initiatives[0], null, 2).substring(0, 500));
    return true;
  }

  if (!GCS_BUCKET_NAME || !GCS_PROJECT_ID) {
    console.error('Missing GCS configuration (GCS_BUCKET_NAME, GCS_PROJECT_ID)');
    return false;
  }

  try {
    const { Storage } = await import('@google-cloud/storage');
    const storage = new Storage({ projectId: GCS_PROJECT_ID });
    const bucket = storage.bucket(GCS_BUCKET_NAME);

    // Upload initiatives
    console.log('Uploading initiatives to GCS...');
    const initiativesFile = bucket.file('data/initiatives.json');
    await initiativesFile.save(JSON.stringify(data.initiatives, null, 2), {
      contentType: 'application/json',
      metadata: {
        migrated: new Date().toISOString(),
        source: 'google-sheets'
      }
    });
    console.log('  ✓ Initiatives uploaded');

    // Upload changelog
    console.log('Uploading changelog to GCS...');
    const changelogFile = bucket.file('data/changelog.json');
    await changelogFile.save(JSON.stringify(data.changelog, null, 2), {
      contentType: 'application/json',
      metadata: {
        migrated: new Date().toISOString(),
        source: 'google-sheets'
      }
    });
    console.log('  ✓ Changelog uploaded');

    return true;
  } catch (error) {
    console.error('Failed to upload to GCS:', error);
    return false;
  }
}

// ============================================
// VALIDATION
// ============================================

async function validateMigration(): Promise<boolean> {
  if (DRY_RUN) {
    console.log('\nValidation skipped in dry run mode');
    return true;
  }

  if (!GCS_BUCKET_NAME || !GCS_PROJECT_ID) {
    return false;
  }

  try {
    const { Storage } = await import('@google-cloud/storage');
    const storage = new Storage({ projectId: GCS_PROJECT_ID });
    const bucket = storage.bucket(GCS_BUCKET_NAME);

    console.log('\nValidating migration...');

    // Check initiatives file
    const initiativesFile = bucket.file('data/initiatives.json');
    const [initiativesExists] = await initiativesFile.exists();
    if (!initiativesExists) {
      console.error('  ✗ Initiatives file not found');
      return false;
    }
    const [initiativesContent] = await initiativesFile.download();
    const initiatives = JSON.parse(initiativesContent.toString());
    console.log(`  ✓ Initiatives file valid (${initiatives.length} records)`);

    // Check changelog file
    const changelogFile = bucket.file('data/changelog.json');
    const [changelogExists] = await changelogFile.exists();
    if (!changelogExists) {
      console.error('  ✗ Changelog file not found');
      return false;
    }
    const [changelogContent] = await changelogFile.download();
    const changelog = JSON.parse(changelogContent.toString());
    console.log(`  ✓ Changelog file valid (${changelog.length} records)`);

    return true;
  } catch (error) {
    console.error('Validation failed:', error);
    return false;
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('='.repeat(50));
  console.log('Portfolio Manager: Google Sheets → GCS Migration');
  console.log('='.repeat(50));
  console.log('');

  if (DRY_RUN) {
    console.log('🔍 Running in DRY RUN mode (no changes will be made)\n');
  }

  // Step 1: Connect to Google Sheets
  console.log('Step 1: Connecting to Google Sheets...');
  const doc = await getSheetDoc();
  if (!doc) {
    console.error('Failed to connect to Google Sheets');
    process.exit(1);
  }
  console.log(`  Connected to: ${doc.title}\n`);

  // Step 2: Extract data
  console.log('Step 2: Extracting data from Google Sheets...');
  const initiatives = await extractInitiatives(doc);
  const changelog = await extractChangelog(doc);
  console.log('');

  // Step 3: Upload to GCS
  console.log('Step 3: Uploading to Google Cloud Storage...');
  const uploadSuccess = await uploadToGCS({ initiatives, changelog });
  if (!uploadSuccess) {
    console.error('Migration failed during upload');
    process.exit(1);
  }
  console.log('');

  // Step 4: Validate
  console.log('Step 4: Validating migration...');
  const valid = await validateMigration();
  if (!valid) {
    console.error('Migration validation failed');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(50));
  console.log('✓ Migration completed successfully!');
  console.log('='.repeat(50));
  console.log('\nNext steps:');
  console.log('1. Set GCS_BUCKET_NAME and GCS_PROJECT_ID in your .env');
  console.log('2. Restart the server');
  console.log('3. Verify the app works with GCS backend');
}

main().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});

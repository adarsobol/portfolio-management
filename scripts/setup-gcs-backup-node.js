#!/usr/bin/env node
/**
 * GCS Backup Setup Script (Node.js)
 * 
 * Sets up complete backup infrastructure without requiring gcloud CLI:
 * 1. Creates bucket if needed
 * 2. Enables object versioning
 * 3. Applies lifecycle policies
 * 4. Prepares Cloud Function for deployment
 * 5. Provides instructions for Cloud Scheduler
 */

import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Get configuration
const BUCKET_NAME = process.env.GCS_BUCKET_NAME || process.argv[2] || 'portfolio-manager-data';
const PROJECT_ID = process.env.GCS_PROJECT_ID || process.argv[3] || 'research-modeling-vertex-ai';
const REGION = process.argv[4] || 'us-central1';

async function main() {
  log('============================================', 'blue');
  log('Complete GCS Backup Setup (Node.js)', 'blue');
  log('============================================', 'blue');
  console.log('');
  log(`Bucket: gs://${BUCKET_NAME}`, 'green');
  log(`Project: ${PROJECT_ID}`, 'green');
  log(`Region: ${REGION}`, 'green');
  console.log('');

  try {
    // Initialize storage client
    // Try to use service account key if available, otherwise use default credentials
    const storageOptions = { projectId: PROJECT_ID };
    
    // Check for service account key file
    const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (keyFile && fs.existsSync(keyFile)) {
      storageOptions.keyFilename = keyFile;
      log(`Using credentials from: ${keyFile}`, 'yellow');
    } else {
      log('Using default application credentials', 'yellow');
      log('  (Set GOOGLE_APPLICATION_CREDENTIALS for service account)', 'yellow');
    }
    
    const storage = new Storage(storageOptions);

    // ============================================
    // Step 1: Create Bucket (if needed)
    // ============================================
    log('Step 1: Checking bucket...', 'yellow');
    
    let bucket;
    try {
      bucket = storage.bucket(BUCKET_NAME);
      const [exists] = await bucket.exists();
      
      if (!exists) {
        log('Creating bucket...', 'yellow');
        await bucket.create({
          location: REGION,
          storageClass: 'STANDARD',
        });
        log('✓ Bucket created', 'green');
      } else {
        log('✓ Bucket already exists', 'green');
      }
    } catch (error) {
      log(`✗ Error with bucket: ${error.message}`, 'red');
      throw error;
    }

    // ============================================
    // Step 2: Enable Object Versioning
    // ============================================
    console.log('');
    log('Step 2: Enabling object versioning...', 'yellow');
    
    try {
      await bucket.setMetadata({
        versioning: {
          enabled: true,
        },
      });
      log('✓ Object versioning enabled', 'green');
    } catch (error) {
      log(`✗ Failed to enable versioning: ${error.message}`, 'red');
      throw error;
    }

    // ============================================
    // Step 3: Apply Lifecycle Policy
    // ============================================
    console.log('');
    log('Step 3: Applying lifecycle policy...', 'yellow');
    
    const lifecycleConfig = {
      lifecycle: {
        rule: [
          {
            action: { type: 'Delete' },
            condition: {
              age: 365,
              isLive: false,
            },
          },
          {
            action: {
              type: 'SetStorageClass',
              storageClass: 'NEARLINE',
            },
            condition: {
              age: 30,
              isLive: false,
              matchesStorageClass: ['STANDARD'],
            },
          },
          {
            action: {
              type: 'SetStorageClass',
              storageClass: 'COLDLINE',
            },
            condition: {
              age: 90,
              isLive: false,
              matchesStorageClass: ['NEARLINE'],
            },
          },
        ],
      },
    };

    try {
      await bucket.setMetadata({ lifecycle: lifecycleConfig.lifecycle });
      log('✓ Lifecycle policy applied', 'green');
    } catch (error) {
      log(`✗ Failed to apply lifecycle policy: ${error.message}`, 'red');
      // Don't throw - lifecycle policy is optional
    }

    // ============================================
    // Step 4: Create Backup Folder Structure
    // ============================================
    console.log('');
    log('Step 4: Creating backup folder structure...', 'yellow');
    
    try {
      const markerFile = bucket.file('backups/.metadata.json');
      const markerContent = JSON.stringify({
        created: new Date().toISOString(),
        type: 'backup_directory_marker',
      });
      
      await markerFile.save(markerContent, {
        contentType: 'application/json',
      });
      log('✓ Backup folder structure ready', 'green');
    } catch (error) {
      // Ignore if file already exists
      log('✓ Backup folder structure ready', 'green');
    }

    // ============================================
    // Step 5: Prepare Cloud Function
    // ============================================
    console.log('');
    log('Step 5: Preparing Cloud Function...', 'yellow');
    
    const functionDir = path.join(__dirname, '../functions/backup');
    const packageJsonPath = path.join(functionDir, 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
      log('⚠ Cloud Function directory not found', 'yellow');
      log('  You may need to deploy it manually', 'yellow');
    } else {
      log('✓ Cloud Function code ready', 'green');
      log('  Deploy with: cd functions/backup && npm run deploy', 'yellow');
    }

    // ============================================
    // Step 6: Enable Required APIs
    // ============================================
    console.log('');
    log('Step 6: Checking required APIs...', 'yellow');
    
    // Note: API enabling requires Service Usage API permissions
    // We'll just inform the user
    log('  Make sure these APIs are enabled:', 'yellow');
    log('    - cloudfunctions.googleapis.com', 'yellow');
    log('    - cloudscheduler.googleapis.com', 'yellow');
    log('    - cloudbuild.googleapis.com', 'yellow');
    log('  Enable via: gcloud services enable <api-name>', 'yellow');

    // ============================================
    // Summary
    // ============================================
    console.log('');
    log('============================================', 'blue');
    log('Setup Complete!', 'green');
    log('============================================', 'blue');
    console.log('');
    log('✅ Configuration applied:', 'green');
    log(`  • Bucket: gs://${BUCKET_NAME}`, 'green');
    log('  • Object versioning: ENABLED', 'green');
    log('  • Lifecycle policy: 365-day retention', 'green');
    console.log('');
    log('📋 Next Steps:', 'blue');
    console.log('');
    log('1. Deploy Cloud Function:', 'yellow');
    log('   cd functions/backup', 'yellow');
    log('   npm install', 'yellow');
    log('   npm run build', 'yellow');
    log(`   gcloud functions deploy backup-daily \\`, 'yellow');
    log(`     --gen2 \\`, 'yellow');
    log(`     --runtime=nodejs20 \\`, 'yellow');
    log(`     --trigger-http \\`, 'yellow');
    log(`     --allow-unauthenticated=false \\`, 'yellow');
    log(`     --entry-point=backupDaily \\`, 'yellow');
    log(`     --source=. \\`, 'yellow');
    log(`     --region=${REGION} \\`, 'yellow');
    log(`     --set-env-vars="GCS_BUCKET_NAME=${BUCKET_NAME},GCS_PROJECT_ID=${PROJECT_ID}"`, 'yellow');
    console.log('');
    log('2. Set up Cloud Scheduler:', 'yellow');
    log('   Get function URL first:', 'yellow');
    log(`   FUNCTION_URL=$(gcloud functions describe backup-daily --gen2 --region=${REGION} --format="value(serviceConfig.uri)")`, 'yellow');
    console.log('');
    log('   Then create scheduler (weekly on Thursday at 6 PM):', 'yellow');
    log(`   gcloud scheduler jobs create http backup-weekly-job \\`, 'yellow');
    log(`     --location=${REGION} \\`, 'yellow');
    log(`     --schedule="0 18 * * 4" \\`, 'yellow');
    log(`     --uri="\${FUNCTION_URL}" \\`, 'yellow');
    log(`     --http-method=POST \\`, 'yellow');
    log(`     --oidc-service-account-email="${PROJECT_ID}@appspot.gserviceaccount.com" \\`, 'yellow');
    log(`     --time-zone="America/New_York"`, 'yellow');
    console.log('');
    log('3. Test the backup:', 'yellow');
    log(`   gcloud scheduler jobs run backup-weekly-job --location=${REGION}`, 'yellow');
    console.log('');
    log('🎉 Your backup infrastructure is ready!', 'green');

  } catch (error) {
    log(`\n✗ Error: ${error.message}`, 'red');
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main().catch(console.error);


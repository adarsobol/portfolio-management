#!/usr/bin/env node
/**
 * Script to check which storage backend is being used
 * and where your data actually is
 */

import * as fs from 'fs';
import * as path from 'path';

console.log('🔍 Checking Storage Backend Configuration\n');

// Check .env file
const envPath = path.join(process.cwd(), '.env');
let gcsBucketName: string | null = null;
let gcsProjectId: string | null = null;
let spreadsheetId: string | null = null;

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const lines = envContent.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('GCS_BUCKET_NAME=')) {
      gcsBucketName = line.split('=')[1].trim();
    }
    if (line.startsWith('GCS_PROJECT_ID=')) {
      gcsProjectId = line.split('=')[1].trim();
    }
    if (line.startsWith('GOOGLE_SPREADSHEET_ID=')) {
      spreadsheetId = line.split('=')[1].trim();
    }
  }
}

console.log('📋 Configuration Found:');
console.log('─'.repeat(50));

if (gcsBucketName && gcsProjectId) {
  console.log('✅ GCS Storage Configured:');
  console.log(`   Bucket: ${gcsBucketName}`);
  console.log(`   Project: ${gcsProjectId}`);
  console.log(`   URL: https://console.cloud.google.com/storage/browser/${gcsBucketName}?project=${gcsProjectId}`);
  console.log('');
  console.log('💡 Your data should be in Google Cloud Storage');
  console.log('   If bucket not found, create it or check permissions');
} else {
  console.log('❌ GCS Storage NOT configured');
  console.log('   (GCS_BUCKET_NAME or GCS_PROJECT_ID missing)');
}

if (spreadsheetId) {
  console.log('');
  console.log('✅ Google Sheets Configured:');
  console.log(`   Spreadsheet ID: ${spreadsheetId}`);
  console.log(`   URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  console.log('');
  console.log('💡 Your data might be in Google Sheets instead of GCS');
}

console.log('');
console.log('─'.repeat(50));
console.log('');

if (!gcsBucketName && !spreadsheetId) {
  console.log('⚠️  No storage backend configured!');
  console.log('   Set up either GCS or Google Sheets in your .env file');
} else if (gcsBucketName && !spreadsheetId) {
  console.log('📦 Using: Google Cloud Storage');
  console.log(`   Check bucket: gs://${gcsBucketName}`);
} else if (!gcsBucketName && spreadsheetId) {
  console.log('📊 Using: Google Sheets');
  console.log(`   Check spreadsheet: ${spreadsheetId}`);
} else {
  console.log('🔄 Both configured - app will use GCS if available, fallback to Sheets');
  console.log('   Check GCS first, then Sheets if needed');
}

console.log('');


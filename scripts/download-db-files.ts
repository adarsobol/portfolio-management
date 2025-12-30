#!/usr/bin/env node
/**
 * Node.js script to download all database JSON files from Google Cloud Storage
 * Usage: npx tsx scripts/download-db-files.ts [bucket-name] [output-dir]
 */

import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';

const BUCKET_NAME = process.env.GCS_BUCKET_NAME || process.argv[2] || 'portfolio-manager-data';
const PROJECT_ID = process.env.GCS_PROJECT_ID || process.argv[3] || undefined;
const OUTPUT_DIR = process.argv[4] || 'db-backup';

interface FileInfo {
  name: string;
  size: number;
  updated: Date;
}

async function downloadFiles() {
  console.log('📦 Downloading database files from GCS');
  console.log(`Bucket: gs://${BUCKET_NAME}`);
  console.log(`Output: ${OUTPUT_DIR}\n`);

  try {
    // Initialize GCS client
    const storage = new Storage({
      projectId: PROJECT_ID,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });

    const bucket = storage.bucket(BUCKET_NAME);

    // Check if bucket exists
    const [exists] = await bucket.exists();
    if (!exists) {
      console.error(`❌ Error: Bucket gs://${BUCKET_NAME} does not exist`);
      process.exit(1);
    }

    // Create output directories
    const dirs = [
      path.join(OUTPUT_DIR, 'data'),
      path.join(OUTPUT_DIR, 'data', 'notifications'),
      path.join(OUTPUT_DIR, 'snapshots'),
      path.join(OUTPUT_DIR, 'support'),
      path.join(OUTPUT_DIR, 'logs', 'activity'),
      path.join(OUTPUT_DIR, 'logs', 'errors'),
    ];

    for (const dir of dirs) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Download main data files
    console.log('Downloading main data files...');
    const dataFiles = await downloadPrefix(bucket, 'data/', path.join(OUTPUT_DIR, 'data'));
    console.log(`  ✓ Downloaded ${dataFiles.length} data files`);

    // Download snapshots
    console.log('Downloading snapshots...');
    const snapshots = await downloadPrefix(bucket, 'snapshots/', path.join(OUTPUT_DIR, 'snapshots'));
    console.log(`  ✓ Downloaded ${snapshots.length} snapshots`);

    // Download support files
    console.log('Downloading support files...');
    const supportFiles = await downloadPrefix(bucket, 'support/', path.join(OUTPUT_DIR, 'support'));
    console.log(`  ✓ Downloaded ${supportFiles.length} support files`);

    // Download logs (optional)
    console.log('Downloading logs...');
    const logs = await downloadPrefix(bucket, 'logs/', path.join(OUTPUT_DIR, 'logs'));
    console.log(`  ✓ Downloaded ${logs.length} log files`);

    console.log('\n✅ Download complete!');
    console.log(`\nFiles downloaded to: ${OUTPUT_DIR}/`);
    console.log('\nSummary:');
    console.log(`  📄 Data files: ${dataFiles.length}`);
    console.log(`  📸 Snapshots: ${snapshots.length}`);
    console.log(`  🎫 Support files: ${supportFiles.length}`);
    console.log(`  📋 Log files: ${logs.length}`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

async function downloadPrefix(
  bucket: any,
  prefix: string,
  outputDir: string
): Promise<FileInfo[]> {
  try {
    const [files] = await bucket.getFiles({ prefix });
    const downloaded: FileInfo[] = [];

    for (const file of files) {
      const fileName = file.name;
      const relativePath = fileName.replace(prefix, '');
      
      // Skip if it's a directory marker
      if (!relativePath || relativePath.endsWith('/')) {
        continue;
      }

      const outputPath = path.join(outputDir, relativePath);
      const outputDirPath = path.dirname(outputPath);
      
      // Create subdirectories if needed
      fs.mkdirSync(outputDirPath, { recursive: true });

      // Download file
      await file.download({ destination: outputPath });
      
      const [metadata] = await file.getMetadata();
      downloaded.push({
        name: fileName,
        size: parseInt(metadata.size || '0', 10),
        updated: new Date(metadata.updated || Date.now()),
      });
    }

    return downloaded;
  } catch (error: any) {
    if (error.code === 404) {
      // Prefix doesn't exist, return empty array
      return [];
    }
    throw error;
  }
}

// Run the script
downloadFiles().catch(console.error);


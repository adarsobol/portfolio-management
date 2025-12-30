#!/usr/bin/env node
/**
 * Simple script to view/download database JSON files from Google Cloud Storage
 * Usage: npx tsx scripts/view-db-files.ts [command] [file]
 * 
 * Commands:
 *   list          - List all files in the bucket
 *   view <file>   - View a specific file (e.g., data/initiatives.json)
 *   download      - Download all files to db-backup/
 */

import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// Get configuration from environment or defaults
const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'portfolio-manager-data';
const PROJECT_ID = process.env.GCS_PROJECT_ID || 'research-modeling-vertex-ai';
const KEY_FILE = process.env.GOOGLE_APPLICATION_CREDENTIALS;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function initializeStorage() {
  try {
    const config: any = {
      projectId: PROJECT_ID,
    };

    // Use key file if provided, otherwise use default credentials
    if (KEY_FILE && fs.existsSync(KEY_FILE)) {
      config.keyFilename = KEY_FILE;
      console.log(`✓ Using credentials from: ${KEY_FILE}`);
    } else {
      console.log('ℹ Using default application credentials');
      console.log('  (Set GOOGLE_APPLICATION_CREDENTIALS for service account)');
    }

    const storage = new Storage(config);
    const bucket = storage.bucket(BUCKET_NAME);

    // Check if bucket exists
    const [exists] = await bucket.exists();
    if (!exists) {
      throw new Error(`Bucket gs://${BUCKET_NAME} does not exist or is not accessible`);
    }

    console.log(`✓ Connected to bucket: gs://${BUCKET_NAME}\n`);
    return { storage, bucket };
  } catch (error: any) {
    console.error('❌ Error connecting to GCS:');
    console.error(error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Make sure you have Google Cloud credentials set up');
    console.error('2. Set GOOGLE_APPLICATION_CREDENTIALS to your service account key file');
    console.error('3. Or run: gcloud auth application-default login');
    process.exit(1);
  }
}

async function listFiles(bucket: any) {
  console.log('📁 Files in bucket:\n');
  
  try {
    const [files] = await bucket.getFiles();
    
    if (files.length === 0) {
      console.log('  (No files found)');
      return;
    }

    // Group by directory
    const dirs: Record<string, string[]> = {};
    
    files.forEach((file: any) => {
      const parts = file.name.split('/');
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '/';
      if (!dirs[dir]) dirs[dir] = [];
      dirs[dir].push(parts[parts.length - 1]);
    });

    Object.keys(dirs).sort().forEach((dir) => {
      console.log(`  📂 ${dir === '/' ? 'root' : dir}/`);
      dirs[dir].forEach((file) => {
        console.log(`     └─ ${file}`);
      });
      console.log('');
    });

    console.log(`Total: ${files.length} files`);
  } catch (error: any) {
    console.error('❌ Error listing files:', error.message);
  }
}

async function viewFile(bucket: any, filePath: string) {
  try {
    const file = bucket.file(filePath);
    const [exists] = await file.exists();
    
    if (!exists) {
      console.error(`❌ File not found: ${filePath}`);
      return;
    }

    const [contents] = await file.download();
    const data = JSON.parse(contents.toString());
    
    console.log(`\n📄 Contents of ${filePath}:\n`);
    console.log(JSON.stringify(data, null, 2));
    
    // Ask if user wants to save it
    const save = await question('\n💾 Save to local file? (y/N): ');
    if (save.toLowerCase() === 'y') {
      const localPath = path.join(process.cwd(), path.basename(filePath));
      fs.writeFileSync(localPath, JSON.stringify(data, null, 2));
      console.log(`✓ Saved to: ${localPath}`);
    }
  } catch (error: any) {
    console.error('❌ Error viewing file:', error.message);
  }
}

async function downloadAll(bucket: any) {
  const outputDir = 'db-backup';
  console.log(`\n📥 Downloading all files to ${outputDir}/...\n`);

  try {
    const [files] = await bucket.getFiles();
    
    if (files.length === 0) {
      console.log('  (No files to download)');
      return;
    }

    let downloaded = 0;
    for (const file of files) {
      const fileName = file.name;
      const localPath = path.join(outputDir, fileName);
      const localDir = path.dirname(localPath);
      
      fs.mkdirSync(localDir, { recursive: true });
      await file.download({ destination: localPath });
      console.log(`  ✓ ${fileName}`);
      downloaded++;
    }

    console.log(`\n✅ Downloaded ${downloaded} files to ${outputDir}/`);
  } catch (error: any) {
    console.error('❌ Error downloading files:', error.message);
  }
}

async function main() {
  const command = process.argv[2] || 'list';
  const filePath = process.argv[3];

  console.log('🔍 Accessing Google Cloud Storage Database Files\n');
  console.log(`Bucket: gs://${BUCKET_NAME}`);
  console.log(`Project: ${PROJECT_ID}\n`);

  const { bucket } = await initializeStorage();

  switch (command) {
    case 'list':
      await listFiles(bucket);
      break;
    
    case 'view':
      if (!filePath) {
        console.error('❌ Please specify a file path');
        console.error('Example: npx tsx scripts/view-db-files.ts view data/initiatives.json');
        process.exit(1);
      }
      await viewFile(bucket, filePath);
      break;
    
    case 'download':
      await downloadAll(bucket);
      break;
    
    default:
      console.log('Usage:');
      console.log('  npx tsx scripts/view-db-files.ts list                    # List all files');
      console.log('  npx tsx scripts/view-db-files.ts view <file-path>       # View a file');
      console.log('  npx tsx scripts/view-db-files.ts download               # Download all files');
      console.log('');
      console.log('Examples:');
      console.log('  npx tsx scripts/view-db-files.ts view data/initiatives.json');
      console.log('  npx tsx scripts/view-db-files.ts view data/users.json');
      process.exit(1);
  }

  rl.close();
}

main().catch(console.error);


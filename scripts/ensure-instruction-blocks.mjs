#!/usr/bin/env node
/* eslint-env node */
/* eslint no-console: "off" */
/* global process, console */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// ============================================================================
// Configuration
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const APPEND_DATE = process.env.APPEND_DATE || '2026-02-06';
const BACKUP_ENABLED = process.env.BACKUP_ENABLED !== 'false'; // default true
const DRY_RUN = process.argv.includes('--dry-run');

const files = [
  '.github/copilot-instructions.md',
  '.roocode/memory-bank.md'
];

// Template files (keep the actual content in template md files for safety)
const TEMPLATE_DIR = path.join(__dirname, 'templates');
const TEMPLATE_ENFORCEMENT = path.join(TEMPLATE_DIR, `enforcement-${APPEND_DATE}.md`);
const TEMPLATE_BEST = path.join(TEMPLATE_DIR, `best-${APPEND_DATE}.md`);

// ============================================================================
// Helper functions
// ============================================================================

async function checkFileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch (e) {
    return false;
  }
}

function isPathSafe(targetPath) {
  const resolved = path.resolve(repoRoot, targetPath);
  return resolved.startsWith(repoRoot + path.sep) || resolved === repoRoot;
}

async function readTemplate(templatePath) {
  if (!(await checkFileExists(templatePath))) {
    throw new Error(`Missing template: ${templatePath}`);
  }
  let content = await fs.readFile(templatePath, 'utf8');
  // Replace placeholder with actual date
  content = content.replace(/{{APPEND_DATE}}/g, APPEND_DATE);
  return content;
}

async function createBackup(fullPath) {
  if (!BACKUP_ENABLED) return null;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${fullPath}.backup-${timestamp}`;
  await fs.copyFile(fullPath, backupPath);
  return backupPath;
}

async function isContentAlreadyAppended(fullPath, header) {
  const content = await fs.readFile(fullPath, 'utf8');
  return content.includes(header);
}

async function appendToFile(fullPath, contentToAppend) {
  const before = await fs.readFile(fullPath, 'utf8');
  const newContent = before + '\n\n' + contentToAppend + '\n';
  await fs.writeFile(fullPath, newContent, 'utf8');
}

async function processFile(relativePath) {
  try {
    if (!isPathSafe(relativePath)) {
      console.error(`Path traversal detected: ${relativePath}`);
      return { status: 'failed', reason: 'path-unsafe' };
    }

    const fullPath = path.resolve(repoRoot, relativePath);
    if (!(await checkFileExists(fullPath))) {
      return { status: 'failed', reason: 'not-found' };
    }

    // Choose template & header
    const isCopilot = relativePath.startsWith('.github');
    const templatePath = isCopilot ? TEMPLATE_ENFORCEMENT : TEMPLATE_BEST;
    const contentToAppend = await readTemplate(templatePath);
    const headerLine = contentToAppend.split('\n')[0].trim();

    if (await isContentAlreadyAppended(fullPath, headerLine)) {
      return { status: 'skipped' };
    }

    // Backup
    const backup = await createBackup(fullPath);

    if (DRY_RUN) {
      console.log(`DRY RUN: would update ${relativePath} (backup: ${backup || 'none'})`);
      return { status: 'dry-run', backup };
    }

    await appendToFile(fullPath, contentToAppend);

    // Stage the file so changes are visible to user for commit
    try {
      execSync(`git add "${relativePath}"`, { stdio: 'ignore' });
    } catch (e) {
      // Non-fatal; continue
      console.warn(`git add failed for ${relativePath}: ${e.message}`);
    }

    return { status: 'updated', backup };
  } catch (error) {
    return { status: 'failed', reason: error.message };
  }
}

async function validateEnvironment() {
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  if (major < 16) {
    throw new Error(`Node.js 16+ required (current: ${nodeVersion})`);
  }
  if (!(await checkFileExists(repoRoot))) {
    throw new Error('Repository root not found');
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║          Documentation Update Script                            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  await validateEnvironment();

  console.log(`Node.js version: ${process.version} ✓`);
  console.log(`Repository root: ${repoRoot} ✓`);
  console.log(`Append date: ${APPEND_DATE}`);
  console.log(`Files to process: ${files.length}`);
  console.log(`Backup enabled: ${BACKUP_ENABLED}`);
  if (DRY_RUN) console.log('Mode: DRY RUN (no files will be modified)');
  console.log('');

  // Ensure templates exist
  if (!(await checkFileExists(TEMPLATE_ENFORCEMENT))) {
    throw new Error(`Missing template: ${TEMPLATE_ENFORCEMENT}`);
  }
  if (!(await checkFileExists(TEMPLATE_BEST))) {
    throw new Error(`Missing template: ${TEMPLATE_BEST}`);
  }

  const results = await Promise.allSettled(files.map(f => processFile(f)));

  let updated = 0, skipped = 0, failed = 0, dry = 0;
  results.forEach((r, i) => {
    const file = files[i];
    if (r.status === 'fulfilled') {
      const val = r.value;
      console.log(`Processing: ${file}`);
      if (val.status === 'updated') {
        console.log(`  Status: Updated successfully`);
        if (val.backup) console.log(`  Backup: ${val.backup}`);
        updated++;
      } else if (val.status === 'skipped') {
        console.log(`  Status: Already updated (skipped)`);
        skipped++;
      } else if (val.status === 'dry-run') {
        console.log(`  Status: Dry-run (would update)`);
        dry++;
      } else if (val.status === 'failed') {
        console.log(`  Status: Failed - ${val.reason}`);
        failed++;
      }
    } else {
      console.log(`Processing: ${file}`);
      console.log(`  Status: Failed - ${r.reason}`);
      failed++;
    }
    console.log('');
  });

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                          Summary                               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`  Updated:  ${updated}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Dry-run:  ${dry}`);
  console.log(`  Failed:   ${failed}`);

  if (failed > 0) {
    console.error('\n⚠ Some operations failed. Please review the errors above.');
    process.exit(1);
  }

  if (updated > 0 && !DRY_RUN) {
    console.log('\nFiles were modified by ensure-instruction-blocks. Please review and commit the staged changes.');
    // Exit non-zero to block pre-commit and force user to review the changes
    process.exit(1);
  }

  console.log('\n✓ All updates completed successfully.');
  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

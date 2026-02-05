/* eslint-env node, es2020 */
/* global URL */
import { test } from 'vitest';
import fs from 'fs/promises';

// Dynamically discover legacy script-style unit files in tests/unit
const unitDir = new URL('.', import.meta.url); // points to tests/unit/
const entries = await fs.readdir(unitDir);

for (const entry of entries) {
  // Only target top-level .mjs files that look like legacy scripts
  if (!entry.endsWith('.mjs')) continue;
  if (entry.endsWith('.test.mjs') || entry.endsWith('.spec.mjs')) continue;
  if (entry === 'wrapper-legacy-tests.test.mjs') continue; // skip this wrapper

  const fileUrl = new URL(entry, unitDir).href;

  // Create one Vitest test per legacy file, so failures surface as test failures
  test(`legacy script - ${entry}`, async () => {
    // Importing the file runs its top-level script; any thrown errors will fail the test.
    await import(fileUrl);
  });
}

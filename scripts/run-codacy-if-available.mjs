#!/usr/bin/env node
import { spawnSync } from 'child_process';

console.log('Checking for Codacy CLI...');

// Try 'npx codacy-analysis-cli --version' to see if it's available
const check = spawnSync('npx', ['codacy-analysis-cli', '--version'], { stdio: 'pipe' });
if (check.status === 0) {
  console.log('Codacy CLI available. Running analysis...');
  const run = spawnSync('npx', ['codacy-analysis-cli', 'analyze', '--upload'], { stdio: 'inherit' });
  if (run.status === 0) {
    console.log('Codacy analysis completed successfully.');
    process.exit(0);
  } else {
    console.warn('Codacy analysis failed with exit code', run.status);
    process.exit(run.status || 1);
  }
} else {
  // Not available — warn and continue (exit 0 so verify:local doesn't fail)
  console.warn('Codacy CLI not installed or not available via npx. Skipping Codacy analysis.');
  process.exit(0);
}

#!/usr/bin/env node
/**
 * Post-edit: run tests when package.json exists (harness-sdd gate).
 */
const { execSync } = require('child_process');
const fs = require('fs');

if (!fs.existsSync('package.json')) {
  process.exit(0);
}

try {
  execSync('pnpm test', { stdio: 'pipe', encoding: 'utf8' });
} catch (e) {
  const out = (e.stdout || '') + (e.stderr || '');
  console.error('[harness] pnpm test failed after edit:\n' + out.slice(-1500));
  process.exit(1);
}

#!/usr/bin/env node
/**
 * Session end: full init.sh verification (harness-sdd gate).
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const initSh = path.join(root, 'init.sh');

if (!fs.existsSync(initSh)) {
  console.error('[harness] init.sh not found');
  process.exit(1);
}

try {
  const out = execSync('./init.sh', { cwd: root, encoding: 'utf8' });
  console.log('[harness] init.sh OK');
  if (process.env.DEBUG_HARNESS) console.log(out.slice(-500));
} catch (e) {
  const out = (e.stdout || '') + (e.stderr || '');
  console.error('[harness] init.sh FAILED — fix before closing session:\n' + out.slice(-2000));
  process.exit(1);
}

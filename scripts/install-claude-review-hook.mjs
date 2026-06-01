import fs from 'node:fs';
import path from 'node:path';

const hookDir = path.join('.git', 'hooks');
const hookPath = path.join(hookDir, 'pre-push');

if (!fs.existsSync('.git')) {
  console.error('No .git directory found. Run this from the repo root.');
  process.exit(1);
}

fs.mkdirSync(hookDir, { recursive: true });

const hook = [
  '#!/bin/sh',
  '# Club OS local guard: validate and run Claude Code read-only review before push.',
  '# Git for Windows executes this through its sh-compatible hook runner.',
  'npm run check:review',
  '',
].join('\n');

fs.writeFileSync(hookPath, hook, { encoding: 'utf8', mode: 0o755 });
try { fs.chmodSync(hookPath, 0o755); } catch {}
console.log(`Installed ${hookPath}`);

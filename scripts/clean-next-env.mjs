import { execFileSync } from 'node:child_process';

function run(args, options = {}) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: options.stdio ?? 'pipe' });
}

function succeeds(args) {
  try {
    run(args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const file = 'next-env.d.ts';

if (!succeeds(['ls-files', '--error-unmatch', file])) {
  console.log(`clean:next-env: ${file} is not tracked; skipping.`);
  process.exit(0);
}

const hasStagedChange = !succeeds(['diff', '--cached', '--quiet', '--', file]);
const sourceArgs = hasStagedChange
  ? ['restore', '--worktree', '--', file]
  : ['restore', '--source=HEAD', '--worktree', '--', file];

run(sourceArgs, { stdio: 'inherit' });
console.log(`clean:next-env: restored ${file} from ${hasStagedChange ? 'index' : 'HEAD'}.`);

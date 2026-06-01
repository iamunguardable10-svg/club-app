import { execFileSync, spawn } from 'node:child_process';

function git(args) {
  try {
    return execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 });
  } catch (error) {
    return error.stdout?.toString?.() || error.message || '';
  }
}

function truncate(value, max = 180_000) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n\n[TRUNCATED: diff exceeded ${max} characters. Ask for a narrower review or inspect manually.]`;
}

function criticalHasFindings(output) {
  const match = output.match(/Critical\s*\n([\s\S]*?)(?:\n\s*(Important|Minor|Good decisions|Concrete next fixes)\s*\n|$)/i);
  if (!match) return false;
  const body = match[1].trim().toLowerCase();
  if (!body) return false;
  return !(/^[-*\s.]*none\.?\s*$/.test(body) || /^no critical/i.test(body));
}

const status = git(['status', '--short']);
const staged = git(['diff', '--staged', '--stat']) + '\n' + git(['diff', '--staged']);
const unstaged = git(['diff', '--stat']) + '\n' + git(['diff']);
const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).trim();
const headReview = upstream
  ? git(['diff', '--stat', `${upstream}...HEAD`]) + '\n' + git(['diff', `${upstream}...HEAD`])
  : git(['show', '--stat', '--format=fuller', 'HEAD']) + '\n' + git(['show', '--format=', 'HEAD']);

const hasWorkingDiff = status.trim().length > 0;
const reviewTarget = hasWorkingDiff ? 'working tree diff' : upstream ? `branch diff against ${upstream}` : 'latest commit';
const diffBody = hasWorkingDiff
  ? `GIT STATUS\n${status}\n\nSTAGED DIFF\n${staged}\n\nUNSTAGED DIFF\n${unstaged}`
  : `GIT STATUS\n${status || '(clean)'}\n\n${reviewTarget.toUpperCase()}\n${headReview}`;

const prompt = `Use the club-os-reviewer subagent to challenge this Club OS ${reviewTarget}.

Rules:
- Read-only review. You have no tools; review only the diff text below.
- Do not suggest broad rewrites unless the diff creates a real risk.
- Focus on Club OS product rules, membership-based roles, Supabase/Auth/RLS risks, demo/real parity, mobile/desktop behavior, functionality regressions, validation gaps, and unnecessary scope.
- Output exactly these sections: Critical, Important, Minor, Good decisions, Concrete next fixes.
- If there are no critical findings, write exactly "- None." under Critical.

DIFF START
${truncate(diffBody)}
DIFF END
`;

const args = [
  '-p',
  '--agent', 'club-os-reviewer',
  '--tools=',
  '--max-budget-usd', process.env.CLAUDE_REVIEW_BUDGET_USD ?? '1.00',
];

const command = process.platform === 'win32' ? 'cmd.exe' : 'claude';
const commandArgs = process.platform === 'win32' ? ['/c', 'claude', ...args] : args;
const child = spawn(command, commandArgs, {
  cwd: process.cwd(),
  shell: false,
  stdio: ['pipe', 'pipe', 'inherit'],
  env: process.env,
});

let output = '';
child.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stdout.write(text);
});

const timeoutMs = Number(process.env.CLAUDE_REVIEW_TIMEOUT_MS ?? 180000);
const timeout = setTimeout(() => {
  child.kill('SIGTERM');
  console.error(`Claude review timed out after ${timeoutMs}ms.`);
}, timeoutMs);

child.stdin.write(prompt);
child.stdin.end();

child.on('exit', (code, signal) => {
  clearTimeout(timeout);
  if (signal) process.exit(124);
  if (code && code !== 0) process.exit(code);
  if (criticalHasFindings(output)) {
    console.error('\nClaude review found Critical issues. Blocking this gate.');
    process.exit(2);
  }
  process.exit(0);
});

/**
 * Telling errors from two builds meeting apart, and not reloading in a loop.
 * Run with `npm run test:build`.
 */

import assert from 'node:assert/strict';
import { isStaleBuildError, mayReload } from './buildVersion';

let failures = 0;
function check(label: string, run: () => void) {
  try {
    run();
    console.log(`ok  ${label}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

check('Safari: old build loads a new chunk', () => assert.ok(isStaleBuildError(new TypeError("undefined is not an object (evaluating 'e[o].call')"))));
check('Chrome: the same', () => assert.ok(isStaleBuildError(new TypeError("Cannot read properties of undefined (reading 'call')"))));
check('a chunk from the old build is gone', () => {
  const error = new Error('Loading chunk 7800 failed.');
  error.name = 'ChunkLoadError';
  assert.ok(isStaleBuildError(error));
});
check('… also as plain text', () => assert.ok(isStaleBuildError('Loading CSS chunk app-layout failed')));
check('an ordinary error is not one', () => assert.equal(isStaleBuildError(new TypeError("undefined is not an object (evaluating 'session.startsAt')")), false));
check('nothing is not one', () => assert.equal(isStaleBuildError(undefined), false));

const now = 1_000_000_000;
check('reloads the first time', () => assert.ok(mayReload(null, now, 'abc1234')));
check('not again for the same build right away', () => assert.equal(mayReload(`abc1234@${now - 1000}`, now, 'abc1234'), false));
check('… but after five minutes', () => assert.ok(mayReload(`abc1234@${now - 6 * 60_000}`, now, 'abc1234')));
check('a newer build may reload at once', () => assert.ok(mayReload(`old0000@${now - 1000}`, now, 'abc1234')));
check('a broken mark does not block', () => assert.ok(mayReload('abc1234@x', now, 'abc1234')));

if (failures > 0) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('all build version checks passed');

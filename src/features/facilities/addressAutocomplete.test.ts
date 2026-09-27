/**
 * Geoapify's answer turned into what the hall address field shows and fills.
 * Run with `npm run test:address`.
 */

import assert from 'node:assert/strict';
import { parseGeoapifyResults } from './addressAutocomplete';

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

const place = (fields: Record<string, unknown>) => ({ results: [fields] });

check('a hall: its name apart, the address to fill in', () => assert.deepEqual(
  parseGeoapifyResults(place({ place_id: 'abc', name: 'PSD Bank - Halle Nord', street: 'Birkenweg', housenumber: '10', postcode: '67346', city: 'Speyer', country: 'Deutschland', formatted: 'PSD Bank - Halle Nord, Birkenweg 10, 67346 Speyer, Deutschland' })),
  [{ placeId: 'abc', name: 'PSD Bank - Halle Nord', address: 'Birkenweg 10, 67346 Speyer' }],
));
check('a plain address: no name', () => assert.deepEqual(
  parseGeoapifyResults(place({ place_id: 'n1', street: 'Nordring', housenumber: '12', postcode: '45141', city: 'Essen' })),
  [{ placeId: 'n1', name: null, address: 'Nordring 12, 45141 Essen' }],
));
check('a street itself: named after the street, not twice', () => assert.deepEqual(
  parseGeoapifyResults(place({ place_id: 'w2', name: 'Birkenweg', street: 'Birkenweg', postcode: '67346', city: 'Speyer' })),
  [{ placeId: 'w2', name: null, address: 'Birkenweg, 67346 Speyer' }],
));
check('a town: just its name', () => assert.equal(
  parseGeoapifyResults(place({ place_id: 'r3', name: 'Speyer', city: 'Speyer', state: 'Rheinland-Pfalz', country: 'Deutschland' }))[0]?.address,
  'Speyer',
));
check('the same place twice: once', () => assert.equal(
  parseGeoapifyResults({ results: [{ place_id: 'a', street: 'A', housenumber: '1', city: 'B' }, { place_id: 'b', street: 'A', housenumber: '1', city: 'B' }] }).length,
  1,
));
check('nothing useful: nothing', () => assert.deepEqual(parseGeoapifyResults(place({})), []));
check('an error answer: nothing', () => assert.deepEqual(parseGeoapifyResults({ error: 'Unauthorized' }), []));
check('not an answer at all: nothing', () => assert.deepEqual(parseGeoapifyResults(null), []));

if (failures > 0) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('all address checks passed');

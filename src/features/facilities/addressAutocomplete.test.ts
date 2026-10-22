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
check('with a position: lat and lon come along (the meeting point pin)', () => assert.deepEqual(
  parseGeoapifyResults(place({ place_id: 'p1', street: 'Nordring', housenumber: '12', postcode: '45141', city: 'Essen', lat: 51.46, lon: 7.01 })),
  [{ placeId: 'p1', name: null, address: 'Nordring 12, 45141 Essen', lat: 51.46, lon: 7.01 }],
));
check('precision: town, street or spot (where the map zooms and whether a pin is set)', () => assert.deepEqual(
  parseGeoapifyResults({ results: [
    { place_id: 'c', name: 'Speyer', city: 'Speyer', result_type: 'city', lat: 49.3, lon: 8.4 },
    { place_id: 's', name: 'Birkenweg', street: 'Birkenweg', city: 'Speyer', result_type: 'street', lat: 49.31, lon: 8.41 },
    { place_id: 'b', street: 'Birkenweg', housenumber: '10', city: 'Speyer', result_type: 'building', lat: 49.312, lon: 8.412 },
  ] }).map((place) => place.precision),
  ['area', 'street', 'spot'],
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

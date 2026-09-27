/**
 * Photon's answer turned into what the hall address field shows and fills.
 * Run with `npm run test:address`.
 */

import assert from 'node:assert/strict';
import { parsePhotonResults } from './addressAutocomplete';

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

const feature = (properties: Record<string, unknown>) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates: [8.4, 49.3] } });

check('a hall: its name apart, the address to fill in', () => assert.deepEqual(
  parsePhotonResults({ features: [feature({ osm_type: 'W', osm_id: 43333265, name: 'PSD Bank - Halle Nord', street: 'Birkenweg', housenumber: '10', postcode: '67346', city: 'Speyer', country: 'Deutschland' })] }),
  [{ placeId: 'W43333265', name: 'PSD Bank - Halle Nord', address: 'Birkenweg 10, 67346 Speyer' }],
));
check('a plain address: no name', () => assert.deepEqual(
  parsePhotonResults({ features: [feature({ osm_type: 'N', osm_id: 1, street: 'Nordring', housenumber: '12', postcode: '45141', city: 'Essen' })] }),
  [{ placeId: 'N1', name: null, address: 'Nordring 12, 45141 Essen' }],
));
check('a street itself: named after the street, not twice', () => assert.deepEqual(
  parsePhotonResults({ features: [feature({ osm_type: 'W', osm_id: 2, name: 'Birkenweg', street: 'Birkenweg', postcode: '67346', city: 'Speyer' })] }),
  [{ placeId: 'W2', name: null, address: 'Birkenweg, 67346 Speyer' }],
));
check('a town: just its name', () => assert.deepEqual(
  parsePhotonResults({ features: [feature({ osm_type: 'R', osm_id: 3, name: 'Speyer', city: 'Speyer', state: 'Rheinland-Pfalz', country: 'Deutschland' })] })[0]?.address,
  'Speyer',
));
check('the same place twice: once', () => assert.equal(
  parsePhotonResults({ features: [feature({ osm_type: 'N', osm_id: 4, street: 'A', housenumber: '1', city: 'B' }), feature({ osm_type: 'N', osm_id: 5, street: 'A', housenumber: '1', city: 'B' })] }).length,
  1,
));
check('nothing useful: nothing', () => assert.deepEqual(parsePhotonResults({ features: [feature({})] }), []));
check('not an answer at all: nothing', () => assert.deepEqual(parsePhotonResults(null), []));

if (failures > 0) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('all address checks passed');

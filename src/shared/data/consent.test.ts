/** Local consent rules: who may consent, when health data counts, defaults per age. */
import assert from 'node:assert/strict';

import { canSelfConsent, defaultLoadForAge, exportLocalPerson, hasHealthConsent, LEGAL_VERSION } from './consentRules';
import { createSeedDatabase } from './seed';

const year = 2026;
assert.ok(canSelfConsent(2010, year), '16 this year may consent');
assert.ok(!canSelfConsent(2011, year), '15 needs a parent');
assert.ok(!canSelfConsent(null, year), 'no birth year, no consent');

assert.equal(defaultLoadForAge('U10'), false);
assert.equal(defaultLoadForAge('U12'), true);
assert.equal(defaultLoadForAge(null), true);

const db = createSeedDatabase();
const person = db.people[0];
db.healthConsentStatus = [];
person.birthYear = new Date().getFullYear() - 14;
db.consents = [{ id: 'c1', personId: person.id, userId: null, kind: 'health', version: LEGAL_VERSION, givenAt: new Date().toISOString(), withdrawnAt: null, byParentName: null, byParentEmail: null }] as typeof db.consents;
assert.ok(!hasHealthConsent(db, person.id), 'a 14-year-old cannot consent alone');
db.consents![0].kind = 'parent_health';
assert.ok(hasHealthConsent(db, person.id), 'a parent can');
db.consents![0].withdrawnAt = new Date().toISOString();
assert.ok(!hasHealthConsent(db, person.id), 'withdrawn means off');

const exported = exportLocalPerson(db, person.id);
assert.deepEqual(exported.people.map((p) => p.id), [person.id], 'export holds only the person');
assert.ok(exported.loadEntries.every((entry) => entry.personId === person.id));
console.log('all consent checks passed');

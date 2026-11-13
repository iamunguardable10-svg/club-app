/** Local consent rules: who may consent, when health data counts, defaults per age. */
import assert from 'node:assert/strict';

import { canSelfConsent, defaultLoadForAge, needsBirthMonth, exportLocalPerson, hasHealthConsent, LEGAL_VERSION } from './consentRules';
import { createSeedDatabase } from './seed';

// Variant b (0057): in the year that is 16 years ago, the month decides.
const june = new Date(2026, 5, 15);
const january = new Date(2026, 0, 10);
assert.ok(canSelfConsent(2009, null, june), 'older than the edge year may consent');
assert.ok(!canSelfConsent(2010, null, june), 'edge year without month needs a parent');
assert.ok(canSelfConsent(2010, 5, june), 'born in May, in June: 16');
assert.ok(!canSelfConsent(2010, 6, june), 'born in June, in June: the birthday may still come');
assert.ok(!canSelfConsent(2010, 1, january), 'in January no month of the edge year counts yet');
assert.ok(!canSelfConsent(2011, 1, june), '15 needs a parent');
assert.ok(!canSelfConsent(null, null, june), 'no birth year, no consent');
assert.ok(needsBirthMonth(2010, june) && !needsBirthMonth(2009, june) && !needsBirthMonth(2011, june), 'the month is asked only in the edge year');

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

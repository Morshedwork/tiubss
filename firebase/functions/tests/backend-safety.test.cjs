const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

// Exercise compiled handlers against atomic Auth/Firestore substitutes. This is
// not a deployment, App Check verification, or a security-rules emulator test.
class Stamp {
  constructor(ms) { this.ms = ms; }
  toMillis() { return this.ms; }
  toDate() { return new Date(this.ms); }
  static fromMillis(ms) { return new Stamp(ms); }
  static now() { return new Stamp(Date.now()); }
}
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const clone = value => value instanceof Stamp ? new Stamp(value.ms) : Array.isArray(value) ? Array.from(value, clone) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) : value;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function harness() {
  const docs = new Map(), accounts = new Map(), claimWrites = [];
  let nextId = 0, queue = Promise.resolve();
  const resolve = (value, previous) => {
    if (value?.__op === 'stamp') return Stamp.now();
    if (value?.__op === 'increment') return Number(previous || 0) + value.amount;
    if (value instanceof Stamp) return clone(value);
    if (Array.isArray(value)) return Array.from(value, (item, index) => resolve(item, previous?.[index]));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolve(item, previous?.[key])]));
    return value;
  };
  const snapshot = target => ({ id: target.split('/').pop(), exists: docs.has(target), data: () => clone(docs.get(target)) });
  const ref = target => ({ path: target, id: target.split('/').pop(), get: async () => snapshot(target), set: async data => docs.set(target, resolve(data)) });
  const db = {
    doc: ref,
    collection: collection => ({
      doc: key => ref(`${collection}/${key || `auto-${++nextId}`}`),
      add: async data => { const target = ref(`${collection}/auto-${++nextId}`); docs.set(target.path, resolve(data)); return target; }
    }),
    runTransaction(handler) {
      const run = queue.then(async () => {
        const writes = [];
        const transaction = {
          get: async target => { assert.equal(writes.length, 0, 'all transaction reads precede writes'); return snapshot(target.path); },
          create: (target, value) => writes.push(['create', target.path, value]),
          set: (target, value, options) => writes.push(['set', target.path, value, options]),
          update: (target, value) => writes.push(['update', target.path, value]),
          delete: target => writes.push(['delete', target.path])
        };
        const result = await handler(transaction), backup = new Map(docs);
        try {
          for (const [kind, target, value, options] of writes) {
            const old = docs.get(target);
            if (kind === 'create' && docs.has(target)) throw new Error('duplicate create');
            if (kind === 'update' && !docs.has(target)) throw new Error('missing update');
            if (kind === 'delete') docs.delete(target);
            else docs.set(target, kind === 'update' || options?.merge ? { ...old, ...resolve(value, old) } : resolve(value, old));
          }
        } catch (cause) { docs.clear(); for (const [key, value] of backup) docs.set(key, value); throw cause; }
        return result;
      });
      queue = run.catch(() => {});
      return run;
    }
  };
  const auth = {
    getUser: async uid => { if (!accounts.has(uid)) throw new Error('Auth user not found'); return clone(accounts.get(uid)); },
    setCustomUserClaims: async (uid, claims) => { claimWrites.push({ uid, claims: clone(claims) }); accounts.get(uid).customClaims = clone(claims); }
  };
  const modules = {
    'firebase-admin/app': { initializeApp() {} }, 'firebase-admin/auth': { getAuth: () => auth },
    'firebase-admin/firestore': { getFirestore: () => db, Timestamp: Stamp, FieldValue: { serverTimestamp: () => ({ __op: 'stamp' }), increment: amount => ({ __op: 'increment', amount }) } },
    'firebase-functions/v2/https': { HttpsError, onCall: (options, handler) => { assert.equal(options.enforceAppCheck, true); return handler; } },
    'firebase-functions/v2/scheduler': { onSchedule: (_options, handler) => handler },
    'node:crypto': crypto, './profile-validation': require('../lib/profile-validation.js')
  };
  const exports = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../lib/index.js'), 'utf8'), { exports, require: name => { assert(modules[name], `Unexpected import ${name}`); return modules[name]; }, Buffer, console }, { filename: 'compiled-backend-safety.js' });
  for (const uid of ['alice', 'bob', 'owner', 'other-owner', 'staff']) {
    accounts.set(uid, { uid, customClaims: { retainedClaim: true, roles: uid === 'owner' ? ['super_admin', 'admin', 'member'] : ['member'] } });
    docs.set(`users/${uid}`, { uid, name: uid, membershipStatus: 'pending' });
  }
  docs.set('staffAssignments/owner', { roles: ['super_admin', 'admin', 'member'], eventIds: [], vendorIds: [] });
  docs.set('staffAssignments/staff', { roles: ['member'], eventIds: [], vendorIds: [] });
  docs.set('events/event1', { title: 'Community gathering', status: 'published', ticketPriceJPY: 0, capacity: 1, registeredCount: 0, checkedInCount: 0, registrationClosesAt: new Stamp(Date.now() + 3600000) });
  docs.set('publicProfiles/bob', { uid: 'bob', name: 'Bob' });
  docs.set('publicProfiles/staff', { uid: 'staff', name: 'Staff' });
  const call = (name, uid, data) => exports[name]({ data, auth: uid ? { uid, token: { email: `${uid}@example.org`, email_verified: false, roles: clone(accounts.get(uid)?.customClaims.roles || ['member']) } } : undefined });
  const register = (uid = 'alice', requestId = 'registration-request') => call('registerForEvent', uid, { eventId: 'event1', requestId });
  const request = (data = {}) => call('submitCommunityRequest', 'alice', { type: 'connection', toUserId: 'bob', subject: 'Hello', interest: '', message: 'Let us meet at the gathering.', requestId: 'message-request', ...data });
  return { docs, accounts, claimWrites, call, register, request };
}
const rejects = (fn, code) => assert.rejects(fn, cause => cause.code === code);
const count = (h, collection) => [...h.docs.keys()].filter(key => key.startsWith(`${collection}/`)).length;

test('event registration requires a saved named profile without consuming capacity on rejection', async () => {
  for (const profile of [undefined, { name: '' }, { name: '   ' }, { name: 123 }]) {
    const h = harness();
    if (profile) h.docs.set('users/alice', profile); else h.docs.delete('users/alice');
    await rejects(() => h.register(), 'failed-precondition');
    assert.equal(count(h, 'registrations'), 0); assert.equal(h.docs.get('events/event1').registeredCount, 0);
  }
});

test('saved pending legacy members can register without new approval or email-verification requirements', async () => {
  const h = harness(), first = await h.register(), again = await h.register();
  assert.equal(first.id, again.id); assert.equal(first.ticketToken, again.ticketToken);
  assert.equal(count(h, 'registrations'), 1); assert.equal(h.docs.get('events/event1').registeredCount, 1);
  await rejects(() => h.register('bob'), 'resource-exhausted');
});

test('suspension prevents registration and a retry cannot bypass the current suspension', async () => {
  const h = harness(); h.docs.get('users/alice').membershipStatus = 'suspended';
  await rejects(() => h.register(), 'permission-denied'); assert.equal(count(h, 'registrations'), 0);
  h.docs.get('users/alice').membershipStatus = 'pending'; await h.register();
  h.docs.get('users/alice').membershipStatus = 'suspended';
  await rejects(() => h.register(), 'permission-denied'); assert.equal(h.docs.get('events/event1').registeredCount, 1);
});

test('concurrent eligible registrations cannot overbook the last place', async () => {
  const h = harness(), results = await Promise.allSettled([h.register('alice'), h.register('bob')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'resource-exhausted');
  assert.equal(count(h, 'registrations'), 1); assert.equal(h.docs.get('events/event1').registeredCount, 1);
});

test('staff assignment cannot remove the caller or another super administrator through either authority', async () => {
  for (const authority of ['self', 'claims', 'assignment']) {
    const h = harness(), target = authority === 'self' ? 'owner' : 'other-owner';
    if (authority === 'claims') h.accounts.get(target).customClaims.roles = ['super_admin'];
    if (authority === 'assignment') h.docs.set(`staffAssignments/${target}`, { roles: ['super_admin'], eventIds: [], vendorIds: [] });
    const before = clone(h.docs.get(`staffAssignments/${target}`)), claims = clone(h.accounts.get(target).customClaims);
    await rejects(() => h.call('assignStaff', 'owner', { uid: target, roles: ['pickup_staff'], eventIds: ['event1'], vendorIds: ['stall1'] }), 'failed-precondition');
    assert.equal(h.claimWrites.length, 0); assert.deepEqual(h.accounts.get(target).customClaims, claims);
    assert.deepEqual(h.docs.get(`staffAssignments/${target}`), before); assert.equal(count(h, 'auditLogs'), 0);
  }
});

test('ordinary staff assignments still preserve unrelated claims and reject non-admin callers', async () => {
  const h = harness(), data = { uid: 'staff', roles: ['pickup_staff'], eventIds: ['event1'], vendorIds: ['stall1'] };
  await rejects(() => h.call('assignStaff', 'alice', data), 'permission-denied'); assert.equal(h.claimWrites.length, 0);
  const result = await h.call('assignStaff', 'owner', data);
  assert.equal(result.refreshRequired, true); assert.equal(h.claimWrites.length, 2);
  assert.deepEqual(h.accounts.get('staff').customClaims, { retainedClaim: true, roles: ['pickup_staff'] });
  assert.deepEqual(h.docs.get('staffAssignments/staff').eventIds, ['event1']); assert.equal(count(h, 'auditLogs'), 1);
});

test('identical request retries return persisted status despite whitespace or sender profile changes', async () => {
  const h = harness(), first = await h.request(), stored = h.docs.get(`communityRequests/${first.id}`);
  stored.status = 'closed'; h.docs.get('users/alice').name = 'Changed Name';
  const retried = await h.request({ subject: '  Hello  ', message: ' Let us meet at the gathering. ' });
  assert.equal(retried.id, first.id); assert.equal(retried.status, 'closed'); assert.equal(count(h, 'communityRequests'), 1);
  assert.equal(h.docs.get(`communityRequests/${first.id}`).name, 'alice');
});

test('request IDs cannot silently accept a different recipient, type, subject, interest or message', async () => {
  for (const changed of [{ toUserId: 'staff' }, { type: 'mentorship' }, { subject: 'Different' }, { interest: 'A new topic' }, { message: 'A different message.' }]) {
    const h = harness(), first = await h.request(), before = clone(h.docs.get(`communityRequests/${first.id}`));
    await rejects(() => h.request(changed), 'already-exists');
    assert.deepEqual(h.docs.get(`communityRequests/${first.id}`), before); assert.equal(count(h, 'communityRequests'), 1);
  }
});

test('legacy requests without a fingerprint remain retryable but reject changed content', async () => {
  const h = harness(), first = await h.request(), stored = h.docs.get(`communityRequests/${first.id}`);
  delete stored.requestFingerprint; stored.status = 'approved';
  assert.equal((await h.request()).status, 'approved');
  await rejects(() => h.request({ message: 'Replacement content' }), 'already-exists');
  assert.equal(count(h, 'communityRequests'), 1);
});

test('concurrent request retries store one request and conflicting reuse is rejected', async () => {
  const h = harness(), results = await Promise.allSettled([h.request(), h.request(), h.request({ message: 'Conflicting message' })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 2);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'already-exists');
  assert.equal(count(h, 'communityRequests'), 1);
  assert.equal(results[0].value.id, digest('alice:message-request'));
});

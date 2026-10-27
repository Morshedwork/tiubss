const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = readFileSync(path.join(__dirname, '../../scripts/bootstrap-admin.cjs'), 'utf8');
function execute({ project = 'tiu-bss', uid = 'owner-uid', missingUser = false } = {}) {
  const calls = [];
  const processMock = { argv: ['node', 'bootstrap-admin.cjs', uid], env: project === undefined ? {} : { GOOGLE_CLOUD_PROJECT: project }, exitCode: 0 };
  const modules = {
    'firebase-admin/app': { initializeApp: options => calls.push(['initialize', options]) },
    'firebase-admin/auth': { getAuth: () => ({
      getUser: async id => { calls.push(['getUser', id]); if (missingUser) throw new Error('User not found.'); return { customClaims: { retainedClaim: true } }; },
      setCustomUserClaims: async (id, claims) => calls.push(['claims', id, claims])
    }) },
    'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => 'server-time' }, getFirestore: () => ({
      doc: target => ({ set: async data => calls.push(['assignment', target, data]) }),
      collection: target => ({ add: async data => calls.push(['audit', target, data]) })
    }) }
  };
  const result = vm.runInNewContext(source, {
    __dirname: path.join(__dirname, '../../scripts'), process: processMock,
    console: { log() {}, error() {} },
    require: name => name === 'node:module' ? { createRequire: () => name => modules[name] } : name === 'node:path' ? path : (() => { throw Error('Unexpected import'); })()
  });
  return Promise.resolve(result).then(() => ({ calls: JSON.parse(JSON.stringify(calls)), processMock }));
}

test('bootstrap is pinned to tiu-bss and refuses a conflicting project before mutation', async () => {
  assert.throws(() => execute({ project: 'another-project' }), /only targets Firebase project tiu-bss/);
  const { calls } = await execute();
  assert.deepEqual(calls[0], ['initialize', { projectId: 'tiu-bss' }]);
});

test('bootstrap requires an existing Auth user and applies both role authorities', async () => {
  const { calls } = await execute();
  assert.deepEqual(calls.find(call => call[0] === 'claims'), ['claims', 'owner-uid', { retainedClaim: true, roles: ['super_admin', 'admin', 'member'] }]);
  const assignment = calls.find(call => call[0] === 'assignment');
  assert.equal(assignment[1], 'staffAssignments/owner-uid');
  assert.deepEqual(assignment[2].roles, ['super_admin', 'admin', 'member']);
  const absent = await execute({ missingUser: true });
  assert.equal(absent.processMock.exitCode, 1);
  assert.equal(absent.calls.some(call => ['claims', 'assignment', 'audit'].includes(call[0])), false);
});

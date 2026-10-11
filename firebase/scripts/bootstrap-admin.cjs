// Run with Application Default Credentials for a Firebase project you own.
// Never ship service-account JSON or credentials to the browser.
const { createRequire } = require('node:module');
const path = require('node:path');
const fromFunctions = createRequire(path.join(__dirname, '../functions/package.json'));
const { initializeApp } = fromFunctions('firebase-admin/app');
const { getAuth } = fromFunctions('firebase-admin/auth');
const { getFirestore, FieldValue } = fromFunctions('firebase-admin/firestore');
const uid = process.argv[2];
if (!uid || !/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) throw new Error('Usage: node scripts/bootstrap-admin.cjs FIREBASE_AUTH_UID');
initializeApp();
(async () => {
  const user = await getAuth().getUser(uid);
  await getAuth().setCustomUserClaims(uid, { ...user.customClaims, roles: ['super_admin', 'admin', 'member'] });
  await getFirestore().doc(`staffAssignments/${uid}`).set({ roles: ['super_admin', 'admin', 'member'], eventIds: [], vendorIds: [], updatedAt: FieldValue.serverTimestamp(), updatedBy: 'owner-cli' });
  await getFirestore().collection('auditLogs').add({ actor: 'owner-cli', action: 'staff.bootstrap', target: uid, at: FieldValue.serverTimestamp() });
  console.log('Administrator assigned. Sign out and sign back in to refresh the ID token.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });

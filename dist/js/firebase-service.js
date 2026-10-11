/** Optional live Firebase adapter. It never substitutes demo data for a failed live operation. */
const SDK = 'https://www.gstatic.com/firebasejs/13.0.0/';
let sdk = null, app = null, auth = null, db = null, functions = null, storage = null, initialization = null;
let state = { configured: false, user: null, roles: [], error: null };
const listeners = new Set();
const emit = () => listeners.forEach(listener => { try { listener(getAuthState()); } catch (error) { console.error(error); } });
export const getAuthState = () => ({ ...state, roles: [...state.roles] });
export function subscribeAuth(listener) { listeners.add(listener); listener(getAuthState()); return () => listeners.delete(listener); }
function error(code, message) { return Object.assign(new Error(message), { code }); }
export async function initFirebase() {
  if (initialization) return initialization;
  const config = globalThis.BSS_FIREBASE_CONFIG;
  if (!config?.apiKey || !config?.projectId || !config?.appId || !config?.authDomain) return getAuthState();
  initialization = (async () => {
    try {
      const [core, authentication, firestore, callable, files] = await Promise.all([
        import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js'), import(SDK + 'firebase-functions.js'), import(SDK + 'firebase-storage.js')
      ]);
      sdk = { core, authentication, firestore, callable, files };
      app = core.getApps().find(existing => existing.name === 'tiu-bss') || core.initializeApp(config, 'tiu-bss');
      if (globalThis.BSS_FIREBASE_APP_CHECK_KEY) {
        const appCheck = await import(SDK + 'firebase-app-check.js');
        appCheck.initializeAppCheck(app, { provider: new appCheck.ReCaptchaV3Provider(globalThis.BSS_FIREBASE_APP_CHECK_KEY), isTokenAutoRefreshEnabled: true });
      }
      auth = authentication.getAuth(app); db = firestore.getFirestore(app);
      functions = callable.getFunctions(app, 'asia-northeast1'); storage = files.getStorage(app);
      const emulatorHost = globalThis.BSS_FIREBASE_EMULATOR_HOST;
      if (emulatorHost && ['localhost', '127.0.0.1'].includes(location.hostname)) {
        authentication.connectAuthEmulator(auth, `http://${emulatorHost}:9099`);
        firestore.connectFirestoreEmulator(db, emulatorHost, 8080);
        callable.connectFunctionsEmulator(functions, emulatorHost, 5001);
        files.connectStorageEmulator(storage, emulatorHost, 9199);
      }
      state.configured = true;
      await new Promise((resolve, reject) => {
        let first = true;
        authentication.onIdTokenChanged(auth, async user => {
          try {
            const claims = user ? (await user.getIdTokenResult()).claims : {};
            state = { configured: true, user, roles: Array.isArray(claims.roles) ? claims.roles : [], error: null };
            emit(); if (first) { first = false; resolve(); }
          } catch (cause) {
            state = { configured: true, user: null, roles: [], error: cause.message }; emit();
            if (first) { first = false; reject(cause); }
          }
        }, reject);
      });
    } catch (cause) {
      state = { configured: false, user: null, roles: [], error: cause.message || 'Firebase could not initialize.' }; emit();
    }
    return getAuthState();
  })();
  return initialization;
}
async function ready(requireUser = false) {
  await initFirebase();
  if (!state.configured) throw error('firebase/unconfigured', state.error || 'Live Firebase is not configured.');
  if (requireUser && !auth.currentUser) throw error('auth/required', 'Please sign in to continue.');
  if (auth.currentUser && state.user?.uid !== auth.currentUser.uid) {
    const claims = (await auth.currentUser.getIdTokenResult()).claims;
    state = { configured: true, user: auth.currentUser, roles: Array.isArray(claims.roles) ? claims.roles : [], error: null };
  }
}
async function call(name, data) { await ready(true); const result = await sdk.callable.httpsCallable(functions, name)(data); return normalize(result.data); }
function normalize(value) {
  if (value == null || typeof value !== 'object') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (Number.isFinite(value._seconds)) return new Date(value._seconds * 1000 + (value._nanoseconds || 0) / 1e6).toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
}
async function list(collection, constraints = []) {
  await ready(); const f = sdk.firestore;
  const snapshots = await f.getDocs(f.query(f.collection(db, collection), ...constraints, f.limit(100)));
  return snapshots.docs.map(doc => ({ id: doc.id, ...normalize(doc.data()) }));
}
export async function signInWithGoogle() { await ready(); return sdk.authentication.signInWithPopup(auth, new sdk.authentication.GoogleAuthProvider()); }
export async function signInWithEmail(email, password) { await ready(); return sdk.authentication.signInWithEmailAndPassword(auth, email, password); }
export async function signUpWithEmail(email, password, displayName) {
  await ready(); const credential = await sdk.authentication.createUserWithEmailAndPassword(auth, email, password);
  if (displayName) await sdk.authentication.updateProfile(credential.user, { displayName });
  await sdk.authentication.sendEmailVerification(credential.user);
  // The caller saves its profile after Auth has settled. Account creation is never rolled back on an email error.
  return credential;
}
export async function signOut() { await ready(); return sdk.authentication.signOut(auth); }
export async function sendPasswordReset(email) { await ready(); return sdk.authentication.sendPasswordResetEmail(auth, email); }
export async function sendVerificationEmail() { await ready(true); return sdk.authentication.sendEmailVerification(auth.currentUser); }
export async function refreshClaims() { await ready(true); await auth.currentUser.getIdToken(true); return getAuthState(); }
export async function getMyProfile() {
  await ready(true); const f = sdk.firestore; const profile = await f.getDoc(f.doc(db, 'users', state.user.uid));
  return profile.exists() ? { id: profile.id, ...normalize(profile.data()) } : null;
}
export const saveMyProfile = patch => call('saveProfile', patch);
export const approveMembership = (uid, status) => call('approveMembership', { uid, status });
export const getPublicProfiles = () => list('publicProfiles');
export async function getEvents() { await ready(); const f = sdk.firestore; return list('events', [f.where('status', '==', 'published'), f.orderBy('startsAt', 'asc')]); }
export const createEvent = data => call('saveEvent', data);
export const registerForEvent = (eventId, requestId) => call('registerForEvent', { eventId, requestId });
export const cancelRegistration = registrationId => call('cancelRegistration', { registrationId });
export const checkInRegistration = (registrationId, token) => call('checkInRegistration', { registrationId, ...(token ? { token } : { manual: true }) });
export async function getMenu(eventId) { await ready(); const f = sdk.firestore; return list('menuItems', [f.where('eventId', '==', eventId), f.where('active', '==', true)]); }
export const saveMenuItem = data => call('saveMenuItem', data);
export const placeFoodOrder = (eventId, items, requestId) => call('placeFoodOrder', { eventId, items, requestId });
export const cancelFoodOrder = orderId => call('cancelFoodOrder', { orderId });
export const advanceFoodOrder = (orderId, action, token, amountJPY) => call('advanceFoodOrder', { orderId, action, ...(token ? { token } : { manual: true }), ...(amountJPY !== undefined ? { amountJPY } : {}) });
export async function getMyRegistrations() { await ready(true); const f = sdk.firestore; return list('registrations', [f.where('uid', '==', state.user.uid), f.orderBy('createdAt', 'desc')]); }
export async function getMyOrders() { await ready(true); const f = sdk.firestore; return list('foodOrders', [f.where('uid', '==', state.user.uid), f.orderBy('createdAt', 'desc')]); }
export async function getStaffOrders(eventId, vendorId) { await ready(true); const f = sdk.firestore; return list('foodOrders', [f.where('eventId', '==', eventId), f.where('vendorId', '==', vendorId), f.orderBy('createdAt', 'desc')]); }
export async function getEventRegistrations(eventId) { await ready(true); const f = sdk.firestore; return list('registrations', [f.where('eventId', '==', eventId), f.orderBy('createdAt', 'desc')]); }
export async function getAdminOverview() {
  await ready(true);
  if (!state.roles.some(role => ['super_admin', 'admin'].includes(role))) throw error('permission-denied', 'Administrator access is required.');
  const [members, events, orders, registrations] = await Promise.all([list('users'), list('events'), list('foodOrders'), list('registrations')]);
  return { members, events, orders, registrations, limitedTo: 100 };
}
export const saveContent = (collection, id, data) => call('saveContent', { collection, id, data });
export async function getContent(collection) { await ready(); return list(collection, [sdk.firestore.where('status', '==', 'published')]); }
export const assignStaff = (uid, roles, eventIds = [], vendorIds = []) => call('assignStaff', { uid, roles, eventIds, vendorIds });
export async function uploadImage(file, { kind = 'gallery', id = 'general' } = {}) {
  await ready(true);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size >= 5 * 1024 * 1024) throw error('storage/invalid-image', 'Choose a JPG, PNG, or WebP image smaller than 5 MB.');
  if (!['gallery', 'avatar'].includes(kind)) throw error('storage/invalid-path', 'Invalid upload type.');
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw error('storage/invalid-path', 'Invalid album identifier.');
  if (kind === 'gallery' && !state.roles.some(role => ['super_admin','admin','content_editor'].includes(role))) throw error('permission-denied', 'Content editor access is required.');
  const suffix = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
  const path = kind === 'avatar' ? `avatars/${state.user.uid}/${crypto.randomUUID()}.${suffix}` : `gallery/${id}/${crypto.randomUUID()}.${suffix}`;
  const ref = sdk.files.ref(storage, path); await sdk.files.uploadBytes(ref, file, { contentType: file.type });
  return { path, url: await sdk.files.getDownloadURL(ref) };
}

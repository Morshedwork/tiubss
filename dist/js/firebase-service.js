/** Live Firebase adapter. Failed operations never fall back to browser-local demo data. */
import {requestId} from './request-id.js';
const SDK = 'https://www.gstatic.com/firebasejs/13.0.0/';
let sdk = null, app = null, auth = null, db = null, functions = null, storage = null, initialization = null;
let state = { configured: false, user: null, roles: [], error: null, loading: false, warning: null };
let authRevision = 0;
const listeners = new Set();
const emit = () => listeners.forEach(listener => { try { listener(getAuthState()); } catch (error) { console.error(error); } });
export const getAuthState = () => ({ ...state, roles: [...state.roles] });
export function subscribeAuth(listener) { listeners.add(listener); listener(getAuthState()); return () => listeners.delete(listener); }
function error(code, message) { return Object.assign(new Error(message), { code }); }
export async function initFirebase() {
  if (initialization) return initialization;
  const config = globalThis.BSS_FIREBASE_CONFIG;
  if (!config?.apiKey || !config?.projectId || !config?.appId || !config?.authDomain) return getAuthState();
  state.loading = true; emit();
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
      auth = authentication.getAuth(app);
      db = firestore.getFirestore(app);
      functions = callable.getFunctions(app, 'asia-northeast1'); storage = files.getStorage(app);
      const emulatorHost = globalThis.BSS_FIREBASE_EMULATOR_HOST;
      if (emulatorHost && ['localhost', '127.0.0.1'].includes(location.hostname)) {
        authentication.connectAuthEmulator(auth, `http://${emulatorHost}:9099`);
        firestore.connectFirestoreEmulator(db, emulatorHost, 8080);
        callable.connectFunctionsEmulator(functions, emulatorHost, 5001);
        files.connectStorageEmulator(storage, emulatorHost, 9199);
      }
      try { await authentication.setPersistence(auth, authentication.browserLocalPersistence); }
      catch { await authentication.setPersistence(auth, authentication.inMemoryPersistence); state.warning = 'Your browser blocks persistent storage. This sign-in lasts only while this page is open.'; }
      state.configured = true;
      await new Promise((resolve, reject) => {
        let first = true;
        authentication.onIdTokenChanged(auth, async user => {
          try {
            const revision = ++authRevision;
            const claims = user ? (await user.getIdTokenResult()).claims : {};
            if (revision !== authRevision || auth.currentUser?.uid !== user?.uid) return;
            state = { ...state, configured: true, user, roles: Array.isArray(claims.roles) ? claims.roles : [], error: null, loading: false };
            emit(); if (first) { first = false; resolve(); }
          } catch (cause) {
            state = { ...state, configured: true, user: null, roles: [], error: friendlyError(cause), loading: false }; emit();
            if (first) { first = false; reject(cause); }
          }
        }, reject);
      });
      // Analytics is optional: unsupported browsers and blockers must not break accounts.
      if (globalThis.BSS_ENABLE_ANALYTICS === true && config.measurementId && !emulatorHost) {
        import(SDK + 'firebase-analytics.js').then(async analytics => {
          if (await analytics.isSupported()) analytics.getAnalytics(app);
        }).catch(() => {});
      }
    } catch (cause) {
      state = { ...state, configured: false, user: null, roles: [], error: friendlyError(cause), loading: false }; emit();
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
    state = { ...state, configured: true, user: auth.currentUser, roles: Array.isArray(claims.roles) ? claims.roles : [], error: null };
  }
}
async function call(name, data) {
  await ready(true);
  if (!globalThis.BSS_FIREBASE_APP_CHECK_KEY && !globalThis.BSS_FIREBASE_EMULATOR_HOST) throw error('firebase/app-check-required', 'Your account is signed in. Community data is awaiting Firebase App Check setup; please contact the site administrator.');
  try { const result = await sdk.callable.httpsCallable(functions, name)(data); return normalize(result.data); }
  catch (cause) { throw error(cause.code || 'firebase/request-failed', friendlyError(cause)); }
}
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
export async function signInWithGoogle() {
  await ready(); const provider = new sdk.authentication.GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' });
  return sdk.authentication.signInWithPopup(auth, provider);
}
export async function signInWithEmail(email, password) { await ready(); return sdk.authentication.signInWithEmailAndPassword(auth, String(email).trim(), password); }
export async function signUpWithEmail(email, password, displayName) {
  await ready(); const credential = await sdk.authentication.createUserWithEmailAndPassword(auth, String(email).trim(), password);
  credential.warnings = [];
  if (displayName) {
    try { await sdk.authentication.updateProfile(credential.user, { displayName: String(displayName).trim().slice(0,80) }); }
    catch { credential.warnings.push('Your account was created, but your display name could not be saved yet.'); }
  }
  try { await sdk.authentication.sendEmailVerification(credential.user); }
  catch { credential.warnings.push('Your account was created. The verification email could not be sent; use Resend verification from your account.'); }
  try { await refreshClaims(); } catch { credential.warnings.push('Your account was created. Reload the page if your account details have not refreshed yet.'); }
  return credential;
}
export async function signOut() {
  await ready(); await sdk.authentication.signOut(auth);
  ++authRevision; state = { ...state, user: null, roles: [], error: null }; emit();
}
export async function sendPasswordReset(email) { await ready(); return sdk.authentication.sendPasswordResetEmail(auth, String(email).trim()); }
export async function sendVerificationEmail() { await ready(true); if (!auth.currentUser.emailVerified) return sdk.authentication.sendEmailVerification(auth.currentUser); }
export async function refreshClaims() {
  await ready(true); const user = auth.currentUser, revision = ++authRevision;
  const claims = (await user.getIdTokenResult(true)).claims;
  if (auth.currentUser?.uid === user.uid && revision === authRevision) { state = { ...state, user, roles: Array.isArray(claims.roles) ? claims.roles : [] }; emit(); }
  return getAuthState();
}
export async function reloadUser() { await ready(true); await sdk.authentication.reload(auth.currentUser); return refreshClaims(); }
export function friendlyError(cause) {
  const messages = {
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/invalid-credential': 'The email or password is incorrect. Please try again.',
    'auth/wrong-password': 'The email or password is incorrect. Please try again.',
    'auth/user-not-found': 'The email or password is incorrect. Please try again.',
    'auth/email-already-in-use': 'An account already uses this email. Sign in or reset your password.',
    'auth/weak-password': 'Choose a stronger password with at least 6 characters.',
    'auth/password-does-not-meet-requirements': 'This password does not meet the account security requirements. Try a longer password with upper and lowercase letters, a number, and a symbol.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
    'auth/network-request-failed': 'Could not connect. Check your internet connection and try again.',
    'auth/operation-not-allowed': 'This sign-in method is awaiting activation. Please contact the site administrator.',
    'auth/configuration-not-found': 'Account access is awaiting Firebase Authentication setup. Please contact the site administrator.',
    'auth/unauthorized-domain': 'Sign-in has not been enabled for this website address. Please contact the site administrator.',
    'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow popups for this site and try again, or use email sign-in.',
    'auth/popup-closed-by-user': 'Google sign-in was closed before completing. Please try again.',
    'auth/cancelled-popup-request': 'A sign-in window is already open. Complete it or try again.',
    'auth/account-exists-with-different-credential': 'This email uses a different sign-in method. Sign in with the method you used when joining.',
    'auth/user-disabled': 'This account is disabled. Please contact the site administrator.',
    'auth/requires-recent-login': 'Please sign out and sign in again before making this change.',
    'auth/invalid-api-key': 'Account access is not configured correctly. Please contact the site administrator.',
    'permission-denied': 'You do not have access to this data, or the community database is still being configured.',
    'unavailable': 'The community service is temporarily unavailable. Please try again shortly.',
    'functions/unauthenticated': 'Please sign in again. If this continues, the administrator needs to complete App Check setup.',
    'functions/not-found': 'This community service is not available yet. Please contact the site administrator.',
    'functions/internal': 'The community service could not complete this request. Please try again later.',
    'functions/unavailable': 'The community service is unavailable. Please try again shortly.',
    'functions/deadline-exceeded': 'The request took too long. Check your connection and retry.',
    'storage/unauthorized': 'You do not have permission to upload here. Please contact the site administrator.'
  };
  return messages[cause?.code] || (cause?.message && !String(cause.message).startsWith('Firebase:') ? cause.message : 'Unable to complete this request. Please try again.');
}
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
export const lookupFoodOrder = data => call('lookupFoodOrder', data);
export const advanceFoodOrder = (orderId, action, token, amountJPY, options={}) => call('advanceFoodOrder', { orderId, action, ...(token ? {token} : options.manual===true ? {manual:true} : {}), ...(amountJPY !== undefined ? { amountJPY } : {}) });
export async function getMyRegistrations() { await ready(true); const f = sdk.firestore; return list('registrations', [f.where('uid', '==', state.user.uid), f.orderBy('createdAt', 'desc')]); }
async function foodOrderFeed(constraints) {
  const f=sdk.firestore, active=[], collection=f.collection(db,'foodOrders');let cursor;
  // An old ready order must never disappear behind a busy stall's recent history.
  for(let page=0;page<20;page++) {
    const snapshot=await f.getDocs(f.query(collection,...constraints,f.where('status','in',['confirmed','preparing','ready']),f.orderBy('createdAt','desc'),...(cursor?[f.startAfter(cursor)]:[]),f.limit(100)));
    active.push(...snapshot.docs.map(doc=>({id:doc.id,...normalize(doc.data())})));
    if(snapshot.docs.length<100)break;
    if(page===19)throw error('food/queue-too-large','This queue exceeds 2,000 active orders. Please contact the administrator before processing further orders.');
    cursor=snapshot.docs[snapshot.docs.length-1];
  }
  const recent=await list('foodOrders',[...constraints,f.orderBy('createdAt','desc')]);
  return [...new Map([...recent,...active].map(row=>[row.id,row])).values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
}
export async function getMyOrders() { await ready(true); return foodOrderFeed([sdk.firestore.where('uid','==',state.user.uid)]); }
export async function getStaffOrders(eventId,vendorId) { await ready(true); const f=sdk.firestore;return foodOrderFeed([f.where('eventId','==',eventId),f.where('vendorId','==',vendorId)]); }
export async function getAdminFoodOrders() { await ready(true);if(!state.roles.some(r=>['admin','super_admin'].includes(r)))throw error('permission-denied','Administrator access is required.');return foodOrderFeed([]); }
export async function getEventRegistrations(eventId) { await ready(true); const f = sdk.firestore; return list('registrations', [f.where('eventId', '==', eventId), f.orderBy('createdAt', 'desc')]); }
export async function getAdminOverview() {
  await ready(true);
  if (!state.roles.some(role => ['super_admin', 'admin'].includes(role))) throw error('permission-denied', 'Administrator access is required.');
  const names = { members:'users', events:'events', orders:'foodOrders', registrations:'registrations', menu:'menuItems', vendors:'vendors', gallery:'photos', reels:'reels', news:'newsPosts', committee:'committeeTerms', partners:'partnerOrganizations', requests:'communityRequests', posts:'communityPosts', audits:'auditLogs', settings:'websiteContent' };
  const entries = await Promise.all(Object.entries(names).map(async ([key, collection]) => [key, await list(collection)]));
  return { ...Object.fromEntries(entries), limitedTo: 100 };
}
export const saveContent = (collection, id, data) => call('saveContent', { collection, id, data });
export async function getContent(collection, {includeDrafts = false} = {}) { await ready(); return list(collection, includeDrafts ? [] : [sdk.firestore.where('status', '==', 'published')]); }
export const deleteContent = (collection, id) => call('deleteContent', { collection, id });
export async function getStaffAssignment() { await ready(true); const doc = await sdk.firestore.getDoc(sdk.firestore.doc(db, 'staffAssignments', auth.currentUser.uid)); return doc.exists() ? normalize(doc.data()) : { roles: [], eventIds: [], vendorIds: [] }; }
export async function getCommunityPosts() { await ready(); return list('communityPosts', [sdk.firestore.where('status', '==', 'published'), sdk.firestore.orderBy('createdAt', 'desc')]); }
export const createCommunityPost = data => call('createCommunityPost', data);
export const deleteCommunityPost = id => call('deleteCommunityPost', { id });
export const togglePostHeart = id => call('togglePostHeart', { id });
export const replyToPost = (id, body) => call('replyToPost', { id, body });
export const moderatePost = (id, status) => call('moderatePost', { id, status });
export const submitCommunityRequest = data => call('submitCommunityRequest', data);
export const updateCommunityRequest = (id, status) => call('updateCommunityRequest', {id,status});
export async function getIncomingRequests() { await ready(true); return list('communityRequests', [sdk.firestore.where('toUserId', '==', auth.currentUser.uid), sdk.firestore.orderBy('createdAt', 'desc')]); }
export async function getMyRequests() { await ready(true); return list('communityRequests', [sdk.firestore.where('uid', '==', auth.currentUser.uid), sdk.firestore.orderBy('createdAt', 'desc')]); }
export const assignStaff = (uid, roles, eventIds = [], vendorIds = []) => call('assignStaff', { uid, roles, eventIds, vendorIds });
export async function uploadImage(file, { kind = 'gallery', id = 'general' } = {}) {
  await ready(true);
  const uploadUserId = auth.currentUser.uid;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size >= 5 * 1024 * 1024) throw error('storage/invalid-image', 'Choose a JPG, PNG, or WebP image smaller than 5 MB.');
  if (!['gallery', 'avatar'].includes(kind)) throw error('storage/invalid-path', 'Invalid upload type.');
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw error('storage/invalid-path', 'Invalid album identifier.');
  if (kind === 'gallery' && !state.roles.some(role => ['super_admin','admin','content_editor'].includes(role))) throw error('permission-denied', 'Content editor access is required.');
  const suffix = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
  const path = kind === 'avatar' ? `avatars/${uploadUserId}/${requestId()}.${suffix}` : `gallery/${id}/${requestId()}.${suffix}`;
  const ref = sdk.files.ref(storage, path); await sdk.files.uploadBytes(ref, file, { contentType: file.type });
  if (auth.currentUser?.uid !== uploadUserId) throw error('auth/account-changed', 'Your signed-in account changed. Reopen your dashboard before saving a picture.');
  const url = await sdk.files.getDownloadURL(ref);
  if (auth.currentUser?.uid !== uploadUserId) throw error('auth/account-changed', 'Your signed-in account changed. Reopen your dashboard before saving a picture.');
  return { path, url };
}

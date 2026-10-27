/** Member sign-in adapter; website data uses the native backend. Failed operations never fall back to browser-local demo data. */
import {createCommunityAPI} from './community-api.js';
const SDK = 'https://www.gstatic.com/firebasejs/13.0.0/';
let sdk = null, app = null, auth = null, initialization = null;
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
      const [core, authentication] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js')]);
      sdk = { core, authentication };
      app = core.getApps().find(existing => existing.name === 'tiu-bss') || core.initializeApp(config, 'tiu-bss');
      auth = authentication.getAuth(app);
      const emulatorHost = globalThis.BSS_FIREBASE_EMULATOR_HOST;
      if (emulatorHost && ['localhost','127.0.0.1'].includes(location.hostname)) authentication.connectAuthEmulator(auth, `http://${emulatorHost}:9099`);
      try { await authentication.setPersistence(auth, authentication.browserLocalPersistence); }
      catch { await authentication.setPersistence(auth, authentication.inMemoryPersistence); state.warning = 'Your browser blocks persistent storage. This sign-in lasts only while this page is open.'; }
      state.configured = true;
      await new Promise((resolve, reject) => {
        let first = true;
        authentication.onIdTokenChanged(auth, async user => {
          if (auth.currentUser?.uid !== user?.uid) return;
          const revision = ++authRevision;
          // Clear the previous member's identity and privileges before role I/O.
          // Other tabs can change the SDK user while an old form is still open.
          if (state.user?.uid !== user?.uid) {
            state = { ...state, configured: true, user, roles: [], error: null, loading: false };
            emit();
          }
          try {
            const roles = user ? await staffRoles(user) : [];
            if (revision !== authRevision || auth.currentUser?.uid !== user?.uid) return;
            state = { ...state, configured: true, user, roles, error: null, loading: false };
            emit(); if (first) { first = false; resolve(); }
          } catch (cause) {
            if (revision !== authRevision || auth.currentUser?.uid !== user?.uid) return;
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
  const result = await initialization;
  // A transient SDK/network failure must not poison every Retry for this page.
  if (!result.configured) initialization = null;
  return result;
}
async function ready(requireUser = false) {
  await initFirebase();
  if (!state.configured) throw error('firebase/unconfigured', state.error || 'Member sign-in is not configured.');
  if (requireUser && !auth.currentUser) throw error('auth/required', 'Please sign in to continue.');
  if (auth.currentUser && state.user?.uid !== auth.currentUser.uid) {
    const user = auth.currentUser, revision = authRevision;
    const roles = await staffRoles(user);
    if (auth.currentUser?.uid !== user.uid) throw error('auth/account-changed', 'Your signed-in account changed. Please open your dashboard again.');
    if (revision === authRevision) {
      state = { ...state, configured: true, user, roles, error: null };
      emit();
    }
  }
}
export async function signInWithGoogle() {
  await ready(); const provider = new sdk.authentication.GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' });
  const credential = await sdk.authentication.signInWithPopup(auth, provider);
  if (!credential.user || auth.currentUser?.uid !== credential.user.uid) throw error('auth/account-changed', 'Your signed-in account changed. Please open your dashboard again.');
  // The token observer also loads staff roles. Publish the confirmed identity
  // immediately so a slower role request cannot make a successful login fail.
  if (state.user?.uid !== credential.user.uid) {
    state = { ...state, configured: true, user: credential.user, roles: [], error: null, loading: false };
    emit();
  }
  return credential;
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
  await user.getIdToken(true); const roles = await staffRoles(user);
  if (auth.currentUser?.uid === user.uid && revision === authRevision) { state = { ...state, user, roles }; emit(); }
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
async function staffRoles(user) {
 try {const response=await fetch('/api/community/me',{headers:{Authorization:'Bearer '+await user.getIdToken()},credentials:'omit',cache:'no-store'});if(!response.ok)return [];return (await response.json()).assignment?.roles||[];} catch{return [];}
}
const native=createCommunityAPI({token:async()=>{await ready(true);return auth.currentUser.getIdToken();},user:()=>auth?.currentUser});
export const {getBackendStatus,getMyProfile,saveMyProfile,approveMembership,getPublicProfiles,getEvents,createEvent,registerForEvent,cancelRegistration,checkInRegistration,getMenu,saveMenuItem,placeFoodOrder,cancelFoodOrder,lookupFoodOrder,advanceFoodOrder,getMyRegistrations,getMyOrders,getStaffOrders,getAdminFoodOrders,getEventRegistrations,getAdminOverview,saveContent,getContent,deleteContent,getStaffAssignment,getCommunityPosts,createCommunityPost,deleteCommunityPost,togglePostHeart,replyToPost,moderatePost,submitCommunityRequest,updateCommunityRequest,getIncomingRequests,getMyRequests,assignStaff,uploadImage}=native;

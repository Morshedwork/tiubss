import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveProfilePhoto, googlePhotoURL, mergeGoogleSignupDraft} from '../dist/js/profile-photo.js';
import {createLiveStore} from '../dist/js/live-store.js';

const google='https://lh3.googleusercontent.com/test-photo';
const custom='https://example.test/custom.jpg';
const user={uid:'one',email:'member@example.test',displayName:'Member',photoURL:google,providerData:[{providerId:'google.com',photoURL:google}]};

test('new Google profile defaults to its provider photo; unsafe or unrelated provider URLs are rejected',()=>{
  assert.deepEqual(resolveProfilePhoto({},user),{photoURL:google,avatar:google,photoSource:'google'});
  assert.equal(googlePhotoURL({...user,providerData:[{providerId:'password',photoURL:google}]}),'');
  for(const photoURL of ['javascript:alert(1)','http://example.test/a','https://user:pass@example.test/a','https://example.test/a b']) {
    assert.equal(googlePhotoURL({...user,providerData:[{providerId:'google.com',photoURL}]}),'');
  }
});

test('saved custom and removed photos survive sign-in; only Google selection follows provider changes',()=>{
  assert.equal(resolveProfilePhoto({photoSource:'custom',photoURL:custom},user).photoURL,custom);
  assert.equal(resolveProfilePhoto({photoSource:'none',photoURL:custom,avatar:custom},user).photoURL,'');
  assert.equal(resolveProfilePhoto({photoURL:'',avatar:custom},user).photoURL,'');
  assert.equal(resolveProfilePhoto({photoURL:custom},user).photoSource,'custom');
  assert.equal(resolveProfilePhoto({photoSource:'google',photoURL:custom},user).photoURL,google);
  assert.equal(resolveProfilePhoto({photoSource:'google',photoURL:custom},{uid:'one'}).photoURL,custom);
});

test('Google signup keeps chosen uploads and explicit removals but fills untouched blank drafts',()=>{
  const base={profile:{name:'Typed name',photoURL:'',avatar:'',photoSource:''},photo:null};
  const merged=mergeGoogleSignupDraft(base,user);
  assert.equal(merged.profile.photoURL,google);assert.equal(merged.profile.photoSource,'google');assert.equal(merged.profile.name,'Typed name');
  assert.equal(mergeGoogleSignupDraft({...base,profile:{...base.profile,photoSource:'none'}},user).profile.photoURL,'');
  const selected={name:'chosen.jpg'};
  const upload=mergeGoogleSignupDraft({...base,photo:selected},user);
  assert.equal(upload.photo,selected);assert.equal(upload.profile.photoSource,'custom');
  assert.equal(mergeGoogleSignupDraft({profile:{photoURL:custom}},user).profile.photoURL,custom);
});

function fixture(initialProfile) {
  let currentUser=user,saved=initialProfile,authListener;
  const auth=()=>({configured:true,user:currentUser,roles:[]});
  const api={subscribeAuth(fn){authListener=fn;fn(auth());return()=>{};},initFirebase:async()=>auth(),getAuthState:auth,
    getPublicProfiles:async()=>[{uid:'public',name:'Public member'}],getEvents:async()=>[],getContent:async()=>[],
    getMyProfile:async()=>saved,getMyRegistrations:async()=>[],getMyOrders:async()=>[],
    async saveMyProfile(patch){saved={...saved,...patch,uid:currentUser.uid};}
  };
  return {store:createLiveStore(api),setUser(next){currentUser=next;authListener(auth());},get saved(){return saved;}};
}

test('own profile gets Google default without leaking it into public profiles or losing a removal on refresh',async()=>{
  const f=fixture({uid:'one',name:'Member'});await f.store.initialize();
  assert.equal(f.store.getState().profile.photoURL,google);
  assert.equal(f.store.getState().publicMembers[0].avatar,'');
  await f.store.saveProfile({photoURL:'',avatar:custom,photoSource:'none'});
  assert.equal(f.saved.photoURL,'');assert.equal(f.saved.photoSource,'none');
  assert.equal(f.store.getState().profile.avatar,'');
  f.setUser({...user,photoURL:google+'-new',providerData:[{providerId:'google.com',photoURL:google+'-new'}]});
  assert.equal(f.store.getState().profile.photoURL,'');
  f.setUser(null);assert.equal(f.store.getState().profile,null);
  f.setUser(user);await f.store.refresh();assert.equal(f.store.getState().profile.photoURL,'');
});

test('Google-mode account refresh follows its own provider, and custom saves stay selected after reload',async()=>{
  const f=fixture({uid:'one',name:'Member',photoSource:'google',photoURL:google});await f.store.initialize();
  f.setUser({...user,providerData:[{providerId:'google.com',photoURL:google+'-latest'}]});
  assert.equal(f.store.getState().profile.avatar,google+'-latest');
  await f.store.saveProfile({photoSource:'custom',photoURL:custom});
  await f.store.refresh();assert.equal(f.store.getState().profile.avatar,custom);
  f.setUser({...user,uid:'two',photoURL:'',providerData:[]});
  assert.notEqual(f.store.getState().profile.avatar,custom);
});

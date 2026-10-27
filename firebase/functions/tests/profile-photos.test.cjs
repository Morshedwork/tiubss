const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

// Runs the actual compiled profile callable with isolated Auth and Firestore
// substitutes. This does not validate deployed Firebase rules or App Check.
class HttpsError extends Error { constructor(code,message) { super(message); this.code=code; } }
const complete = () => ({uid:'member',name:'Test Member',email:'member@example.org',phone:'+81 90 1234 5678',bio:'Finding my community while studying in Tokyo.',membershipType:'student',university:'Tokyo International University',major:'Digital Business',semester:4,membershipStatus:'pending',directoryOptIn:false,publicFields:['name','membershipType']});
const googleURL = 'https://lh3.googleusercontent.com/member-photo';
const customURL = 'https://firebasestorage.googleapis.com/member-photo?token=private';
function harness({profile,providers=[{providerId:'google.com',photoURL:googleURL}]}={}) {
  const docs=new Map(), stats={providerReads:0};if(profile)docs.set('users/member',structuredClone(profile));
  const ref=path=>({path});
  const db={doc:ref,runTransaction:async fn=>{
    const writes=[];const tx={get:async r=>{assert.equal(writes.length,0);const data=docs.get(r.path);return {exists:data!==undefined,data:()=>data&&structuredClone(data)};},set:(r,data)=>writes.push(['set',r.path,structuredClone(data)]),delete:r=>writes.push(['delete',r.path])};
    const result=await fn(tx);for(const [kind,path,data]of writes){if(kind==='delete')docs.delete(path);else docs.set(path,data);}return result;
  }};
  const modules={
    'firebase-admin/app':{initializeApp(){}},
    'firebase-admin/auth':{getAuth:()=>({getUser:async uid=>{assert.equal(uid,'member');stats.providerReads++;return {photoURL:'https://untrusted.example/auth-picture',providerData:providers};}})},
    'firebase-admin/firestore':{getFirestore:()=>db,Timestamp:{fromMillis:ms=>ms},FieldValue:{serverTimestamp:()=>Date.now()}},
    'firebase-functions/v2/https':{HttpsError,onCall:(options,handler)=>{assert.equal(options.enforceAppCheck,true);return handler;}},
    'firebase-functions/v2/scheduler':{onSchedule:(_options,handler)=>handler},
    'node:crypto':crypto,'./profile-validation':require('../lib/profile-validation.js')
  };
  const exports={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../lib/index.js'),'utf8'),{exports,require:name=>{assert(modules[name],`Unexpected import ${name}`);return modules[name];},Buffer,console},{filename:'compiled-profile-functions.js'});
  const save=(data,signedIn=true)=>exports.saveProfile({data,auth:signedIn?{uid:'member',token:{email:'member@example.org'}}:undefined});
  return {docs,stats,save,get profile(){return docs.get('users/member');}};
}
const reject=(fn,code)=>assert.rejects(fn,error=>error.code===code);

test('new profiles default to the trusted Google provider picture, never Auth top-level photo',async()=>{
  const h=harness();await h.save(complete());assert.equal(h.profile.photoSource,'google');assert.equal(h.profile.photoURL,googleURL);assert.equal(h.stats.providerReads,1);
  const email=harness({providers:[]});await email.save(complete());assert.equal(email.profile.photoSource,'none');assert.equal(email.profile.photoURL,'');
});

test('explicit Google selection resolves provider data and ignores submitted picture URLs',async()=>{
  const h=harness({profile:{...complete(),photoSource:'custom',photoURL:customURL}});
  await h.save({photoSource:'google',photoURL:'javascript:untrusted()'});assert.equal(h.profile.photoURL,googleURL);assert.equal(h.profile.photoSource,'google');
  const absent=harness({profile:complete(),providers:[{providerId:'password',photoURL:googleURL}]});
  await reject(()=>absent.save({photoSource:'google',photoURL:googleURL}),'failed-precondition');assert.equal(absent.profile.photoURL,undefined);
});

test('custom upload and explicit removal survive later unrelated profile saves',async()=>{
  const h=harness({profile:{...complete(),photoSource:'google',photoURL:googleURL}});
  await h.save({photoSource:'custom',photoURL:customURL});await h.save({city:'Tokyo'});assert.equal(h.profile.photoSource,'custom');assert.equal(h.profile.photoURL,customURL);
  await h.save({photoSource:'none',photoURL:googleURL});await h.save({city:'Kawagoe'});assert.equal(h.profile.photoSource,'none');assert.equal(h.profile.photoURL,'');assert.equal(h.stats.providerReads,0);
  await h.save({photoSource:'google'});assert.equal(h.profile.photoURL,googleURL);
});

test('legacy profiles infer conservative choices without silently restoring a Google picture',async()=>{
  for(const [url,source]of [['','none'],[customURL,'custom']]){const h=harness({profile:{...complete(),photoURL:url}});await h.save({city:'Tokyo'});assert.equal(h.profile.photoSource,source);assert.equal(h.profile.photoURL,url);assert.equal(h.stats.providerReads,0);}
  const missing=harness({profile:complete()});await missing.save({city:'Tokyo'});assert.equal(missing.profile.photoSource,'none');assert.equal(missing.profile.photoURL,undefined);assert.equal(missing.stats.providerReads,0);
  const oldClient=harness({profile:{...complete(),photoSource:'google',photoURL:googleURL}});await oldClient.save({photoURL:customURL});assert.equal(oldClient.profile.photoSource,'custom');await oldClient.save({photoURL:''});assert.equal(oldClient.profile.photoSource,'none');assert.equal(oldClient.profile.photoURL,'');
});

test('photo preferences and URLs are validated while longer Storage URLs remain usable',async()=>{
  const h=harness({profile:complete()});const long='https://storage.example/photo?token='+ 'x'.repeat(1600);await h.save({photoSource:'custom',photoURL:long});assert.equal(h.profile.photoURL,long);
  for(const data of [{photoSource:'automatic'},{photoSource:'custom',photoURL:''},{photoSource:'custom',photoURL:'http://example.org/photo'},{photoSource:'custom',photoURL:'https://name:secret@example.org/photo'},{photoURL:'https://example.org/'+'x'.repeat(2000)}])await reject(()=>h.save(data),'invalid-argument');
  const badGoogle=harness({profile:complete(),providers:[{providerId:'google.com',photoURL:'javascript:alert(1)'}]});await reject(()=>badGoogle.save({photoSource:'google'}),'failed-precondition');
});

test('photo source stays private and public picture projection still requires approval and consent',async()=>{
  const h=harness({profile:{...complete(),membershipStatus:'approved',directoryOptIn:true,publicFields:['name','membershipType','photoURL']}});await h.save({photoSource:'google'});const publicProfile=h.docs.get('publicProfiles/member');assert.equal(publicProfile.photoURL,googleURL);assert.equal(publicProfile.photoSource,undefined);
  await h.save({publicFields:['name','membershipType']});assert.equal(h.docs.get('publicProfiles/member').photoURL,undefined);
  await h.save({directoryOptIn:false});assert.equal(h.docs.has('publicProfiles/member'),false);
  await reject(()=>h.save({publicFields:['photoSource']}),'invalid-argument');
  const pending=harness();await pending.save({...complete(),directoryOptIn:true,publicFields:['name','photoURL']});assert.equal(pending.docs.has('publicProfiles/member'),false);
});

test('photo changes do not bypass authentication, onboarding, or consent withdrawal protections',async()=>{
  const h=harness();await reject(()=>h.save({photoSource:'google'},false),'unauthenticated');await reject(()=>h.save({photoSource:'google'}),'invalid-argument');assert.equal(h.profile,undefined);
  const legacy=harness({profile:{uid:'member',name:'Legacy Member',directoryOptIn:true}});await legacy.save({directoryOptIn:false});assert.equal(legacy.profile.directoryOptIn,false);await reject(()=>legacy.save({directoryOptIn:false,photoSource:'google'}),'invalid-argument');
});

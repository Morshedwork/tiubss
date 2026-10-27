import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
let sequence=0;
const original=(await readFile(new URL('../public/js/firebase-service.js',import.meta.url),'utf8')).replace("from './community-api.js'",`from '${new URL('../public/js/community-api.js',import.meta.url).href}'`);
test('Firebase initialization can retry after a temporary SDK download failure',async()=>{
  const key=`__firebaseInitFixture${++sequence}`, priorConfig=globalThis.BSS_FIREBASE_CONFIG;
  let fail=true, attempts=0;
  const modules={
    'firebase-app.js':{getApps:()=>[],initializeApp:()=>({name:'tiu-bss'})},
    'firebase-auth.js':{getAuth:()=>({currentUser:null}),setPersistence:async()=>{},onIdTokenChanged:(auth,fn)=>fn(null)},
    'firebase-firestore.js':{getFirestore:()=>({})},
    'firebase-functions.js':{getFunctions:()=>({})},
    'firebase-storage.js':{getStorage:()=>({})}
  };
  globalThis[key]={async load(name){attempts++;if(fail)throw new Error('Temporary SDK network error');return modules[name];}};
  globalThis.BSS_FIREBASE_CONFIG={apiKey:'test',projectId:'test',appId:'test',authDomain:'test.example'};
  const source=original.replace(/import\(SDK \+ ('[^']+')\)/g,`globalThis.${key}.load($1)`);
  try {
    const api=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    assert.equal((await api.initFirebase()).configured,false);
    fail=false;assert.equal((await api.initFirebase()).configured,true);assert.equal(attempts,4);
  } finally {delete globalThis[key];if(priorConfig===undefined)delete globalThis.BSS_FIREBASE_CONFIG;else globalThis.BSS_FIREBASE_CONFIG=priorConfig;}
});


async function authFixture(fetchRoles=async()=>({ok:true,json:async()=>({assignment:{roles:['checkin_staff']}})})) {
  const key='__firebaseAuthFixture'+ ++sequence, priorConfig=globalThis.BSS_FIREBASE_CONFIG, priorFetch=globalThis.fetch;
  const auth={currentUser:null};let listener;
  const modules={
    'firebase-app.js':{getApps:()=>[],initializeApp:()=>({name:'tiu-bss'})},
    'firebase-auth.js':{getAuth:()=>auth,setPersistence:async()=>{},onIdTokenChanged:(_,next)=>{listener=next;void next(null);}}
  };
  globalThis[key]={load:async name=>modules[name]};
  globalThis.fetch=fetchRoles;
  globalThis.BSS_FIREBASE_CONFIG={apiKey:'test',projectId:'test',appId:'test',authDomain:'test.example'};
  const source=original.replace(/import\(SDK \+ ('[^']+')\)/g,'globalThis.'+key+'.load($1)');
  const api=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  await api.initFirebase();
  return {api,auth,changeUser(user){auth.currentUser=user;return listener(user);},cleanup(){delete globalThis[key];globalThis.fetch=priorFetch;if(priorConfig===undefined)delete globalThis.BSS_FIREBASE_CONFIG;else globalThis.BSS_FIREBASE_CONFIG=priorConfig;}};
}

test('a stale token failure cannot clear a newer native-backend session or completed sign-out',async()=>{
  for(const nextUser of [null,{uid:'new-account',getIdToken:async()=>'new-test-token'}]) {
    const f=await authFixture();
    try {
      let rejectToken;const pending=new Promise((_,reject)=>{rejectToken=reject;});
      const old=f.changeUser({uid:'old-account',getIdToken:()=>pending});
      await f.changeUser(nextUser);
      rejectToken(new Error('Old account token failed'));await old;
      assert.equal(f.api.getAuthState().user?.uid,nextUser?.uid);
      assert.equal(f.api.getAuthState().error,null);
      assert.deepEqual(f.api.getAuthState().roles,nextUser?['checkin_staff']:[]);
      assert.equal(f.api.getAuthState().configured,true);
    }finally{f.cleanup();}
  }
});

test('a late native role lookup cannot restore roles after an account switch',async()=>{
  let finishOld,startOld;const oldStarted=new Promise(resolve=>{startOld=resolve;});
  const f=await authFixture(async(path,options)=>{
    assert.equal(path,'/api/community/me');
    if(options.headers.Authorization==='Bearer old-test-token'){startOld();return new Promise(resolve=>{finishOld=resolve;});}
    return {ok:true,json:async()=>({assignment:{roles:['pickup_staff']}})};
  });
  try {
    const old=f.changeUser({uid:'old-account',getIdToken:async()=>'old-test-token'});await oldStarted;
    await f.changeUser({uid:'new-account',getIdToken:async()=>'new-test-token'});
    finishOld({ok:true,json:async()=>({assignment:{roles:['event_manager']}})});await old;
    assert.equal(f.api.getAuthState().user.uid,'new-account');
    assert.deepEqual(f.api.getAuthState().roles,['pickup_staff']);
  }finally{f.cleanup();}
});

test('an older failed role request cannot replace refreshed roles for the same member',async()=>{
  let rejectOld,startOld;const oldStarted=new Promise(resolve=>{startOld=resolve;});
  const f=await authFixture(async(path,options)=>{
    if(options.headers.Authorization==='Bearer old-test-token'){startOld();return new Promise((_,reject)=>{rejectOld=reject;});}
    return {ok:true,json:async()=>({assignment:{roles:['kitchen_staff']}})};
  });
  try {
    const old=f.changeUser({uid:'same-account',getIdToken:async()=>'old-test-token'});await oldStarted;
    await f.changeUser({uid:'same-account',getIdToken:async()=>'new-test-token'});
    rejectOld(new Error('Superseded role request failed'));await old;
    assert.equal(f.api.getAuthState().user.uid,'same-account');
    assert.deepEqual(f.api.getAuthState().roles,['kitchen_staff']);assert.equal(f.api.getAuthState().error,null);
  }finally{f.cleanup();}
});

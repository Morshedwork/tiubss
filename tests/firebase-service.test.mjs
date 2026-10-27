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


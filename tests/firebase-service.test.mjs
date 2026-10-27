import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const original = (await readFile(new URL('../public/js/firebase-service.js', import.meta.url), 'utf8'))
  .replace("from './app-check-config.js'", `from '${new URL('../public/js/app-check-config.js', import.meta.url).href}'`)
  .replace("from './request-id.js'", `from '${new URL('../public/js/request-id.js', import.meta.url).href}'`);
let sequence = 0;
async function fixture(driver) {
  const key = `__firebaseQueryFixture${++sequence}`;
  globalThis[key] = driver;
  const source = original
    .replace('let sdk = null, app = null, auth = null, db = null, functions = null, storage = null, initialization = null;', `let sdk = globalThis.${key}, app = null, auth = {currentUser:null}, db = {}, functions = null, storage = null, initialization = null;`)
    .replace('configured: false, user: null', 'configured: true, user: null')
    + '\nexport {list as readCollection};';
  return {api: await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`), cleanup: () => delete globalThis[key]};
}
function driver(onQuery) {
  const queries = [];
  return {queries, firestore: {
    collection: (db, name) => ({name}), query: (collection, ...constraints) => ({collection, constraints}),
    where: (field, operator, value) => ({kind:'where', field, operator, value}),
    orderBy: (field, direction) => ({kind:'order', field, direction}), limit: count => ({kind:'limit', count}),
    startAfter: doc => ({kind:'after', id:doc.id}),
    async getDocs(query) {queries.push(query);return onQuery(query, queries.length);}
  }};
}
const snapshot = rows => ({docs:rows.map(row => ({id:row.id, data: () => row}))});
const indexError = () => Object.assign(new Error('The query requires an index.'), {code:'failed-precondition'});

test('missing-index fallback keeps authorization filters and sorts across every page before limiting', async () => {
  const sdk = driver((query, count) => {
    if(count === 1) throw indexError();
    if(count === 2) return snapshot(Array.from({length:100}, (_, i) => ({id:`later-${String(i).padStart(3,'0')}`, startsAt:`2027-01-${String(i%28+1).padStart(2,'0')}`})));
    return snapshot([{id:'earliest', startsAt:'2026-01-01'}, {id:'no-time'}]);
  });
  const f = await fixture(sdk);
  try {
    const filter=sdk.firestore.where('status','==','published');
    const rows=await f.api.readCollection('events',[filter],['startsAt','asc']);
    assert.equal(rows.length,100);assert.equal(rows[0].id,'earliest');assert.ok(!rows.some(row=>row.id==='no-time'));
    assert.equal(sdk.queries.length,3);
    for(const query of sdk.queries) assert.deepEqual(query.constraints[0],filter);
    assert.equal(sdk.queries[2].constraints.find(c=>c.kind==='after').id,'later-099');
    assert.ok(sdk.queries.slice(1).every(q=>!q.constraints.some(c=>c.kind==='order')));
  } finally {f.cleanup();}
});

test('permission and unrelated precondition failures never cause a broader retry',async()=>{
  for(const cause of [Object.assign(new Error('Denied'),{code:'permission-denied'}),Object.assign(new Error('Database not configured'),{code:'failed-precondition'})]){
    const sdk=driver(()=>{throw cause;}),f=await fixture(sdk);
    try{await assert.rejects(f.api.readCollection('registrations',[sdk.firestore.where('uid','==','member')],['createdAt','desc']),error=>error===cause);assert.equal(sdk.queries.length,1);}
    finally{f.cleanup();}
  }
});

test('large missing-index result refuses to display a misleading partial collection',async()=>{
  const sdk=driver((query,count)=>{if(count===1)throw indexError();return snapshot(Array.from({length:100},(_,i)=>({id:`${count}-${i}`,createdAt:'2026-10-27'})));}),f=await fixture(sdk);
  try {await assert.rejects(f.api.readCollection('registrations',[sdk.firestore.where('uid','==','member')],['createdAt','desc']),/needs its Firestore index/);assert.equal(sdk.queries.length,22);}
  finally {f.cleanup();}
});

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
    fail=false;assert.equal((await api.initFirebase()).configured,true);assert.equal(attempts,10);
  } finally {delete globalThis[key];if(priorConfig===undefined)delete globalThis.BSS_FIREBASE_CONFIG;else globalThis.BSS_FIREBASE_CONFIG=priorConfig;}
});

test('App Check selects the registered provider and requires no secret in browser config',async()=>{
 const {appCheckOptions}=await import('../public/js/app-check-config.js');
 class Enterprise{constructor(key){this.key=key;}}class V3{constructor(key){this.key=key;}}
 const sdk={ReCaptchaEnterpriseProvider:Enterprise,ReCaptchaV3Provider:V3};
 const options=appCheckOptions(sdk,{BSS_FIREBASE_APP_CHECK_KEY:'public-site-key',BSS_FIREBASE_APP_CHECK_PROVIDER:'recaptcha-enterprise'});
 assert.ok(options.provider instanceof Enterprise);assert.equal(options.isTokenAutoRefreshEnabled,true);
 assert.ok(appCheckOptions(sdk,{BSS_FIREBASE_APP_CHECK_KEY:'legacy-public-key'}).provider instanceof V3);
 assert.equal(appCheckOptions(sdk,{}),null);
 assert.throws(()=>appCheckOptions(sdk,{BSS_FIREBASE_APP_CHECK_KEY:'key',BSS_FIREBASE_APP_CHECK_PROVIDER:'unknown'}),/not supported/);
});

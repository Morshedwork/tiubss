const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');

// This harness runs the actual compiled callable handlers with an atomic,
// serialized in-memory Firestore substitute. It is not a Firebase emulator:
// App Check/network wiring and deployed security rules still need a live check.
class Stamp {
  constructor(ms) { this.ms = ms; }
  toMillis() { return this.ms; }
  toDate() { return new Date(this.ms); }
  static fromMillis(ms) { return new Stamp(ms); }
  static now() { return new Stamp(Date.now()); }
}
class HttpsError extends Error { constructor(code,message) { super(message); this.code=code; } }
const clone = value => value instanceof Stamp ? new Stamp(value.ms) : Array.isArray(value) ? value.map(clone) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clone(v)])) : value;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function harness({stock=10,limit=10,allowGuestFood=false}={}) {
  const docs=new Map(); let nextId=0; let queue=Promise.resolve();
  function snapshot(p) { const data=docs.get(p); return {id:p.split('/').pop(),exists:data!==undefined,data:()=>clone(data)}; }
  const ref=p=>({path:p,id:p.split('/').pop(),get:async()=>snapshot(p),create:async data=>{if(docs.has(p))throw Error('already exists');docs.set(p,resolve(data));}});
  function resolve(value,old) {
    if(value?.__op==='stamp')return Stamp.now();
    if(value?.__op==='increment')return Number(old||0)+value.amount;
    if(value instanceof Stamp)return clone(value);
    if(Array.isArray(value))return value.map((x,i)=>resolve(x,old?.[i]));
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolve(v,old?.[k])]));
    return value;
  }
  function collection(name,filters=[],max=Infinity) { return {
    doc: id=>ref(`${name}/${id||`auto-${++nextId}`}`),
    add: async data=>{const r=ref(`${name}/auto-${++nextId}`);docs.set(r.path,resolve(data));return r;},
    where:(field,op,value)=>collection(name,[...filters,[field,op,value]],max),
    limit:value=>collection(name,filters,value),
    get:async()=>{const found=[...docs].filter(([p,data])=>p.startsWith(name+'/')&&p.split('/').length===2&&filters.every(([field,op,value])=>op==='=='?data[field]===value:op==='<='?(data[field]?.toMillis?.()??data[field])<=(value?.toMillis?.()??value):false)).slice(0,max).map(([p])=>snapshot(p));return {docs:found,size:found.length};}
  }; }
  const db={doc:ref,collection,runTransaction(fn){
    const run=queue.then(async()=>{const writes=[];const tx={
      get:async r=>{assert.equal(writes.length,0,'Firestore requires all reads before writes');return snapshot(r.path);},
      create:(r,v)=>writes.push(['create',r.path,v]),set:(r,v,options)=>writes.push(['set',r.path,v,options]),update:(r,v)=>writes.push(['update',r.path,v]),delete:r=>writes.push(['delete',r.path])
    }; const result=await fn(tx); const backup=new Map(docs); try{for(const [kind,p,value,options]of writes){const old=docs.get(p);if(kind==='create'&&old!==undefined)throw Error('duplicate create');if(kind==='update'&&old===undefined)throw Error('missing update');if(kind==='delete')docs.delete(p);else docs.set(p,kind==='update'||options?.merge?{...old,...resolve(value,old)}:resolve(value,old));}}catch(e){docs.clear();for(const[p,v]of backup)docs.set(p,v);throw e;}return result;});queue=run.catch(()=>{});return run;
  }};
  const mods={
    'firebase-admin/app':{initializeApp(){}},'firebase-admin/auth':{getAuth:()=>({})},
    'firebase-admin/firestore':{getFirestore:()=>db,Timestamp:Stamp,FieldValue:{serverTimestamp:()=>({__op:'stamp'}),increment:amount=>({__op:'increment',amount})}},
    'firebase-functions/v2/https':{HttpsError,onCall:(options,handler)=>{assert.equal(options.enforceAppCheck,true);return handler;}},
    'firebase-functions/v2/scheduler':{onSchedule:(_options,handler)=>handler},'node:crypto':crypto,
    './profile-validation':require('../lib/profile-validation.js')
  };
  const exports={}; const code=fs.readFileSync(path.join(__dirname,'../lib/index.js'),'utf8');
  vm.runInNewContext(code,{exports,require:name=>{if(!mods[name])throw Error(`Unexpected import ${name}`);return mods[name];},Buffer,console},{filename:'compiled-food-functions.js'});
  const future=Date.now()+3600000;
  docs.set('events/event1',{title:'Test festival',status:'published',foodEnabled:true,foodClosesAt:new Stamp(future),endsAt:new Stamp(future),allowGuestFood});
  docs.set('vendors/stall1',{eventId:'event1',name:'Food stall',location:'Counter 1',status:'published'});
  docs.set('vendors/stall2',{eventId:'event1',name:'Other stall',location:'Counter 2',status:'published'});
  docs.set('menuItems/dish1',{eventId:'event1',vendorId:'stall1',name:'Biryani',priceJPY:800,stock,perPersonLimit:limit,active:true,pickupLocation:'Food counter'});
  docs.set('menuItems/dish2',{eventId:'event1',vendorId:'stall1',name:'Lassi',priceJPY:300,stock,perPersonLimit:limit,active:true,pickupLocation:'Food counter'});
  for(const user of ['alice','bob']){docs.set(`users/${user}`,{name:user,membershipStatus:'approved'});docs.set(`registrations/${digest(`event1:${user}`)}`,{uid:user,eventId:'event1',status:'confirmed'});}
  const assignments={manager:{roles:['food_vendor_manager'],eventIds:['event1'],vendorIds:['stall1']},cashier:{roles:['pickup_staff'],eventIds:['event1'],vendorIds:['stall1']},kitchen:{roles:['kitchen_staff'],eventIds:['event1'],vendorIds:['stall1']},outsider:{roles:['pickup_staff'],eventIds:['event1'],vendorIds:['stall2']},admin:{roles:['admin'],eventIds:[],vendorIds:[]}};
  for(const [user,data]of Object.entries(assignments))docs.set(`staffAssignments/${user}`,data);
  const call=(name,user,data,overrideRoles)=>exports[name]({data,auth:user?{uid:user,token:{roles:overrideRoles||assignments[user]?.roles||['member']}}:undefined});
  const order=(user='alice',requestId='request-1',items=[{itemId:'dish1',quantity:1}])=>call('placeFoodOrder',user,{eventId:'event1',requestId,items});
  return {docs,call,order,scheduled:exports.expireFoodReservations};
}
const rejected = (fn,code)=>assert.rejects(fn,e=>e.code===code);

test('concurrent customers cannot reserve the same last portion',async()=>{
  const h=harness({stock:1});const results=await Promise.allSettled([h.order('alice'),h.order('bob')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'resource-exhausted');
  assert.equal(h.docs.get('menuItems/dish1').stock,0);assert.equal([...h.docs.keys()].filter(k=>k.startsWith('foodOrders/')).length,1);
});

test('checkout retry is idempotent, server-priced and independent of input line order',async()=>{
  const h=harness();const lines=[{itemId:'dish2',quantity:2,unitPriceJPY:0},{itemId:'dish1',quantity:1,priceJPY:1}];
  const a=await h.order('alice','same-request',lines),b=await h.order('alice','same-request',[...lines].reverse());
  assert.equal(a.id,b.id);assert.equal(a.totalJPY,1400);assert.equal(a.pickupToken,b.pickupToken);assert.equal(h.docs.get('menuItems/dish1').stock,9);assert.equal(h.docs.get('menuItems/dish2').stock,8);
  assert.match(a.orderNumber,/^BSS-[A-F0-9]{12}$/);assert.equal(a.vendorName,'Food stall');assert.equal(a.customerName,'alice');assert.equal(a.pickupLocation,'Counter 1');assert.equal(typeof a.createdAt,'string');assert.equal(typeof a.expiresAt,'string');assert.equal(a.requestFingerprint,undefined);
  await rejected(()=>h.order('alice','same-request',[{itemId:'dish1',quantity:2}]),'already-exists');
});

test('checkout rejects malformed quantities, duplicate rows and mixed stalls without changing stock',async()=>{
  const h=harness();h.docs.get('menuItems/dish2').vendorId='stall2';
  for(const quantity of [0,-1,1.5,21,'1'])await rejected(()=>h.order('alice',`invalid-${quantity}`,[{itemId:'dish1',quantity}]),'invalid-argument');
  await rejected(()=>h.order('alice','duplicate',[{itemId:'dish1',quantity:1},{itemId:'dish1',quantity:1}]),'invalid-argument');
  await rejected(()=>h.order('alice','mixed',[{itemId:'dish1',quantity:1},{itemId:'dish2',quantity:1}]),'failed-precondition');assert.equal(h.docs.get('menuItems/dish1').stock,10);
});

test('only an open event, a published matching stall and an eligible customer can order',async()=>{
  for(const update of [h=>h.docs.get('vendors/stall1').status='draft',h=>h.docs.get('vendors/stall1').eventId='elsewhere',h=>h.docs.delete('vendors/stall1'),h=>h.docs.get('events/event1').endsAt=new Stamp(Date.now()-1),h=>h.docs.get('events/event1').foodClosesAt=new Stamp(Date.now()-1),h=>h.docs.delete('users/alice'),h=>h.docs.delete(`registrations/${digest('event1:alice')}`)]){const h=harness();update(h);await rejected(()=>h.order(),'failed-precondition');assert.equal(h.docs.get('menuItems/dish1').stock,10);}
  const h=harness({allowGuestFood:true});h.docs.delete(`registrations/${digest('event1:alice')}`);await h.order();
  const suspended=harness();suspended.docs.get('users/alice').membershipStatus='suspended';await rejected(()=>suspended.order(),'permission-denied');
  await rejected(()=>harness().call('placeFoodOrder',null,{}),'unauthenticated');
});

test('per-customer limits aggregate across orders and cancellation releases each reservation once',async()=>{
  const h=harness({limit:2});const a=await h.order('alice','first',[{itemId:'dish1',quantity:2}]);
  await rejected(()=>h.order('alice','over-limit'),'failed-precondition');await rejected(()=>h.call('cancelFoodOrder','bob',{orderId:a.id}),'permission-denied');
  await h.call('cancelFoodOrder','alice',{orderId:a.id});await h.call('cancelFoodOrder','alice',{orderId:a.id});assert.equal(h.docs.get('menuItems/dish1').stock,10);
  await h.order('alice','new-after-cancel',[{itemId:'dish1',quantity:2}]);assert.equal(h.docs.get('menuItems/dish1').stock,8);
});

test('scoped managers can cancel reservations but another stall and kitchen-only roles cannot',async()=>{
  const h=harness();const a=await h.order();await rejected(()=>h.call('cancelFoodOrder','outsider',{orderId:a.id}),'permission-denied');await rejected(()=>h.call('cancelFoodOrder','kitchen',{orderId:a.id}),'permission-denied');
  await h.call('cancelFoodOrder','manager',{orderId:a.id});assert.equal(h.docs.get('menuItems/dish1').stock,10);
});

test('cash confirmation validates exact amount and pickup requires paid, ready and a valid one-time token',async()=>{
  const h=harness(),a=await h.order();
  await rejected(()=>h.call('advanceFoodOrder','cashier',{orderId:a.id,action:'confirmPayment',amountJPY:799}),'invalid-argument');
  await rejected(()=>h.call('advanceFoodOrder','kitchen',{orderId:a.id,action:'confirmPayment',amountJPY:800}),'permission-denied');
  await rejected(()=>h.call('advanceFoodOrder','cashier',{orderId:a.id,action:'pickup',token:a.pickupToken}),'failed-precondition');
  await h.call('advanceFoodOrder','kitchen',{orderId:a.id,action:'prepare'});await h.call('advanceFoodOrder','kitchen',{orderId:a.id,action:'ready'});
  await rejected(()=>h.call('advanceFoodOrder','cashier',{orderId:a.id,action:'pickup',token:a.pickupToken}),'failed-precondition');
  await h.call('advanceFoodOrder','cashier',{orderId:a.id,action:'confirmPayment',amountJPY:800});await h.call('advanceFoodOrder','cashier',{orderId:a.id,action:'confirmPayment',amountJPY:800});
  assert.equal([...h.docs.keys()].filter(k=>k.startsWith('paymentTransactions/')).length,1);
  await rejected(()=>h.call('advanceFoodOrder','cashier',{orderId:a.id,action:'pickup',token:'wrong'}),'permission-denied');
  const collect=()=>h.call('advanceFoodOrder','cashier',{orderId:a.id,action:'pickup',token:a.pickupToken});const result=await Promise.allSettled([collect(),collect()]);assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(h.docs.get(`foodOrders/${a.id}`).status,'collected');assert.equal([...h.docs.keys()].filter(k=>k.startsWith('foodPickupRedemptions/')).length,1);
});

test('complimentary orders stay distinct from cash payments and can be collected once ready',async()=>{
  const h=harness();h.docs.get('menuItems/dish1').priceJPY=0;const a=await h.order();assert.equal(a.paymentStatus,'complimentary');
  for(const action of ['prepare','ready'])await h.call('advanceFoodOrder','manager',{orderId:a.id,action});
  await h.call('advanceFoodOrder','manager',{orderId:a.id,action:'pickup',manual:true});assert.equal(h.docs.get(`foodOrders/${a.id}`).status,'collected');assert.equal([...h.docs.keys()].filter(k=>k.startsWith('paymentTransactions/')).length,0);
});

test('lookup validates structured and legacy tokens, supports audited manual references and checks current scope',async()=>{
  const h=harness(),a=await h.order();const scanned=await h.call('lookupFoodOrder','cashier',{orderId:a.id,token:a.pickupToken});assert.equal(scanned.order.id,a.id);
  assert.equal((await h.call('lookupFoodOrder','cashier',{code:a.pickupToken})).order.id,a.id);
  await rejected(()=>h.call('lookupFoodOrder','cashier',{orderId:a.id}),'invalid-argument');await rejected(()=>h.call('lookupFoodOrder','cashier',{orderId:a.id,token:'wrong'}),'permission-denied');
  await rejected(()=>h.call('lookupFoodOrder','outsider',{orderId:a.id,token:a.pickupToken}),'permission-denied');await rejected(()=>h.call('lookupFoodOrder','alice',{orderId:a.id,manual:true}),'permission-denied');
  assert.equal((await h.call('lookupFoodOrder','cashier',{code:a.orderNumber.toLowerCase(),manual:true})).order.id,a.id);
  const audits=[...h.docs.values()].filter(v=>v.action==='food.lookup');assert.equal(audits.length,1);assert.equal(audits[0].method,'manual');assert(!JSON.stringify(audits).includes(a.pickupToken));
  h.docs.get('staffAssignments/cashier').roles=[];await rejected(()=>h.call('lookupFoodOrder','cashier',{orderId:a.id,manual:true},['pickup_staff']),'permission-denied');
});

test('expired unpaid reservations cannot advance and scheduled expiry releases stock exactly once',async()=>{
  const h=harness(),a=await h.order();h.docs.get(`foodOrders/${a.id}`).expiresAt=new Stamp(Date.now()-1);
  await rejected(()=>h.call('advanceFoodOrder','manager',{orderId:a.id,action:'prepare'}),'failed-precondition');await h.scheduled();await h.scheduled();
  const saved=h.docs.get(`foodOrders/${a.id}`);assert.equal(saved.status,'cancelled');assert.equal(saved.cancelReason,'reservation_expired');assert.equal(h.docs.get('menuItems/dish1').stock,10);
  const b=await h.order('alice','paid');await h.call('advanceFoodOrder','cashier',{orderId:b.id,action:'confirmPayment',amountJPY:800});h.docs.get(`foodOrders/${b.id}`).expiresAt=new Stamp(Date.now()-1);await h.scheduled();assert.equal(h.docs.get(`foodOrders/${b.id}`).status,'confirmed');
});

test('menu edits reject stale inventory and cross-event stalls; stall records cannot be moved',async()=>{
  const h=harness();const data={id:'dish1',eventId:'event1',vendorId:'stall1',name:'Biryani',priceJPY:800,stock:10,perPersonLimit:2};
  await rejected(()=>h.call('saveMenuItem','manager',{...data,expectedStock:9}),'aborted');await h.call('saveMenuItem','manager',{...data,expectedStock:10});
  h.docs.get('vendors/stall1').eventId='elsewhere';await rejected(()=>h.call('saveMenuItem','manager',{...data,expectedStock:10}),'failed-precondition');h.docs.get('vendors/stall1').eventId='event1';
  h.docs.set('events/event2',{status:'draft'});await rejected(()=>h.call('saveContent','admin',{collection:'vendors',id:'stall1',data:{name:'Moved',eventId:'event2',status:'published'}}),'failed-precondition');
});

test('legacy event cutoff beyond event end never extends a reservation past the event',async()=>{
  const h=harness(),ends=Date.now()+5*60000;h.docs.get('events/event1').endsAt=new Stamp(ends);h.docs.get('events/event1').foodClosesAt=new Stamp(Date.now()+3600000);
  const a=await h.order();assert.equal(Date.parse(a.expiresAt),ends);
});

test('cancelled or unpublished events reject every stall mutation atomically',async()=>{
  for(const status of ['cancelled','draft'])for(const action of ['confirmPayment','prepare','ready','pickup']){
    const h=harness(),a=await h.order();const saved=h.docs.get(`foodOrders/${a.id}`);saved.status=action==='ready'?'preparing':action==='pickup'?'ready':'confirmed';if(action==='pickup')saved.paymentStatus='paid';
    const before=clone(saved);h.docs.get('events/event1').status=status;
    await rejected(()=>h.call('advanceFoodOrder','manager',{orderId:a.id,action,amountJPY:800,token:a.pickupToken}),'failed-precondition');assert.deepEqual(h.docs.get(`foodOrders/${a.id}`),before);assert.equal([...h.docs.keys()].filter(k=>k.startsWith('paymentTransactions/')||k.startsWith('foodPickupRedemptions/')).length,0);
  }
});

test('revoking a staff assignment blocks mutations even with an old role claim',async()=>{
  const h=harness(),a=await h.order();h.docs.get('staffAssignments/manager').roles=[];
  await rejected(()=>h.call('advanceFoodOrder','manager',{orderId:a.id,action:'prepare'},['food_vendor_manager']),'permission-denied');assert.equal(h.docs.get(`foodOrders/${a.id}`).status,'confirmed');
});

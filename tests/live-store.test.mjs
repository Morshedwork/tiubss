import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveStore} from '../public/js/live-store.js';

function fixture(overrides={}) {
  let auth={configured:true,user:{uid:'u1',email:'member@example.org',displayName:'Member',emailVerified:true},roles:[],error:null},listener;
  const service={
    subscribeAuth(fn){listener=fn;fn(auth);return()=>{};},async initFirebase(){return auth;},getAuthState(){return auth;},
    async getPublicProfiles(){return[];},async getEvents(){return[];},async getContent(){return[];},async getCommunityPosts(){return[];},
    async getMyProfile(){return null;},async getMyRegistrations(){return[];},async getMyOrders(){return[];},async getMyRequests(){return[];},
    ...overrides
  };
  return {store:createLiveStore(service),service,changeAuth(next){auth={...auth,...next};listener(auth);}};
}

test('live store never loads sample transactions or persists member state locally',async()=>{
  let writes=0;
  const prior=globalThis.localStorage;
  globalThis.localStorage={getItem(){return JSON.stringify({profile:{id:'fake'},events:[{id:'demo'}]});},setItem(){writes++;}};
  try {
    const f=fixture();await f.store.initialize();const state=f.store.getState();
    assert.equal(state.profile.id,'u1');assert.equal(state.profilePending,true);assert.deepEqual(state.events,[]);assert.deepEqual(state.tickets,[]);assert.equal(writes,0);assert.equal(state.isLive,true);
  } finally {globalThis.localStorage=prior;}
});

test('logout clears private state immediately and rejects a late profile response',async()=>{
  let resolveProfile;const profile=new Promise(resolve=>{resolveProfile=resolve;});
  const f=fixture({getMyProfile:()=>profile});
  const initialization=f.store.initialize();
  await new Promise(resolve=>setTimeout(resolve,0));
  f.changeAuth({user:null,roles:[]});
  assert.equal(f.store.getState().profile,null);
  resolveProfile({uid:'u1',name:'Private Member',email:'private@example.org'});
  await initialization;
  assert.equal(f.store.getState().profile,null);assert.deepEqual(f.store.getState().orders,[]);assert.deepEqual(f.store.getState().messages,[]);
});

test('profile writes map existing UI fields and cannot grant roles or public field expansion',async()=>{
  let patch;
  const f=fixture({async saveMyProfile(data){patch=data;},async getMyProfile(){return{uid:'u1',name:'Member',membershipType:'alumni',company:'Company',graduationYear:2027,membershipStatus:'pending'};}});
  await f.store.initialize();
  await f.store.saveProfile({name:'Member',type:'alumni',employer:'Company',graduation:'2027',directoryVisible:true,roles:['admin'],status:'approved'});
  assert.equal(patch.membershipType,'alumni');assert.equal(patch.company,'Company');assert.equal(patch.graduationYear,'2027');assert.equal(patch.directoryOptIn,true);assert.equal(patch.roles,undefined);assert.equal(patch.status,undefined);assert.deepEqual(patch.publicFields,['name','membershipType']);
  assert.equal(f.store.getState().profile.status,'pending');
});

test('onboarding details round trip without exposing contact fields or trusting completion claims',async()=>{
  let saved={uid:'u1',name:'Member',membershipType:'student',membershipStatus:'pending'},patch;
  const f=fixture({async saveMyProfile(data){patch=data;saved={...saved,...data,onboardingComplete:true};},async getMyProfile(){return saved;}});
  await f.store.initialize();
  await f.store.saveProfile({name:'Member',type:'student',semester:'4',phone:'+81 90 1234 5678',bio:'Studying digital business and meeting our community.',instagram:'https://www.instagram.com/member/',facebook:'https://www.facebook.com/member',website:'https://example.org',publicFields:['name','membershipType','semester','instagram','phone','email'],onboardingComplete:true,roles:['admin']});
  assert.equal(patch.semester,'4');assert.equal(patch.phone,'+81 90 1234 5678');assert.equal(patch.instagram,'https://www.instagram.com/member/');assert.equal(patch.facebook,'https://www.facebook.com/member');
  assert.deepEqual(patch.publicFields,['name','membershipType','semester','instagram']);assert.equal(patch.onboardingComplete,undefined);assert.equal(patch.roles,undefined);
  const profile=f.store.getState().profile;
  assert.equal(profile.semester,'4');assert.equal(profile.phone,patch.phone);assert.equal(profile.bio,patch.bio);assert.equal(profile.onboardingComplete,true);
  await f.store.saveProfile({...profile,type:'alumni',semester:'',instagram:'',facebook:''});
  assert.equal(patch.semester,'');assert.equal(patch.instagram,'');assert.equal(patch.facebook,'');
});

test('food retries reuse the request identifier and trust returned server pricing',async()=>{
  const ids=[];let attempts=0;
  const f=fixture({async placeFoodOrder(eventId,items,requestId){ids.push(requestId);if(attempts++===0)throw new Error('Network response lost');return{id:'order1',uid:'u1',eventId,pickupToken:'secure-token',totalJPY:900,paymentStatus:'unpaid',status:'confirmed',items:[{itemId:'dish1',name:'Dish',quantity:2,unitPriceJPY:450}]};}});
  await f.store.initialize();
  await assert.rejects(f.store.placeOrder('event1',[{menuId:'dish1',qty:2,price:1}]),/Network response lost/);
  const result=await f.store.placeOrder('event1',[{menuId:'dish1',qty:2,price:1}]);
  assert.equal(ids[0],ids[1]);assert.equal(result.total,900);assert.equal(result.items[0].price,450);assert.equal(result.paymentStatus,'due');assert.equal(result.qrToken,'secure-token');
});

test('private admin overview does not replace the public directory projection',async()=>{
  const f=fixture({async getPublicProfiles(){return[{uid:'u2',name:'Public name'}];},async getStaffAssignment(){return{roles:['admin'],eventIds:[],vendorIds:[]};},async getAdminOverview(){return{members:[{uid:'u2',name:'Private name',email:'private@example.org'}],events:[],orders:[],registrations:[]};}});
  const initial=f.store.initialize();await initial;f.changeAuth({roles:['admin']});await f.store.refresh();
  assert.equal(f.store.getState().members[0].email,'private@example.org');assert.equal(f.store.getState().publicMembers[0].email,undefined);assert.equal(f.store.getState().publicMembers[0].name,'Public name');
});

test('Refresh reconnects after a failed Firebase initialization without reloading the page',async()=>{
  let connected=false, attempts=0;
  const auth=()=>({configured:connected,user:null,roles:[],error:connected?null:'Temporary network error'});
  const api={subscribeAuth(fn){fn(auth());return()=>{};},async initFirebase(){attempts++;return auth();},getAuthState:auth,
    async getPublicProfiles(){return[];},async getEvents(){return[{id:'event-live',startsAt:'2026-12-01T00:00:00Z'}];},async getContent(){return[];}};
  const store=createLiveStore(api);await store.initialize();assert.equal(store.getState().auth.configured,false);assert.ok(store.getState().dataErrors.connection);
  const beforeRetry=attempts;connected=true;await store.refresh();
  assert.ok(attempts>beforeRetry);assert.equal(store.getState().auth.configured,true);assert.equal(store.getState().events[0].id,'event-live');assert.equal(store.getState().dataErrors.connection,undefined);
});

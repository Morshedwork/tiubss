import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommunityAPI} from '../public/js/community-api.js';
test('member adapter shares parallel reads, sends identity and preserves failed responses',async()=>{
 const previous=globalThis.fetch,calls=[];let rejected=false;
 globalThis.fetch=async(path,options)=>{calls.push({path,options});if(rejected)return new Response(JSON.stringify({error:'Service unavailable'}),{status:503});return new Response(JSON.stringify(path.endsWith('/public')?{members:Array.from({length:150},(_,i)=>({id:'m'+i})),events:[],vendors:[],menu:[],posts:[]}:path.endsWith('/me')?{profile:{id:'member'},orders:[],registrations:[],requests:[],assignment:{roles:[]}}:{ok:true}));};
 try{const api=createCommunityAPI({token:async()=>'test-member-token',user:()=>({uid:'member'})});const [members]=await Promise.all([api.getPublicProfiles(),api.getEvents(),api.getCommunityPosts()]);assert.equal(calls.length,1);assert.equal(members.length,150);assert.equal(calls[0].options.headers.Authorization,undefined);
 await Promise.all([api.getMyProfile(),api.getMyOrders()]);assert.equal(calls.length,2);assert.equal(calls[1].options.headers.Authorization,'Bearer test-member-token');
 await api.saveMyProfile({name:'Member'});assert.equal(calls.at(-1).options.headers['X-BSS-Member'],'1');assert.equal(JSON.parse(calls.at(-1).options.body).action,'saveProfile');assert.equal(calls.at(-1).options.credentials,'omit');
 rejected=true;await assert.rejects(api.getPublicProfiles(),/Service unavailable/);await assert.rejects(api.getAdminOverview(),/separate admin/);
 }finally{globalThis.fetch=previous;}
});
test('independent admin adapter and live store persist the event-stall-menu flow with no member sign-in',async()=>{
 const [{createLiveStore},operations,{fixture},{handleAdminAPI},{communityAction}]=await Promise.all([import('../public/js/live-store.js'),import('../public/js/operations-service.js'),import('./operations-fixture.mjs'),import('../server/admin.mjs'),import('../server/community.mjs')]);
 const f=fixture(),cookie=await f.login(),prior=globalThis.fetch;
 globalThis.fetch=async(path,options={})=>handleAdminAPI(new Request('https://bss.test'+path,{...options,headers:{...options.headers,Cookie:cookie,...(options.method?{Origin:'https://bss.test'}:{})}}),f.env);
 const store=createLiveStore(operations);
 try{await store.initialize();assert.equal(store.getState().auth.user.uid,'admin:owner');assert.equal(store.getState().backend.database,true);assert.deepEqual(store.getState().dataErrors,{});
 await store.saveRecord('events',{id:'new-ui-id',title:'Festival',description:'A day together.',category:'Community',date:'2099-01-01',time:'10:00',endDate:'2099-01-01',endTime:'18:00',location:'TIU campus',capacity:40,status:'published',foodEnabled:true,allowGuestFood:true,slug:'festival'});
 const event=store.getState().events[0];assert.ok(event.id);assert.notEqual(event.id,'new-ui-id');
 await store.saveRecord('vendors',{id:'vendor-ui-id',eventId:event.id,name:'Stall one',location:'East courtyard',status:'published'});const vendor=store.getState().vendors[0];assert.equal(vendor.location,'East courtyard');
 await store.saveRecord('menu',{id:'dish-ui-id',eventId:event.id,vendorId:vendor.id,name:'Khichuri',price:600,stock:20,perPersonLimit:3,allergens:['Milk'],ingredients:'Rice',active:true});const dish=store.getState().menu[0];assert.equal(dish.price,600);
 await store.saveRecord('menu',{...dish,price:650,stock:25});assert.equal(store.getState().menu[0].stock,25);assert.equal(store.getState().menu[0].price,650);
 const member={uid:'member',email:'member@example.test',emailVerified:true,photoURL:''};await communityAction(f.env,member,'saveProfile',{name:'A member',bio:'I enjoy community events.',phone:'+81 90 1234 5678',membershipType:'student',university:'TIU',major:'DBI',semester:'3',graduationYear:'2027',directoryOptIn:true,publicFields:['name']});await store.refresh();assert.equal(store.getState().members[0].status,'pending');
 await store.saveRecord('members',{id:'member',status:'approved'});assert.equal(store.getState().publicMembers[0].name,'A member');assert.equal(store.getState().publicMembers[0].email,undefined);
 assert.deepEqual(store.getState().dataErrors,{});
 }finally{store.dispose();globalThis.fetch=prior;}
});
test('an in-flight private read is never shared with a different account',async()=>{
 const prior=globalThis.fetch;let active={uid:'alice'},resolveFirst;
 globalThis.fetch=async(path,options)=>{const identity=options.headers.Authorization;if(identity==='Bearer alice')return new Promise(resolve=>{resolveFirst=()=>resolve(new Response(JSON.stringify({profile:{id:'alice'}})));});return new Response(JSON.stringify({profile:{id:'bob'}}));};
 try{const api=createCommunityAPI({token:async()=>active.uid,user:()=>active});const first=api.getMyProfile();await new Promise(resolve=>setImmediate(resolve));active={uid:'bob'};const second=await api.getMyProfile();assert.equal(second.id,'bob');resolveFirst();await assert.rejects(first,/account changed/);}finally{globalThis.fetch=prior;}
});


test('a private write is not sent when the account changes while its token is pending',async()=>{
 const prior=globalThis.fetch;let active={uid:'alice'},resolveToken;const calls=[];
 globalThis.fetch=async(path,options)=>{calls.push({path,options});return new Response(JSON.stringify({ok:true}));};
 try{
  const api=createCommunityAPI({user:()=>active,token:()=>new Promise(resolve=>{resolveToken=resolve;})});
  const pending=api.saveMyProfile({name:'Alice private draft'});
  active={uid:'bob'};resolveToken('bob-token');
  await assert.rejects(pending,/account changed/);assert.equal(calls.length,0);
 }finally{globalThis.fetch=prior;}
});

test('a private read is not sent after signout while its token is pending',async()=>{
 const prior=globalThis.fetch;let active={uid:'alice'},resolveToken;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({profile:{id:'alice'}}));};
 try{
  const api=createCommunityAPI({user:()=>active,token:()=>new Promise(resolve=>{resolveToken=resolve;})});
  const pending=api.getMyProfile();active=null;resolveToken('alice-token');
  await assert.rejects(pending,/account changed/);assert.equal(calls,0);
 }finally{globalThis.fetch=prior;}
});

test('signed-out private reads and writes fail before token retrieval or network access',async()=>{
 const prior=globalThis.fetch;let calls=0,tokens=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({members:[]}));};
 try{
  const api=createCommunityAPI({user:()=>null,token:async()=>{tokens++;return 'stale-token';}});
  await assert.rejects(api.getMyProfile(),/sign in/i);
  await assert.rejects(api.saveMyProfile({name:'Private draft'}),/sign in/i);
  assert.equal(tokens,0);assert.equal(calls,0);
  assert.deepEqual(await api.getPublicProfiles(),[]);assert.equal(calls,1);
 }finally{globalThis.fetch=prior;}
});

test('admin requests use the independent session and reject late reads after an admin switch',async()=>{
 const prior=globalThis.fetch;let active={uid:'admin:owner'},finish;const calls=[];
 globalThis.fetch=async(path,options)=>{calls.push({path,options});if(path==='/api/admin/operations')return new Promise(resolve=>{finish=()=>resolve(new Response(JSON.stringify({orders:[]})));});return new Response(JSON.stringify({ok:true}));};
 try{
  const api=createCommunityAPI({admin:true,user:()=>active,token:async()=>{throw new Error('Member token must not be requested');}});
  await api.assignStaff('member',['checkin_staff'],['event'],[]);
  assert.equal(calls[0].options.credentials,'same-origin');assert.equal(calls[0].options.headers['X-BSS-Admin'],'1');assert.equal(calls[0].options.headers.Authorization,undefined);
  const pending=api.getAdminOverview();active={uid:'admin:other'};finish();
  await assert.rejects(pending,/account changed/);
  active=null;const count=calls.length;await assert.rejects(api.getAdminOverview(),/admin workspace/);assert.equal(calls.length,count);
 }finally{globalThis.fetch=prior;}
});

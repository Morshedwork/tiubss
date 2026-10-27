import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLiveStore} from '../public/js/live-store.js';

let sequence=0;
const sender={uid:'sender',email:'sender@example.test',emailVerified:true};
const complete={id:'sender',name:'Sender Member',email:sender.email,phone:'+819012345678',bio:'I enjoy community events.',type:'community',status:'approved'};
function control(dataset={}){return {dataset,handlers:{},disabled:false,addEventListener(event,fn){this.handlers[event]=fn;}};}
async function fixture({store,user=sender,action='connect'}={}) {
 const previous={document:globalThis.document,FormData:globalThis.FormData,location:globalThis.location};
 const auth={user,getAuthState(){return {user:this.user};},subscribeAuth:()=>()=>{},friendlyError:e=>e.message};
 const key='__communityRegressionAuth'+ ++sequence;globalThis[key]=auth;
 let source=(await readFile(new URL('../public/js/community.js',import.meta.url),'utf8')).replace("import * as auth from './firebase-service.js';",'const auth=globalThis.'+key+';');
 for(const name of ['router.js','profile-photo.js','ui-styles.js'])source=source.replaceAll("from './"+name+"'","from '"+new URL('../public/js/'+name,import.meta.url).href+"'");
 const ui=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const state={profile:{...complete},profilePending:false,publicMembers:[{id:'recipient',name:'Recipient',status:'approved',directoryVisible:true}],messages:[],volunteers:[],tickets:[],orders:[],posts:[],incomingRequests:[]};
 const button=control({communityAction:action,memberId:'recipient'}),google=control(),submit=control(),error={hidden:true,textContent:''};
 const form={...control(),values:{message:'I would like to connect.'},querySelector:selector=>selector==='[type="submit"]'?submit:error};
 let modalOpen=false,googleEnabled=false,capturedBlob;const notices=[],navigations=[];
 const ctx={store:store||{getState:()=>state,refreshSession:async()=>{}},esc:String,icon:()=>'',formatDate:String,money:String,render(){},toast:value=>notices.push(value),navigate:value=>navigations.push(value),modal(title,html,mount){modalOpen=true;mount?.();},closeModal(){modalOpen=false;}};
 globalThis.document={querySelectorAll:selector=>selector==='#app [data-community-action]'?[button]:selector==='[data-google-signin]'&&googleEnabled?[google]:[],getElementById:id=>modalOpen&&id==='community-message-form'?form:null,createElement:()=>({click(){}})};
 globalThis.FormData=class{constructor(current){this.form=current;}get(name){return this.form.values[name]??null;}};
 globalThis.location={pathname:'/profile',search:'',hash:''};
 ui.mountCommunity(ctx);
 return {ui,auth,state,ctx,button,google,form,submit,error,notices,navigations,async openRequest(){await button.handlers.click();},submitRequest:()=>form.handlers.submit({preventDefault(){},currentTarget:form}),mountGoogle(){googleEnabled=true;ui.mountCommunity(ctx);},cleanup(){Object.assign(globalThis,previous);delete globalThis[key];}};
}

function requestStore({legacy=false}={}) {
 const persisted=new Map(),calls=[],updates=[];
 let first=true;const auth={configured:true,user:sender,roles:[]};
 const api={subscribeAuth(fn){fn(auth);return()=>{};},initFirebase:async()=>auth,getAuthState:()=>auth,
  getPublicProfiles:async()=>[{uid:'recipient',name:'Recipient'}],getEvents:async()=>[],getContent:async()=>[],getCommunityPosts:async()=>[],getMyProfile:async()=>({...complete,uid:sender.uid,membershipType:'community'}),getMyRegistrations:async()=>[],getMyOrders:async()=>[],getMyRequests:async()=>[...persisted.values()],getIncomingRequests:async()=>[],
  submitCommunityRequest:async data=>{calls.push(data);if(!persisted.has(data.requestId))persisted.set(data.requestId,{...data,id:legacy?data.requestId:'server-request',uid:sender.uid});if(first){first=false;throw new Error('Response lost after the server saved the request');}return persisted.get(data.requestId);},
  updateCommunityRequest:async(...args)=>{updates.push(args);throw new Error('A member cannot change request status');}
 };
 return {store:createLiveStore(api),persisted,calls,updates};
}

test('connection and mentorship retries reuse a saved request even after its response is lost and records refresh',async()=>{
 for(const action of ['connect','mentor'])for(const legacy of [false,true]) {
  const backend=requestStore({legacy});await backend.store.initialize();const f=await fixture({store:backend.store,action});
  try {
   await f.openRequest();await f.submitRequest();assert.match(f.error.textContent,/Response lost/);assert.equal(backend.persisted.size,1);
   await backend.store.refresh();await f.submitRequest();
   assert.equal(backend.persisted.size,1);assert.equal(backend.calls.length,2);assert.equal(backend.calls[0].requestId,backend.calls[1].requestId);
   assert.equal(backend.calls[0].type,action==='mentor'?'mentorship':'connection');assert.equal(backend.updates.length,0);
   assert.equal(backend.calls[0].submitRequest,undefined);assert.equal(f.notices.at(-1),'Your request has been submitted.');
  }finally{f.cleanup();backend.store.dispose();}
 }
});

test('connection submission disables repeat clicks until the first request settles',async()=>{
 const f=await fixture();let finish,calls=0;
 try {
  f.ctx.store.saveRecord=()=>{calls++;return new Promise(resolve=>{finish=resolve;});};await f.openRequest();
  const pending=f.submitRequest();await f.submitRequest();assert.equal(calls,1);assert.equal(f.submit.disabled,true);assert.equal(f.form.dataset.busy,'true');
  finish({ok:true});await pending;assert.equal(f.submit.disabled,false);assert.equal(f.form.dataset.busy,'false');assert.equal(f.notices.length,1);
 }finally{f.cleanup();}
});

test('editing a failed request starts a new reference and a switched account cannot submit the old form',async()=>{
 const f=await fixture(),records=[];
 try {
  f.ctx.store.saveRecord=async(_,record)=>{records.push(record);throw new Error('Connection unavailable');};await f.openRequest();await f.submitRequest();
  f.form.values.message='A different mentoring question.';await f.submitRequest();assert.equal(records.length,2);assert.notEqual(records[0].requestId,records[1].requestId);
  f.auth.user={uid:'other-member'};await f.submitRequest();assert.equal(records.length,2);assert.match(f.error.textContent,/account changed/);
 }finally{f.cleanup();}
});

test('native uid requests appear in history and export without including another member records',async()=>{
 const f=await fixture({action:'export-data'}),previousCreate=URL.createObjectURL,previousRevoke=URL.revokeObjectURL;let blob;
 try {
  f.state.messages=[{id:'native',uid:'sender',type:'connection',toName:'Native recipient'},{id:'legacy-from',fromUserId:'sender',type:'mentorship',toName:'Legacy mentor'},{id:'legacy-user',userId:'sender',type:'connection',toName:'Legacy recipient'},{id:'other',uid:'other',userId:'sender',type:'connection',toName:'Someone else'}];
  f.state.volunteers=[{id:'native-volunteer',uid:'sender'},{id:'other-volunteer',uid:'other'}];
  const html=f.ui.renderProfile(f.ctx);assert.match(html,/<strong>3<\/strong><span>Connection requests/);assert.ok(html.includes('Native recipient'));assert.ok(!html.includes('Someone else'));assert.ok(!html.includes('Your saved connection and mentorship requests will appear here.'));
  URL.createObjectURL=value=>{blob=value;return 'blob:fixture';};URL.revokeObjectURL=()=>{};await f.button.handlers.click();
  const exported=JSON.parse(await blob.text());assert.deepEqual(exported.messages.map(row=>row.id),['native','legacy-from','legacy-user']);assert.deepEqual(exported.volunteerApplications.map(row=>row.id),['native-volunteer']);
 }finally{URL.createObjectURL=previousCreate;URL.revokeObjectURL=previousRevoke;f.cleanup();}
});

test('Google sign-in uses its returned credential while adapter state catches up',async()=>{
 const f=await fixture({user:null});
 try {
  f.auth.signInWithGoogle=async()=>({user:sender});f.ctx.store.refreshSession=async()=>{f.auth.user=sender;};f.mountGoogle();await f.google.handlers.click();
  assert.ok(f.navigations.includes('/profile'));assert.equal(f.notices.length,0);
 }finally{f.cleanup();}
});

test('logout or account switch during the login refresh never opens the previous account dashboard',async()=>{
 for(const next of [null,{uid:'other-member'}]){
  const f=await fixture({user:null});let finish;
  try {
   f.auth.signInWithGoogle=async()=>{f.auth.user=sender;return {user:sender};};f.ctx.store.refreshSession=()=>new Promise(resolve=>{finish=resolve;});f.mountGoogle();const pending=f.google.handlers.click();
   while(!finish)await Promise.resolve();f.auth.user=next;finish();await pending;
   assert.deepEqual(f.navigations,[]);assert.match(f.notices[0],/account changed/);assert.equal(f.google.disabled,false);
  }finally{f.cleanup();}
 }
});
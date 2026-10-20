import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

globalThis.__uiAuth={user:null,error:null};
const source=(await readFile(new URL('../dist/js/community.js',import.meta.url),'utf8')).replace("import * as auth from './firebase-service.js';",`const auth={subscribeAuth:()=>()=>{},getAuthState:()=>globalThis.__uiAuth,friendlyError:error=>error.message,signInWithGoogle:async()=>{globalThis.__uiAuth={user:{uid:'google-new',email:'member@example.test',displayName:'Member',emailVerified:true}};}};`);
const ui=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const complete={id:'member',name:'Test Member',email:'member@example.test',phone:'+81 (90) 1234-5678',bio:'I study digital business and enjoy community events.',type:'student',university:'TIU',major:'DBI',semester:4,graduation:2027,status:'approved'};
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function context(profile){return {store:{getState:()=>({profile,publicMembers:[],tickets:[],orders:[],messages:[],posts:[]}),refreshSession:async()=>{}},esc:escape,icon:()=>'',formatDate:x=>x,money:x=>x,navigate:()=>{},render:()=>{},toast:()=>{}};}
function fakeDocument(elements={}){return {getElementById:()=>null,querySelectorAll:selector=>elements[selector]||[]};}
function button(dataset){const handlers={};return {dataset,handlers,disabled:false,addEventListener:(event,handler)=>handlers[event]=handler};}

test('onboarding requires current student semester and alumni graduation, but social links remain optional',()=>{
  assert.equal(ui.profileRequirements(complete).complete,true);
  assert.equal(ui.validateProfileDetails(complete),'');
  assert.deepEqual(ui.profileRequirements({...complete,semester:''}).missing.map(x=>x[0]),['semester']);
  assert.equal(ui.profileRequirements({...complete,semester:14}).complete,false);
  assert.equal(ui.profileRequirements({...complete,type:'alumni',semester:''}).complete,true);
  assert.deepEqual(ui.profileRequirements({...complete,type:'alumni',semester:'',graduation:''}).missing.map(x=>x[0]),['graduation']);
  assert.equal(ui.profileRequirements({...complete,type:'community',semester:'',university:'',major:'',graduation:''}).complete,true);
});

test('private contact and short bio validation rejects incomplete data and unsafe social URLs',()=>{
  assert.match(ui.validateProfileDetails({...complete,phone:'abc12345'}),/contact number/);
  assert.match(ui.validateProfileDetails({...complete,phone:'1234567890123456'}),/contact number/);
  assert.match(ui.validateProfileDetails({...complete,bio:'       hi       '}),/short bio/);
  assert.match(ui.validateProfileDetails({...complete,bio:'x'.repeat(501)}),/short bio/);
  for(const link of ['javascript:alert(1)','https://user:password@example.test','https://example.test/a b'])assert.match(ui.validateProfileDetails({...complete,instagram:link}),/HTTPS/);
  assert.equal(ui.validateProfileDetails({...complete,instagram:'https://instagram.com/example',facebook:'https://facebook.com/example',website:'https://example.test'}),'');
});

test('signup collects semester, phone, bio and four links while excluding contacts from publication choices',()=>{
  globalThis.__uiAuth={user:null,error:null};const html=ui.renderJoin(context(null));
  assert.match(html,/<select name="semester" required>/);
  assert.match(html,/name="phone" type="tel"[^>]*required/);
  assert.match(html,/<textarea name="bio"[^>]*required minlength="10" maxlength="500"/);
  for(const field of ['linkedin','instagram','facebook','website'])assert.match(html,new RegExp(`name="${field}" type="url"`));
  assert.doesNotMatch(html,/name="publicFields" value="(?:email|phone)"/);
  assert.match(html,/Profile saving and photo uploads are awaiting activation/);
});

test('incomplete members land in onboarding and can still use dashboard tabs',async()=>{
  const incomplete={...complete,id:'legacy',phone:'',semester:''};globalThis.__uiAuth={user:{uid:'legacy',email:incomplete.email,emailVerified:true}};
  const ctx=context(incomplete);assert.match(ui.renderProfile(ctx),/id="community-edit-form"/);
  const overview=button({communityAction:'profile-tab',tab:'overview'});globalThis.document=fakeDocument({'#app [data-community-action]':[overview]});
  ui.mountCommunity(ctx);await overview.handlers.click();const html=ui.renderProfile(ctx);
  assert.match(html,/Manage member details/);assert.match(html,/Finish your onboarding/);assert.match(html,/Contact number/);assert.doesNotMatch(html,/id="community-edit-form"/);
});

test('Google sign-in directs a missing member profile to required onboarding',async()=>{
  globalThis.__uiAuth={user:null,error:null};const google=button({});let destination='';const ctx=context(null);ctx.navigate=value=>destination=value;
  globalThis.document=fakeDocument({'[data-google-signin]':[google]});ui.mountCommunity(ctx);await google.handlers.click();
  assert.equal(destination,'/profile');const html=ui.renderProfile(ctx);assert.match(html,/Complete your profile/);assert.match(html,/name="semester" required/);assert.match(html,/name="phone" type="tel"[^>]*required/);
});

test('alumni onboarding hides and disables semester while requiring graduation year',()=>{
  const alumni={...complete,id:'alumni',type:'alumni',phone:'',semester:'',graduation:''};globalThis.__uiAuth={user:{uid:'alumni',email:alumni.email,emailVerified:true}};
  const html=ui.renderProfile(context(alumni));assert.match(html,/data-semester-field hidden/);assert.match(html,/<select name="semester" disabled>/);assert.match(html,/name="graduation" type="number"[^>]*required/);
});

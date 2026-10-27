import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const googleURL='https://lh3.googleusercontent.com/member-photo';
const customURL='https://example.test/custom-photo.jpg';
const googleUser={uid:'alice',email:'alice@example.test',displayName:'Alice',emailVerified:true,providerData:[{providerId:'google.com',photoURL:googleURL}]};
const complete={id:'alice',name:'Alice Member',email:googleUser.email,phone:'+81 90 1234 5678',bio:'I enjoy meeting our community in Tokyo.',type:'student',university:'TIU',major:'DBI',semester:'4',status:'approved',skills:[],publicFields:['name','membershipType']};
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let seq=0;
function node(value='') { return {value,disabled:false,hidden:false,dataset:{},handlers:{},textContent:'',addEventListener(event,fn){this.handlers[event]=fn;},setAttribute(){},replaceChildren(...children){this.children=children;},querySelector(){return this.children?.[0]||null;},setCustomValidity(){}}; }
async function fixture({profile={...complete,photoURL:customURL,avatar:customURL,photoSource:'custom'},user={...googleUser}}={}) {
  const prior={document:globalThis.document,FormData:globalThis.FormData,location:globalThis.location};
  const service={user,getAuthState(){return{user:this.user};},subscribeAuth(){return()=>{};},friendlyError:e=>e.message,async uploadImage(){return{url:'https://example.test/new-upload.jpg'};}};
  globalThis.__photoUIAuth=service;
  const source=(await readFile(new URL('../public/js/community.js',import.meta.url),'utf8')).replace("from './ui-styles.js'",`from '${new URL('../public/js/ui-styles.js',import.meta.url).href}'`).replace("from './router.js'",`from '${new URL('../public/js/router.js',import.meta.url).href}'`).replace("import * as auth from './firebase-service.js';",'const auth=globalThis.__photoUIAuth;').replace("from './profile-photo.js'",`from '${new URL('../public/js/profile-photo.js',import.meta.url).href}'`)+`\n// fixture ${++seq}`;
  const ui=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const saved=[],messages=[],navigations=[];
  const state={profile,profilePending:false,publicMembers:[],tickets:[],orders:[],messages:[],posts:[]};
  const ctx={store:{getState:()=>state,async saveProfile(p){saved.push({...p});state.profile={...p};}},esc:escape,icon:()=>'',formatDate:x=>x,money:x=>x,navigate:x=>navigations.push(x),render(){},toast:x=>messages.push(x)};
  const controls=Object.fromEntries(Object.entries({...complete,...profile,photoSource:profile?.photoSource||'',photoURL:profile?.photoURL||''}).map(([key,value])=>[key,node(value)]));
  for(const key of ['profilePhoto','skills','directoryVisible','mentor','photoURL','photoSource'])controls[key]||=node('');
  controls.skills.value='';controls.publicFields.value=[];
  const preview=node(),photoStatus=node(),error=node(),submit=node(),remove=node(),google=node();
  const form={dataset:{},handlers:{},elements:{...controls,namedItem:key=>controls[key]},reportValidity:()=>true,setAttribute(){},addEventListener(type,fn){this.handlers[type]=fn;},querySelector(selector){if(selector.startsWith('[name="'))return controls[selector.slice(7,-2)];return {'[data-photo-preview]':preview,'[data-photo-status]':photoStatus,'.form-error':error,'[type="submit"]':submit,'[data-photo-remove]':remove,'[data-photo-google]':google}[selector]||null;},querySelectorAll(selector){return selector==='[name="profilePhoto"],[data-photo-remove],[data-photo-google]'?[controls.profilePhoto,remove,google]:[];}};
  globalThis.FormData=class{constructor(f){this.form=f;}get(key){return this.form.elements[key]?.value??null;}getAll(key){const value=this.get(key);return Array.isArray(value)?value:[];}};
  globalThis.document={getElementById:id=>id==='community-edit-form'?form:null,querySelectorAll:()=>[],createElement:()=>node()};
  globalThis.location={pathname:'/profile',search:'',hash:''};
  ui.mountCommunity(ctx);
  return {ui,ctx,state,service,saved,messages,navigations,form,controls,preview,photoStatus,error,remove,google,submit:()=>form.handlers.submit({preventDefault(){}}),restore(){Object.assign(globalThis,prior);}};
}

test('dashboard photo editor shows Google default and edit shortcut, but keeps a saved removal empty',async()=>{
  const f=await fixture({profile:{...complete,phone:'',profilePending:true}});try{
    const html=f.ui.renderProfile(f.ctx);
    assert.match(html,/Edit picture/);assert.match(html,/Use Google picture/);assert.match(html,/name="photoSource" value="google"/);assert.match(html,/Using your Google picture/);assert.match(html,/referrerpolicy="no-referrer"/);
    f.state.profile={...f.state.profile,photoURL:'',avatar:customURL,photoSource:'none'};
    const removed=f.ui.renderProfile(f.ctx);assert.match(removed,/name="photoURL" value=""/);assert.match(removed,/name="photoSource" value="none"/);assert.doesNotMatch(removed,/src="https:\/\/lh3\.googleusercontent/);
  }finally{f.restore();}
});

test('Google action appears only for an account with an actual Google provider photo',async()=>{
  const f=await fixture({profile:{...complete,phone:''},user:{...googleUser,providerData:[],photoURL:customURL}});try{assert.doesNotMatch(f.ui.renderProfile(f.ctx),/data-photo-google/);}finally{f.restore();}
});

test('removing and restoring Google photo stay drafts until a successful save',async()=>{
  const f=await fixture();try{
    await f.remove.handlers.click();assert.equal(f.controls.photoSource.value,'none');assert.equal(f.controls.photoURL.value,'');assert.equal(f.saved.length,0);assert.match(f.photoStatus.textContent,/Save/);
    await f.submit();assert.equal(f.saved[0].photoSource,'none');assert.equal(f.saved[0].photoURL,'');assert.equal(f.saved[0].avatar,'');
    await f.google.handlers.click();assert.equal(f.controls.photoSource.value,'google');assert.equal(f.controls.photoURL.value,googleURL);assert.equal(f.saved.length,1);
    await f.submit();assert.equal(f.saved[1].photoSource,'google');assert.equal(f.saved[1].photoURL,googleURL);
  }finally{f.restore();}
});

test('failed save keeps the selected photo draft and never reports success',async()=>{
  const f=await fixture();try{
    f.ctx.store.saveProfile=async()=>{throw new Error('Service is unavailable.');};await f.remove.handlers.click();await f.submit();
    assert.match(f.error.textContent,/unavailable/);assert.equal(f.messages.length,0);assert.equal(f.navigations.length,0);assert.equal(f.controls.photoSource.value,'none');assert.equal(f.form.dataset.authDirty,'true');assert.equal(f.remove.disabled,false);
  }finally{f.restore();}
});

test('upload locks photo actions, saves custom source, and prevents double submit',async()=>{
  const f=await fixture();try{
    let finishUpload,calls=0;f.service.uploadImage=()=>{calls++;return new Promise(resolve=>finishUpload=resolve);};
    const file=new Blob(['image'],{type:'image/png'});file.name='portrait.png';f.controls.profilePhoto.files=[file];await f.controls.profilePhoto.handlers.change();
    const saving=f.submit();assert.equal(calls,1);assert.equal(f.remove.disabled,true);assert.equal(f.google.disabled,true);
    await f.remove.handlers.click();await f.submit();assert.equal(calls,1);assert.equal(f.controls.photoSource.value,'custom');
    finishUpload({url:'https://example.test/uploaded.png'});await saving;assert.equal(f.saved.length,1);assert.equal(f.saved[0].photoSource,'custom');assert.equal(f.saved[0].photoURL,'https://example.test/uploaded.png');
  }finally{f.restore();}
});

test('account change while uploading cannot save a photo into another member profile',async()=>{
  const f=await fixture();try{
    let finishUpload;f.service.uploadImage=()=>new Promise(resolve=>finishUpload=resolve);
    const file=new Blob(['image'],{type:'image/png'});file.name='portrait.png';f.controls.profilePhoto.files=[file];await f.controls.profilePhoto.handlers.change();
    const saving=f.submit();f.service.user={...googleUser,uid:'bob'};finishUpload({url:'https://example.test/alice-upload.png'});await saving;
    assert.equal(f.saved.length,0);assert.equal(f.messages.length,0);assert.match(f.error.textContent,/account changed/);
  }finally{f.restore();}
});


test('untouched empty photo preference is not sent as an invalid source',async()=>{
  const f=await fixture({profile:{...complete,photoURL:'',photoSource:''},user:{...googleUser,providerData:[]}});try{
    await f.submit();assert.equal(f.saved.length,1);assert.equal(f.saved[0].photoSource,undefined);assert.equal(f.saved[0].photoURL,'');
  }finally{f.restore();}
});

test('a failed Google picture load shows initials without changing the saved choice',async()=>{
  const f=await fixture();try{
    await f.google.handlers.click();const image=f.preview.children[0];image.onerror();
    assert.equal(f.preview.textContent,'AM');assert.match(f.photoStatus.textContent,/could not load/);assert.equal(f.controls.photoSource.value,'google');assert.equal(f.controls.photoURL.value,googleURL);assert.equal(f.saved.length,0);
  }finally{f.restore();}
});

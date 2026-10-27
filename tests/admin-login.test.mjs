import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveLoginIdentifier} from '../dist/js/login-identifier.js';
import {administratorAccess,renderAdminLogin,mountAdminLogin} from '../dist/js/admin-login.js';

test('Admin alias resolves only an account identifier; invalid identifiers are rejected',()=>{
  assert.equal(resolveLoginIdentifier(' Admin '),'farhanmorshedwork@gmail.com');
  assert.equal(resolveLoginIdentifier('ADMIN'),'farhanmorshedwork@gmail.com');
  assert.equal(resolveLoginIdentifier('member@example.test'),'member@example.test');
  for(const value of ['', 'owner','Admin@example','member @example.test'])assert.throws(()=>resolveLoginIdentifier(value));
});

test('admin entry requires both a token role and a current matching assignment',()=>{
  const user={uid:'one',email:'farhanmorshedwork@gmail.com'};
  assert.equal(administratorAccess({auth:{user:null},roles:['admin']}),'signed-out');
  assert.equal(administratorAccess({auth:{user},roles:[],staffAssignment:{roles:['admin']}}),'unassigned');
  assert.equal(administratorAccess({auth:{user},roles:['admin'],staffAssignment:{roles:['member']}}),'unassigned');
  assert.equal(administratorAccess({auth:{user},roles:['admin'],staffAssignment:{roles:['admin']},dataErrors:{staff:'Denied'}}),'unverified');
  assert.equal(administratorAccess({auth:{user},roles:['admin'],staffAssignment:{roles:['admin']},loading:true}),'unverified');
  assert.equal(administratorAccess({auth:{user},roles:['admin'],staffAssignment:{roles:['admin']}}),'granted');
});

function fixture({granted=true,fail=false,changed=false}={}) {
  const previous={document:globalThis.document,FormData:globalThis.FormData};
  const calls=[],navigations=[],handlers={},actions={};let renders=0,user=null;
  const error={hidden:true,textContent:''},password={value:'fixture-password',type:'password'},buttons=[];
  for(const action of ['google','refresh','switch','show']){const b={dataset:{adminLoginAction:action},disabled:false,textContent:'Show',setAttribute(){},addEventListener(type,handler){actions[action]=handler;}};buttons.push(b);}
  const state={auth:{user:null},roles:[],staffAssignment:null};
  const form={elements:{password},reportValidity:()=>true,querySelector:()=>error,addEventListener(type,handler){handlers[type]=handler;}};
  const page={isConnected:true,dataset:{},setAttribute(){},querySelector:selector=>selector==='#admin-login-form'?form:error,querySelectorAll:()=>buttons};
  globalThis.document={querySelector:()=>page};
  globalThis.FormData=class {get(key){return key==='identifier'?'Admin':password.value;}};
  const ctx={store:{getState:()=>state,async refreshSession(){state.auth.user=user;state.roles=granted?['admin']:[];state.staffAssignment={roles:granted?['admin']:[]};}},auth:{getAuthState:()=>({user}),friendlyError:e=>e.message,
    async signInWithEmail(email,secret){calls.push({email,secret});if(fail)throw new Error('The email or password is incorrect.');user={uid:'one',email};return{user};},
    async signInWithGoogle(){calls.push({google:true});user={uid:'one',email:'farhanmorshedwork@gmail.com'};return{user};},
    async refreshClaims(){if(changed)user={uid:'two',email:'other@example.test'};},async signOut(){user=null;}
  },navigate:path=>navigations.push(path),render:()=>renders++};
  mountAdminLogin(ctx);
  return{ctx,state,calls,navigations,actions,error,password,page,submit:()=>handlers.submit({preventDefault(){}}),get renders(){return renders;},restore(){Object.assign(globalThis,previous);}};
}

test('username/password authenticates through Firebase, clears password, then opens verified admin workspace',async()=>{
  const f=fixture();try{await f.submit();assert.equal(f.calls[0].email,'farhanmorshedwork@gmail.com');assert.equal(f.calls[0].secret,'fixture-password');assert.equal(f.password.value,'');assert.deepEqual(f.navigations,['/admin']);assert.equal(f.page.dataset.authBusy,'false');}finally{f.restore();}
});
test('correct account without admin assignment does not open privileged workspace',async()=>{
  const f=fixture({granted:false});try{await f.submit();assert.deepEqual(f.navigations,[]);assert.equal(f.renders,1);assert.equal(administratorAccess(f.state),'unassigned');}finally{f.restore();}
});
test('wrong password and account switches cannot grant access',async()=>{
  for(const options of [{fail:true},{changed:true}]){const f=fixture(options);try{await f.submit();assert.deepEqual(f.navigations,[]);assert.equal(f.error.hidden,false);assert.equal(f.page.dataset.authBusy,'false');}finally{f.restore();}}
});
test('Google sign-in goes through the same refreshed role and assignment checks',async()=>{
  for(const granted of [true,false]){const f=fixture({granted});try{await f.actions.google();assert.deepEqual(f.calls,[{google:true}]);assert.deepEqual(f.navigations,granted?['/admin']:[]);}finally{f.restore();}}
});
test('rendered login shows both Firebase methods and does not mistake matching email for an admin role',()=>{
  const ctx={esc:v=>String(v).replaceAll('<','&lt;'),store:{getState:()=>({auth:{user:null}})}};
  const html=renderAdminLogin(ctx);assert.match(html,/Continue with Google/);assert.match(html,/autocomplete="username"/);assert.match(html,/autocomplete="current-password"/);assert.doesNotMatch(html,/type="password"[^>]*value=/);
  ctx.store.getState=()=>({auth:{user:{uid:'one',email:'farhanmorshedwork@gmail.com'}},roles:[]});
  const pending=renderAdminLogin(ctx);assert.match(pending,/Admin access is not assigned/);assert.doesNotMatch(pending,/Open admin workspace/);
});

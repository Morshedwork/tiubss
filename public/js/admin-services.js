/** Loaded only after the independent admin session opens Member services. */
import * as firebase from './firebase-service.js';
import {createLiveStore} from './live-store.js';
import {renderAdmin,mountAdmin} from './admin.js';
import {currentRoute} from './router.js';

export const SERVICE_TABS=['overview','members','events','menu','vendors','orders','wall','volunteers','inbox','reports','roles'];
export function serviceTab(path){const key=String(path).split('?')[0].split('/')[3]||'overview';return SERVICE_TABS.includes(key)?key:'overview';}
export function serviceAccess(state){
  if(!state.auth?.configured)return 'connection';
  if(!state.auth.user)return 'signed-out';
  const roles=state.roles||state.auth.roles||[];
  if(!roles.some(role=>['admin','super_admin'].includes(role)))return 'unassigned';
  if(state.loading)return 'loading';
  if(state.dataErrors?.staff)return 'failed';
  if(!state.staffAssignment?.roles?.some(role=>['admin','super_admin'].includes(role)&&roles.includes(role)))return 'unassigned';
  if(state.dataErrors?.admin)return 'failed';
  return 'ready';
}
const styles=`.member-service-tabs{display:flex;flex-wrap:wrap;gap:8px;margin:24px 0}.member-service-tabs a{border:1px solid #bdc9ac;border-radius:6px;padding:10px 13px;color:var(--green,#063b2f);font-size:13px;text-decoration:none}.member-service-tabs a.active{background:var(--green,#063b2f);color:#fff}.member-service-connection{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap}.member-service-connection p{margin:5px 0}.member-service-login{max-width:620px}.member-service-login .auth-fields{margin:20px 0}.member-service-errors li{margin:8px 0;overflow-wrap:anywhere}.member-operations .admin-two-col{grid-template-columns:1fr}.member-operations .panel{overflow:hidden}.member-operations .stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.member-service-tabs a:focus-visible{outline:3px solid #c33e46;outline-offset:3px}@media(max-width:650px){.member-operations .stat-grid{grid-template-columns:1fr}.member-service-connection .table-actions{width:100%}.member-service-tabs a{padding:9px;font-size:12px}}`;
let configLoading;
function loadConfig(){
  if(globalThis.BSS_FIREBASE_CONFIG)return Promise.resolve();
  if(configLoading)return configLoading;
  configLoading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/firebase-config.js';script.onload=()=>globalThis.BSS_FIREBASE_CONFIG?resolve():reject(new Error('Firebase configuration is missing.'));script.onerror=()=>{script.remove();reject(new Error('The Firebase configuration could not be loaded. Please retry.'));};document.head.append(script);}).catch(error=>{configLoading=null;throw error;});
  return configLoading;
}
export function createAdminServices(c,{api=firebase,store=createLiveStore(api),loadConfiguration=loadConfig}={}){
  let disposed=false,initialized=false,busy=false,error='',cleanup;
  const notify=()=>{if(!disposed&&!busy)c.render();};
  const unsubscribe=store.subscribe(notify);
  const context=()=>({...c,store,auth:api,adminBase:'/admin/services',adminTab:serviceTab(currentRoute()),adminEmbedded:true,adminTabs:SERVICE_TABS});
  async function initialize(){try{await loadConfiguration();await store.initialize();initialized=true;}catch(cause){error=api.friendlyError(cause);}finally{notify();}}
  async function refresh(){error='';if(!initialized)return initialize();if(api.getAuthState().user)await api.refreshClaims();await store.refreshSession();}
  function render(){
    const s=store.getState(),access=serviceAccess(s),esc=c.esc;
    const connection=s.auth?.user?`<section class="panel member-service-connection"><div><strong>Firebase organiser account</strong><p>${esc(s.auth.user.email||s.auth.user.uid)}</p></div><div class="table-actions"><button class="btn btn-secondary" data-member-service="refresh">Refresh access & records</button><button class="btn btn-ghost" data-member-service="signout">Disconnect account</button></div></section>`:'';
    const errorBox=error?`<p class="form-error" role="alert">${esc(error)}</p>`:'';
    const setup=!globalThis.BSS_FIREBASE_APP_CHECK_KEY&&!globalThis.BSS_FIREBASE_EMULATOR_HOST?`<section class="panel"><strong>Member updates need Firebase activation.</strong><p>App Check has not been configured for this website. Sign-in and permitted reads can work; saving profiles, events and orders will stay blocked until the Firebase backend setup is complete.</p><a href="/setup" class="text-link">View connection details ↗</a></section>`:'';
    if(!initialized)return `<style>${styles}</style><section class="panel" role="status"><h2>Connecting member services</h2><p>${error?'Firebase could not connect.':'Loading your Firebase account and current records…'}</p>${errorBox}${error?'<button class="btn btn-primary" data-member-service="retry">Retry connection</button>':''}</section>`;
    if(access==='connection')return `<style>${styles}</style><section class="panel"><h2>Firebase connection unavailable</h2><p role="alert">${esc(s.auth?.error||s.dataErrors?.connection||'Check your connection and retry.')}</p>${errorBox}<button class="btn btn-primary" data-member-service="retry">Retry connection</button></section>`;
    if(access==='signed-out')return `<style>${styles}</style>${setup}<section class="panel member-service-login"><div class="panel-heading"><h2>Connect member services</h2></div><p>Sign in with your assigned Firebase administrator account to manage members, events, registrations and food orders here.</p><p class="panel-note">Your Admin workspace login stays separate. Firebase checks this account’s permissions for every protected action.</p><form id="member-service-signin"><div class="auth-fields"><label class="field"><span>Firebase account email</span><input type="email" name="email" required maxlength="254" autocomplete="username"></label><label class="field"><span>Password</span><input type="password" name="password" required maxlength="128" autocomplete="current-password"></label></div><button class="btn btn-primary" type="submit">Connect Firebase account</button><button type="button" class="btn btn-secondary" data-member-service="google">Continue with Google</button><p class="form-error" role="alert" ${error?'':'hidden'}>${esc(error)}</p></form><p class="panel-note"><a href="/forgot-password">Forgot your Firebase password?</a></p></section>`;
    if(access==='loading')return `<style>${styles}</style>${connection}<section class="panel" role="status"><p>Loading current member records and checking organiser access…</p></section>`;
    if(access==='unassigned')return `<style>${styles}</style>${connection}${setup}<section class="panel"><h2>Administrator access required</h2><p>This Firebase account does not have a current administrator assignment. Use an assigned organiser account, or have the Firebase project owner grant this account access and then choose Refresh access & records.</p><p class="panel-note">Firebase user ID: <code>${esc(s.auth.user.uid)}</code></p>${errorBox}</section>`;
    const errors=Object.entries(s.dataErrors||{});
    const issues=errors.length?`<section class="panel" role="alert"><h2>Some Firebase records could not load</h2><ul class="member-service-errors">${errors.map(([key,message])=>`<li><strong>${esc(key)}:</strong> ${esc(message)}</li>`).join('')}</ul><button class="btn btn-secondary" data-member-service="refresh">Retry records</button><a class="btn btn-ghost" href="/setup">Connection details</a></section>`:'';
    // Never turn a failed privileged query into an empty members/orders table.
    return `<style>${styles}</style>${connection}${setup}${errorBox}${issues}${access==='failed'?'':renderAdmin(context())}`;
  }
  function mount(){
    cleanup?.();cleanup=null;
    if(disposed)return;
    const root=document.querySelector('.sa-dashboard');if(!root)return;
    if(serviceAccess(store.getState())==='ready')cleanup=mountAdmin(context());
    const form=root.querySelector('#member-service-signin');
    async function execute(action,element){
      if(busy)return;busy=true;error='';
      const container=element?.closest('form')||root;container.dataset.busy='true';container.setAttribute('aria-busy','true');container.querySelectorAll('button').forEach(button=>button.disabled=true);
      try{await action();}catch(cause){error=api.friendlyError(cause);}finally{busy=false;delete container.dataset.busy;container.removeAttribute('aria-busy');if(!disposed)c.render();}
    }
    form?.addEventListener('submit',event=>{event.preventDefault();if(!form.reportValidity())return;const data=new FormData(form);void execute(async()=>{await api.signInWithEmail(String(data.get('email')),String(data.get('password')));form.elements.password.value='';await store.refreshSession();},form);});
    root.querySelectorAll('[data-member-service]').forEach(button=>button.addEventListener('click',()=>execute(async()=>{
      const action=button.dataset.memberService;
      if(action==='signout'){c.closeModal();await api.signOut();await store.refreshSession();}
      else if(action==='google'){await api.signInWithGoogle();await store.refreshSession();}
      else if(action==='retry'){await initialize();}
      else await refresh();
    },button)));
  }
  function dispose(){disposed=true;cleanup?.();unsubscribe();store.dispose();error='';}
  return {initialize,refresh,render,mount,dispose};
}

/** Operational workspace uses the existing independent admin session. */
import * as operations from './operations-service.js';
import {createLiveStore} from './live-store.js';
import {renderAdmin,mountAdmin} from './admin.js';
import {currentRoute} from './router.js';
export const SERVICE_TABS=['overview','members','events','registrations','counter','menu','vendors','orders','wall','volunteers','inbox','reports','roles'];
export function serviceTab(path){const key=String(path).split('?')[0].split('/')[3]||'members';return SERVICE_TABS.includes(key)?key:'overview';}
export function serviceAccess(state){
 if(!state.auth?.configured||!state.auth.user)return 'signed-out';
 if(!(state.roles||state.auth.roles||[]).some(role=>['admin','super_admin'].includes(role)))return 'unassigned';
 if(state.loading)return 'loading';
 if(state.dataErrors?.admin)return 'failed';
 return 'ready';
}
const styles=`.member-service-tabs{display:flex;flex-wrap:wrap;gap:8px;margin:24px 0}.member-service-tabs a{border:1px solid #bdc9ac;border-radius:6px;padding:10px 13px;color:var(--green,#063b2f);font-size:13px;text-decoration:none}.member-service-tabs a.active{background:var(--green,#063b2f);color:#fff}.member-service-connection{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap}.member-service-connection p{margin:5px 0}.member-service-login{max-width:620px}.member-service-login .auth-fields{margin:20px 0}.member-service-errors li{margin:8px 0;overflow-wrap:anywhere}.member-operations .admin-two-col{grid-template-columns:1fr}.member-operations .panel{overflow:hidden}.member-operations .stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.member-service-tabs a:focus-visible{outline:3px solid #c33e46;outline-offset:3px}@media(max-width:650px){.member-operations .stat-grid{grid-template-columns:1fr}.member-service-connection .table-actions{width:100%}.member-service-tabs a{padding:9px;font-size:12px}}`;

export function createAdminServices(c,{api=operations,store=createLiveStore(api)}={}){
 let disposed=false,initialized=false,busy=false,error='',cleanup;
 const notify=()=>{const editing=globalThis.document?.activeElement?.closest('form');if(!disposed&&!busy&&!editing)c.render();};
 const unsubscribe=store.subscribe(notify);
 const context=()=>({...c,store,auth:api,adminBase:'/admin/services',adminTab:serviceTab(currentRoute()),adminEmbedded:true,adminTabs:SERVICE_TABS});
 async function initialize(){try{await store.initialize();initialized=true;}catch(cause){error=api.friendlyError(cause);}finally{notify();}}
 async function refresh(){error='';if(!initialized)return initialize();await api.refreshClaims();await store.refreshSession();}
 function render(){
  const s=store.getState(),access=serviceAccess(s),esc=c.esc;
  const errorBox=error?`<p class="form-error" role="alert">${esc(error)}</p>`:'';
  if(!initialized)return `<style>${styles}</style><section class="panel" role="status"><h2>Loading operations</h2><p>${error?'The website could not connect.':'Loading current website records…'}</p>${errorBox}${error?'<button class="btn btn-primary" data-member-service="refresh">Retry</button>':''}</section>`;
  if(access==='signed-out'||access==='unassigned')return `<section class="panel"><h2>Admin sign-in required</h2><p>${esc(s.auth?.error||'Open your independent Admin workspace to manage operations.')}</p><a class="btn btn-primary" href="/admin/login">Admin sign-in</a></section>`;
  const connection=`<section class="panel member-service-connection"><div><strong>Website operations</strong><p>Events, members and food services · ${esc(s.auth.user.displayName||s.auth.user.email||'Admin')}</p></div><button class="btn btn-secondary" data-member-service="refresh">Refresh records</button></section>`;
  if(access==='loading')return `<style>${styles}</style>${connection}<section class="panel" role="status"><p>Loading current records…</p></section>`;
  const errors=Object.entries(s.dataErrors||{}),issues=errors.length?`<section class="panel" role="alert"><h2>Some records could not load</h2><ul class="member-service-errors">${errors.map(([key,message])=>`<li><strong>${esc(key)}:</strong> ${esc(message)}</li>`).join('')}</ul><button class="btn btn-secondary" data-member-service="refresh">Retry records</button></section>`:'';
  return `<style>${styles}</style>${connection}${errorBox}${issues}${access==='failed'?'':renderAdmin(context())}`;
 }
 function mount(){
  cleanup?.();cleanup=null;if(disposed)return;
  const root=document.querySelector('.sa-dashboard');if(!root)return;
  if(serviceAccess(store.getState())==='ready')cleanup=mountAdmin(context());
  root.querySelectorAll('[data-member-service]').forEach(button=>button.addEventListener('click',async()=>{
   if(busy)return;busy=true;button.disabled=true;error='';try{await refresh();}catch(cause){error=api.friendlyError(cause);}finally{busy=false;if(!disposed)c.render();}
  }));
 }
 function dispose(){disposed=true;cleanup?.();unsubscribe();store.dispose();error='';}
 return {initialize,refresh,render,mount,dispose};
}

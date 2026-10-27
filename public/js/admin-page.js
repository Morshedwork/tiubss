/** Independent admin entry point; Operational services load only after workspace sign-in. */
import {renderStandaloneAdmin,mountStandaloneAdmin,initializeStandaloneAdmin,subscribeStandaloneAdmin,standaloneAdminState} from './standalone-admin.js';
import {adminStyles,communityStyles} from './ui-styles.js';
import {icon} from './icons.js';
import {currentRoute,navigateRoute,installRouter} from './router.js';
import {applyMetadata} from './seo.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=s=>document.querySelector(s);let returnFocus,timer;
const style=document.createElement('style');style.textContent=adminStyles+'\n'+communityStyles;document.head.append(style);
function closeModal(){$('#modal-root').innerHTML='';document.body.style.overflow='';if(returnFocus?.isConnected)returnFocus.focus();}
function modal(title,html,onMount){returnFocus=document.activeElement;$('#modal-root').innerHTML=`<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-header"><h2 id="modal-title">${esc(title)}</h2><button class="modal-close" type="button" aria-label="Close dialog">${icon('close')}</button></header><div class="modal-body">${html}</div></section></div>`;document.body.style.overflow='hidden';$('.modal-close').onclick=closeModal;$('.modal-backdrop').onclick=e=>{if(e.target.classList.contains('modal-backdrop'))closeModal();};$('.modal-close').focus();onMount?.($('#modal-root'));}
function toast(message){clearTimeout(timer);$('#toast').textContent=message;$('#toast').classList.add('visible');timer=setTimeout(()=>$('#toast').classList.remove('visible'),4200);}
function navigate(path){if(path.startsWith('/admin'))navigateRoute(path);else location.assign(path);}
let services,serviceLoading=false,serviceError='',serviceRevision=0;
const servicesActive=()=>!!standaloneAdminState().user && /^\/admin\/services(?:\/|$)/.test(currentRoute().split('?')[0]);
const ctx={esc,icon,modal,closeModal,toast,navigate,render,
 renderMemberServices:()=>services?.render()||`<section class="panel" role="status"><h2>Member services</h2><p>${serviceError?esc(serviceError):'Loading website operations…'}</p>${serviceError?'<button class="btn btn-primary" data-service-load-retry>Retry connection</button>':''}</section>`,
 refreshMemberServices:()=>services?.refresh()
};
function manageServices(){
 if(!servicesActive()){if(services||serviceLoading){serviceRevision++;services?.dispose();services=null;serviceLoading=false;serviceError='';closeModal();}return;}
 if(services){services.mount();return;}
 if(serviceLoading||serviceError)return;
 const revision=++serviceRevision;serviceLoading=true;
 import('./admin-services.js').then(module=>{if(revision!==serviceRevision||!servicesActive())return;services=module.createAdminServices(ctx);return services.initialize();}).catch(error=>{if(revision===serviceRevision)serviceError='Member services could not load. Check your connection and retry.';}).finally(()=>{if(revision===serviceRevision){serviceLoading=false;render();}});
}
function render(){$('#app').innerHTML=renderStandaloneAdmin(ctx).replace(/<main\b/g,'<section').replace(/<\/main>/g,'</section>');applyMetadata(currentRoute());mountStandaloneAdmin(ctx);manageServices();document.querySelector('[data-service-load-retry]')?.addEventListener('click',()=>{serviceError='';render();});}
installRouter(()=>{closeModal();render();window.scrollTo(0,0);},{scope:path=>path.startsWith('/admin')});
document.addEventListener('click',e=>{if(e.target.closest('.skip-link')){e.preventDefault();$('#main').focus();}});
document.addEventListener('keydown',e=>{if(!$('#modal-root').children.length)return;if(e.key==='Escape')closeModal();if(e.key==='Tab'){const nodes=[...$('#modal-root').querySelectorAll('button:not([disabled]),a,input,select,textarea,[tabindex="0"]')].filter(el=>!el.hidden),first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
subscribeStandaloneAdmin(render);
render();
initializeStandaloneAdmin();

import {icon} from './icons.js';
import {createPublicViews} from './public-views.js';
import {currentRoute,navigateRoute,installRouter} from './router.js';
import {applyMetadata} from './seo.js';
import * as store from './site-store.js';
import * as auth from './firebase-service.js';
import {renderStandaloneAdmin,mountStandaloneAdmin,initializeStandaloneAdmin,subscribeStandaloneAdmin} from './standalone-admin.js';
import {renderEvents,renderEvent,renderFood,renderFoodHub,mountEvents,eventStyles} from './events.js';
import {renderAdmin,renderStaff,mountAdmin,adminStyles} from './admin.js';
import {renderCommunity,renderMember,renderJoin,renderProfile,renderSignIn,renderResetPassword,mountCommunity,communityStyles} from './community.js';
import {qrSvg} from './qr.js';
import {renderTicketWallet,mountTicketWallet,showFoodTicket} from './ticket-wallet.js';
import {renderRickshawHome,mountCommunityHome} from './home-v2.js';
import {renderCommitteePanels,mountPanels} from './panels.js';
import {renderReelsPage,mountReels} from './reels.js';
import {mountMotion} from './motion.js';
import {mountRickshawStage} from './rickshaw-stage.js';
import {renderMela,mountMela} from './mela.js';
import {renderArtStudio,mountArtStudio} from './art-studio.js';
import {renderCulturePage,mountCultureTrail} from './culture-v3.js';

const $=s=>document.querySelector(s);
export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let lang='en';try{lang=localStorage.getItem('bss-language')||'en';}catch{}
let toastTimer,returnFocus,adminCleanup,walletCleanup;
const tx=(en,bn)=>lang==='bn'?bn:en;
const money=n=>`¥${Number(n||0).toLocaleString('en-US')}`;
const formatDate=d=>new Date(`${String(d).slice(0,10)}T12:00:00+09:00`).toLocaleDateString(lang==='bn'?'bn-BD':'en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Tokyo'});
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=String(message);$('#toast').classList.add('visible');toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4200);}
function closeModal(){const root=$('#modal-root');root.innerHTML='';document.body.style.overflow='';if(returnFocus?.isConnected)returnFocus.focus();}
function modal(title,html,onMount){returnFocus=document.activeElement;$('#modal-root').innerHTML=`<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-header"><h2 id="modal-title">${esc(title)}</h2><button type="button" class="modal-close" data-close-modal aria-label="Close dialog">${icon('close')}</button></header><div class="modal-body">${html}</div></section></div>`;document.body.style.overflow='hidden';const root=$('#modal-root');root.querySelector('[data-close-modal]').onclick=closeModal;root.querySelector('.modal-backdrop').addEventListener('click',e=>{if(e.target.classList.contains('modal-backdrop'))closeModal();});root.querySelector('.modal-close').focus();onMount?.(root);}
function navigate(path){if(currentRoute()===path)render();else navigateRoute(path);}
function showTicket(ticket,type='event'){
 if(type==='food'||type==='order')return showFoodTicket(ctx,ticket);
 const s=store.getState(),food=type==='food'||type==='order',event=s.events.find(e=>e.id===ticket.eventId),token=ticket.qrToken||ticket.id;
 const html=`<div class="qr-ticket"><span class="badge badge-demo">${food?'FOOD PICKUP':'EVENT ENTRY'} TICKET</span><h3>${esc(event?.title||'Community gathering')}</h3><p class="small muted">${esc(event?.date?formatDate(event.date):'')} · ${esc(food?ticket.pickup:event?.location||'')}</p>${qrSvg(token)}<div class="ticket-code">${esc(ticket.id)}</div><div class="ticket-summary">${food?(ticket.items||[]).map(i=>`<div class="order-line"><span>${i.qty} × ${esc(i.name)}</span><b>${money(i.price*i.qty)}</b></div>`).join(''):`<div class="order-line"><span>Reserved for</span><b>${esc(ticket.name)}</b></div>`}<div class="order-line"><span>Status</span><b>${esc((ticket.status||'confirmed').replaceAll('_',' '))}</b></div>${food?`<div class="order-line"><span>${ticket.paymentStatus==='paid'?'Cash recorded':'Payment due at pickup'}</span><b>${money(ticket.total)}</b></div>`:''}</div><p class="ticket-note">${food?'This is your food pickup code, separate from event admission. Show it at the food counter.':'Show this code at the event check-in desk. Food orders have their own pickup code.'} Keep this code private; it is used to redeem your reservation.</p><button class="btn btn-primary" id="ticket-print">${icon('download')} Save / print ticket</button><button class="btn btn-secondary" id="ticket-copy">Copy QR token</button></div>`;
 modal(food?'Your food ticket':'Your place is saved',html,root=>{root.querySelector('#ticket-print').onclick=()=>window.print();root.querySelector('#ticket-copy').onclick=async()=>{try{await navigator.clipboard.writeText(token);toast('Ticket token copied.');}catch{modal('Ticket token',`<p class="small">Copy this reference for manual staff lookup:</p><input class="search-input" value="${esc(token)}" readonly>`);}};});
}
const ctx={store,auth,esc,icon,toast,modal,closeModal,navigate,render,formatDate,money,showTicket};
const extraStyles=document.createElement('style');extraStyles.textContent=[eventStyles,adminStyles,communityStyles, '.connection-notice{padding:12px 5%;background:#f4e6c7;color:#684b22;font-size:13px;display:flex;gap:14px;flex-wrap:wrap}.nav-auth{white-space:nowrap;font-size:12px}.cart-summary{color:var(--green)} .hero h1{font-family:var(--serif)} .community-section .community-grid{grid-template-columns:1.1fr 2fr;gap:70px} @media(max-width:850px){.community-section .community-grid{grid-template-columns:1fr;gap:35px}}'].join('\n');document.head.append(extraStyles);
for(const id of ['rickshaw-theme','rickshaw-inner-theme','culture-theme','community-wall-theme','rickshaw-v4-theme','mela-theme','art-studio-theme','festive-theme','gallery-v6-theme','reels-theme','community-home-theme','community-hero-theme','panels-theme','food-ordering-theme','ticket-wallet-theme','stall-operations-theme']){const link=document.getElementById(id);if(link)document.head.append(link);}

const {header,footer,renderHome,renderGallery,renderAbout,renderNews,renderParticipate,renderCommittee,renderLegal,renderSetup,renderVerify,missing,setGalleryFilter}=createPublicViews(ctx,{tx,getLanguage:()=>lang,getRoute:currentRoute});
function render(){adminCleanup?.();walletCleanup?.();adminCleanup=null;walletCleanup=null;const raw=currentRoute().split('?')[0],parts=raw.split('/').filter(Boolean);let html;try{switch(parts[0]||'home'){case'home':html=renderHome();break;case'events':html=parts[2]==='food'?renderFood(ctx,parts[1]):parts[1]?renderEvent(ctx,parts[1]):renderEvents(ctx);break;case'food':html=renderFoodHub(ctx);break;case'tickets':case'orders':html=renderTicketWallet(ctx);break;case'community':html=renderCommunity(ctx);break;case'alumni':html=renderCommunity(ctx,true);break;case'members':html=renderMember(ctx,parts[1]);break;case'signup':case'join':html=renderJoin(ctx);break;case'login':case'signin':html=renderSignIn(ctx);break;case'forgot-password':html=renderResetPassword(ctx);break;case'dashboard':case'profile':html=renderProfile(ctx);break;case'admin':html=renderStandaloneAdmin(ctx);break;case'staff':html=renderStaff(ctx,parts[1]);break;case'gallery':html=renderGallery();break;case'reels':html=renderReelsPage(ctx,tx);break;case'culture':html=renderCulturePage(ctx,tx);break;case'mela':case'stalls':html=renderMela(ctx,tx);break;case'art-studio':html=renderArtStudio(ctx,tx);break;case'about':case'mission':case'history':html=renderAbout();break;case'news':html=renderNews(parts[1]);break;case'volunteer':case'mentorship':case'partners':case'contact':html=renderParticipate(parts[0]);break;case'committee':html=renderCommittee();break;case'privacy':html=renderLegal();break;case'terms':html=renderLegal(true);break;case'setup':html=renderSetup();break;case'verify-certificate':html=renderVerify(parts[1]);break;default:html=missing();}}catch(error){console.error(error);html=`<section class="page-container empty-state"><h1>Something needs a refresh.</h1><p>We couldn’t load this view. Please retry. We will only confirm changes after they have been saved.</p><button class="btn btn-primary" data-global="reload">Try again</button></section>`;}
 const connection=store.getState();const dataPage=!['join','signup','signin','login','forgot-password','setup','profile','dashboard','admin'].includes(parts[0]);const notice=dataPage&&Object.keys(connection.dataErrors||{}).length?`<div class="connection-notice" role="status">Some community information is unavailable right now. <button class="text-button" data-global="refresh-data">Retry</button> <a href="/setup">Connection details ↗</a></div>`:'';$('#site-header').innerHTML=header();$('#app').innerHTML=notice+html.replace(/<main\b/g,'<section').replace(/<\/main>/g,'</section>');$('#site-footer').innerHTML=footer();document.documentElement.lang=lang;applyMetadata(raw,connection);
 mountEvents(ctx);adminCleanup=parts[0]==='admin'?null:mountAdmin(ctx);walletCleanup=mountTicketWallet(ctx);mountCommunity(ctx);mountStandaloneAdmin(ctx);mountRoot();mountCultureTrail(ctx);mountRickshawStage(ctx);mountMela(ctx);mountArtStudio(ctx);mountReels(ctx);mountCommunityHome(ctx);mountPanels(ctx,tx);
 document.querySelectorAll('#app > .page-container > .page-heading, .events-page .event-card, .community-page .community-member-card, .food-page .food-card, .about-banner, .feature-card').forEach(el=>el.setAttribute('data-reveal',''));
 mountMotion();
}
function mountRoot(){const form=$('#participation-form');if(form)form.onsubmit=async e=>{e.preventDefault();if(!form.reportValidity())return;if(!store.getState().auth?.user){toast('Please sign in to send your request.');navigate('/signin');return;}const data=Object.fromEntries(new FormData(form)),kind=form.dataset.kind,button=form.querySelector('button[type="submit"]');button.disabled=true;try{await store.saveRecord(kind==='volunteer'?'volunteers':'messages',{...data,kind,status:'pending'});form.reset();toast('Your request has been submitted to TIU BSS.');}catch(err){toast(auth.friendlyError(err));}finally{button.disabled=false;}};const verify=$('#verify-form');if(verify)verify.onsubmit=e=>{e.preventDefault();navigate('/verify-certificate/'+encodeURIComponent(new FormData(verify).get('id')));};}
document.addEventListener('click',async e=>{if(e.target.closest('.skip-link')){e.preventDefault();$('#main').focus();$('#main').scrollIntoView({block:'start'});return;}const b=e.target.closest('[data-global]');if(!b)return;const action=b.dataset.global;if(action==='language'){lang=lang==='en'?'bn':'en';try{localStorage.setItem('bss-language',lang);}catch{}render();if(lang==='bn'&&currentRoute()!=='/')toast('বাংলা হোমপেজ ও নেভিগেশন চালু হয়েছে। কিছু সেকশন ইংরেজিতে রয়েছে।');}if(action==='menu'){$('#nav-links').classList.toggle('is-open');b.setAttribute('aria-expanded',$('#nav-links').classList.contains('is-open'));}if(action==='reload')render();if(action==='refresh-data'){b.disabled=true;try{await store.refresh();render();}catch(err){toast(auth.friendlyError(err));}finally{b.disabled=false;}}if(action==='signout'){b.disabled=true;try{await auth.signOut();closeModal();navigate('/signin');toast('You have signed out.');}catch(err){toast(auth.friendlyError(err));}finally{b.disabled=false;}}if(action==='gallery-section'){const target=document.getElementById(b.dataset.section);target?.scrollIntoView({behavior:document.documentElement.dataset.motion==='on'&&!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'smooth':'auto',block:'start'});target?.focus({preventScroll:true});}if(action==='gallery-filter'){setGalleryFilter(b.dataset.filter);render();}if(action==='gallery'){const g=store.getState().gallery.find(g=>g.id===b.dataset.id);if(g)modal(g.title,`<img src="${esc(g.image)}" alt="${esc(g.caption||g.title)}"><p class="small muted" style="margin:17px 0 0">${esc(g.caption||'')}</p>`);}});
document.addEventListener('keydown',e=>{if(!$('#modal-root').children.length)return;if(e.key==='Escape')closeModal();if(e.key==='Tab'){const nodes=[...$('#modal-root').querySelectorAll('button:not([disabled]),a,input,select,textarea,[tabindex="0"]')].filter(el=>!el.hidden);const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
installRouter(()=>{closeModal();render();window.scrollTo(0,0);$('#main').focus({preventScroll:true});},{scope:path=>!path.startsWith('/admin')});

window.addEventListener('offline',()=>toast('You’re offline. Reconnect to sign in or save changes.'));
function sessionIdentity(snapshot) {
 const userId=snapshot.auth?.user?.uid || null;
 return {userId,roles:[...(snapshot.roles || snapshot.auth?.roles || [])].sort().join(',')};
}
let displayedSession=sessionIdentity(store.getState());
store.subscribe(snapshot=>{
 const nextSession=sessionIdentity(snapshot || store.getState());
 const departedAccount=displayedSession.userId && displayedSession.userId!==nextSession.userId;
 const changedPrivileges=displayedSession.userId===nextSession.userId && displayedSession.roles!==nextSession.roles;
 displayedSession=nextSession;
 // A cross-tab sign-out or account switch must remove the previous account's
 // private form and dialogs, even when an edit or request was in progress.
 if(departedAccount || changedPrivileges){closeModal();render();return;}
 const busy=document.querySelector('[data-auth-busy="true"],form[data-auth-dirty="true"],form[data-busy="true"]');
 const active=document.activeElement;
 const editing=active?.closest('#app form')&&['INPUT','TEXTAREA','SELECT'].includes(active.tagName);
 if(busy||editing){$('#site-header').innerHTML=header();return;}
 render();
});
subscribeStandaloneAdmin(()=>{if(currentRoute().startsWith('/admin'))render();});
if(currentRoute().startsWith('/admin')){location.replace(currentRoute());}else{
render();
store.initialize().catch(error=>toast(auth.friendlyError(error)));
}

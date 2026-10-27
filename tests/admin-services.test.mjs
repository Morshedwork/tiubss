import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAdminServices,serviceAccess,serviceTab,SERVICE_TABS} from '../public/js/admin-services.js';
import {renderAdmin} from '../public/js/admin.js';
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const base=()=>({auth:{configured:true,user:{uid:'organiser',email:'organiser@example.test'},roles:['admin']},roles:['admin'],staffAssignment:{roles:['admin']},dataErrors:{},loading:false,events:[],members:[],orders:[],tickets:[],menu:[],vendors:[],messages:[],audits:[]});
const context={esc,icon:()=>'',render(){},closeModal(){},toast(){}};
test('services resolve nested operational routes and reject unrelated content tabs',()=>{
 assert.equal(serviceTab('/admin/services/members'),'members');
 assert.equal(serviceTab('/admin/services/orders?view=active'),'orders');
 assert.equal(serviceTab('/admin/services'),'overview');
 assert.equal(serviceTab('/admin/services/gallery'),'overview');
});
test('privileged service view requires authenticated claims and a current matching assignment',()=>{
 assert.equal(serviceAccess({...base(),auth:{configured:true,user:null}}),'signed-out');
 assert.equal(serviceAccess({...base(),roles:['member']}),'unassigned');
 assert.equal(serviceAccess({...base(),staffAssignment:{roles:[]}}),'unassigned');
 assert.equal(serviceAccess({...base(),staffAssignment:null}),'unassigned');
 assert.equal(serviceAccess({...base(),loading:true}),'loading');
 assert.equal(serviceAccess({...base(),dataErrors:{staff:'Permission denied'}}),'failed');
 assert.equal(serviceAccess({...base(),dataErrors:{admin:'Cannot load'}}),'failed');
 assert.equal(serviceAccess(base()),'ready');
});
test('embedded operations preserve services routes and omit duplicate site content sections',()=>{
 const html=renderAdmin({...context,store:{getState:base},adminEmbedded:true,adminTab:'overview',adminBase:'/admin/services',adminTabs:['overview','members','events','orders']});
 assert.match(html,/href="\/admin\/services\/members"/);
 assert.match(html,/href="\/admin\/services\/events"/);
 assert.doesNotMatch(html,/href="\/admin\/members"/);
 assert.doesNotMatch(html,/href="\/admin\/services\/gallery"/);
 assert.doesNotMatch(html,/admin-sidebar/);
});
test('failed Firestore admin reads render a real error instead of an empty directory',async()=>{
 let state={...base(),dataErrors:{admin:'Missing or insufficient permissions.'}},disposed=false;
 const store={getState:()=>state,subscribe:()=>()=>{},initialize:async()=>{},dispose:()=>{disposed=true;}};
 const api={friendlyError:e=>e.message};
 const services=createAdminServices(context,{store,api,loadConfiguration:async()=>{}});
 await services.initialize();const html=services.render();
 assert.match(html,/Missing or insufficient permissions/);
 assert.doesNotMatch(html,/No members found|membership requests|No food orders yet|Community members/);
 services.dispose();assert.equal(disposed,true);
});
test('sign in and unassigned states do not render or imply privileged records',async()=>{
 let state={...base(),auth:{configured:true,user:null},roles:[]};
 const store={getState:()=>state,subscribe:()=>()=>{},initialize:async()=>{},dispose(){}};
 const services=createAdminServices(context,{store,api:{friendlyError:e=>e.message},loadConfiguration:async()=>{}});
 await services.initialize();assert.match(services.render(),/member-service-signin/);
 state={...base(),staffAssignment:{roles:['member']}};
 assert.match(services.render(),/Administrator access required/);
 assert.doesNotMatch(services.render(),/class="member-operations"/);
 services.dispose();
});
test('ordinary admin entry has no eager Firebase imports and gates service loading on standalone session',()=>{
 const entry=readFileSync(new URL('../public/js/admin-page.js',import.meta.url),'utf8');
 assert.doesNotMatch(entry,/^import .*from ['"].*(?:firebase-service|live-store|admin-services)\.js/m);
 assert.match(entry,/standaloneAdminState\(\)\.user/);
 assert.match(entry,/if\(!servicesActive\(\)\)/);
 assert.match(entry,/services\?\.dispose\(\)/);
 assert.match(entry,/import\('\.\/admin-services\.js'\)/);
});

test('all connected operational tabs render using real fixture records',()=>{
 const state={...base(),roles:['super_admin'],staffAssignment:{roles:['super_admin']},settings:{},posts:[],volunteers:[],
  members:[{id:'m1',name:'Member <One>',status:'pending',skills:[]}],
  events:[{id:'e1',title:'Community event',date:'2099-01-01',status:'published',capacity:30}],
  tickets:[{id:'t1',eventId:'e1',userId:'m1',status:'confirmed'}],
  orders:[{id:'o1',eventId:'e1',vendorId:'v1',total:700,status:'confirmed',paymentStatus:'due',items:[{name:'Lunch',qty:1}]}],
  vendors:[{id:'v1',eventId:'e1',name:'Food stall',status:'published'}],menu:[{id:'d1',eventId:'e1',vendorId:'v1',name:'Lunch',price:700,stock:20}]};
 for(const tab of SERVICE_TABS){const html=renderAdmin({...context,store:{getState:()=>state},adminEmbedded:true,adminTab:tab,adminBase:'/admin/services',adminTabs:SERVICE_TABS});assert.match(html,/class="member-operations"/,tab);assert.match(html,new RegExp('href="/admin/services/'+tab+'"'),tab);assert.doesNotMatch(html,/<One>/,tab);}
});

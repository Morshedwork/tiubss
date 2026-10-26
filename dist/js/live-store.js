/** Firebase-backed application state. Live failures never fall back to demo records. */
import * as firebase from './firebase-service.js';
import {normalizeInstagramReelURL} from './instagram.js';
import {parseFoodTicketCode} from './food-ticket-code.js';
import {requestId as newRequestId} from './request-id.js';

const clone = value => JSON.parse(JSON.stringify(value));
const fail = message => { throw new Error(message); };
const array = value => Array.isArray(value) ? value : [];
const DEFAULT_SETTINGS = {title: 'TIU Bangladesh Students’ Society', announcement: 'A little piece of Bangladesh. A community in Japan.', instagram: 'https://www.instagram.com/tiu.bss/', isDemo: false};
const ARTWORK = [
  {id: 'reference-peacocks', title: 'Colour, culture & connection', category: 'Art & Culture', image: 'assets/reference-peacocks.webp', caption: 'Artwork supplied as a visual reference for this website.', isArtwork: true},
  {id: 'reference-flowers', title: 'Rooted in tradition', category: 'Art & Culture', image: 'assets/reference-flowers.webp', caption: 'Artwork supplied as a visual reference for this website.', isArtwork: true}
];
const CONTENT = {gallery: 'photos', reels: 'reels', news: 'newsPosts', committee: 'committeeTerms', partners: 'partnerOrganizations', vendors: 'vendors'};
const PUBLIC_FIELDS = ['name','nameBn','bio','photoURL','city','country','university','degree','major','semester','graduationYear','company','jobTitle','industry','skills','linkedin','instagram','facebook','website','mentor','membershipType'];
const COLLECTIONS = ['events','menu','vendors','members','tickets','orders','gallery','reels','news','volunteers','messages','posts','committee','partners','audits'];
const safeUser = user => user ? {uid:user.uid,email:user.email || '',displayName:user.displayName || '',photoURL:user.photoURL || '',emailVerified:!!user.emailVerified} : null;
const member = (row, publiclyVisible = false) => ({...row,id:row.id || row.uid,name:row.name || 'Community member',type:row.membershipType || row.type || 'student',graduation:row.graduationYear ?? row.graduation ?? '',employer:row.company ?? row.employer ?? '',avatar:row.photoURL || row.avatar || '',directoryVisible:publiclyVisible || row.directoryOptIn === true,status:publiclyVisible ? 'approved' : row.membershipStatus || row.status || 'pending',skills:array(row.skills),isDemo:false});
function japanParts(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return {date:'',time:''};
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};
}
const event = row => ({...row,...japanParts(row.startsAt),endDate:japanParts(row.endsAt).date,endTime:japanParts(row.endsAt).time,location:row.venue || '',price:row.ticketPriceJPY || 0,image:row.photoURL || '',registeredCount:Number(row.registeredCount || 0),pickup:array(row.pickupSlots),isDemo:false});
const menuItem = row => ({...row,price:row.priceJPY,image:row.photoURL || '',isDemo:false});
const ticket = (row, profile) => ({...row,userId:row.uid,name:row.name || (row.uid === profile?.id ? profile.name : '') || 'Community member',qrToken:row.ticketToken,status:row.checkedIn && row.status !== 'cancelled' ? 'checked_in' : row.status,isDemo:false});
const order = row => ({...row,userId:row.uid,qrToken:row.pickupToken,total:row.totalJPY,pickup:row.pickupLocation || 'At the food counter',rawPaymentStatus:row.paymentStatus,paymentStatus:row.paymentStatus === 'unpaid' ? 'due' : row.paymentStatus === 'complimentary' ? 'paid' : row.paymentStatus,items:array(row.items).map(i=>({...i,menuId:i.itemId,qty:i.quantity,price:i.unitPriceJPY})),isDemo:false});
const content = (kind, row) => ({...row,image:row.photoURL || '',photo:row.photoURL || '',logo:row.photoURL || '',caption:row.caption || row.description || row.alt || '',bio:row.description || '',website:row.url || '',location:row.location || row.description || '',excerpt:row.excerpt || row.description || '',date:row.date || String(row.createdAt || row.updatedAt || '').slice(0,10),isDemo:false});

export function createLiveStore(api = firebase) {
  let state = {...Object.fromEntries(COLLECTIONS.map(key=>[key,[]])),gallery:clone(ARTWORK),settings:{...DEFAULT_SETTINGS},profile:null,profilePending:false,publicMembers:[],incomingRequests:[],isLive:true,loading:true,roles:[],staffAssignment:null,auth:{configured:false,user:null,roles:[],error:null},dataErrors:{}};
  let initialization, revision = 0, knownSession = '', pendingRefresh = null, pendingOrderRefresh = null, authUnsubscribe;
  const subscribers = new Set(), requestIds = new Map(), loadedEvents = new Set();
  const getState = () => clone(state);
  const emit = () => { for (const listener of subscribers) { try { listener(getState()); } catch (error) { console.error(error); } } };
  const subscribe = listener => { subscribers.add(listener); return () => subscribers.delete(listener); };
  const uid = (prefix='item') => `${prefix}-${newRequestId()}`;
  const explain = cause => typeof api.friendlyError === 'function' ? api.friendlyError(cause) : cause?.message || 'This Firebase operation could not be completed.';
  const requireUser = () => state.auth.user || fail('Please sign in to continue.');
  function setAuth(auth) {
    const user = safeUser(auth.user), roles = array(auth.roles), key = `${user?.uid || ''}|${[...roles].sort().join(',')}`;
    const changed = key !== knownSession;
    state.auth = {configured:!!auth.configured,user,roles,error:auth.error || null};
    state.roles = roles;
    if (changed) {
      revision++; knownSession = key; pendingRefresh = null; pendingOrderRefresh = null; requestIds.clear(); loadedEvents.clear();
      // This clears all privileged and private cache before the next asynchronous read.
      state = {...state,...Object.fromEntries(COLLECTIONS.map(k=>[k,[]])),gallery:clone(ARTWORK),settings:{...DEFAULT_SETTINGS},profile:null,profilePending:false,publicMembers:[],incomingRequests:[],staffAssignment:null,dataErrors:{}};
    }
    if (user && (!state.profile || state.profile.id !== user.uid || state.profilePending)) {
      state.profile = member({uid:user.uid,name:user.displayName || '',email:user.email,photoURL:user.photoURL,membershipType:'student',membershipStatus:'pending'});
      state.profile.profilePending = true; state.profilePending = true;
    }
    if (!user) { state.profile = null; state.profilePending = false; }
    emit();
    return changed;
  }
  async function initialize() {
    if (initialization) return initialization;
    initialization = (async()=>{
      authUnsubscribe = api.subscribeAuth(auth=>{
        const changed = setAuth(auth);
        if (changed && auth.configured) void refresh();
      });
      await api.initFirebase();
      setAuth(api.getAuthState());
      return refresh();
    })();
    return initialization;
  }
  async function refresh() {
    if (pendingRefresh) return pendingRefresh;
    const epoch = revision, userId = state.auth.user?.uid, administrator = state.roles.some(r=>['admin','super_admin'].includes(r));
    const editor = administrator || state.roles.includes('content_editor');
    state.loading = true; emit();
    const promise = (async()=>{
      if (!state.auth.configured) { state.loading=false; state.dataErrors.connection=state.auth.error || 'Firebase could not connect. Check your connection and try again.'; emit(); return getState(); }
      const errors = {}, updates = {};
      const read = async (label, fn, apply) => { try { const result = await fn(); if (epoch === revision) apply(result); } catch(cause) { errors[label]=explain(cause); } };
      const tasks = [
        read('members',()=>api.getPublicProfiles(),rows=>{updates.members=array(rows).map(r=>member(r,true));updates.publicMembers=updates.members;}),
        read('events',()=>api.getEvents(),rows=>{updates.events=array(rows).map(event);}),
        ...Object.entries(CONTENT).map(([key,collection])=>read(key,()=>api.getContent(collection,{includeDrafts:editor}),rows=>{updates[key]=array(rows).map(r=>content(key,r)); if(key==='gallery') updates.gallery=[...clone(ARTWORK),...updates.gallery];})),
        read('settings',()=>api.getContent('websiteContent'),rows=>{const settings=array(rows).find(r=>r.id==='settings'); updates.settings={...DEFAULT_SETTINGS,...(settings || {})};})
      ];
      if (typeof api.getCommunityPosts === 'function') tasks.push(read('posts',()=>api.getCommunityPosts(),rows=>{updates.posts=array(rows);}));
      if (userId) {
        tasks.push(read('profile',()=>api.getMyProfile(),row=>{if(row){updates.profile=member(row);updates.profile.profilePending=false;updates.profilePending=false;}}));
        tasks.push(read('tickets',()=>api.getMyRegistrations(),rows=>{updates.tickets=array(rows).map(r=>ticket(r,state.profile));}));
        tasks.push(read('orders',()=>api.getMyOrders(),rows=>{updates.orders=array(rows).map(order);}));
        if(typeof api.getMyRequests==='function') tasks.push(read('requests',()=>api.getMyRequests(),rows=>{updates.messages=array(rows).filter(r=>r.type!=='volunteer');updates.volunteers=array(rows).filter(r=>r.type==='volunteer');}));
        if(typeof api.getIncomingRequests==='function') tasks.push(read('incomingRequests',()=>api.getIncomingRequests(),rows=>{updates.incomingRequests=array(rows);}));
        if(state.roles.some(r=>r!=='member') && typeof api.getStaffAssignment==='function') tasks.push(read('staff',()=>api.getStaffAssignment(),row=>{updates.staffAssignment=row;}));
      }
      await Promise.all(tasks);
      if (epoch !== revision || userId !== state.auth.user?.uid) return getState();
      state = {...state,...updates,dataErrors:errors};
      if (administrator) {
        await read('admin',()=>api.getAdminOverview(),overview=>{
          if(overview.settings){const settings=array(overview.settings).find(r=>r.id==='settings');if(settings)state.settings={...DEFAULT_SETTINGS,...settings};}state.members=array(overview.members).map(r=>member(r));state.events=array(overview.events).map(event);state.orders=array(overview.orders).map(order);state.tickets=array(overview.registrations).map(r=>ticket(r,state.profile));
          if(overview.menu) state.menu=array(overview.menu).map(menuItem);
          for(const key of Object.keys(CONTENT)) if(overview[key]) state[key]=array(overview[key]).map(r=>content(key,r));
          if(overview.requests){state.messages=array(overview.requests).filter(r=>r.type!=='volunteer');state.volunteers=array(overview.requests).filter(r=>r.type==='volunteer');}
          if(overview.posts) state.posts=array(overview.posts);
          if(overview.audits) state.audits=array(overview.audits).map(r=>({...r,createdAt:r.at || r.createdAt,recordId:r.target,actorId:r.actor}));
          state.limitedTo=overview.limitedTo || 100;
        });
        if(typeof api.getAdminFoodOrders==='function')await read('orders',()=>api.getAdminFoodOrders(),rows=>{state.orders=array(rows).map(order);});
      } else if (state.staffAssignment) {
        const assignment=state.staffAssignment, staffTasks=[];
        for(const eventId of array(assignment.eventIds)) {
          if(state.roles.some(r=>['checkin_staff','event_manager'].includes(r))) staffTasks.push(read(`checkin:${eventId}`,()=>api.getEventRegistrations(eventId),rows=>{state.tickets=mergeRows(state.tickets,array(rows).map(r=>ticket(r,state.profile)));}));
          if(state.roles.some(r=>['food_vendor_manager','kitchen_staff','pickup_staff'].includes(r))) for(const vendorId of array(assignment.vendorIds)) staffTasks.push(read(`counter:${eventId}:${vendorId}`,()=>api.getStaffOrders(eventId,vendorId),rows=>{state.orders=mergeRows(state.orders,array(rows).map(order));}));
        }
        await Promise.all(staffTasks);
      }
      if (epoch !== revision) return getState();
      state.dataErrors=errors;state.loading=false;emit();return getState();
    })();
    pendingRefresh=promise;
    try{return await promise;} finally {if(pendingRefresh===promise) pendingRefresh=null;}
  }
  const refreshSession = async()=>{await api.initFirebase();setAuth(api.getAuthState());return refresh();};
  async function loadEventData(eventId, {force = false} = {}) {
    if(loadedEvents.has(eventId) && !force) return getState();
    const epoch=revision;
    try {const rows=await api.getMenu(eventId);if(epoch!==revision)return getState();state.menu=[...state.menu.filter(r=>r.eventId!==eventId),...rows.map(menuItem)];loadedEvents.add(eventId);delete state.dataErrors[`menu:${eventId}`];}
    catch(cause){if(epoch===revision)state.dataErrors[`menu:${eventId}`]=explain(cause);}
    if(epoch===revision)emit();return getState();
  }
  async function refreshOrders() {
    if (pendingOrderRefresh) return pendingOrderRefresh;
    const user = requireUser(), epoch = revision, roles = [...state.roles], assignment = state.staffAssignment;
    const promise = (async()=>{
      try {
        const tasks = [api.getMyOrders()];
        if (roles.some(r=>['admin','super_admin'].includes(r)) && api.getAdminFoodOrders) tasks.push(api.getAdminFoodOrders());
        else if (assignment && roles.some(r=>['food_vendor_manager','kitchen_staff','pickup_staff'].includes(r))) {
          for (const eventId of array(assignment.eventIds)) for (const vendorId of array(assignment.vendorIds)) tasks.push(api.getStaffOrders(eventId,vendorId));
        }
        const [results,registrations] = await Promise.all([Promise.all(tasks),api.getMyRegistrations()]);
        if (epoch !== revision || user.uid !== state.auth.user?.uid) return getState();
        state.orders = mergeRows([],results.flat().map(order));
        state.tickets=mergeRows(state.tickets.filter(row=>row.userId!==user.uid),array(registrations).map(row=>ticket(row,state.profile)));
        delete state.dataErrors.orders;
        state.ordersUpdatedAt = new Date().toISOString();
        emit(); return getState();
      } catch(cause) {
        if (epoch === revision) {state.dataErrors.orders = explain(cause);emit();}
        throw new Error(explain(cause));
      }
    })();
    pendingOrderRefresh=promise;
    try {return await promise;} finally {if(pendingOrderRefresh===promise)pendingOrderRefresh=null;}
  }
  async function mutate(operation) {
    const user=requireUser(), epoch=revision;
    let result;
    try { result=await operation(); } catch(cause){throw Object.assign(new Error(explain(cause)),{code:cause?.code});}
    if(epoch===revision && state.auth.user?.uid===user.uid) {revision++;pendingRefresh=null;loadedEvents.clear();await refresh();}
    return result;
  }
  async function saveProfile(profile) {
    const patch={};
    const aliases={type:'membershipType',graduation:'graduationYear',employer:'company',avatar:'photoURL',directoryVisible:'directoryOptIn'};
    for(const key of [...PUBLIC_FIELDS,'email','phone','directoryOptIn','publicFields','education','employment']) if(profile[key]!==undefined)patch[key]=profile[key];
    for(const [from,to] of Object.entries(aliases))if(profile[from]!==undefined)patch[to]=profile[from];
    // Only explicit per-field choices can broaden what reaches the public directory.
    patch.publicFields = array(profile.publicFields || state.profile?.publicFields || ['name','membershipType']).filter(key=>PUBLIC_FIELDS.includes(key));
    await mutate(()=>api.saveMyProfile(patch));
    if(state.dataErrors.profile) throw new Error(`Your profile was saved, but could not be reloaded: ${state.dataErrors.profile}`);
    return getState().profile;
  }
  async function saveRecord(collection, record) {
    requireUser();
    const old=array(state[collection]).find(r=>r.id===record.id) || {}, data={...old,...record};
    if(collection==='members') {if(data.id===state.profile?.id)return saveProfile(data);return mutate(()=>api.approveMembership(data.id,data.status));}
    if(collection==='events') {
      const startsAt=new Date(`${data.date}T${data.time || '00:00'}:00+09:00`).toISOString();
      const endDate=data.endDate || data.date, endTime=data.endTime;
      const endsAt=endTime ? new Date(`${endDate}T${endTime}:00+09:00`).toISOString() : new Date(Date.parse(startsAt)+3*3600000).toISOString();
      return mutate(()=>api.createEvent({...data,startsAt,endsAt,registrationClosesAt:data.registrationClosesAt || startsAt,foodClosesAt:data.foodClosesAt || endsAt,venue:data.location,ticketPriceJPY:Number(data.price || 0),photoURL:data.image || '',capacity:Number(data.capacity),pickupSlots:typeof data.pickup==='string'?data.pickup.split(',').map(v=>v.trim()).filter(Boolean):array(data.pickup)}));
    }
    if(collection==='menu') return mutate(()=>api.saveMenuItem({...data,priceJPY:Number(data.price),stock:Number(data.stock),expectedStock:record.expectedStock ?? old.stock,photoURL:data.image || '',active:data.active!==false,perPersonLimit:Number(data.perPersonLimit || 20),ingredients:Array.isArray(data.ingredients)?data.ingredients:String(data.ingredients || ''),pickupLocation:data.pickupLocation || state.vendors.find(v=>v.id===data.vendorId)?.location || 'Food counter'}));
    if(collection==='messages'||collection==='volunteers') {
      if(old.id && typeof api.updateCommunityRequest==='function') return mutate(()=>api.updateCommunityRequest(old.id,data.status));
      if(old.id) fail('Request status changes need the latest Firebase backend deployment.');
      const type=collection==='volunteers'?'volunteer':['connection','mentorship'].includes(data.type||data.kind)?(data.type||data.kind):'contact';
      return mutate(()=>api.submitCommunityRequest({requestId:data.id || uid('request'),type,toUserId:data.toUserId || '',name:data.name || state.profile?.name || '',email:data.email || state.auth.user.email || '',subject:data.subject || data.interest || data.kind || '',message:data.message || data.body || '',interest:data.interest || ''}));
    }
    const target=collection==='settings'?'websiteContent':CONTENT[collection];
    if(!target) fail('This action is not available for this Firebase collection.');
    const id=collection==='settings'?'settings':data.id || uid(collection);
    const payload={...data,photoURL:data.image || data.photo || data.logo || data.photoURL || '',description:data.caption || data.bio || data.excerpt || data.location || data.description || '',url:data.website || data.url || '',status:data.status || 'published'};
    if(collection==='reels'){payload.url=normalizeInstagramReelURL(data.url);if(!payload.url)fail('Use a direct public Instagram reel URL.');}
    return mutate(()=>api.saveContent(target,id,payload));
  }
  async function removeRecord(collection,id) {
    const target=CONTENT[collection];
    if(!target) fail(collection==='members'?'Account deletion requires a verified account deletion workflow. Contact the society administrator.':'Use cancellation or archive controls to preserve booking records.');
    return mutate(()=>api.deleteContent(target,id));
  }
  async function importInstagramReels(urls,category='Community',status='draft') {
    const lines=(Array.isArray(urls)?urls:String(urls || '').split(/\r?\n/)).map(s=>s.trim()).filter(Boolean);
    if(!lines.length || lines.length>100) fail('Add 1–100 direct reel links, one per line.');
    const records=lines.map((url,i)=>{const normalized=normalizeInstagramReelURL(url);if(!normalized)fail(`Line ${i+1}: use a valid Instagram reel link.`);return {id:uid('reel'),title:`Community reel ${state.reels.length+i+1}`,category,status,url:normalized};});
    if(new Set(records.map(r=>r.url)).size!==records.length || records.some(r=>state.reels.some(old=>old.url===r.url)))fail('Remove duplicate reel links before importing.');
    const saved=[];
    for(const record of records){try{await saveRecord('reels',record);saved.push(record);}catch(cause){throw new Error(`${saved.length} reels were saved before the import stopped. ${cause.message}`);}}
    return saved;
  }
  async function registerEvent(eventId) {
    const key=`ticket:${requireUser().uid}:${eventId}`;
    if(!requestIds.has(key)) requestIds.set(key,newRequestId());
    const result=await mutate(()=>api.registerForEvent(eventId,requestIds.get(key)));requestIds.delete(key);return ticket(result,state.profile);
  }
  async function placeOrder(eventId,items,options={}) {
    const normalized=items.map(i=>({itemId:i.menuId || i.id,quantity:Number(i.qty)})).sort((a,b)=>a.itemId.localeCompare(b.itemId));
    const key=`food:${requireUser().uid}:${eventId}:${JSON.stringify(normalized)}`;
    const requestedId=typeof options==='object'?options.requestId:undefined;
    if(requestedId && !/^[a-zA-Z0-9_-]{1,128}$/.test(requestedId))fail('Invalid checkout reference. Reopen your cart and try again.');
    if(requestedId)requestIds.set(key,requestedId);
    if(!requestIds.has(key))requestIds.set(key,newRequestId());
    const userId=state.auth.user.uid;
    const result=await mutate(()=>api.placeFoodOrder(eventId,normalized,requestIds.get(key)));requestIds.delete(key);
    const saved=order(result);
    if(state.auth.user?.uid===userId){state.orders=mergeRows(state.orders,[saved]);emit();}
    return saved;
  }
  async function checkInTicket(tokenOrId) {
    const row=state.tickets.find(r=>r.id===tokenOrId || r.qrToken===tokenOrId);
    if(!row)fail('Ticket not found in your assigned event records. Refresh and use the ticket reference for manual lookup.');
    await mutate(()=>api.checkInRegistration(row.id,row.qrToken===tokenOrId?tokenOrId:undefined));return state.tickets.find(r=>r.id===row.id) || {id:row.id,message:'Guest checked in successfully.'};
  }
  async function lookupFoodOrder(code,options={}) {
    const user=requireUser(),epoch=revision;
    const result=await api.lookupFoodOrder(parseFoodTicketCode(code,options));
    if(epoch!==revision||state.auth.user?.uid!==user.uid)fail('Your account changed. Look up the ticket again.');
    const row=order(result.order || result);
    state.orders=mergeRows(state.orders,[row]);emit();return clone(row);
  }
  async function advanceOrder(tokenOrId,action,options={}) {
    let row=state.orders.find(r=>r.id===tokenOrId || r.qrToken===tokenOrId);
    if(!row)row=await lookupFoodOrder(tokenOrId,{manual:options.manual===true});
    const scanToken=options.token || (row.qrToken===tokenOrId?tokenOrId:undefined);
    if(action==='pickup'&&!scanToken&&options.manual!==true)fail('Scan the food ticket or explicitly choose manual collection.');
    const amountJPY=action==='confirmPayment'?(options.amountJPY ?? row.total):undefined;
    return mutate(()=>api.advanceFoodOrder(row.id,action,scanToken,amountJPY,{manual:options.manual===true}));
  }
  function exportCSV(collection) {
    if(!COLLECTIONS.includes(collection))fail('This collection cannot be exported.');
    const rows=state[collection];if(!rows.length)return '';
    const columns=[...new Set(rows.flatMap(row=>Object.keys(row)))];
    const cell=value=>{let s=value==null?'':typeof value==='object'?JSON.stringify(value):String(value);if(/^[\s]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s))s=`'${s}`;return `"${s.replaceAll('"','""')}"`;};
    return [columns.map(cell).join(','),...rows.map(row=>columns.map(k=>cell(row[k])).join(','))].join('\r\n');
  }
  return {getState,subscribe,uid,initialize,refresh,refreshSession,refreshOrders,loadEventData,saveRecord,saveProfile,removeRecord,importInstagramReels,registerEvent,placeOrder,checkInTicket,lookupFoodOrder,advanceOrder,exportCSV,
    createCommunityPost:data=>mutate(()=>api.createCommunityPost(data)),deleteCommunityPost:id=>mutate(()=>api.deleteCommunityPost(id)),togglePostHeart:id=>mutate(()=>api.togglePostHeart(id)),replyToCommunityPost:(id,body)=>mutate(()=>api.replyToPost(id,body)),moderateCommunityPost:(id,status)=>mutate(()=>api.moderatePost(id,status)),
    cancelTicket:id=>mutate(()=>api.cancelRegistration(id)),cancelOrder:id=>mutate(()=>api.cancelFoodOrder(id)),resetDemo:()=>fail('Live Firebase data cannot be reset from the website.'),dispose:()=>{authUnsubscribe?.();revision++;subscribers.clear();}
  };
}
function mergeRows(a,b){return [...new Map([...a,...b].map(row=>[row.id,row])).values()];}
const live=createLiveStore();
export const {getState,subscribe,uid,initialize,refresh,refreshSession,refreshOrders,loadEventData,saveRecord,saveProfile,removeRecord,importInstagramReels,registerEvent,placeOrder,checkInTicket,lookupFoodOrder,advanceOrder,exportCSV,createCommunityPost,deleteCommunityPost,togglePostHeart,replyToCommunityPost,moderateCommunityPost,cancelTicket,cancelOrder,resetDemo}=live;

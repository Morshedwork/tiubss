import {memberIdentity} from './member-identity.mjs';

const PUBLIC_FIELDS=['name','nameBn','bio','photoURL','city','country','university','degree','major','semester','graduationYear','company','jobTitle','industry','skills','linkedin','instagram','facebook','website','mentor','membershipType'];
const emptyEvent=()=>({event:null,menu:[],vendors:[],orders:[],registrations:[],audits:[]});
const emptySocial=()=>({posts:[],requests:[],assignments:{},audits:[]});
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const iso=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
const text=(value,label,max=500,required=false)=>{if(value===undefined||value===null)value='';if(typeof value!=='string')fail(400,`${label} must be text.`);value=value.trim();if(value.length>max||required&&!value)fail(400,`Enter ${label}${required?' (required)':''}, up to ${max} characters.`);return value;};
const integer=(n,label,min=0,max=100000)=>{if(!Number.isSafeInteger(n)||n<min||n>max)fail(400,`${label} must be a whole number between ${min} and ${max}.`);return n;};
const key=(value,label='reference')=>{if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(value))fail(400,`Invalid ${label}.`);return value;};
const url=(value,label='link')=>{const v=text(value,label,2000);if(!v)return '';try{const u=new URL(v);if(u.protocol==='https:'&&!u.username&&!u.password&&!/[\s\u0000-\u001f]/.test(v))return u.href;}catch{}fail(400,`${label} must be an HTTPS address.`);};
const imageURL=v=>/^assets\/[a-zA-Z0-9_./-]+$/.test(v||'')&&!v.split('/').includes('..')?v:url(v,'picture');
const strings=(value,label,max=20,length=100)=>{if(!Array.isArray(value)||value.length>max)fail(400,`Use up to ${max} ${label}.`);return value.map(v=>text(v,label,length,true));};
const time=(value,label)=>{const ms=Date.parse(value);if(!Number.isFinite(ms))fail(400,`Choose a valid ${label}.`);return new Date(ms).toISOString();};
const parse=row=>row?JSON.parse(row.data):null;
async function ledger(env,ledgerId,kind){const row=await env.DB.prepare('SELECT data,version FROM community_ledgers WHERE id=?').bind(ledgerId).first();return {value:parse(row)||(kind==='event'?emptyEvent():emptySocial()),version:row?.version||0};}
// One conditional write commits all stock, ticket and order changes together.
async function updateLedger(env,ledgerId,kind,change){
 for(let attempt=0;attempt<8;attempt++){
  const {value,version}=await ledger(env,ledgerId,kind),result=await change(value);
  const data=JSON.stringify(value);if(new TextEncoder().encode(data).length>1800000)fail(409,'This event has reached its record capacity. Create a new event before accepting more orders.');
  const updated=version?await env.DB.prepare('UPDATE community_ledgers SET data=?,version=version+1,updated_at=? WHERE id=? AND version=? RETURNING version').bind(data,Date.now(),ledgerId,version).first():await env.DB.prepare('INSERT INTO community_ledgers (id,kind,data,version,updated_at) VALUES (?,?,?,1,?) ON CONFLICT(id) DO NOTHING RETURNING version').bind(ledgerId,kind,data,Date.now()).first();
  if(updated)return result;
 }
 fail(409,'Another request updated this event. Please retry.');
}
const note=(state,actor,action,target)=>{state.audits.unshift({id:id(),actor:actor.uid,action,target,at:iso()});state.audits=state.audits.slice(0,100);};
async function member(env,uid){const row=await env.DB.prepare('SELECT * FROM community_members WHERE id=?').bind(uid).first();return row?{...parse(row),id:row.id,uid:row.id,membershipStatus:row.status}:null;}
async function updateMember(env,uid,change){for(let i=0;i<8;i++){const row=await env.DB.prepare('SELECT * FROM community_members WHERE id=?').bind(uid).first(),old=row?{...parse(row),membershipStatus:row.status}:null;const data=await change(old);const encoded=JSON.stringify(data);if(encoded.length>25000)fail(400,'Profile is too large.');const changed=row?await env.DB.prepare('UPDATE community_members SET status=?,directory_opt_in=?,data=?,version=version+1,updated_at=? WHERE id=? AND version=? RETURNING version').bind(data.membershipStatus,data.directoryOptIn?1:0,encoded,Date.now(),uid,row.version).first():await env.DB.prepare('INSERT INTO community_members (id,status,directory_opt_in,data,version,updated_at) VALUES (?,?,?,?,1,?) ON CONFLICT(id) DO NOTHING RETURNING version').bind(uid,data.membershipStatus,data.directoryOptIn?1:0,encoded,Date.now()).first();if(changed)return {ok:true};}fail(409,'This profile changed in another session. Retry your update.');}
function validateProfile(input,old,actor){
 const p={...(old||{uid:actor.uid,membershipStatus:'pending',directoryOptIn:false,publicFields:['name','membershipType'],createdAt:iso()})};
 for(const f of PUBLIC_FIELDS.filter(f=>!['skills','semester','graduationYear','mentor'].includes(f)))if(input[f]!==undefined)p[f]=['photoURL','linkedin','instagram','facebook','website'].includes(f)?url(input[f],f):text(input[f],f,['name','nameBn'].includes(f)?80:500);
 if(input.skills!==undefined)p.skills=strings(input.skills,'skills',20,60);
 for(const [f,max,min] of [['semester',13,1],['graduationYear',2100,1950]])if(input[f]!==undefined)p[f]=input[f]===''?'':integer(typeof input[f]==='string'&&/^\d+$/.test(input[f])?Number(input[f]):input[f],f,min,max);
 for(const f of ['directoryOptIn','mentor'])if(input[f]!==undefined){if(typeof input[f]!=='boolean')fail(400,`Invalid ${f}.`);p[f]=input[f];}
 if(input.publicFields!==undefined){p.publicFields=[...new Set(strings(input.publicFields,'public fields',PUBLIC_FIELDS.length,30))];if(p.publicFields.some(f=>!PUBLIC_FIELDS.includes(f)))fail(400,'A private field cannot be published.');}
 if(input.phone!==undefined)p.phone=text(input.phone,'contact phone',40);
 for(const group of ['education','employment'])if(input[group]!==undefined){if(!Array.isArray(input[group])||input[group].length>10)fail(400,'Use up to 10 history entries.');const fields=group==='education'?['university','degree','major','startYear','graduationYear']:['company','jobTitle','industry','startYear','endYear'];p[group]=input[group].map(r=>Object.fromEntries(fields.filter(f=>r[f]!==undefined).map(f=>[f,text(String(r[f]),f,150)])));}
 p.email=actor.email;p.updatedAt=iso();p.uid=actor.uid;
 if(input.photoSource!==undefined&&!['google','custom','none'].includes(input.photoSource))fail(400,'Invalid picture preference.');
 if(input.photoSource==='none'){p.photoURL='';p.photoSource='none';}
 else if(input.photoSource==='google'){p.photoURL=url(actor.photoURL,'Google picture');if(!p.photoURL)fail(400,'Your sign-in account has no picture. Choose a picture or initials.');p.photoSource='google';}
 else if(input.photoSource==='custom'||input.photoURL!==undefined){p.photoSource=p.photoURL?'custom':'none';}
 else if(!old){p.photoURL=url(actor.photoURL,'account picture');p.photoSource=p.photoURL?'google':'none';}
 if(p.membershipType!=='student')p.semester='';
 const missing=[];if(!p.name)missing.push('name');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email||''))missing.push('account email');
 const digits=(p.phone||'').replace(/\D/g,'');if(!/^\+?[\d\s().-]+$/.test(p.phone||'')||digits.length<7||digits.length>15)missing.push('contact phone');
 if((p.bio||'').length<10)missing.push('short bio');if(!['student','alumni','professional','community','volunteer','committee'].includes(p.membershipType))missing.push('member type');
 if(['student','alumni'].includes(p.membershipType)&&!p.university)missing.push('university');if(p.membershipType==='student'&&(!p.major||!Number.isInteger(p.semester)))missing.push('major and semester');if(p.membershipType==='alumni'&&!Number.isInteger(p.graduationYear))missing.push('graduation year');
 const withdrawing=old&&input.directoryOptIn===false&&Object.keys(input).every(k=>['directoryOptIn','publicFields'].includes(k));
 if(missing.length&&!withdrawing)fail(400,'Complete your profile: '+missing.join(', ')+'.');p.onboardingComplete=!missing.length;return p;
}
export function publicProfile(p){if(p.membershipStatus!=='approved'||p.directoryOptIn!==true||p.onboardingComplete!==true)return null;const result={uid:p.uid,id:p.uid,updatedAt:p.updatedAt};for(const f of PUBLIC_FIELDS)if(p.publicFields?.includes(f)&&p[f]!==undefined)result[f]=p[f];return result;}
async function eventStates(env){const rows=await env.DB.prepare("SELECT data FROM community_ledgers WHERE kind='event'").all();return (rows.results||[]).map(parse);}
function release(state,order,status){if(['cancelled','expired'].includes(order.status))return;for(const line of order.items){const item=state.menu.find(m=>m.id===line.itemId);if(item)item.stock+=line.quantity;}order.status=status;order.updatedAt=iso();}
function expire(state){for(const o of state.orders)if(o.status==='confirmed'&&o.paymentStatus==='unpaid'&&Date.parse(o.expiresAt)<=Date.now())release(state,o,'expired');}
const activeOrder=o=>!['cancelled','expired'].includes(o.status);
const eventOpen=(state,food=false)=>{const e=state.event;if(!e||e.status!=='published')fail(409,'This event is not open.');if(Date.parse(e.endsAt)<=Date.now())fail(409,'This event has ended.');if(food&&(!e.foodEnabled||Date.parse(e.foodClosesAt)<=Date.now()))fail(409,'Food ordering is closed.');return e;};
const checkAdmin=actor=>{if(!actor.admin)fail(403,'Sign in to the admin workspace to perform this action.');};
async function requireProfile(env,actor){const p=await member(env,actor.uid);if(!p)fail(409,'Finish and save your member profile first.');if(['suspended','rejected'].includes(p.membershipStatus))fail(403,'Your membership is not active. Contact the society team.');return p;}
async function locate(env,kind,reference){for(const s of await eventStates(env))if(s[kind].some(r=>r.id===reference||r.ticketToken===reference||r.pickupToken===reference||r.orderNumber===reference))return s.event.id;fail(404,'Ticket or order not found.');}
export async function communityPublic(env){
 const [states,rows,social]=await Promise.all([eventStates(env),env.DB.prepare("SELECT id,status,data FROM community_members WHERE status='approved' AND directory_opt_in=1").all(),ledger(env,'social','social')]);
 const published=states.filter(s=>s.event?.status==='published');for(const s of published)expire(s);
 return {members:(rows.results||[]).map(r=>publicProfile({...parse(r),uid:r.id,membershipStatus:r.status})).filter(Boolean),events:published.map(s=>({...s.event,registeredCount:s.registrations.filter(t=>t.status!=='cancelled').length})),menu:published.flatMap(s=>s.menu.filter(m=>m.active&&s.vendors.some(v=>v.id===m.vendorId&&v.status==='published'))),vendors:published.flatMap(s=>s.vendors.filter(v=>v.status==='published')),posts:social.value.posts.filter(p=>p.status==='published')};
}
export async function communityPrivate(env,actor){
 const [states,social,profile]=await Promise.all([eventStates(env),ledger(env,'social','social'),member(env,actor.uid)]);for(const s of states)expire(s);
 if(actor.admin){const rows=await env.DB.prepare('SELECT * FROM community_members ORDER BY updated_at DESC').all();return {members:(rows.results||[]).map(r=>({...parse(r),uid:r.id,id:r.id,membershipStatus:r.status})),events:states.map(s=>({...s.event,registeredCount:s.registrations.filter(t=>t.status!=='cancelled').length})),menu:states.flatMap(s=>s.menu),vendors:states.flatMap(s=>s.vendors),orders:states.flatMap(s=>s.orders),registrations:states.flatMap(s=>s.registrations),posts:social.value.posts,requests:social.value.requests,audits:[...states.flatMap(s=>s.audits),...social.value.audits].sort((a,b)=>b.at.localeCompare(a.at)),assignments:social.value.assignments};}
 const assignment=social.value.assignments[actor.uid]||{roles:[],eventIds:[],vendorIds:[]};
 const assignedOrder=o=>assignment.eventIds.includes(o.eventId)&&assignment.vendorIds.includes(o.vendorId)&&assignment.roles.some(r=>['food_vendor_manager','kitchen_staff','pickup_staff'].includes(r));
 return {profile,orders:states.flatMap(s=>s.orders).filter(o=>o.uid===actor.uid||assignedOrder(o)),registrations:states.flatMap(s=>s.registrations).filter(t=>t.uid===actor.uid||assignment.eventIds.includes(t.eventId)&&assignment.roles.some(r=>['event_manager','checkin_staff'].includes(r))),requests:social.value.requests.filter(r=>r.uid===actor.uid||r.toUserId===actor.uid),assignment};
}
async function authorizeEvent(env,actor,eventId,vendorId,roles){if(actor.admin)return;await requireProfile(env,actor);const {value}=await ledger(env,'social','social'),a=value.assignments[actor.uid];if(!a||!a.eventIds.includes(eventId)||vendorId&&!a.vendorIds.includes(vendorId)||!a.roles.some(r=>roles.includes(r)))fail(403,'You are not assigned to this event or stall.');}
export async function communityAction(env,actor,action,data){
 if(!data||typeof data!=='object'||Array.isArray(data))fail(400,'Invalid request.');
 if(action==='saveProfile')return updateMember(env,actor.uid,old=>validateProfile(data,old,actor));
 if(action==='approveMembership'){checkAdmin(actor);const uid=key(data.uid,'member');if(!['pending','approved','rejected','suspended'].includes(data.status))fail(400,'Invalid membership status.');return updateMember(env,uid,old=>{if(!old)fail(404,'Member not found.');return {...old,membershipStatus:data.status,updatedAt:iso(),reviewedBy:actor.uid};});}
 if(action==='saveEvent'){
  checkAdmin(actor);const eventId=data.id?key(data.id):id();return updateLedger(env,eventId,'event',s=>{
   const old=s.event;if(data.id&&!old)fail(404,'Event not found.');const startsAt=time(data.startsAt,'start time'),endsAt=time(data.endsAt,'end time');if(endsAt<=startsAt)fail(400,'End time must follow the start time.');
   const capacity=integer(data.capacity,'capacity',1,10000);if(capacity<s.registrations.filter(t=>t.status!=='cancelled').length)fail(409,'Capacity cannot be lower than existing registrations.');
   if(!['draft','published','cancelled'].includes(data.status))fail(400,'Invalid event status.');if(Number(data.ticketPriceJPY||0)!==0)fail(400,'Event admission is free. Paid admission is not enabled.');
   if(old&&data.version!==old.version)fail(409,'This event changed. Refresh before saving.');
   s.event={id:eventId,title:text(data.title,'title',160,true),titleBn:text(data.titleBn,'Bangla title',160),description:text(data.description,'description',6000,true),category:text(data.category,'category',50,true),slug:key(data.slug||eventId,'slug'),venue:text(data.venue,'venue',300,true),startsAt,endsAt,registrationClosesAt:time(data.registrationClosesAt||startsAt,'registration cutoff'),foodClosesAt:time(data.foodClosesAt||endsAt,'food cutoff'),capacity,ticketPriceJPY:0,status:data.status,foodEnabled:data.foodEnabled===true,allowGuestFood:data.allowGuestFood===true,photoURL:imageURL(data.photoURL||''),pickupSlots:Array.isArray(data.pickupSlots)?strings(data.pickupSlots,'pickup slots',20,100):[],version:(old?.version||0)+1,createdAt:old?.createdAt||iso(),updatedAt:iso()};
   if(s.event.foodClosesAt>endsAt||s.event.registrationClosesAt>endsAt)fail(400,'Ordering and registration must close by the event end.');
   if(old&&old.status!=='cancelled'&&s.event.status==='cancelled'){for(const t of s.registrations)if(!t.checkedIn)t.status='cancelled';for(const o of s.orders)if(o.status==='confirmed'&&o.paymentStatus==='unpaid')release(s,o,'cancelled');}
   note(s,actor,'event.saved',eventId);return s.event;
  });
 }
 if(action==='saveVendor'||action==='saveMenuItem'){
  checkAdmin(actor);const eventId=key(data.eventId,'event');return updateLedger(env,eventId,'event',s=>{if(!s.event)fail(404,'Event not found.');expire(s);const list=action==='saveVendor'?s.vendors:s.menu,recordId=data.id?key(data.id):id(),old=list.find(r=>r.id===recordId);
   if(data.id&&!old)fail(404,'Record not found in this event.');if(old&&data.version!==old.version)fail(409,'This record changed. Refresh before editing.');
   let record;
   if(action==='saveVendor'){if(!['published','draft'].includes(data.status))fail(400,'Choose open or paused.');record={id:recordId,eventId,name:text(data.name,'stall name',100,true),location:text(data.location||data.description,'pickup location',200,true),description:text(data.location||data.description,'pickup location',200),status:data.status};}
   else{const vendor=s.vendors.find(v=>v.id===data.vendorId);if(!vendor)fail(400,'Choose a stall belonging to this event.');if(old&&data.expectedStock!==old.stock)fail(409,'Stock changed after another order. Refresh before editing.');if(old&&old.vendorId!==vendor.id&&s.orders.some(o=>activeOrder(o)&&o.items.some(i=>i.itemId===recordId)))fail(409,'A dish with orders cannot move to another stall.');record={id:recordId,eventId,vendorId:vendor.id,name:text(data.name,'dish name',100,true),nameBn:text(data.nameBn,'Bangla name',100),description:text(data.description,'description',2000),category:text(data.category,'category',60),priceJPY:integer(data.priceJPY,'price',0,100000),stock:integer(data.stock,'stock',0,100000),perPersonLimit:integer(Number(data.perPersonLimit||20),'per-person limit',1,100),active:data.active!==false,vegetarian:data.vegetarian===true,allergens:Array.isArray(data.allergens)?strings(data.allergens,'allergens',20,80):text(data.allergens,'allergens',500).split(',').map(s=>s.trim()).filter(Boolean),ingredients:Array.isArray(data.ingredients)?strings(data.ingredients,'ingredients',30,100).join(', '):text(data.ingredients,'ingredients',1000),pickupLocation:text(data.pickupLocation||vendor.location,'pickup location',200,true),photoURL:imageURL(data.photoURL||'')};}
   record.version=(old?.version||0)+1;if(old)Object.assign(old,record);else list.push(record);note(s,actor,action,recordId);return record;
  });
 }
 if(action==='registerForEvent'){
  const profile=await requireProfile(env,actor),eventId=key(data.eventId);return updateLedger(env,eventId,'event',s=>{const existing=s.registrations.find(t=>t.uid===actor.uid&&t.status!=='cancelled');if(existing)return existing;const e=eventOpen(s);if(Date.parse(e.registrationClosesAt)<=Date.now())fail(409,'Registration has closed.');if(s.registrations.filter(t=>t.status!=='cancelled').length>=e.capacity)fail(409,'This event is fully booked.');const t={id:id(),eventId,uid:actor.uid,name:profile.name,status:'confirmed',ticketToken:id()+id(),createdAt:iso(),checkedIn:false};s.registrations.push(t);return t;});
 }
 if(action==='cancelRegistration'||action==='checkInRegistration'){
  const ref=key(data.registrationId),eventId=await locate(env,'registrations',ref);if(action==='checkInRegistration')await authorizeEvent(env,actor,eventId,'',['event_manager','checkin_staff']);
  return updateLedger(env,eventId,'event',s=>{const t=s.registrations.find(t=>t.id===ref);if(action==='cancelRegistration'){if(t.uid!==actor.uid&&!actor.admin)fail(403,'This is not your ticket.');if(t.checkedIn)fail(409,'An admitted guest cannot cancel their ticket.');expire(s);if(s.orders.some(o=>o.uid===t.uid&&['confirmed','preparing','ready'].includes(o.status)))fail(409,'Cancel or collect your food orders before cancelling admission.');t.status='cancelled';}else{eventOpen(s);if(t.status==='cancelled')fail(409,'This ticket was cancelled.');if(t.checkedIn)fail(409,'This ticket has already been checked in.');if(data.manual!==true&&data.token!==t.ticketToken)fail(403,'The ticket code does not match.');t.checkedIn=true;t.checkedInAt=iso();t.checkedInBy=actor.uid;}note(s,actor,action,t.id);return t;});
 }
 if(action==='placeFoodOrder'){
  const profile=await requireProfile(env,actor),eventId=key(data.eventId),requestId=key(data.requestId,'checkout reference');if(!Array.isArray(data.items)||!data.items.length||data.items.length>20)fail(400,'Choose 1–20 dishes.');
  const lines=data.items.map(i=>({itemId:key(i.itemId),quantity:integer(i.quantity,'quantity',1,20)})).sort((a,b)=>a.itemId.localeCompare(b.itemId));if(new Set(lines.map(i=>i.itemId)).size!==lines.length)fail(400,'Combine duplicate dishes.');const fingerprint=JSON.stringify(lines);
  return updateLedger(env,eventId,'event',s=>{expire(s);const existing=s.orders.find(o=>o.uid===actor.uid&&o.requestId===requestId);if(existing){if(existing.fingerprint!==fingerprint)fail(409,'This checkout reference was used for a different cart.');return existing;}const e=eventOpen(s,true);if(!e.allowGuestFood&&!s.registrations.some(t=>t.uid===actor.uid&&t.status!=='cancelled'))fail(409,'Reserve your event admission ticket first.');
   let total=0,vendorId='';const items=lines.map(line=>{const dish=s.menu.find(m=>m.id===line.itemId),vendor=s.vendors.find(v=>v.id===dish?.vendorId);if(!dish?.active||vendor?.status!=='published')fail(409,'A selected dish or stall is unavailable.');if(vendorId&&vendorId!==dish.vendorId)fail(400,'Place a separate order for each stall.');vendorId=dish.vendorId;
    const used=s.orders.filter(o=>o.uid===actor.uid&&activeOrder(o)).reduce((n,o)=>n+o.items.filter(i=>i.itemId===dish.id).reduce((a,i)=>a+i.quantity,0),0);if(used+line.quantity>dish.perPersonLimit)fail(409,`The limit for ${dish.name} is ${dish.perPersonLimit} per member.`);if(dish.stock<line.quantity)fail(409,`${dish.name} has only ${dish.stock} remaining.`);dish.stock-=line.quantity;total+=dish.priceJPY*line.quantity;return {...line,name:dish.name,unitPriceJPY:dish.priceJPY};});
   const vendor=s.vendors.find(v=>v.id===vendorId),orderId=id(),o={id:orderId,orderNumber:'BSS-'+orderId.replaceAll('-','').slice(0,12).toUpperCase(),eventId,vendorId,vendorName:vendor.name,uid:actor.uid,name:profile.name,items,totalJPY:total,status:'confirmed',paymentStatus:total===0?'complimentary':'unpaid',pickupToken:id()+id(),pickupLocation:vendor.location,requestId,fingerprint,expiresAt:new Date(Math.min(Date.now()+30*60*1000,Date.parse(e.foodClosesAt))).toISOString(),createdAt:iso(),updatedAt:iso()};s.orders.push(o);note(s,actor,'order.placed',o.id);return o;
  });
 }
 if(['cancelFoodOrder','lookupFoodOrder','advanceFoodOrder'].includes(action)){
  const reference=text(data.orderId||data.code,'order reference',200,true),eventId=await locate(env,'orders',reference);const snapshot=(await ledger(env,eventId,'event')).value,o=snapshot.orders.find(o=>o.id===reference||o.pickupToken===reference||o.orderNumber===reference);
  if(action!=='cancelFoodOrder'||o.uid!==actor.uid)await authorizeEvent(env,actor,eventId,o.vendorId,action==='cancelFoodOrder'?['food_vendor_manager']:action==='advanceFoodOrder'&&['prepare','ready'].includes(data.action)?['food_vendor_manager','kitchen_staff']:['food_vendor_manager','pickup_staff']);
  return updateLedger(env,eventId,'event',s=>{expire(s);const order=s.orders.find(r=>r.id===o.id);
   if(action==='lookupFoodOrder'){if(data.manual!==true&&data.token!==order.pickupToken&&data.code!==order.pickupToken)fail(403,'The pickup ticket does not match.');return {order};}
   if(action==='cancelFoodOrder'){if(order.status!=='confirmed'||!['unpaid','complimentary'].includes(order.paymentStatus))fail(409,'Only unpaid, unprepared reservations can be cancelled.');release(s,order,'cancelled');}
   else{if(s.event?.status!=='published')fail(409,'This event is not open for food service.');const step=data.action;
    if(step==='confirmPayment'){if(!['confirmed','preparing','ready'].includes(order.status)||order.paymentStatus!=='unpaid')fail(409,'Payment has already been recorded or the order is closed.');if(data.amountJPY!==order.totalJPY)fail(400,'Enter the exact cash amount for this order.');order.paymentStatus='paid';order.paidAt=iso();order.paidBy=actor.uid;}
    else if(step==='prepare'){if(order.status!=='confirmed')fail(409,'Only confirmed orders can start preparation.');order.status='preparing';}
    else if(step==='ready'){if(order.status!=='preparing')fail(409,'Start preparation before marking ready.');order.status='ready';}
    else if(step==='pickup'){if(order.status!=='ready'||!['paid','complimentary'].includes(order.paymentStatus))fail(409,'Food must be ready and paid before collection.');if(data.manual!==true&&data.token!==order.pickupToken)fail(403,'The pickup ticket does not match.');order.status='collected';order.collectedAt=iso();order.collectedBy=actor.uid;}
    else fail(400,'Unknown food order action.');order.updatedAt=iso();
   }note(s,actor,action==='cancelFoodOrder'?action:data.action,order.id);return order;
  });
 }
 if(['createCommunityPost','deleteCommunityPost','togglePostHeart','replyToPost','moderatePost','submitCommunityRequest','updateCommunityRequest','assignStaff'].includes(action)){
  const profile=actor.admin?null:await requireProfile(env,actor);
  if(action==='assignStaff'){checkAdmin(actor);if(!actor.owner)fail(403,'Only the workspace owner can assign staff.');if(!await member(env,key(data.uid)))fail(404,'This member must save a profile before receiving staff access.');const states=await eventStates(env);for(const eventId of data.eventIds||[])if(!states.some(s=>s.event.id===eventId))fail(400,'An assigned event does not exist.');for(const vendorId of data.vendorIds||[])if(!states.some(s=>(data.eventIds||[]).includes(s.event.id)&&s.vendors.some(v=>v.id===vendorId)))fail(400,'Choose stalls in the assigned events.');}
  if(action==='submitCommunityRequest'&&['connection','mentorship'].includes(data.type)){const recipient=await member(env,key(data.toUserId));if(!recipient||!publicProfile(recipient))fail(404,'This member is not accepting directory requests.');if(data.toUserId===actor.uid)fail(400,'Choose another community member.');}
  if(['createCommunityPost','replyToPost'].includes(action)&&!actor.emailVerified)fail(403,'Verify your email before posting to the community.');
  return updateLedger(env,'social','social',s=>{
   if(action==='assignStaff'){checkAdmin(actor);if(!actor.owner)fail(403,'Only the workspace owner can assign staff.');const uid=key(data.uid);const roles=strings(data.roles,'staff roles',5,40);if(roles.some(r=>!['event_manager','checkin_staff','food_vendor_manager','kitchen_staff','pickup_staff'].includes(r)))fail(400,'Use invited admin accounts for administrator access.');s.assignments[uid]={roles,eventIds:strings(data.eventIds||[],'event references',30,128).map(v=>key(v)),vendorIds:strings(data.vendorIds||[],'stall references',30,128).map(v=>key(v))};note(s,actor,action,uid);return {ok:true};}
   if(action==='submitCommunityRequest'){const requestId=key(data.requestId),existing=s.requests.find(r=>r.uid===actor.uid&&r.id===requestId);if(existing)return existing;if(!['connection','mentorship','volunteer','partners','contact'].includes(data.type))fail(400,'Invalid request type.');const r={id:requestId,uid:actor.uid,toUserId:data.toUserId?key(data.toUserId):'',name:profile.name,email:actor.email,type:data.type,subject:text(data.subject,'subject',200),message:text(data.message,'message',2000,true),interest:text(data.interest,'interest',200),status:'submitted',createdAt:iso()};s.requests.push(r);return r;}
   if(action==='updateCommunityRequest'){checkAdmin(actor);const r=s.requests.find(r=>r.id===data.id);if(!r)fail(404,'Request not found.');if(!['submitted','pending','read','approved','rejected','closed'].includes(data.status))fail(400,'Invalid request status.');r.status=data.status;note(s,actor,action,r.id);return r;}
   if(action==='createCommunityPost'){if(!['introduction','question','moment','opportunity'].includes(data.category))fail(400,'Choose a note category.');const p={id:id(),uid:actor.uid,userId:actor.uid,name:profile.name,body:text(data.body,'note',600,true),category:data.category,status:'published',hearts:[],replies:[],createdAt:iso()};s.posts.push(p);return p;}
   const p=s.posts.find(p=>p.id===data.id);if(!p)fail(404,'Community note not found.');
   if(action==='deleteCommunityPost'){if(p.uid!==actor.uid)fail(403,'Only the author can delete their note.');s.posts=s.posts.filter(r=>r.id!==p.id);return {ok:true};}
   if(action==='moderatePost'){checkAdmin(actor);if(!['published','hidden'].includes(data.status))fail(400,'Invalid visibility.');p.status=data.status;note(s,actor,action,p.id);return p;}
   if(p.status!=='published')fail(409,'This note is hidden.');
   if(action==='togglePostHeart'){if(p.hearts.includes(actor.uid))p.hearts=p.hearts.filter(u=>u!==actor.uid);else if(p.hearts.length<1000)p.hearts.push(actor.uid);else fail(409,'This note has reached its reaction limit.');}
   if(action==='replyToPost'){if(p.replies.length>=100)fail(409,'This note has reached its reply limit.');p.replies.push({id:id(),uid:actor.uid,userId:actor.uid,name:profile.name,body:text(data.body,'reply',300,true),createdAt:iso()});}return p;
  });
 }
 fail(404,'This community action is unavailable.');
}
async function readBody(request,max=50000){if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail(415,'Use a JSON request.');const bytes=await readBounded(request,max);let value;try{value=JSON.parse(new TextDecoder().decode(bytes));}catch{fail(400,'Invalid JSON request.');}return value;}
async function readBounded(request,max){if(Number(request.headers.get('Content-Length')||0)>max)fail(413,'The request is too large.');const reader=request.body?.getReader(),parts=[];let n=0;if(!reader)return new Uint8Array();for(;;){const {value,done}=await reader.read();if(done)break;n+=value.length;if(n>max){await reader.cancel();fail(413,'The request is too large.');}parts.push(value);}const all=new Uint8Array(n);let offset=0;for(const part of parts){all.set(part,offset);offset+=part.length;}return all;}
async function rateLimit(env,actor){await env.DB.prepare('DELETE FROM admin_login_limits WHERE expires_at<=?').bind(Date.now()).run();const bucket=Math.floor(Date.now()/300000),limit=actor.admin?300:80,key='community:'+actor.uid+':'+bucket;const row=await env.DB.prepare('INSERT INTO admin_login_limits (id,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(key,Date.now()+600000).first();if(row.attempts>limit)fail(429,'Too many updates. Wait a few minutes and retry.');}
async function upload(request,env,actor){
 if(!env.BUCKET)fail(503,'Image storage is unavailable.');const type=request.headers.get('Content-Type'),ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[type];if(!ext)fail(415,'Choose a JPG, PNG or WebP picture.');const bytes=await readBounded(request,5*1024*1024);const valid=type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:type==='image/png'?[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v):new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';if(!valid)fail(400,'This file is not a valid supported image.');
 const name=id()+'.'+ext;await env.BUCKET.put('admin-media/'+name,bytes,{httpMetadata:{contentType:type}});return {url:new URL(request.url).origin+'/api/media/'+name,path:name};
}
export async function handleCommunityAPI(request,env,adminSession){
 try{
  if(!env.DB)fail(503,'Community database is unavailable.');const path=new URL(request.url).pathname,method=request.method,isAdmin=path.startsWith('/api/admin/operations');
  if(path==='/api/community/public'&&method==='GET')return json(await communityPublic(env));
  if(path==='/api/community/health'&&method==='GET'){await env.DB.prepare('SELECT id FROM community_members LIMIT 1').first();await env.DB.prepare('SELECT id FROM community_ledgers LIMIT 1').first();return json({database:true,images:!!env.BUCKET,backend:'website',memberSignIn:'firebase-auth'});}
  if(isAdmin&&!adminSession?.user)fail(401,'Sign in to the admin workspace.');
  const actor=isAdmin?{uid:'admin:'+adminSession.user.id,admin:true,owner:adminSession.user.role==='owner',email:adminSession.user.email,emailVerified:true}:await memberIdentity(request);
  if(method==='GET'&&(isAdmin||path==='/api/community/me'))return json(await communityPrivate(env,actor));
  if(method!=='POST')fail(405,'Method not allowed.');if(request.headers.get('Origin')!==new URL(request.url).origin||request.headers.get(isAdmin?'X-BSS-Admin':'X-BSS-Member')!=='1')fail(403,'Submit this action from the TIU BSS website.');await rateLimit(env,actor);
  if(![isAdmin?'/api/admin/operations/upload':'/api/community/upload',isAdmin?'/api/admin/operations/action':'/api/community/action'].includes(path))fail(404,'Not found.');
  if(path.endsWith('/upload'))return json(await upload(request,env,actor));
  const input=await readBody(request);return json(await communityAction(env,actor,input.action,input.data));
 }catch(error){return json({error:error.status?error.message:'The community service could not complete this request. Please retry.'},error.status||500);}
}

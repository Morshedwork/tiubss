import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './operations-fixture.mjs';
import {communityAction,communityPrivate,communityPublic} from '../server/community.mjs';
import {verifyMemberToken} from '../server/member-identity.mjs';
import {generateKeyPair,SignJWT} from 'jose';
const admin={uid:'admin:owner',admin:true,owner:true,emailVerified:true};
const person=(uid='member-one')=>({uid,email:uid+'@example.test',emailVerified:true,photoURL:'https://images.example.test/avatar.jpg'});
const profile={name:'Community member',membershipType:'student',bio:'A student in Japan.',phone:'+81 90 1234 5678',university:'TIU',major:'DBI',semester:3,directoryOptIn:true,publicFields:['name','membershipType','bio']};
const future=n=>new Date(Date.now()+n*3600000).toISOString();
const eventData=()=>({title:'Test gathering',description:'Our community gathering.',category:'Community',venue:'Campus',status:'published',capacity:20,startsAt:future(1),endsAt:future(5),foodClosesAt:future(4),foodEnabled:true,allowGuestFood:true,slug:'test-gathering'});
const act=(f,actor,action,data)=>communityAction(f.env,actor,action,data);
async function setup(stock=10){const f=fixture(),actor=person();await act(f,actor,'saveProfile',profile);const event=await act(f,admin,'saveEvent',eventData());const vendor=await act(f,admin,'saveVendor',{eventId:event.id,name:'Bangla kitchen',location:'Campus counter',status:'published'});const dish=await act(f,admin,'saveMenuItem',{eventId:event.id,vendorId:vendor.id,name:'Lunch',priceJPY:700,stock,perPersonLimit:20});return {...f,actor,event,vendor,dish};}
const order=(f,actor=f.actor,requestId='request-one',qty=1)=>act(f,actor,'placeFoodOrder',{eventId:f.event.id,items:[{itemId:f.dish.id,quantity:qty}],requestId});
test('profile submission, review, opt-in and withdrawal strictly control public fields',async()=>{
 const f=fixture(),p=person();await act(f,p,'saveProfile',{...profile,email:'forged@test.test',membershipStatus:'approved',roles:['admin']});
 let own=(await communityPrivate(f.env,p)).profile;assert.equal(own.email,p.email);assert.equal(own.membershipStatus,'pending');assert.equal(own.roles,undefined);assert.equal((await communityPublic(f.env)).members.length,0);
 await act(f,admin,'approveMembership',{uid:p.uid,status:'approved'});let published=(await communityPublic(f.env)).members[0];assert.equal(published.name,profile.name);assert.equal(published.email,undefined);assert.equal(published.phone,undefined);assert.equal(published.university,undefined);
 await assert.rejects(act(f,p,'saveProfile',{...profile,publicFields:['email']}),/private field/);
 await act(f,p,'saveProfile',{directoryOptIn:false});assert.equal((await communityPublic(f.env)).members.length,0);
 await act(f,p,'saveProfile',{...profile,photoSource:'google'});assert.equal((await communityPrivate(f.env,p)).profile.photoURL,p.photoURL);
 await act(f,admin,'approveMembership',{uid:p.uid,status:'suspended'});assert.equal((await communityPublic(f.env)).members.length,0);
});
test('admin HTTP routes require independent session and origin; forged member tokens cannot write',async()=>{
 const f=fixture();assert.equal((await f.call('admin/operations')).status,401);
 assert.equal((await f.call('community/health')).status,200);
 const token=await f.login();assert.equal((await f.call('admin/operations',{token})).status,200);
 const data={action:'saveEvent',data:eventData()};assert.equal((await f.call('admin/operations/action',{method:'POST',token,data,origin:'https://evil.test'})).status,403);
 assert.equal((await f.call('admin/operations/action',{method:'POST',token,data})).status,200);
 assert.equal((await f.call('community/action',{method:'POST',data:{action:'saveProfile',data:profile},headers:{Authorization:'Bearer fake.token.value','X-BSS-Member':'1'}})).status,401);
 const publicData=await(await f.call('community/public')).json();assert.equal(publicData.events.length,1);assert.equal(publicData.orders,undefined);
});
test('event capacity, duplicate registrations and check-in are enforced under concurrent requests',async()=>{
 const f=await setup(),p2=person('member-two');await act(f,p2,'saveProfile',profile);const event=await act(f,admin,'saveEvent',{...f.event,capacity:1});
 const results=await Promise.allSettled([act(f,f.actor,'registerForEvent',{eventId:event.id}),act(f,p2,'registerForEvent',{eventId:event.id})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const ticket=results.find(r=>r.status==='fulfilled').value,actor=person(ticket.uid);
 assert.equal((await act(f,actor,'registerForEvent',{eventId:event.id})).id,ticket.id);
 await assert.rejects(act(f,actor,'checkInRegistration',{registrationId:ticket.id,manual:true}),/not assigned/);
 await act(f,admin,'checkInRegistration',{registrationId:ticket.id,token:ticket.ticketToken});await assert.rejects(act(f,admin,'checkInRegistration',{registrationId:ticket.id,manual:true}),/already been checked/);
});
test('concurrent last-stock checkouts do not oversell; retries do not create extra orders',async()=>{
 const f=await setup(1),p2=person('member-two');await act(f,p2,'saveProfile',profile);
 const results=await Promise.allSettled([order(f),order(f,p2,'second')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const o=results.find(r=>r.status==='fulfilled').value;
 assert.equal((await communityPublic(f.env)).menu[0].stock,0);assert.equal((await order(f,person(o.uid),o.requestId)).id,o.id);
 await assert.rejects(order(f,person(o.uid),o.requestId,2),/different cart/);
 await act(f,person(o.uid),'cancelFoodOrder',{orderId:o.id});assert.equal((await communityPublic(f.env)).menu[0].stock,1);await assert.rejects(act(f,person(o.uid),'cancelFoodOrder',{orderId:o.id}),/Only unpaid/);assert.equal((await communityPublic(f.env)).menu[0].stock,1);
});
test('cash, preparation and collection use trusted totals and prevent duplicate collection',async()=>{
 const f=await setup(),o=await order(f);assert.equal(o.totalJPY,700);
 await assert.rejects(act(f,admin,'advanceFoodOrder',{orderId:o.id,action:'confirmPayment',amountJPY:1}),/exact cash/);
 await assert.rejects(act(f,admin,'advanceFoodOrder',{orderId:o.id,action:'pickup',manual:true}),/ready and paid/);
 await act(f,admin,'advanceFoodOrder',{orderId:o.id,action:'prepare'});await act(f,admin,'advanceFoodOrder',{orderId:o.id,action:'ready'});await act(f,admin,'advanceFoodOrder',{orderId:o.id,action:'confirmPayment',amountJPY:700});
 await assert.rejects(act(f,admin,'cancelFoodOrder',{orderId:o.id}),/Only unpaid/);await assert.rejects(act(f,admin,'advanceFoodOrder',{orderId:o.id,action:'pickup',token:'wrong'}),/does not match/);
 await act(f,admin,'advanceFoodOrder',{orderId:o.id,action:'pickup',token:o.pickupToken});await assert.rejects(act(f,admin,'advanceFoodOrder',{orderId:o.id,action:'pickup',manual:true}),/ready and paid/);
 const stranger=person('stranger');assert.equal((await communityPrivate(f.env,stranger)).orders.length,0);const publicData=JSON.stringify(await communityPublic(f.env));assert.ok(!publicData.includes(o.pickupToken));assert.ok(!publicData.includes(o.uid));
});
test('a failed mixed-stall cart reserves nothing and stale stock edits cannot overwrite purchases',async()=>{
 const f=await setup(5),v2=await act(f,admin,'saveVendor',{eventId:f.event.id,name:'Second',location:'Other counter',status:'published'}),d2=await act(f,admin,'saveMenuItem',{eventId:f.event.id,vendorId:v2.id,name:'Tea',priceJPY:100,stock:2});
 await assert.rejects(act(f,f.actor,'placeFoodOrder',{eventId:f.event.id,requestId:'mixed',items:[{itemId:f.dish.id,quantity:1},{itemId:d2.id,quantity:1}]}),/separate order/);assert.equal((await communityPublic(f.env)).menu.find(d=>d.id===f.dish.id).stock,5);
 await order(f);await assert.rejects(act(f,admin,'saveMenuItem',{...f.dish,expectedStock:5,stock:50}),/Stock changed/);
 const updated=await act(f,admin,'saveMenuItem',{...f.dish,expectedStock:4,stock:12});assert.equal(updated.stock,12);
});
test('expired reservations release stock once and stall scope controls every staff action',async()=>{
 const f=await setup(1),o=await order(f),raw=f.sqlite.prepare('SELECT data FROM community_ledgers WHERE id=?').get(f.event.id),data=JSON.parse(raw.data);data.orders[0].expiresAt=new Date(0).toISOString();f.sqlite.prepare('UPDATE community_ledgers SET data=? WHERE id=?').run(JSON.stringify(data),f.event.id);
 const next=await order(f,f.actor,'next');assert.equal((await communityPublic(f.env)).menu[0].stock,0);assert.equal((await communityPrivate(f.env,f.actor)).orders.find(r=>r.id===o.id).status,'expired');
 const staff=person('staff');await act(f,staff,'saveProfile',profile);await act(f,admin,'assignStaff',{uid:staff.uid,roles:['kitchen_staff'],eventIds:[f.event.id],vendorIds:[f.vendor.id]});
 assert.equal((await communityPrivate(f.env,staff)).orders.length,2);await act(f,staff,'advanceFoodOrder',{orderId:next.id,action:'prepare'});
 await assert.rejects(act(f,staff,'advanceFoodOrder',{orderId:next.id,action:'confirmPayment',amountJPY:700}),/not assigned/);
 await act(f,admin,'assignStaff',{uid:staff.uid,roles:[],eventIds:[],vendorIds:[]});assert.equal((await communityPrivate(f.env,staff)).orders.length,0);await assert.rejects(act(f,staff,'advanceFoodOrder',{orderId:next.id,action:'ready'}),/not assigned/);
});
test('member requests remain private, posts can be moderated, and nonowners cannot grant staff',async()=>{
 const f=await setup(),r=await act(f,f.actor,'submitCommunityRequest',{requestId:'contact-one',type:'partners',message:'Can we work together?'});assert.equal(r.email,f.actor.email);assert.equal((await communityPrivate(f.env,person('other'))).requests.length,0);
 const post=await act(f,f.actor,'createCommunityPost',{category:'moment',body:'Our shared festival.'});assert.equal((await communityPublic(f.env)).posts.length,1);await act(f,admin,'moderatePost',{id:post.id,status:'hidden'});assert.equal((await communityPublic(f.env)).posts.length,0);
 await assert.rejects(act(f,{...admin,owner:false},'assignStaff',{uid:f.actor.uid,roles:[]}),/Only the workspace owner/);
});
test('member JWT validation rejects wrong project, expiry, future auth time, and another signer',async()=>{
 const pair=await generateKeyPair('RS256'),other=await generateKeyPair('RS256'),now=Math.floor(Date.now()/1000);
 const mint=(patch={},key=pair.privateKey)=>new SignJWT({sub:'member-one',iss:'https://securetoken.google.com/tiu-bss',aud:'tiu-bss',iat:now,exp:now+3600,auth_time:now-1,email:'member@example.test',...patch}).setProtectedHeader({alg:'RS256'}).sign(key);
 assert.equal((await verifyMemberToken(await mint(),pair.publicKey)).uid,'member-one');
 for(const patch of [{aud:'another-project'},{iss:'https://attacker.test'},{exp:now-100},{auth_time:now+100},{iat:now+100},{sub:''}])await assert.rejects(verifyMemberToken(await mint(patch),pair.publicKey));
 await assert.rejects(verifyMemberToken(await mint({},other.privateKey),pair.publicKey));
});

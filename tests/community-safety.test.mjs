import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './operations-fixture.mjs';
import {communityAction,communityPrivate} from '../server/community.mjs';

const admin={uid:'admin:owner',admin:true,owner:true,email:'owner@example.test',emailVerified:true};
const person=uid=>({uid,email:`${uid}@example.test`,emailVerified:true});
const profile={name:'Test member',membershipType:'community',bio:'A member of the society.',phone:'+81 90 1234 5678',directoryOptIn:true,publicFields:['name']};
const future=hours=>new Date(Date.now()+hours*3600000).toISOString();
const act=(f,actor,action,data)=>communityAction(f.env,actor,action,data);
const rejection=status=>cause=>cause.status===status;

async function setupDelegation(){
 const f=fixture(),staff=person('staff-member'),customer=person('customer-member');
 for(const actor of [staff,customer])await act(f,actor,'saveProfile',profile);
 const events=[];
 for(const slug of ['assigned-event','other-event']){
  const event=await act(f,admin,'saveEvent',{title:slug,description:'A society gathering.',category:'Community',venue:'Campus',status:'published',capacity:20,startsAt:future(1),endsAt:future(5),foodClosesAt:future(4),foodEnabled:true,allowGuestFood:true,slug});
  const vendor=await act(f,admin,'saveVendor',{eventId:event.id,name:'Test kitchen',location:'Campus counter',status:'published'});
  const dish=await act(f,admin,'saveMenuItem',{eventId:event.id,vendorId:vendor.id,name:'Lunch',priceJPY:700,stock:10,perPersonLimit:10});
  events.push({event,vendor,dish});
 }
 const ticket=(actor,event)=>act(f,actor,'registerForEvent',{eventId:event.id});
 const order=(actor,{event,dish},requestId)=>act(f,actor,'placeFoodOrder',{eventId:event.id,requestId,items:[{itemId:dish.id,quantity:1}]});
 const ownTicket=await ticket(staff,events[0].event),delegatedTicket=await ticket(customer,events[0].event),otherTicket=await ticket(customer,events[1].event);
 const ownOrder=await order(staff,events[0],'staff-order'),delegatedOrder=await order(customer,events[0],'customer-order'),otherOrder=await order(customer,events[1],'other-order');
 await act(f,admin,'assignStaff',{uid:staff.uid,roles:['checkin_staff','kitchen_staff'],eventIds:[events[0].event.id],vendorIds:[events[0].vendor.id]});
 return {...f,staff,customer,events,ownTicket,delegatedTicket,otherTicket,ownOrder,delegatedOrder,otherOrder};
}

test('delegated private reads require a current eligible profile while members retain their own records',async()=>{
 for(const status of ['suspended','rejected','missing']){
  const f=await setupDelegation();
  let data=await communityPrivate(f.env,f.staff);
  assert.deepEqual(new Set(data.registrations.map(r=>r.id)),new Set([f.ownTicket.id,f.delegatedTicket.id]));
  assert.deepEqual(new Set(data.orders.map(r=>r.id)),new Set([f.ownOrder.id,f.delegatedOrder.id]));
  assert.deepEqual(data.assignment.roles,['checkin_staff','kitchen_staff']);
  if(status==='missing')f.sqlite.prepare('DELETE FROM community_members WHERE id=?').run(f.staff.uid);
  else await act(f,admin,'approveMembership',{uid:f.staff.uid,status});
  data=await communityPrivate(f.env,f.staff);
  assert.deepEqual(data.registrations.map(r=>r.id),[f.ownTicket.id]);
  assert.deepEqual(data.orders.map(r=>r.id),[f.ownOrder.id]);
  assert.deepEqual(data.assignment,{roles:[],eventIds:[],vendorIds:[]});
  const response=JSON.stringify(data);
  for(const secret of [f.delegatedTicket.ticketToken,f.otherTicket.ticketToken,f.delegatedOrder.pickupToken,f.otherOrder.pickupToken])assert.equal(response.includes(secret),false);
  assert.equal(response.includes(f.ownTicket.ticketToken),true);assert.equal(response.includes(f.ownOrder.pickupToken),true);
  await assert.rejects(act(f,f.staff,'checkInRegistration',{registrationId:f.delegatedTicket.id,manual:true}),rejection(status==='missing'?409:403));
  f.sqlite.close();
 }
});

test('native admin access stays independent of membership and can review inactive staff assignments',async()=>{
 const f=await setupDelegation();await act(f,admin,'approveMembership',{uid:f.staff.uid,status:'suspended'});
 const data=await communityPrivate(f.env,admin);
 assert.equal(data.orders.length,3);assert.equal(data.registrations.length,3);
 assert.deepEqual(data.assignments[f.staff.uid].roles,['checkin_staff','kitchen_staff']);
 assert.equal(data.members.find(member=>member.uid===f.staff.uid).membershipStatus,'suspended');
 f.sqlite.close();
});

async function setupRequests(){
 const f=fixture(),sender=person('sender-member'),recipient=person('recipient-member'),other=person('other-member');
 for(const actor of [sender,recipient,other]){await act(f,actor,'saveProfile',profile);await act(f,admin,'approveMembership',{uid:actor.uid,status:'approved'});}
 const data={requestId:'request-one',type:'connection',toUserId:recipient.uid,subject:'Hello',interest:'Community',message:'Let us meet at the gathering.'};
 const request=patch=>act(f,sender,'submitCommunityRequest',{...data,...patch});
 return {...f,sender,recipient,other,data,request};
}

test('identical normalized request retries preserve the saved record and its current status',async()=>{
 const f=await setupRequests(),first=await f.request();
 await act(f,admin,'updateCommunityRequest',{id:first.id,status:'closed'});
 await act(f,f.sender,'saveProfile',{name:'A changed display name'});
 const retried=await f.request({type:' connection ',subject:'  Hello  ',interest:' Community ',message:' Let us meet at the gathering. '});
 assert.equal(retried.id,first.id);assert.equal(retried.status,'closed');assert.equal(retried.name,first.name);
 assert.equal((await communityPrivate(f.env,f.sender)).requests.length,1);
 f.sqlite.close();
});

test('reused request IDs reject changed submitted content or destination without overwriting the original',async()=>{
 for(const patch of [{type:'mentorship'},{toUserId:'other-member'},{subject:'Changed subject'},{interest:'Changed topic'},{message:'Changed message'}]){
  const f=await setupRequests(),first=await f.request();
  await assert.rejects(f.request(patch),rejection(409));
  const requests=(await communityPrivate(f.env,f.sender)).requests;
  assert.equal(requests.length,1);assert.deepEqual(requests[0],first);f.sqlite.close();
 }
});

test('legacy requests without fingerprint metadata remain idempotent after the recipient leaves the directory',async()=>{
 const f=await setupRequests(),first=await f.request();
 const row=f.sqlite.prepare('SELECT data FROM community_ledgers WHERE id=?').get('social'),social=JSON.parse(row.data);
 const saved=social.requests.find(request=>request.id===first.id);delete saved.fingerprint;delete saved.requestFingerprint;saved.status='approved';
 f.sqlite.prepare('UPDATE community_ledgers SET data=? WHERE id=?').run(JSON.stringify(social),'social');
 await act(f,f.recipient,'saveProfile',{directoryOptIn:false});
 const retried=await f.request();assert.equal(retried.id,first.id);assert.equal(retried.status,'approved');
 await assert.rejects(f.request({message:'Changed message'}),rejection(409));
 await assert.rejects(f.request({requestId:'new-request'}),rejection(404));
 assert.equal((await communityPrivate(f.env,f.sender)).requests.length,1);f.sqlite.close();
});

test('concurrent identical requests create one record and conflicting reuse is rejected',async()=>{
 const f=await setupRequests();
 const results=await Promise.allSettled([f.request(),f.request(),f.request({message:'Conflicting message'})]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,2);
 assert.equal(results.find(result=>result.status==='rejected').reason.status,409);
 assert.equal((await communityPrivate(f.env,f.sender)).requests.length,1);f.sqlite.close();
});

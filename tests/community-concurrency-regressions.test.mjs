import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './operations-fixture.mjs';
import {communityAction,communityPrivate,communityPublic} from '../server/community.mjs';

const admin={uid:'admin:concurrency-tests',admin:true,owner:true,emailVerified:true};
const person=uid=>({uid,email:`${uid}@example.test`,emailVerified:true});
const profile={name:'Test member',membershipType:'community',bio:'A member of the local test society.',phone:'+81 90 1234 5678'};
const future=hours=>new Date(Date.now()+hours*3600000).toISOString();
const eventData=(slug='test-gathering')=>({title:slug,slug,description:'A test community gathering.',category:'Community',venue:'Campus',status:'published',capacity:10,startsAt:future(1),endsAt:future(5),foodClosesAt:future(4),foodEnabled:true,allowGuestFood:true});
const act=(f,actor,action,data)=>communityAction(f.env,actor,action,data);
const rejected=status=>cause=>cause.status===status;
const makeFixture=t=>{const f=fixture();t.after(()=>f.sqlite.close());return f;};
async function members(f){const actors=[person('member-one'),person('member-two')];for(const actor of actors)await act(f,actor,'saveProfile',profile);return actors;}
function editLedger(f,ledgerId,edit){const row=f.sqlite.prepare('SELECT data FROM community_ledgers WHERE id=?').get(ledgerId);const state=JSON.parse(row.data);edit(state);f.sqlite.prepare('UPDATE community_ledgers SET data=?,version=version+1 WHERE id=?').run(JSON.stringify(state),ledgerId);}

test('concurrent event creates cannot publish the same public slug twice',async t=>{
 const f=makeFixture(t);
 const results=await Promise.allSettled([
  act(f,admin,'saveEvent',{...eventData('shared-route'),title:'First gathering'}),
  act(f,admin,'saveEvent',{...eventData('shared-route'),title:'Second gathering'})
 ]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
 assert.equal(results.find(result=>result.status==='rejected').reason.status,409);
 const matches=(await communityPublic(f.env)).events.filter(event=>event.slug==='shared-route');
 assert.equal(matches.length,1);assert.equal(matches[0].id,results.find(result=>result.status==='fulfilled').value.id);
});

test('renaming an event to an occupied slug is rejected without changing either event',async t=>{
 const f=makeFixture(t),first=await act(f,admin,'saveEvent',eventData('first-route')),second=await act(f,admin,'saveEvent',eventData('second-route'));
 await assert.rejects(act(f,admin,'saveEvent',{...second,slug:first.slug,title:'Must not be saved'}),rejected(409));
 const events=(await communityPublic(f.env)).events;
 assert.equal(events.find(event=>event.id===first.id).slug,'first-route');
 assert.equal(events.find(event=>event.id===second.id).slug,'second-route');
 assert.equal(events.find(event=>event.id===second.id).title,second.title);
});

test('a successful slug rename frees the previous route for another event',async t=>{
 const f=makeFixture(t),first=await act(f,admin,'saveEvent',eventData('original-route'));
 const renamed=await act(f,admin,'saveEvent',{...first,slug:'renamed-route'});
 const replacement=await act(f,admin,'saveEvent',eventData('original-route'));
 assert.notEqual(replacement.id,first.id);assert.equal(renamed.slug,'renamed-route');
 const events=(await communityPublic(f.env)).events;
 assert.equal(events.filter(event=>event.slug==='original-route').length,1);
 assert.equal(events.filter(event=>event.slug==='renamed-route').length,1);
});

test('replaying a registration request after cancellation preserves the cancelled ticket and free capacity',async t=>{
 const f=makeFixture(t),[actor]=await members(f),event=await act(f,admin,'saveEvent',eventData());
 const data={eventId:event.id,requestId:'original-registration'};
 const ticket=await act(f,actor,'registerForEvent',data);
 await act(f,actor,'cancelRegistration',{registrationId:ticket.id});
 const retry=await act(f,actor,'registerForEvent',data);
 assert.equal(retry.id,ticket.id);assert.equal(retry.status,'cancelled');
 assert.equal((await communityPrivate(f.env,actor)).registrations.length,1);
 assert.equal((await communityPublic(f.env)).events.find(row=>row.id===event.id).registeredCount,0);
});

test('a new registration request allows deliberate rebooking without reviving an older request',async t=>{
 const f=makeFixture(t),[actor]=await members(f),event=await act(f,admin,'saveEvent',eventData());
 const original={eventId:event.id,requestId:'original-registration'},newRequest={eventId:event.id,requestId:'intentional-rebooking'};
 const first=await act(f,actor,'registerForEvent',original);await act(f,actor,'cancelRegistration',{registrationId:first.id});
 const rebooked=await act(f,actor,'registerForEvent',newRequest);
 assert.notEqual(rebooked.id,first.id);assert.equal(rebooked.status,'confirmed');
 const oldRetry=await act(f,actor,'registerForEvent',original),newRetry=await act(f,actor,'registerForEvent',newRequest);
 assert.equal(oldRetry.id,first.id);assert.equal(oldRetry.status,'cancelled');assert.equal(newRetry.id,rebooked.id);
 assert.equal((await communityPrivate(f.env,actor)).registrations.length,2);
 assert.equal((await communityPublic(f.env)).events.find(row=>row.id===event.id).registeredCount,1);
});

test('registration request keys are scoped to each member and concurrent retries reserve once per member',async t=>{
 const f=makeFixture(t),[first,second]=await members(f),event=await act(f,admin,'saveEvent',eventData());
 const payload={eventId:event.id,requestId:'same-client-key'};
 const [a,b,aRetry]=await Promise.all([act(f,first,'registerForEvent',payload),act(f,second,'registerForEvent',payload),act(f,first,'registerForEvent',payload)]);
 assert.notEqual(a.id,b.id);assert.equal(a.id,aRetry.id);assert.equal(a.uid,first.uid);assert.equal(b.uid,second.uid);
 assert.equal((await communityPublic(f.env)).events.find(row=>row.id===event.id).registeredCount,2);
});

test('legacy tickets without a request key stay usable and a supplied retry key becomes cancellation-safe',async t=>{
 const f=makeFixture(t),[actor]=await members(f),event=await act(f,admin,'saveEvent',eventData());
 const legacy=await act(f,actor,'registerForEvent',{eventId:event.id});
 assert.equal((await act(f,actor,'registerForEvent',{eventId:event.id})).id,legacy.id);
 const payload={eventId:event.id,requestId:'legacy-client-retry'};
 const linked=await act(f,actor,'registerForEvent',payload);assert.equal(linked.id,legacy.id);
 await act(f,actor,'cancelRegistration',{registrationId:legacy.id});
 const retry=await act(f,actor,'registerForEvent',payload);
 assert.equal(retry.id,legacy.id);assert.equal(retry.status,'cancelled');
 assert.equal((await communityPrivate(f.env,actor)).registrations.length,1);
});

test('two senders may reuse a client request key while moderation targets only the selected record',async t=>{
 const f=makeFixture(t),[first,second]=await members(f);
 const payload={requestId:'shared-client-key',type:'contact',subject:'A society question',interest:'Membership',message:'Please tell me about the next gathering.'};
 const [a,b]=await Promise.all([act(f,first,'submitCommunityRequest',payload),act(f,second,'submitCommunityRequest',payload)]);
 assert.notEqual(a.id,b.id);assert.equal(a.uid,first.uid);assert.equal(b.uid,second.uid);
 assert.equal((await act(f,first,'submitCommunityRequest',payload)).id,a.id);
 assert.equal((await act(f,second,'submitCommunityRequest',payload)).id,b.id);
 await act(f,admin,'updateCommunityRequest',{id:b.id,status:'approved'});
 const aRows=(await communityPrivate(f.env,first)).requests,bRows=(await communityPrivate(f.env,second)).requests;
 assert.equal(aRows.length,1);assert.equal(bRows.length,1);
 assert.equal(aRows[0].status,'submitted');assert.equal(bRows[0].status,'approved');
 assert.equal((await act(f,second,'submitCommunityRequest',payload)).status,'approved');
 await assert.rejects(act(f,second,'submitCommunityRequest',{...payload,message:'Different message'}),rejected(409));
});

test('legacy raw request IDs remain retryable without colliding with another sender using the same key',async t=>{
 const f=makeFixture(t),[first,second]=await members(f);
 const payload={requestId:'legacy-raw-key',type:'contact',message:'A request accepted by the earlier backend.'};
 const created=await act(f,first,'submitCommunityRequest',payload);
 editLedger(f,'social',state=>{const row=state.requests.find(request=>request.id===created.id&&request.uid===first.uid);row.id=payload.requestId;delete row.requestId;row.status='closed';});
 const legacyRetry=await act(f,first,'submitCommunityRequest',payload);
 assert.equal(legacyRetry.uid,first.uid);assert.equal(legacyRetry.status,'closed');
 const newcomer=await act(f,second,'submitCommunityRequest',payload);assert.notEqual(newcomer.id,legacyRetry.id);
 await act(f,admin,'updateCommunityRequest',{id:newcomer.id,status:'approved'});
 const oldRows=(await communityPrivate(f.env,first)).requests,newRows=(await communityPrivate(f.env,second)).requests;
 assert.equal(oldRows.length,1);assert.equal(oldRows[0].status,'closed');assert.equal(newRows.length,1);assert.equal(newRows[0].status,'approved');
});

test('concurrent event renames cannot claim the same available slug',async t=>{
 const f=makeFixture(t),first=await act(f,admin,'saveEvent',eventData('first-route')),second=await act(f,admin,'saveEvent',eventData('second-route'));
 const results=await Promise.allSettled([
  act(f,admin,'saveEvent',{...first,slug:'new-shared-route'}),
  act(f,admin,'saveEvent',{...second,slug:'new-shared-route'})
 ]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
 assert.equal(results.find(result=>result.status==='rejected').reason.status,409);
 const events=(await communityPublic(f.env)).events;
 assert.equal(events.filter(event=>event.slug==='new-shared-route').length,1);
 assert.equal(events.length,2);
});

test('every request key that returned an active ticket remains bound to that ticket after cancellation',async t=>{
 const f=makeFixture(t),[actor]=await members(f),event=await act(f,admin,'saveEvent',eventData());
 const firstKey={eventId:event.id,requestId:'first-browser-tab'},secondKey={eventId:event.id,requestId:'second-browser-tab'};
 const ticket=await act(f,actor,'registerForEvent',firstKey);
 assert.equal((await act(f,actor,'registerForEvent',secondKey)).id,ticket.id);
 await act(f,actor,'cancelRegistration',{registrationId:ticket.id});
 for(const payload of [firstKey,secondKey]){const retried=await act(f,actor,'registerForEvent',payload);assert.equal(retried.id,ticket.id);assert.equal(retried.status,'cancelled');}
 assert.equal((await communityPrivate(f.env,actor)).registrations.length,1);
 assert.equal((await communityPublic(f.env)).events.find(row=>row.id===event.id).registeredCount,0);
});

test('ambiguous legacy moderation IDs fail closed instead of changing the first sender record',async t=>{
 const f=makeFixture(t),[first,second]=await members(f);
 await act(f,first,'submitCommunityRequest',{requestId:'first-key',type:'contact',message:'First legacy sender.'});
 await act(f,second,'submitCommunityRequest',{requestId:'second-key',type:'contact',message:'Second legacy sender.'});
 editLedger(f,'social',state=>{for(const row of state.requests){row.id='duplicated-legacy-id';delete row.requestId;}});
 await assert.rejects(act(f,admin,'updateCommunityRequest',{id:'duplicated-legacy-id',status:'approved'}),rejected(409));
 assert.equal((await communityPrivate(f.env,first)).requests[0].status,'submitted');
 assert.equal((await communityPrivate(f.env,second)).requests[0].status,'submitted');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {renderAdmin,renderStaff,scopedFoodOrders,pickupEligibility} from '../public/js/admin.js';

const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const order=(id,patch={})=>({id,eventId:'event-a',vendorId:'stall-a',status:'confirmed',paymentStatus:'due',total:850,items:[{name:'Biryani',qty:1}],createdAt:'2099-01-01T07:00:00Z',expiresAt:'2099-01-01T08:00:00Z',...patch});
function state(roles=['food_vendor_manager']){return {auth:{user:{uid:'staff-1'}},roles,staffAssignment:{eventIds:['event-a'],vendorIds:['stall-a']},events:[{id:'event-a',title:'Community mela',status:'published',date:'2099-01-01'},{id:'event-b',title:'Private event',status:'published',date:'2099-01-02'}],vendors:[{id:'stall-a',eventId:'event-a',name:'Dhaka table',location:'North hall'},{id:'stall-b',eventId:'event-b',name:'Other stall'}],orders:[order('one'),order('two',{status:'ready',paymentStatus:'paid'}),order('three',{status:'preparing'}),order('foreign',{eventId:'event-b',vendorId:'stall-b',items:[{name:'HIDDEN PRIVATE FOOD',qty:1}]}),order('mine-but-unassigned',{eventId:'event-a',vendorId:'stall-b'})],dataErrors:{}};}
const ctx=s=>({store:{getState:()=>structuredClone(s)},esc:escape,icon:()=>'<svg></svg>'});

test('staff food queue requires both event and stall assignment; admin sees all',()=>{
 const s=state();assert.deepEqual(scopedFoodOrders(s).map(o=>o.id),['one','two','three']);
 assert.equal(scopedFoodOrders({...s,staffAssignment:null}).length,0);
 assert.equal(scopedFoodOrders({...s,roles:['admin']}).length,5);
});

test('pickup eligibility rejects unpaid, unready, cancelled, expired and reused tickets',()=>{
 assert.match(pickupEligibility(order('a',{status:'ready'})),/cash payment/i);
 assert.match(pickupEligibility(order('a',{paymentStatus:'paid'})),/not ready/i);
 assert.match(pickupEligibility(order('a',{status:'collected',paymentStatus:'paid'})),/already been collected/i);
 assert.match(pickupEligibility(order('a',{status:'cancelled'})),/cancelled/i);
 assert.match(pickupEligibility(order('a',{expiresAt:'2000-01-01T00:00:00Z'})),/expired/i);
 assert.equal(pickupEligibility(order('a',{status:'ready',paymentStatus:'paid'})),'');
 assert.equal(pickupEligibility(order('a',{status:'ready',paymentStatus:'complimentary',total:0})),'');
});

test('kitchen staff can prepare food but cannot record cash or collect tickets',()=>{
 const html=renderStaff(ctx(state(['kitchen_staff'])),'food');
 assert.match(html,/data-next="prepare"/);assert.match(html,/data-next="ready"/);
 assert.doesNotMatch(html,/data-admin-action="cash-order"/);assert.doesNotMatch(html,/data-admin-action="pickup-order"/);
 assert.doesNotMatch(html,/data-admin-form="food-lookup"/);assert.doesNotMatch(html,/HIDDEN PRIVATE FOOD/);
});

test('pickup staff can record cash and verify tickets, but cannot prepare orders',()=>{
 const html=renderStaff(ctx(state(['pickup_staff'])),'food');
 assert.match(html,/data-admin-form="food-lookup"/);assert.match(html,/data-admin-action="cash-order"/);assert.match(html,/data-admin-action="pickup-order"/);
 assert.doesNotMatch(html,/data-next="prepare"/);assert.doesNotMatch(html,/data-next="ready"/);
 assert.match(html,/Manual order reference/);assert.match(html,/Camera|camera/);
});

test('signed out and ordinary members cannot render the staff queue',()=>{
 const s=state(['member']);assert.match(renderStaff(ctx(s),'food'),/Team access required/);
 assert.doesNotMatch(renderStaff(ctx(s),'food'),/Biryani/);
 assert.match(renderStaff(ctx({...s,auth:{user:null}}),'food'),/Sign in to continue/);
});

test('stall and menu text is escaped in the operator queue',()=>{
 const s=state();s.vendors[0].name='<script>alert(1)</script>';s.orders[0].items[0].name='<img src=x onerror=alert(1)>';
 const html=renderStaff(ctx(s),'food');assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<script>|<img src=x/);
});

test('staff access assignment appears only for a super administrator',()=>{
 globalThis.location={pathname:'/admin/roles',search:'',hash:''};
 assert.doesNotMatch(renderAdmin(ctx(state(['admin']))),/data-admin-form="staff-assignment"/);
 assert.match(renderAdmin(ctx(state(['super_admin']))),/data-admin-form="staff-assignment"/);
});


test('cancelled events show no kitchen, cash or pickup actions; managers can release reservations',()=>{
 const s=state();s.events[0].status='cancelled';const html=renderStaff(ctx(s),'food');
 assert.doesNotMatch(html,/data-next="prepare"|data-next="ready"|data-admin-action="cash-order"|data-admin-action="pickup-order"/);
 assert.match(html,/not open for food service/);assert.match(html,/data-admin-action="cancel-order"/);
 const cashier=renderStaff(ctx({...s,roles:['pickup_staff']}),'food');assert.doesNotMatch(cashier,/data-admin-action="cancel-order"/);
});

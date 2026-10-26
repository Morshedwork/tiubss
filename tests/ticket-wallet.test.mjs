import test from 'node:test';
import assert from 'node:assert/strict';
import {renderTicketWallet,walletRecords,foodTicketState,foodTicketPayload,foodTicketDocument,showFoodTicket} from '../dist/js/ticket-wallet.js';

const now=Date.now();
const order={id:'order-one',uid:'member-1',eventId:'festival',vendorId:'stall-1',orderNumber:'BSS-112233445566',vendorName:'The food table',eventTitle:'Community Festival',pickupLocation:'Courtyard · Stall 1',status:'confirmed',paymentStatus:'due',rawPaymentStatus:'unpaid',qrToken:'pickup-secret',total:900,expiresAt:new Date(now+30*60000).toISOString(),createdAt:new Date(now).toISOString(),items:[{menuId:'dish',name:'Fuchka',qty:2,price:450}]};
const state={auth:{user:{uid:'member-1'}},profile:{id:'member-1'},events:[{id:'festival',title:'Community Festival',status:'published',endsAt:new Date(now+86400000).toISOString()}],vendors:[],orders:[order],tickets:[],dataErrors:{},loading:false};
const ctx=(value=state)=>({store:{getState:()=>value},money:n=>`¥${n}`,toast:()=>{}});

test('wallet exposes only the authenticated member’s tickets even when admin cache contains all orders',()=>{
  const combined={...state,roles:['admin'],orders:[order,{...order,id:'another-order',uid:'someone-else',vendorName:'PRIVATE VENDOR',items:[{name:'PRIVATE ITEM'}]}],tickets:[{id:'my-entry',userId:'member-1',eventId:'festival',status:'confirmed'},{id:'their-entry',uid:'someone-else',status:'confirmed'}]};
  const rows=walletRecords(combined);
  assert.equal(rows.orders.length,1);assert.equal(rows.tickets.length,1);
  const html=renderTicketWallet(ctx(combined));
  assert.match(html,/BSS-112233445566/);assert.doesNotMatch(html,/PRIVATE VENDOR|PRIVATE ITEM|another-order|their-entry|pickup-secret/);
});

test('logged-out wallet cannot disclose a stale profile or cached transaction',()=>{
  const signedOut={...state,auth:{user:null}};
  assert.deepEqual(walletRecords(signedOut),{orders:[],tickets:[]});
  const html=renderTicketWallet(ctx(signedOut));
  assert.match(html,/Sign in/);assert.doesNotMatch(html,/order-one|BSS-112233445566|pickup-secret/);
});

test('reservation expiry hides its QR and cannot be cancelled again; preparing or paid orders do not expire',()=>{
  const expired={...order,expiresAt:new Date(now-1).toISOString()};
  assert.deepEqual(foodTicketState(expired,now),{status:'expired',active:false,expired:true,canCancel:false,canShowCode:false,payment:'unpaid',paid:false});
  assert.equal(foodTicketState({...expired,status:'preparing'},now).active,true);
  assert.equal(foodTicketState({...expired,paymentStatus:'paid',rawPaymentStatus:'paid'},now).status,'confirmed');
  assert.equal(foodTicketState({...order,status:'cancelled',cancelReason:'reservation_expired'},now).status,'expired');
});

test('collected, cancelled, or incomplete tickets never contain a usable pickup symbol',()=>{
  for(const status of ['collected','cancelled','unknown','<script>'])assert.equal(foodTicketState({...order,status},now).canShowCode,false);
  assert.equal(foodTicketState({...order,qrToken:''},now).canShowCode,false);
  assert.equal(foodTicketState({...order,status:'<script>'},now).status,'unknown');
  assert.throws(()=>foodTicketPayload({...order,qrToken:''}),/pickup code/);
});

test('complimentary status remains distinct from cash paid and may be cancelled before preparation',()=>{
  const complimentary={...order,total:0,paymentStatus:'paid',rawPaymentStatus:'complimentary'};
  const result=foodTicketState(complimentary,now);
  assert.equal(result.payment,'complimentary');assert.equal(result.paid,true);assert.equal(result.canCancel,true);
  assert.match(renderTicketWallet(ctx({...state,orders:[complimentary]})),/Complimentary/);
});

test('QR payload uses order reference plus secret token for reliable staff lookup',()=>{
  assert.deepEqual(JSON.parse(foodTicketPayload(order)),{type:'food',id:'order-one',token:'pickup-secret'});
  assert.deepEqual(JSON.parse(foodTicketPayload({...order,qrToken:undefined,pickupToken:'new-secret'})),{type:'food',id:'order-one',token:'new-secret'});
});

test('saved ticket is self-contained, escaped, and records exact server order totals',()=>{
  const malicious={...order,vendorName:'<script>alert(1)</script>',items:[{name:'<img src=x onerror=alert(1)>',quantity:2,unitPriceJPY:450}]};
  const document=foodTicketDocument(ctx({...state,orders:[malicious]}),malicious);
  assert.match(document,/<!doctype html>/);assert.match(document,/class="qr-image"/);assert.match(document,/¥900/);
  assert.match(document,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);assert.doesNotMatch(document,/<script|<img src=x|src="https:/);
  assert.match(document,/A saved copy does not update automatically/);
});

test('saved ticket rejects another member, closed order, or cancelled event',()=>{
  assert.throws(()=>foodTicketDocument(ctx(),{...order,uid:'another-member'}),/account that owns/);
  assert.throws(()=>foodTicketDocument(ctx(),{...order,status:'collected'}),/active pickup/);
  assert.throws(()=>foodTicketDocument(ctx({...state,events:[{id:'festival',status:'cancelled'}]}),order),/active pickup/);
});

test('direct ticket modal refuses records belonging to another account before touching DOM',()=>{
  const messages=[];let opened=false;
  showFoodTicket({...ctx(),toast:message=>messages.push(message),modal:()=>{opened=true;}},{...order,uid:'another-member'});
  assert.equal(opened,false);assert.match(messages[0],/account that owns/);
});

test('wallet shows cash deadline, pickup location and live ordering links without displaying QR tokens',()=>{
  const html=renderTicketWallet(ctx());
  assert.match(html,/Pay before/);assert.match(html,/JST/);assert.match(html,/Courtyard · Stall 1/);
  assert.match(html,/href="#\/food"/);assert.match(html,/Refresh my tickets/);assert.doesNotMatch(html,/pickup-secret/);
});

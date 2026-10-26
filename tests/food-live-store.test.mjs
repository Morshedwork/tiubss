import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveStore} from '../dist/js/live-store.js';
import {parseFoodTicketCode} from '../dist/js/food-ticket-code.js';

function fixture(overrides={}) {
  let auth={configured:true,user:{uid:'buyer',email:'buyer@example.test'},roles:[]},listener;
  const api={subscribeAuth(fn){listener=fn;return()=>{};},async initFirebase(){return auth;},getAuthState(){return auth;},async getPublicProfiles(){return[];},async getEvents(){return[];},async getContent(){return[];},async getMyProfile(){return{uid:'buyer',name:'Buyer'};},async getMyRegistrations(){return[];},async getMyOrders(){return[];},...overrides};
  return {store:createLiveStore(api),changeAuth(next){auth={...auth,...next};listener(auth);}};
}
const raw={id:'order1',uid:'buyer',eventId:'event1',vendorId:'stall1',pickupToken:'abcdefghijklmnopqrstuvwxyz123456',items:[{itemId:'food1',quantity:2,unitPriceJPY:450}],totalJPY:900,paymentStatus:'unpaid',status:'confirmed'};

test('checkout ID survives a new store session and server return populates the wallet',async()=>{
  const ids=[];const api={async placeFoodOrder(event,items,id){ids.push(id);return raw;}};
  for(let i=0;i<2;i++) {
    const {store}=fixture(api);await store.initialize();
    const result=await store.placeOrder('event1',[{menuId:'food1',qty:2,price:1}],{requestId:'retained-checkout-id'});
    assert.equal(result.total,900);assert.equal(store.getState().orders[0].id,'order1');
  }
  assert.deepEqual(ids,['retained-checkout-id','retained-checkout-id']);
});

test('menu refresh bypasses cache only when requested',async()=>{
  let calls=0;const {store}=fixture({async getMenu(){return[{id:'food1',eventId:'event1',stock:10-++calls,priceJPY:450}];}});
  await store.initialize();await store.loadEventData('event1');await store.loadEventData('event1');assert.equal(calls,1);
  await store.loadEventData('event1',{force:true});assert.equal(calls,2);assert.equal(store.getState().menu[0].stock,8);
});

test('scanned codes go to server lookup and manual collection must be explicit',async()=>{
  let payload,advance;const {store}=fixture({async lookupFoodOrder(data){payload=data;return{order:raw};},async advanceFoodOrder(...args){advance=args;return{ok:true};}});
  await store.initialize();
  await store.lookupFoodOrder(JSON.stringify({type:'food',id:raw.id,token:raw.pickupToken}));
  assert.deepEqual(payload,{orderId:raw.id,token:raw.pickupToken});
  await assert.rejects(store.advanceOrder(raw.id,'pickup'),/explicitly choose manual/);
  await store.advanceOrder(raw.id,'pickup',{token:raw.pickupToken});
  assert.equal(advance[2],raw.pickupToken);assert.equal(advance[4].manual,false);
  await store.lookupFoodOrder('BSS-123456789ABC',{manual:true});
  assert.deepEqual(payload,{code:'BSS-123456789ABC',manual:true});
  await store.advanceOrder(raw.id,'pickup',{manual:true});assert.equal(advance[2],undefined);assert.equal(advance[4].manual,true);
});

test('cash amount is forwarded and complimentary status is retained',async()=>{
  let amount;const {store}=fixture({async getMyOrders(){return[{...raw,paymentStatus:'complimentary'}];},async advanceFoodOrder(id,action,token,value){amount=value;}});
  await store.initialize();assert.equal(store.getState().orders[0].rawPaymentStatus,'complimentary');
  await store.advanceOrder(raw.id,'confirmPayment',{amountJPY:899});assert.equal(amount,899,'backend must reject incorrect cash rather than frontend changing it');
});

test('a delayed wallet response cannot leak into a signed-out session',async()=>{
  let release,delay=false;const {store,changeAuth}=fixture({getMyOrders(){return delay?new Promise(resolve=>release=resolve):Promise.resolve([]);}});
  await store.initialize();delay=true;const request=store.refreshOrders();changeAuth({user:null});release([raw]);await request;assert.deepEqual(store.getState().orders,[]);
});

test('food ticket parser rejects event tickets, malformed data and unintentional manual lookup',()=>{
  assert.throws(()=>parseFoodTicketCode('{broken'),/incomplete/);
  assert.throws(()=>parseFoodTicketCode(JSON.stringify({type:'event',id:'event1',token:raw.pickupToken})),/food pickup/);
  assert.throws(()=>parseFoodTicketCode('BSS-123456789ABC'),/manual lookup/);
  assert.throws(()=>parseFoodTicketCode('<script>',{manual:true}),/order number/);
  assert.deepEqual(parseFoodTicketCode(raw.pickupToken),{code:raw.pickupToken});
});

import test from 'node:test';
import assert from 'node:assert/strict';

const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
let moduleId=0;
async function setup(overrides={}) {
  const module=await import(`../public/js/events.js?food-ui-${++moduleId}`);
  const memory=new Map(),listeners=new Map(),calls=[],messages=[],shown=[];
  const s={isLive:true,loading:false,auth:{user:{uid:'alice',emailVerified:true}},profile:{id:'alice',name:'Alice',onboardingComplete:true,status:'approved'},events:[{id:'festival',slug:'festival',title:'Our gathering',date:'2099-10-27',time:'12:00',location:'Campus',startsAt:'2099-10-27T03:00:00Z',endsAt:'2099-10-27T08:00:00Z',foodClosesAt:'2099-10-27T07:00:00Z',foodEnabled:true,allowGuestFood:true,status:'published',capacity:100}],vendors:[{id:'v1',eventId:'festival',name:'The rice stall',location:'West courtyard',status:'published'},{id:'v2',eventId:'festival',name:'The tea stall',location:'East courtyard',status:'published'}],menu:[{id:'rice',eventId:'festival',vendorId:'v1',name:'Rice',price:500,stock:8,perPersonLimit:3,active:true,category:'Meals'},{id:'tea',eventId:'festival',vendorId:'v2',name:'Tea',price:200,stock:8,perPersonLimit:3,active:true,category:'Drinks'}],orders:[],tickets:[],dataErrors:{},...overrides};
  const prior={document:globalThis.document,location:globalThis.location,localStorage:globalThis.localStorage};
  const app={addEventListener(type,fn,options){listeners.set(type,fn);options?.signal?.addEventListener('abort',()=>{if(listeners.get(type)===fn)listeners.delete(type);});}};
  globalThis.document={getElementById(id){return id==='app'?app:null;},querySelector(){return null;}};
  globalThis.location={pathname:'/events/festival/food',search:'',hash:''};
  globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
  let modal=null;
  function parseButtons(html) {
    return [...html.matchAll(/<button\b([^>]*)>/g)].map(([,attrs])=>{
      const dataset={};for(const [,key,value] of attrs.matchAll(/data-([\w-]+)="([^"]*)"/g))dataset[key.replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=value;
      const button={dataset,disabled:/\sdisabled(?:\s|$|=)/.test(attrs),textContent:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}};
      return button;
    });
  }
  const ctx={store:{getState:()=>s,loadEventData:async(...args)=>{calls.push(['load',...args]);},refresh:async()=>{},placeOrder:async(...args)=>{calls.push(['order',...args]);return{id:'saved-order',eventId:'festival',status:'confirmed',paymentStatus:'due',items:[],total:500};}},esc:escape,money:n=>`¥${n}`,formatDate:d=>d,toast:message=>messages.push(message),render(){},navigate:route=>calls.push(['navigate',route]),closeModal(){modal=null;},showTicket:(ticket,type)=>shown.push({ticket,type}),modal(title,html,onMount){const buttons=parseButtons(html);modal={title,html,buttons};onMount?.({querySelectorAll:selector=>selector==='button'?buttons:buttons.filter(b=>b.dataset.modalEventAction)});}};
  const click=async(action,data={})=>{const button={disabled:false,dataset:{eventAction:action,...data}};await listeners.get('click')({target:{closest:()=>button}});};
  const modalClick=async(action,data={})=>{const button=modal.buttons.find(b=>b.dataset.modalEventAction===action&&Object.entries(data).every(([key,value])=>b.dataset[key]===String(value)));assert.ok(button,`modal action ${action} exists`);assert.equal(button.disabled,false,`modal action ${action} is enabled`);await button.listeners.click({target:button});};
  module.mountEvents(ctx);await new Promise(resolve=>setImmediate(resolve));
  return {module,ctx,s,memory,calls,messages,shown,click,modalClick,get modal(){return modal;},async reload(){const m=await import(`../public/js/events.js?food-ui-${++moduleId}`);this.module=m;m.mountEvents(ctx);await new Promise(resolve=>setImmediate(resolve));return m;},restore(){Object.assign(globalThis,prior);}};
}

test('food hub shows only open published food events and has a real ticket wallet link',async()=>{
  const f=await setup();try {
    f.s.events.push({...f.s.events[0],id:'closed',title:'Closed gathering',foodClosesAt:'2000-01-01T00:00:00Z'},{...f.s.events[0],id:'draft',title:'Draft gathering',status:'draft'},{...f.s.events[0],id:'no-food',title:'No food gathering',foodEnabled:false});
    const html=f.module.renderFoodHub(f.ctx);assert.match(html,/Our gathering/);assert.doesNotMatch(html,/Closed gathering|Draft gathering|No food gathering/);assert.match(html,/href="\/tickets"/);assert.match(html,/The rice stall/);
    f.s.events=[];assert.match(f.module.renderFoodHub(f.ctx),/no food reservations open right now/);
  }finally{f.restore();}
});

test('basket limits include previous orders and switching stalls requires explicit choice',async()=>{
  const f=await setup();try {
    f.s.orders=[{eventId:'festival',userId:'alice',status:'collected',items:[{menuId:'rice',qty:2}]}];
    await f.click('qty',{eventId:'festival',menuId:'rice',delta:'1'});await f.click('qty',{eventId:'festival',menuId:'rice',delta:'1'});
    assert.match(f.messages.at(-1),/per-person limit/);
    await f.click('qty',{eventId:'festival',menuId:'tea',delta:'1'});
    assert.equal(f.modal.title,'One stall, one food ticket.');
    assert.equal([...f.memory.values()].map(JSON.parse)[0].items[0][0],'rice');
    await f.modalClick('switch');const basket=[...f.memory.values()].map(JSON.parse)[0];assert.deepEqual(basket.items,[['tea',1]]);
  }finally{f.restore();}
});

test('saved baskets survive reload and are isolated between signed-in members and guests',async()=>{
  const f=await setup();try {
    await f.click('qty',{eventId:'festival',menuId:'rice',delta:'1'});
    f.s.auth.user={uid:'bob'};f.s.profile={id:'bob',onboardingComplete:true};
    assert.match(f.module.renderFood(f.ctx,'festival'),/Something good belongs here/);
    f.s.auth.user=null;f.s.profile=null;assert.match(f.module.renderFood(f.ctx,'festival'),/Something good belongs here/);
    f.s.auth.user={uid:'alice'};f.s.profile={id:'alice',onboardingComplete:true};await f.reload();
    const html=f.module.renderFood(f.ctx,'festival');assert.match(html,/Review & reserve/);assert.doesNotMatch(html,/Something good belongs here/);
  }finally{f.restore();}
});

test('lost checkout responses retry the same request across reload and cannot mutate a pending basket',async()=>{
  const f=await setup();try {
    const ids=[];let n=0;f.ctx.store.placeOrder=async(eventId,items,options)=>{ids.push(options.requestId);if(n++===0)throw Object.assign(new Error('Network connection lost'),{code:'functions/unavailable'});return{id:'one-order',eventId,status:'confirmed',paymentStatus:'due'};};
    await f.click('qty',{eventId:'festival',menuId:'rice',delta:'1'});await f.click('cart',{id:'festival'});await f.modalClick('checkout');
    assert.match(f.modal.html,/same reservation/);assert.match(f.modal.html,/Network connection lost/);
    await f.click('qty',{eventId:'festival',menuId:'rice',delta:'1'});assert.match(f.messages.at(-1),/pending reservation/);
    await f.reload();await f.click('cart',{id:'festival'});await f.modalClick('checkout');
    assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);assert.equal(f.shown[0].ticket.id,'one-order');assert.equal(f.memory.size,0);
  }finally{f.restore();}
});

test('closed food tables and insufficient live stock cannot be checked out',async()=>{
  const f=await setup();try {
    await f.click('qty',{eventId:'festival',menuId:'rice',delta:'1'});f.s.menu[0].stock=0;await f.click('cart',{id:'festival'});
    assert.match(f.modal.html,/no longer available in this quantity/);assert.equal(f.modal.buttons.find(b=>b.dataset.modalEventAction==='checkout').disabled,true);
    f.s.menu[0].stock=8;f.s.events[0].foodClosesAt='2000-01-01T00:00:00Z';await f.click('cart',{id:'festival'});
    assert.match(f.modal.html,/Food reservations are closed/);assert.equal(f.calls.filter(c=>c[0]==='order').length,0);
  }finally{f.restore();}
});

test('event-ticket prerequisite directs members to registration, and menu refresh forces a new read',async()=>{
  const f=await setup();try {
    f.s.events[0].allowGuestFood=false;await f.click('qty',{eventId:'festival',menuId:'rice',delta:'1'});await f.click('cart',{id:'festival'});
    assert.match(f.modal.html,/Reserve event entry first/);await f.modalClick('checkout');assert.equal(f.modal.title,'A place at the table.');assert.equal(f.calls.filter(c=>c[0]==='order').length,0);
    await f.click('retry-menu',{id:'festival'});assert.deepEqual(f.calls.at(-1),['load','festival',{force:true}]);
  }finally{f.restore();}
});

test('definitive server rejection unlocks basket editing without inventing a ticket',async()=>{
  const f=await setup();try {
    f.ctx.store.placeOrder=async()=>{throw Object.assign(new Error('Only one portion remains'),{code:'functions/resource-exhausted'});};
    await f.click('qty',{eventId:'festival',menuId:'rice',delta:'1'});await f.click('cart',{id:'festival'});await f.modalClick('checkout');
    assert.match(f.modal.html,/Only one portion remains/);assert.equal(f.shown.length,0);
    await f.click('qty',{eventId:'festival',menuId:'rice',delta:'-1'});assert.equal(f.memory.size,0);
  }finally{f.restore();}
});

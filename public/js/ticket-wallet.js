import {qrSvg} from './qr.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const list = value => Array.isArray(value) ? value : [];
const money = (ctx,value) => ctx.money ? ctx.money(Number(value) || 0) : `¥${(Number(value) || 0).toLocaleString('en-US')}`;
const owner = row => row?.uid || row?.userId;
const currentUser = state => state.auth?.user?.uid || '';
const own = (state,row) => !!currentUser(state) && owner(row) === currentUser(state);
const timestamp = value => {
  if (value == null || value === '') return NaN;
  if (typeof value === 'object' && (value.seconds != null || value._seconds != null)) return Number(value.seconds ?? value._seconds) * 1000;
  return typeof value === 'number' ? value : Date.parse(value);
};
const timeLabel = value => Number.isFinite(timestamp(value)) ? new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tokyo',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(timestamp(value))) + ' JST' : 'Time not available';
const payment = row => row.rawPaymentStatus || row.paymentStatus;
const isUnpaid = row => ['unpaid','due'].includes(payment(row));
const isPaid = row => ['paid','complimentary'].includes(payment(row));
const total = row => Number(row.totalJPY ?? row.total) || 0;
const lines = row => list(row.items).map(item=>({...item,quantity:Number(item.quantity ?? item.qty) || 0,unitPrice:Number(item.unitPriceJPY ?? item.price) || 0}));
const reference = row => row.orderNumber || `#${String(row.id || '').slice(-10).toUpperCase()}`;
const eventFor = (state,row) => list(state.events).find(event=>event.id===row.eventId);
const eventName = (state,row) => row.eventTitle || eventFor(state,row)?.title || 'Community gathering';
const vendorName = (state,row) => row.vendorName || list(state.vendors).find(vendor=>vendor.id===row.vendorId)?.name || 'Food stall';
const pickupLocation = (state,row) => row.pickupLocation || row.pickup || list(state.vendors).find(vendor=>vendor.id===row.vendorId)?.location || 'Ask the stall team';
let walletFilters={owner:'',kind:'food',period:'active',event:'all',vendor:'all'};
let mountedCleanup;
let ticketCleanup;
const pending = new Set();

/** This is display state only. The server authorizes every payment and redemption. */
export function foodTicketState(row, now=Date.now()) {
  const expired = row.status === 'expired' || row.cancelReason === 'reservation_expired' || (row.status === 'confirmed' && isUnpaid(row) && Number.isFinite(timestamp(row.expiresAt)) && timestamp(row.expiresAt) <= now);
  const status = expired ? 'expired' : ['confirmed','preparing','ready','collected','cancelled'].includes(row.status) ? row.status : 'unknown';
  const active = ['confirmed','preparing','ready'].includes(status);
  return {status,active,expired,canCancel:status==='confirmed' && (isUnpaid(row)||payment(row)==='complimentary'),canShowCode:active && !!(row.qrToken || row.pickupToken),payment:payment(row),paid:isPaid(row)};
}
export function foodTicketPayload(row) {
  const token=row.qrToken || row.pickupToken;
  if(!row?.id || !token) throw new Error('This saved order does not have a pickup code. Refresh your tickets or ask the stall team.');
  return JSON.stringify({type:'food',id:row.id,token});
}
export function walletRecords(state) {
  return {orders:list(state.orders).filter(row=>own(state,row)),tickets:list(state.tickets).filter(row=>own(state,row))};
}
function eventTicketActive(state,row,now=Date.now()) {
  const event=eventFor(state,row),ends=timestamp(event?.endsAt || row.eventEndsAt);
  return row.status==='confirmed' && !row.checkedIn && !row.checkedInAt && event?.status!=='cancelled' && !(Number.isFinite(ends)&&ends<=now);
}
const statusText = status => ({confirmed:'Reserved',preparing:'Preparing',ready:'Ready to collect',collected:'Collected',cancelled:'Cancelled',expired:'Reservation expired',checked_in:'Checked in',unknown:'Check with the stall'})[status] || String(status).replaceAll('_',' ');
function paymentText(row) {
  if(payment(row)==='complimentary') return 'Complimentary';
  if(payment(row)==='paid') return 'Cash received';
  if(['cancelled','expired'].includes(foodTicketState(row).status)) return 'No payment recorded';
  return 'Cash due at the stall';
}
function timeline(row) {
  const status=foodTicketState(row).status,steps=['confirmed','preparing','ready','collected'],index=steps.indexOf(status);
  if(index<0) return `<p class="tw-closed-note">${status==='expired'?'This unpaid reservation has expired. Place a new order if the stall is still accepting orders.':status==='cancelled'?'This order was cancelled. Its pickup code is no longer valid.':'The stall team can help with this order.'}</p>`;
  return `<ol class="tw-progress" aria-label="Food order progress">${steps.map((step,i)=>`<li class="${i<index?'is-done':i===index?'is-current':''}" ${i===index?'aria-current="step"':''}><span aria-hidden="true">${i<index?'✓':i+1}</span><b>${['Reserved','Preparing','Ready','Collected'][i]}</b></li>`).join('')}</ol>`;
}
function orderCard(ctx,state,row) {
  const view=foodTicketState(row),cancelledEvent=eventFor(state,row)?.status==='cancelled';
  return `<article class="tw-order-card" data-wallet-order="${escape(row.id)}"><div class="tw-card-heading"><div><p class="tw-eyebrow">${escape(vendorName(state,row))}</p><h2>${escape(reference(row))}</h2></div><span class="tw-status tw-status-${view.status}">${escape(statusText(view.status))}</span></div><p class="tw-event-name">${escape(eventName(state,row))}</p>${timeline(row)}<ul class="tw-order-lines">${lines(row).map(item=>`<li><span><b>${item.quantity} ×</b> ${escape(item.name)}</span><strong>${escape(money(ctx,item.quantity*item.unitPrice))}</strong></li>`).join('')}</ul><div class="tw-card-total"><span>${paymentText(row)}</span><strong>${escape(money(ctx,total(row)))}</strong></div><dl class="tw-pickup-meta"><div><dt>Collect at</dt><dd>${escape(pickupLocation(state,row))}</dd></div>${view.active&&isUnpaid(row)&&row.status==='confirmed'&&row.expiresAt?`<div><dt>Pay before</dt><dd>${escape(timeLabel(row.expiresAt))}</dd></div>`:''}</dl>${cancelledEvent?'<p class="tw-closed-note">This event was cancelled. Contact the stall team about your order.</p>':''}<div class="tw-card-actions"><button type="button" class="btn ${view.active?'btn-primary':'btn-secondary'}" data-wallet-action="food-ticket" data-id="${escape(row.id)}">${view.canShowCode&&!cancelledEvent?'Open pickup ticket ↗':'Order details ↗'}</button>${view.canCancel?`<button type="button" class="tw-text-button" data-wallet-action="cancel-order" data-id="${escape(row.id)}" ${pending.has(row.id)?'disabled':''}>Cancel reservation</button>`:''}</div></article>`;
}
function eventCard(ctx,state,row) {
  const event=eventFor(state,row),active=eventTicketActive(state,row),checked=row.status==='checked_in'||row.checkedIn||row.checkedInAt;
  const label=checked?'Checked in':row.status==='cancelled'?'Cancelled':event?.status==='cancelled'?'Event cancelled':active?'Place reserved':'Past ticket';
  return `<article class="tw-event-card"><div class="tw-card-heading"><p class="tw-eyebrow">EVENT ENTRY / প্রবেশপত্র</p><span class="tw-status">${label}</span></div><h2>${escape(eventName(state,row))}</h2><p>${escape(event?.startsAt?timeLabel(event.startsAt):event?.date || 'Event details saved with your reservation')}</p><p>${escape(event?.location || event?.venue || '')}</p><div class="tw-ticket-reference">Reference <span>${escape(row.id)}</span></div><div class="tw-card-actions">${active?`<button class="btn btn-primary" type="button" data-wallet-action="event-ticket" data-id="${escape(row.id)}">Open entry ticket ↗</button><button class="tw-text-button" type="button" data-wallet-action="cancel-ticket" data-id="${escape(row.id)}" ${pending.has(row.id)?'disabled':''}>Cancel my place</button>`:'<span class="tw-closed-note">This entry ticket cannot be used again.</span>'}</div></article>`;
}
function emptyWallet(kind,period,filtered) {
  return `<div class="tw-empty"><span aria-hidden="true">✳</span><h2>${filtered?'No matching tickets.':period==='past'?'Your memories will live here.':kind==='food'?'Your next taste of home awaits.':'Make room for your next gathering.'}</h2><p>${filtered?'Choose another gathering or stall to see your tickets.':kind==='food'?'Food orders appear here only after your reservation has been saved.':period==='past'?'Collected orders and past tickets will appear here.':'Reserve a place at a gathering to get your entry ticket.'}</p><a class="btn btn-secondary" href="/${kind==='food'?'food':'events'}">${kind==='food'?'Explore the food stalls':'Find a gathering'} ↗</a></div>`;
}
export function renderTicketWallet(ctx) {
  const state=ctx.store.getState(),uid=currentUser(state);
  if(!uid) return `<section class="page-container ticket-wallet"><div class="tw-signed-out"><p class="tw-eyebrow">YOUR TICKETS / আপনার টিকিট</p><span aria-hidden="true">✳</span><h1>A little wallet.<br><em>Many good moments.</em></h1><p>Sign in to find your food pickup tickets, follow your orders, and keep your event entry passes together.</p><div class="tw-card-actions"><a class="btn btn-primary" href="/signin">Sign in ↗</a><a class="btn btn-secondary" href="/food">Explore food stalls</a></div></div></section>`;
  if(walletFilters.owner!==uid)walletFilters={owner:uid,kind:'food',period:'active',event:'all',vendor:'all'};
  const rows=walletRecords(state),active=rows.orders.filter(row=>foodTicketState(row).active),ready=active.filter(row=>row.status==='ready');
  const allRows=walletFilters.kind==='food'?rows.orders:rows.tickets,eventIds=[...new Set(allRows.map(row=>row.eventId))],vendorIds=[...new Set(rows.orders.filter(row=>walletFilters.event==='all'||row.eventId===walletFilters.event).map(row=>row.vendorId))];
  if(walletFilters.event!=='all'&&!eventIds.includes(walletFilters.event))walletFilters.event='all';
  if(walletFilters.vendor!=='all'&&!vendorIds.includes(walletFilters.vendor))walletFilters.vendor='all';
  const selected=allRows.filter(row=>walletFilters.event==='all'||row.eventId===walletFilters.event).filter(row=>walletFilters.kind==='event'||walletFilters.vendor==='all'||row.vendorId===walletFilters.vendor).filter(row=>(walletFilters.kind==='food'?foodTicketState(row).active:eventTicketActive(state,row))===(walletFilters.period==='active')).sort((a,b)=>(timestamp(b.createdAt)||0)-(timestamp(a.createdAt)||0));
  const errors=[state.dataErrors?.orders,state.dataErrors?.tickets].filter(Boolean);
  return `<section class="page-container ticket-wallet" data-ticket-wallet><header class="tw-page-header"><div><p class="tw-eyebrow">YOUR TICKETS / আপনার টিকিট</p><h1>Good food.<br><em>Great company. All here.</em></h1><p>Your stall orders and event passes, in one little wallet.</p></div><div class="tw-header-stamp" aria-hidden="true"><span>TIU BSS</span><b>টিকিট</b><span>KEEP GOOD COMPANY</span></div></header><div class="tw-page-links"><a href="/food">Order from a stall ↗</a><a href="/events">Find a gathering ↗</a><a href="/profile">My dashboard ↗</a><button type="button" data-wallet-action="refresh" ${state.loading?'disabled':''}>${state.loading?'Refreshing…':'↻ Refresh my tickets'}</button></div><div class="tw-stats"><div><strong>${active.length}</strong><span>Active food tickets</span></div><div><strong>${ready.length}</strong><span>Ready to collect</span></div><div><strong>${rows.tickets.filter(row=>eventTicketActive(state,row)).length}</strong><span>Upcoming entry passes</span></div></div>${errors.length?`<div class="tw-alert" role="alert"><strong>We couldn’t refresh all your tickets.</strong><p>${errors.map(escape).join(' ')}</p><span>Shown tickets are the last saved details. Refresh before collecting.</span></div>`:''}<div class="tw-controls"><div class="tw-kind-tabs" role="group" aria-label="Ticket type">${[['food','Food pickup'],['event','Event entry']].map(([kind,label])=>`<button type="button" data-wallet-action="kind" data-value="${kind}" aria-pressed="${walletFilters.kind===kind}">${label}<span>${kind==='food'?rows.orders.length:rows.tickets.length}</span></button>`).join('')}</div><div class="tw-period-tabs" role="group" aria-label="Ticket period">${[['active','Active'],['past','Past & cancelled']].map(([period,label])=>`<button type="button" data-wallet-action="period" data-value="${period}" aria-pressed="${walletFilters.period===period}">${label}</button>`).join('')}</div></div><div class="tw-selects"><label>Gathering<select data-wallet-filter="event"><option value="all">All gatherings</option>${eventIds.map(id=>`<option value="${escape(id)}" ${walletFilters.event===id?'selected':''}>${escape(eventName(state,allRows.find(row=>row.eventId===id)))}</option>`).join('')}</select></label>${walletFilters.kind==='food'?`<label>Stall<select data-wallet-filter="vendor"><option value="all">All stalls</option>${vendorIds.map(id=>`<option value="${escape(id)}" ${walletFilters.vendor===id?'selected':''}>${escape(vendorName(state,rows.orders.find(row=>row.vendorId===id)))}</option>`).join('')}</select></label>`:''}<p role="status">${selected.length} ${selected.length===1?'ticket':'tickets'} · Times in Japan time</p></div><div class="tw-ticket-grid">${selected.length?selected.map(row=>walletFilters.kind==='food'?orderCard(ctx,state,row):eventCard(ctx,state,row)).join(''):state.loading?'<div class="tw-empty" role="status"><h2>Finding your tickets…</h2></div>':emptyWallet(walletFilters.kind,walletFilters.period,walletFilters.event!=='all'||walletFilters.vendor!=='all')}</div><div class="tw-wallet-note"><span aria-hidden="true">✽</span><p>Food pickup and event admission use different tickets. Keep your pickup code private and show it only to your stall team. Orders refresh while this wallet is open.</p></div></section>`;
}
function latestOwnOrder(ctx,id,fallback) {
  const state=ctx.store.getState();
  if(!own(state,fallback))return null;
  return walletRecords(state).orders.find(row=>row.id===id) || fallback;
}
function ticketInner(ctx,state,row) {
  const view=foodTicketState(row),cancelledEvent=eventFor(state,row)?.status==='cancelled',code=view.canShowCode&&!cancelledEvent;
  return `<article class="tw-food-ticket" data-food-ticket><div class="tw-ticket-brand"><strong>TIU BSS</strong><span>FOOD PICKUP / খাবার টিকিট</span></div><div class="tw-ticket-heading"><p>${escape(eventName(state,row))}</p><h3>${escape(vendorName(state,row))}</h3><strong>${escape(reference(row))}</strong><span class="tw-status tw-status-${view.status}">${escape(statusText(view.status))}</span></div>${code?`<div class="tw-ticket-qr">${qrSvg(foodTicketPayload(row))}<strong>Show this code at your stall</strong><span>One order · one collection</span></div>`:`<div class="tw-ticket-inactive"><span aria-hidden="true">${view.status==='collected'?'✓':'—'}</span><strong>${cancelledEvent?'Event cancelled':statusText(view.status)}</strong><p>${view.status==='collected'?'This order has already been handed over.':cancelledEvent?'Please contact your stall team about this order.':'No active pickup code is available for this order.'}</p></div>`}<div class="tw-ticket-details"><ul class="tw-order-lines">${lines(row).map(item=>`<li><span>${item.quantity} × ${escape(item.name)}</span><strong>${escape(money(ctx,item.quantity*item.unitPrice))}</strong></li>`).join('')}</ul><div class="tw-card-total"><span>${paymentText(row)}</span><strong>${escape(money(ctx,total(row)))}</strong></div><dl class="tw-pickup-meta"><div><dt>Collect at</dt><dd>${escape(pickupLocation(state,row))}</dd></div>${view.active&&isUnpaid(row)&&row.status==='confirmed'&&row.expiresAt?`<div><dt>Pay before</dt><dd>${escape(timeLabel(row.expiresAt))}</dd></div>`:''}${row.collectedAt?`<div><dt>Collected</dt><dd>${escape(timeLabel(row.collectedAt))}</dd></div>`:''}<div><dt>Order reference</dt><dd class="tw-full-reference">${escape(row.id)}</dd></div></dl></div><p class="tw-ticket-notice">${view.active?isUnpaid(row)?'Pay the exact amount in cash at this stall. Payment and pickup are confirmed by staff.':'Payment is recorded. Staff will check this ticket before handing over your order.':'This is a record of your order, not a valid pickup pass.'} Food tickets do not include event admission.</p>${code?'<p class="tw-private-note">Keep this code private. A saved copy does not update automatically; the stall checks the latest order status.</p>':''}</article>`;
}
export function foodTicketDocument(ctx,row,now=Date.now()) {
  const state=ctx.store.getState();
  if(!own(state,row))throw new Error('Sign in to the account that owns this food ticket.');
  if(!foodTicketState(row,now).canShowCode||eventFor(state,row)?.status==='cancelled')throw new Error('Only an active pickup ticket can be saved.');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(reference(row))} — TIU BSS food ticket</title><style>body{margin:0;padding:24px;background:#f7f0df;color:#214b39;font:15px/1.6 Arial,sans-serif}.tw-food-ticket{max-width:430px;margin:auto;border:1px solid #c8b999;background:#fffdf6}.tw-ticket-brand{background:#214b39;color:#fff9e9;display:flex;justify-content:space-between;gap:20px;padding:16px;font-size:11px}.tw-ticket-heading{text-align:center;padding:20px 24px 10px}.tw-ticket-heading p{font-size:12px}.tw-ticket-heading h3{font:30px Georgia,serif;margin:8px 0}.tw-ticket-heading>strong{display:block;font-size:22px}.tw-status{display:inline-block;font-size:11px;padding:3px 8px;background:#ede8d3;margin:12px 0}.tw-ticket-qr{text-align:center;border-bottom:1px dashed #c8b999;padding:0 20px 20px}.tw-ticket-qr svg{display:block;margin:auto;width:240px;height:240px}.tw-ticket-qr>strong,.tw-ticket-qr>span{display:block;font-size:12px}.tw-ticket-details{padding:12px 24px}.tw-order-lines{list-style:none;padding:0}.tw-order-lines li,.tw-card-total{display:flex;justify-content:space-between;gap:20px;padding:10px 0;border-bottom:1px solid #e0dacb}.tw-pickup-meta{font-size:12px}.tw-pickup-meta>div{margin-top:12px}.tw-pickup-meta dt{color:#72776a}.tw-pickup-meta dd{margin:0;overflow-wrap:anywhere}.tw-ticket-notice,.tw-private-note{font-size:11px;padding:0 24px 12px}.tw-save-note{text-align:center;font-size:10px;color:#5c6b60}@media print{body{padding:0;background:#fff}.tw-food-ticket{break-inside:avoid}}</style></head><body>${ticketInner(ctx,state,row)}<p class="tw-save-note">Saved ${escape(timeLabel(now))}. Check your live ticket wallet for current status.</p></body></html>`;
}
function explain(ctx,error) {return ctx.auth?.friendlyError?.(error)||error?.message||'Could not refresh your tickets. Please try again.';}
const refreshWallet=ctx=>typeof ctx.store.refreshOrders==='function'?ctx.store.refreshOrders():ctx.store.refresh();
function saveDocument(html,row) {
  const blob=new Blob([html],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`TIU-BSS-food-ticket-${String(row.orderNumber||row.id).replace(/[^a-z0-9-]/gi,'').slice(0,80)}.html`;
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function showFoodTicket(ctx,initialOrder) {
  const state=ctx.store.getState();
  if(!own(state,initialOrder)){ctx.toast('Sign in to the account that owns this food ticket.');return;}
  ticketCleanup?.();
  ctx.modal('Your food pickup ticket',`<div data-food-ticket-view>${ticketInner(ctx,state,initialOrder)}</div><p class="tw-modal-refresh-note" data-ticket-refresh-note role="status"></p><div class="tw-modal-actions"><button class="btn btn-primary" type="button" data-food-ticket-action="print">Print ticket</button><button class="btn btn-secondary" type="button" data-food-ticket-action="download">Save ticket</button><button class="btn btn-secondary" type="button" data-food-ticket-action="copy">Copy pickup code</button><button class="tw-text-button" type="button" data-food-ticket-action="refresh">↻ Refresh status</button></div><label class="tw-copy-fallback" hidden>Copy this private pickup code<textarea readonly rows="3"></textarea></label><a class="tw-wallet-link" href="/tickets">Back to my ticket wallet ↗</a>`,root=>{
    const view=root.querySelector('[data-food-ticket-view]'),note=root.querySelector('[data-ticket-refresh-note]');
    let stopped=false,busy=false,lastFingerprint='',lastOrder=initialOrder;
    const controller=new AbortController();
    const paint=()=>{
      if(stopped||!view.isConnected)return;
      const current=latestOwnOrder(ctx,initialOrder.id,lastOrder);
      if(!current){cleanup();ctx.closeModal();return;}
      lastOrder=current;
      const state=ctx.store.getState(),currentState=foodTicketState(current),eventCancelled=eventFor(state,current)?.status==='cancelled';
      const fingerprint=JSON.stringify([current,state.dataErrors?.orders,currentState.status,eventCancelled]);
      if(fingerprint!==lastFingerprint){view.innerHTML=ticketInner(ctx,state,current);lastFingerprint=fingerprint;}
      const canShow=currentState.canShowCode&&!eventCancelled;
      for(const action of ['copy','download','print'])root.querySelector(`[data-food-ticket-action="${action}"]`).disabled=!canShow;
      if(!canShow){const fallback=root.querySelector('.tw-copy-fallback');fallback.hidden=true;fallback.querySelector('textarea').value='';}
      if(state.dataErrors?.orders)note.textContent=`Last saved details shown. ${state.dataErrors.orders}`;
    };
    const refresh=async()=>{if(stopped||busy||document.hidden)return;busy=true;note.textContent='Checking your latest order status…';try{await refreshWallet(ctx);if(!stopped)note.textContent=ctx.store.getState().dataErrors?.orders||'Order status refreshed.';}catch(error){if(!stopped)note.textContent=explain(ctx,error);}finally{busy=false;paint();}};
    const unsubscribe=ctx.store.subscribe?.(paint);
    const timer=setInterval(()=>{if(!view.isConnected){cleanup();return;}paint();if(!document.hidden)void refresh();},20000);
    const observer=new MutationObserver(()=>{if(!view.isConnected)cleanup();});observer.observe(root,{childList:true});
    function cleanup(){if(stopped)return;stopped=true;clearInterval(timer);controller.abort();unsubscribe?.();observer.disconnect();if(ticketCleanup===cleanup)ticketCleanup=null;}
    ticketCleanup=cleanup;
    root.addEventListener('click',async event=>{
      const button=event.target.closest('[data-food-ticket-action]');if(!button||button.disabled||stopped)return;
      const action=button.dataset.foodTicketAction;
      if(action==='refresh'){await refresh();return;}
      paint();const row=latestOwnOrder(ctx,initialOrder.id,lastOrder);if(!row||!foodTicketState(row).canShowCode||eventFor(ctx.store.getState(),row)?.status==='cancelled'){ctx.toast('This order no longer has an active pickup ticket.');return;}
      if(action==='print'){window.print();return;}
      if(action==='download'){try{saveDocument(foodTicketDocument(ctx,row),row);ctx.toast('Food ticket saved. Check the wallet for the latest status.');}catch(error){ctx.toast(explain(ctx,error));}return;}
      if(action==='copy'){const payload=foodTicketPayload(row);try{await navigator.clipboard.writeText(payload);ctx.toast('Private pickup code copied. Share it only with stall staff.');}catch{const fallback=root.querySelector('.tw-copy-fallback');fallback.hidden=false;const input=fallback.querySelector('textarea');input.value=payload;input.focus();input.select();}}
    },{signal:controller.signal});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();},{signal:controller.signal});
    paint();
    void refresh();
  });
}
function confirmCancellation(ctx,row,kind) {
  const food=kind==='order';
  ctx.modal(food?'Cancel this food reservation?':'Cancel your event place?',`<p>${food?'Your reserved portions will return to the stall. Once cancelled, this pickup ticket cannot be used.':'Your place will return to the gathering. This event entry ticket will no longer be valid.'}</p><p class="tw-cancel-summary">${escape(food?reference(row):row.eventTitle||row.id)}</p><p class="tw-form-error" role="alert" data-wallet-cancel-error></p><div class="tw-modal-actions"><button class="btn btn-secondary" type="button" data-wallet-cancel="keep">Keep my ${food?'order':'place'}</button><button class="btn btn-danger" type="button" data-wallet-cancel="confirm">Confirm cancellation</button></div>`,root=>{
    root.querySelector('[data-wallet-cancel="keep"]').onclick=()=>ctx.closeModal();
    root.querySelector('[data-wallet-cancel="confirm"]').onclick=async()=>{
      if(pending.has(row.id))return;
      const current=ctx.store.getState();if(!own(current,row)){ctx.closeModal();ctx.toast('Please sign in again.');return;}
      pending.add(row.id);root.querySelectorAll('button').forEach(button=>button.disabled=true);
      try{await (food?ctx.store.cancelOrder(row.id):ctx.store.cancelTicket(row.id));ctx.closeModal();ctx.toast(food?'Food reservation cancelled.':'Your event place has been cancelled.');}
      catch(error){root.querySelector('[data-wallet-cancel-error]').textContent=explain(ctx,error);root.querySelectorAll('button').forEach(button=>button.disabled=false);}
      finally{pending.delete(row.id);ctx.render();}
    };
  });
}
export function mountTicketWallet(ctx) {
  mountedCleanup?.();
  const root=document.querySelector('[data-ticket-wallet]');
  if(!root)return ()=>{};
  const controller=new AbortController();let stopped=false,busy=false;
  const refresh=async()=>{if(stopped||busy||document.hidden)return;busy=true;try{await refreshWallet(ctx);}catch(error){ctx.toast(explain(ctx,error));}finally{busy=false;}};
  root.addEventListener('click',async event=>{
    const button=event.target.closest('[data-wallet-action]');if(!button||button.disabled)return;
    const action=button.dataset.walletAction,id=button.dataset.id;
    if(action==='kind'){walletFilters.kind=button.dataset.value;walletFilters.event='all';walletFilters.vendor='all';ctx.render();return;}
    if(action==='period'){walletFilters.period=button.dataset.value;ctx.render();return;}
    if(action==='refresh'){await refresh();return;}
    const state=ctx.store.getState(),rows=walletRecords(state),row=(action==='event-ticket'||action==='cancel-ticket'?rows.tickets:rows.orders).find(row=>row.id===id);
    if(!row){ctx.toast('That ticket is not available in your account. Refresh your wallet.');return;}
    if(action==='food-ticket')showFoodTicket(ctx,row);
    if(action==='event-ticket'){if(eventTicketActive(state,row))ctx.showTicket(row,'event');else ctx.toast('This entry ticket is no longer active.');}
    if(action==='cancel-order'){if(foodTicketState(row).canCancel)confirmCancellation(ctx,row,'order');else ctx.toast('This order can no longer be cancelled. Please speak with your stall team.');}
    if(action==='cancel-ticket'&&eventTicketActive(state,row))confirmCancellation(ctx,row,'event');
  },{signal:controller.signal});
  root.addEventListener('change',event=>{const select=event.target.closest('[data-wallet-filter]');if(!select)return;walletFilters[select.dataset.walletFilter]=select.value;if(select.dataset.walletFilter==='event')walletFilters.vendor='all';ctx.render();},{signal:controller.signal});
  const timer=setInterval(()=>{if(!root.isConnected){cleanup();return;}if(!document.hidden&&!document.querySelector('[role="dialog"]')&&!document.activeElement?.closest('[data-ticket-wallet] select,[data-ticket-wallet] input,[data-ticket-wallet] textarea'))void refresh();},20000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!document.querySelector('[role="dialog"]'))void refresh();},{signal:controller.signal});
  function cleanup(){if(stopped)return;stopped=true;controller.abort();clearInterval(timer);if(mountedCleanup===cleanup)mountedCleanup=null;}
  mountedCleanup=cleanup;return cleanup;
}

/** The digital mela: three illustrated stalls connected by a little rickshaw ride. */
const PASSPORT_KEY='tiu-bss-mela-passport-v1';
const STALLS=[
 {id:'food',bn:'খাবার ঘর',title:'The food table',tag:'A little spice. A lot of home.',image:'assets/mela-stall-food-v5.webp',stamp:'স্বাদ',colour:'green'},
 {id:'art',bn:'রঙের দোকান',title:'The paint shop',tag:'Make something only you could.',image:'assets/mela-stall-art-v5.webp',stamp:'রং',colour:'rose'},
 {id:'adda',bn:'আড্ডার আসর',title:'The adda corner',tag:'Pull up a chair. Stay a little.',image:'assets/mela-stall-adda-v5.webp',stamp:'গল্প',colour:'gold'}
];
let selected='art';
function readVisits(){try{const value=JSON.parse(localStorage.getItem(PASSPORT_KEY)||'[]');return Array.isArray(value)?[...new Set(value.filter(v=>STALLS.some(s=>s.id===v)))]:[];}catch{return [];}}
const txDefault=en=>en;

function stallPanel(ctx,id){
 const {store,esc,icon}=ctx,s=store.getState();
 if(id==='food'){
  const events=s.events.filter(e=>e.status==='published'&&e.foodEnabled);
  return `<div class="mela-detail-copy"><p class="mela-overline">01 / খাবার ঘর</p><h3 id="mela-detail-title">Follow the smell of home.</h3><p>Fuchka, biryani, a cup of cha. Pick a gathering, browse its food table, and keep your pickup ticket handy.</p><small>Event menus · Cash due at pickup · Separate food ticket</small></div><div class="mela-detail-actions">${events.length?`<label for="mela-food-event">Which gathering are you joining?</label><select id="mela-food-event" data-mela-food-event>${events.map(e=>`<option value="${esc(e.slug)}">${esc(e.title)}</option>`).join('')}</select><a class="btn mela-primary" data-mela-food-link href="#/events/${esc(events[0].slug)}/food">Explore this food table ${icon('arrowUp')}</a>`:`<p>No food counters are open yet.</p><a class="btn mela-primary" href="#/events">Explore gatherings ${icon('arrowUp')}</a>`}</div>`;
 }
 if(id==='art')return `<div class="mela-detail-copy"><p class="mela-overline">02 / রঙের দোকান</p><h3 id="mela-detail-title">Take a little colour home.</h3><p>Your words, our painted roots. Make a digital postcard with rickshaws, folk birds, and flowers. Pick a palette, write from the heart, and download it.</p><small>Live art maker · Bangla & English · Downloadable PNG</small></div><div class="mela-detail-actions"><div class="mela-paint-dabs" aria-hidden="true"><i></i><i></i><i></i><i></i></div><a class="btn mela-primary" href="#/art-studio">Make your own artwork ${icon('arrowUp')}</a><a class="mela-small-link" href="#/gallery">Wander through the art wall ↗</a></div>`;
 return `<div class="mela-detail-copy"><p class="mela-overline">03 / আড্ডার আসর</p><h3 id="mela-detail-title">The best part is who you meet.</h3><p>Introduce yourself, leave a question, or share one small thing that made your day. Our adda wall has room for every new voice.</p><small>Introductions · Questions · Little moments</small></div><div class="mela-detail-actions"><span class="mela-hello" lang="bn">চলুন, গল্প করি।</span><a class="btn mela-primary" href="#/community?wall=1">Pull up a chair ${icon('arrowUp')}</a><a class="mela-small-link" href="#/join">New here? Make a profile ↗</a></div>`;
}

function passport(visits){return `<div class="mela-passport-title"><span>YOUR LITTLE MELA PASS</span><strong>${visits.length===3?'A full pocket of memories.':`${visits.length} of 3 little stops`}</strong><small>Tap a stall to collect its keepsake.</small></div><div class="mela-stamps">${STALLS.map(s=>`<span class="mela-stamp ${visits.includes(s.id)?'is-stamped':''}" data-keepsake="${s.id}" aria-label="${s.title}: ${visits.includes(s.id)?'visited':'not visited'}"><b lang="bn">${s.stamp}</b><small>${s.id==='food'?'TASTE':s.id==='art'?'COLOUR':'STORIES'}</small>${visits.includes(s.id)?'<i aria-hidden="true">✓</i>':''}</span>`).join('')}</div><p class="mela-passport-note">${visits.length===3?'All three stamps are yours. Make a postcard to remember your little visit.':'A taste, a colour, a conversation. Every stop brings something different.'}<small>Saved in this browser.</small></p>`;}

export function renderMela(ctx,tx=txDefault,compact=false){
 const visits=readVisits(),index=STALLS.findIndex(s=>s.id===selected);
 return `<section class="mela-section ${compact?'mela-home':'mela-page'}" id="digital-mela" data-mela style="--mela-stop:${index}" aria-labelledby="mela-title">
  <div class="mela-section-top"><span>${tx('A LITTLE MELA, WHEREVER YOU ARE','যেখানেই থাকুন, একটু মেলা হোক')}</span><span lang="bn">আসুন, একসাথে রঙিন হই।</span></div>
  <header class="mela-heading" data-reveal><div><p class="mela-overline">THE TIU BSS DIGITAL MELA / আমাদের মেলা</p><${compact?'h2':'h1'} id="mela-title">${tx('Come for the colour.<br><em>Stay for the adda.</em>','রঙের টানে আসুন।<br><em>আড্ডায় থেকে যান।</em>')}</${compact?'h2':'h1'}></div><div class="mela-heading-side"><p>${tx('Three little stalls. A rickshaw ride. Something to taste, something to make, and someone to say hello to.','তিনটি ছোট্ট স্টল। একটি রিকশা সফর। ঘরের স্বাদ, নিজের শিল্প আর নতুন মানুষের সাথে পরিচয়।')}</p><button type="button" class="mela-ride-next" data-mela-next>${tx('Hop on. Next stop?','চলুন, পরের স্টলে!')} ${ctx.icon('arrow')}</button></div></header>
  <div class="mela-street-wrap"><div class="mela-light-string" aria-hidden="true">${Array.from({length:15},(_,i)=>`<i style="--bulb:${i}"></i>`).join('')}</div>
   <div class="mela-street" role="group" aria-label="Visit a mela stall">${STALLS.map((s,i)=>`<button type="button" class="mela-stall mela-${s.colour} ${s.id===selected?'is-current':''}" data-stall-id="${s.id}" aria-pressed="${s.id===selected}" aria-controls="mela-stall-details"><span class="mela-stall-art"><img src="${s.image}" width="1280" height="1280" alt="${s.title}: an original hand-painted Bangladeshi festival stall" loading="lazy"><span class="mela-painted-name" lang="bn">${s.bn}</span><span class="mela-stall-open">${s.id===selected?'YOU’RE HERE':'STEP INSIDE'} ↗</span></span><span class="mela-stall-caption"><small>0${i+1} / ${s.id==='food'?'TASTE':s.id==='art'?'CREATE':'CONNECT'}</small><strong>${s.title}</strong><span>${s.tag}</span></span></button>`).join('')}</div>
   <div class="mela-ride-track"><div class="mela-road" aria-hidden="true"></div><div class="mela-rickshaw-marker" aria-hidden="true"><img src="assets/rickshaw-cutout-v4.webp" width="1536" height="1024" alt=""><span>টিং টিং!</span></div><div class="mela-route-stops">${STALLS.map((s,i)=>`<button type="button" data-mela-stop="${s.id}" class="${s.id===selected?'active':''}" aria-label="Ride to ${s.title}"><i aria-hidden="true"></i><span>${s.id==='food'?'Food':s.id==='art'?'Art':'Adda'}</span></button>`).join('')}</div><span class="mela-route-origin" aria-hidden="true">DHAKA ROOTS <b>↔</b> TOKYO DREAMS</span></div>
  </div>
  <div class="mela-detail" id="mela-stall-details" aria-labelledby="mela-detail-title" data-current-stall="${selected}" aria-live="polite">${stallPanel(ctx,selected)}</div>
  <div class="mela-passport" data-mela-passport>${passport(visits)}</div>
  ${compact?`<div class="mela-home-link"><span>Celebration is better when everyone has a place.</span><a href="#/mela">Explore the digital mela ${ctx.icon('arrowUp')}</a></div>`:`<div class="mela-contribute"><div><p class="mela-overline">THERE’S ALWAYS ROOM FOR ONE MORE</p><h2>Bring your colours.<br><em>We’ll make room.</em></h2><p>Have an idea for a gathering, a helping hand to offer, or a story to share?</p></div><div><a class="btn mela-primary" href="#/volunteer">Help make it happen ${ctx.icon('arrowUp')}</a><a class="mela-small-link" href="#/events">Find the next gathering ↗</a></div></div>`}
 </section>`;
}

export function mountMela(ctx){
 document.querySelectorAll('[data-mela]').forEach(root=>{
  const mountFood=()=>{const select=root.querySelector('[data-mela-food-event]'),link=root.querySelector('[data-mela-food-link]');if(select&&link)select.addEventListener('change',()=>{link.href=`#/events/${encodeURIComponent(select.value)}/food`;});};
  const visit=(id,scroll=false)=>{
   const index=STALLS.findIndex(s=>s.id===id);if(index<0)return;selected=id;
   root.style.setProperty('--mela-stop',String(index));
   const visits=readVisits();if(!visits.includes(id))visits.push(id);
   let saved=true;try{localStorage.setItem(PASSPORT_KEY,JSON.stringify(visits));}catch{saved=false;}
   root.querySelectorAll('[data-stall-id]').forEach(button=>{const active=button.dataset.stallId===id;button.classList.toggle('is-current',active);button.setAttribute('aria-pressed',String(active));button.querySelector('.mela-stall-open').textContent=(active?'YOU’RE HERE':'STEP INSIDE')+' ↗';});
   root.querySelectorAll('[data-mela-stop]').forEach(button=>button.classList.toggle('active',button.dataset.melaStop===id));
   const details=root.querySelector('.mela-detail');details.dataset.currentStall=id;details.innerHTML=stallPanel(ctx,id);mountFood();
   const pass=root.querySelector('[data-mela-passport]');pass.innerHTML=passport(visits);if(!saved)pass.querySelector('.mela-passport-note small').textContent='This browser could not save the keepsake.';
   if(scroll){const button=root.querySelector(`[data-stall-id="${id}"]`);button?.scrollIntoView?.({block:'nearest',inline:'center',behavior:document.documentElement.dataset.motion==='on'?'smooth':'auto'});}
  };
  root.querySelectorAll('[data-stall-id]').forEach(button=>button.addEventListener('click',()=>visit(button.dataset.stallId)));
  root.querySelectorAll('[data-mela-stop]').forEach(button=>button.addEventListener('click',()=>visit(button.dataset.melaStop,true)));
  root.querySelector('[data-mela-next]')?.addEventListener('click',()=>{visit(STALLS[(STALLS.findIndex(s=>s.id===selected)+1)%STALLS.length].id,true);});
  mountFood();
 });
}

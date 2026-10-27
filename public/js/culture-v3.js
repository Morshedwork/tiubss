/** A painted cultural journey, with accessible, selectable landmark stories. */
import {CULTURE_STORIES} from './culture-data.js';
const stories=ctx=>ctx.store?.getState().catalogManaged?(ctx.store.getState().culture||[]):CULTURE_STORIES;
const image='assets/rickshaw-cutout-v4.webp';
const stamps={language:'assets/landmark-dhaka-v4.svg',parliament:'assets/landmark-parliament-v4.svg',tokyo:'assets/landmark-tokyo-v4.svg',sakura:'assets/sakura-folk-v3.svg'};
const tr=(tx,en,bn)=>tx?tx(en,bn):en;

function panel(place,ctx){
 const {esc,icon}=ctx;
 return `<div class="bridge-panel-art" aria-hidden="true"><img src="${esc(place.image||stamps[place.id]||image)}" alt="" width="180" height="200"></div><div class="bridge-panel-copy"><span class="bridge-location">${esc(place.place)}</span><span class="bridge-bangla" lang="bn">${esc(place.bn)}</span><h3 id="bridge-story-title">${esc(place.title)}</h3><p>${esc(place.body)}</p><blockquote>${esc(place.invitation)}</blockquote><a class="rk-underlined" href="${esc(place.href)}">${esc(place.action)} ${icon('arrowUp')}</a><a class="bridge-source" href="${esc(place.source)}" target="_blank" rel="noopener noreferrer">Landmark reference · ${esc(place.sourceLabel)} ↗</a></div>`;
}

export function renderCultureTrail(ctx,tx){
 const places=stories(ctx),{esc}=ctx;if(!places.length)return '';
 return `<section class="bridge-section" id="culture-trail" aria-labelledby="bridge-title"><header class="bridge-heading" data-reveal><div><p class="rk-kicker"><span>✽</span> ${tr(tx,'TWO PLACES. A THOUSAND CONNECTIONS.','দুই দেশ। হাজারো সংযোগ।')}</p><h2 id="bridge-title">${tr(tx,'Our roots travel<br><em>with us.</em>','শিকড় আমাদের<br><em>সাথেই থাকে।</em>')}</h2></div><p>${tr(tx,'From the places we remember to the traditions we’re discovering. Pick a little postcard from the places we carry with us.','চেনা স্মৃতি থেকে নতুন সংস্কৃতি। আমাদের রঙিন জগতের একটি গল্প বেছে নিন।')}</p></header><div class="bridge-explorer"><div class="bridge-postcards" role="group" aria-label="Choose a cultural story">${places.map((p,i)=>`<button type="button" class="bridge-stop bridge-${['red','green','blue','pink'].includes(p.theme)?p.theme:'green'} ${i===0?'is-active':''}" data-place="${esc(p.id)}" aria-pressed="${i===0}" aria-controls="bridge-story"><span class="bridge-stop-art" aria-hidden="true"><img src="${ctx.esc(p.image||stamps[p.id]||image)}" alt="" width="180" height="200" loading="lazy"></span><span class="bridge-stop-copy"><small>0${i+1} / ${ctx.esc(p.place.split(',')[0])}</small><strong>${esc(p.name)}</strong><span>${esc(p.short)}</span></span><span class="bridge-stop-arrow" aria-hidden="true">↗</span></button>`).join('')}</div><article class="bridge-panel" id="bridge-story" aria-labelledby="bridge-story-title" aria-live="polite" data-reveal>${panel(places[0],ctx)}</article></div><div class="bridge-bottom"><span>বাংলাদেশ <svg class="bridge-route" viewBox="0 0 110 26" aria-hidden="true"><path data-draw d="M2 13C24-8 38 33 58 13S89 2 105 13M99 7l7 6-7 6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg> 日本</span><p>Little landmarks, shared roots. These original postage-style illustrations are artistic interpretations.</p><button type="button" class="rk-underlined" data-view-mural>A closer look at the rickshaw ${ctx.icon('image')}</button></div></section>`;
}

export function mountCultureTrail(ctx){
 document.querySelectorAll('[data-place]').forEach(button=>button.addEventListener('click',()=>{
  const place=stories(ctx).find(p=>p.id===button.dataset.place);if(!place)return;
  const section=button.closest('.bridge-section');
  section.querySelectorAll('[data-place]').forEach(b=>{const active=b===button;b.setAttribute('aria-pressed',String(active));b.classList.toggle('is-active',active);});
  section.querySelector('.bridge-panel').innerHTML=panel(place,ctx);
 }));
 document.querySelectorAll('[data-view-mural]').forEach(button=>button.addEventListener('click',()=>ctx.modal('Painted roots. A little ride home.',`<figure class="mural-view"><img src="${image}" alt="Original freestanding rickshaw illustration with hand-painted peacocks, flowers, a pink canopy and blue wheels"><figcaption>An original rickshaw illustration inspired by the colourful peacock and flower references you shared. Painted memories, carried into a new chapter.</figcaption></figure>`)));
 document.querySelectorAll('[data-culture-scroll]').forEach(button=>button.addEventListener('click',()=>{
  const section=document.getElementById('culture-trail');
  if(section){section.scrollIntoView({behavior:document.documentElement.dataset.motion==='on'?'smooth':'auto',block:'start'});const heading=section.querySelector('h2');heading.tabIndex=-1;heading.focus({preventScroll:true});}
  else ctx.navigate('/culture');
 }));
}

export function renderCulturePage(ctx,tx){
 return `<div class="culture-page"><section class="culture-page-intro"><div class="culture-intro-copy"><p class="rk-kicker">DHAKA ROOTS ↔ TOKYO DREAMS</p><h1>A little colour.<br><em>A long way home.</em></h1><p>A painted rickshaw, familiar landmarks, and new traditions. Little pieces of the places that make us who we are.</p><button type="button" class="rk-underlined" data-culture-scroll>Explore our little postcards ${ctx.icon('arrowUp')}</button></div><div class="culture-ride-art"><img src="${image}" alt="Freestanding decorated Bangladeshi cycle rickshaw with peacock and rose panels"><span>রঙিন শিকড়। নতুন পথ। / COLOURFUL ROOTS. NEW ROUTES.</span></div></section>${renderCultureTrail(ctx,tx)}<div class="culture-join"><span>আসুন, গল্প করি।</span><h2>Every journey deserves good company.</h2><a class="btn rk-btn-painted" href="/community?wall=1">Find your people ↗</a></div></div>`;
}

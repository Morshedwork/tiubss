import {normalizeInstagramReelURL,REEL_CATEGORIES} from './instagram.js';

function instagramAccount(ctx){
 let handle='tiu.bss';
 const value=ctx.store.getState().settings?.instagram;
 if(typeof value==='string'&&value.length<=2048&&!/[\s\\]/.test(value.trim())){
  try{
   const url=new URL(value.trim()),match=url.pathname.match(/^\/([A-Za-z0-9._]{1,30})\/?$/);
   const reserved=['accounts','about','api','challenge','create','developer','developers','direct','directory','emails','explore','legal','oauth','p','privacy','reel','reels','settings','stories','terms','tv','web'];
   if(url.protocol==='https:'&&['instagram.com','www.instagram.com'].includes(url.hostname)&&!url.username&&!url.password&&!url.port&&match&&!reserved.includes(match[1].toLowerCase()))handle=match[1];
  }catch{}
 }
 return {handle,url:`https://www.instagram.com/${handle}/reels/`};
}
const CATEGORY_COPY={
 'Community':{bn:'আমাদের মানুষ',heading:'The people make the place.',description:'Introductions, everyday friendships, and the little moments between everything else.',short:'Faces & friendships'},
 'Gatherings':{bn:'একসাথে',heading:'Good days, shared.',description:'A place for celebrations, campus gatherings, and memories we made together.',short:'Days to remember'},
 'Food & mela':{bn:'স্বাদ ও উৎসব',heading:'Meet at the food table.',description:'The flavours, colours, and conversations that bring a little home to Japan.',short:'Taste & celebration'},
 'Bangladesh × Japan':{bn:'দুই দেশ, এক বন্ধন',heading:'Two places. Our stories.',description:'Bangladeshi roots and life in Japan, seen through our community’s eyes.',short:'Across two cultures'}
};
const categorySlug=category=>`reels-${REEL_CATEGORIES.indexOf(category)+1}`;
const defaultTx=en=>en;
let cleanMount=()=>{};

function publishedReels(ctx){
 const records=ctx.store.getState().reels;
 return (Array.isArray(records)?records:[]).filter(reel=>reel&&reel.status==='published'&&normalizeInstagramReelURL(reel.url)).map(reel=>({...reel,url:normalizeInstagramReelURL(reel.url),category:REEL_CATEGORIES.includes(reel.category)?reel.category:REEL_CATEGORIES[0]}));
}

function reelCard(reel,ctx,index){
 const {esc}=ctx;
 const title=String(reel.title||'A TIU BSS community reel');
 const search=`${title} ${reel.caption||''} ${reel.category}`.toLocaleLowerCase();
 return `<article class="reel-card" data-reel-card data-reel-search="${esc(search)}" data-reel-url="${esc(reel.url)}" data-reel-title="${esc(title)}">
  <div class="reel-preview" data-reel-preview><div class="reel-preview-cover"><span class="reel-origin">INSTAGRAM REEL</span><span class="reel-play-mark" aria-hidden="true">▷</span><p>${esc(title)}</p><small>Choose to load from Instagram</small><span class="reel-cover-bottom"><span>COMMUNITY PICKS</span><span>↗</span></span></div></div>
  <div class="reel-card-copy"><div class="reel-card-kicker"><span>${esc(reel.category)}</span><span>${String(index+1).padStart(2,'0')}</span></div><h3>${esc(title)}</h3>${reel.caption?`<p>${esc(reel.caption)}</p>`:''}
   <div class="reel-card-actions"><button type="button" data-reel-load aria-expanded="false">Load preview <span aria-hidden="true">▷</span></button><a href="${esc(reel.url)}" target="_blank" rel="noopener noreferrer">Watch on Instagram ↗</a></div>
   <p class="reel-provider-note" data-reel-provider-note>Loading connects to Instagram. If the preview is unavailable or asks you to sign in, use “Watch on Instagram.”</p>
  </div>
 </article>`;
}

function categorySection(category,reels,ctx,account){
 const copy=CATEGORY_COPY[category],{esc}=ctx,items=reels.filter(reel=>reel.category===category),id=categorySlug(category);
 return `<section class="reel-category" id="${id}" data-reel-category="${esc(category)}" aria-labelledby="${id}-title"><div class="reel-category-intro"><span class="reel-category-number">0${REEL_CATEGORIES.indexOf(category)+1}</span><p lang="bn">${copy.bn}</p><h2 id="${id}-title">${copy.heading}</h2><p>${copy.description}</p><span class="reel-category-label">${esc(category)}</span></div><div class="reel-category-content">${items.length?`<div class="reel-grid">${items.map((reel,index)=>reelCard(reel,ctx,index)).join('')}</div><p class="reel-search-empty" data-reel-search-empty hidden>No reels match this search in ${esc(category)}.</p>`:`<div class="reel-category-empty"><span class="reel-empty-label">${copy.short}</span><p>No reels have been added to this section yet.</p><a href="${esc(account.url)}" target="_blank" rel="noopener noreferrer">Visit @${esc(account.handle)} on Instagram ↗</a></div>`}</div></section>`;
}

export function renderReelSections(ctx,tx=defaultTx,{compact=false}={}){
 const reels=publishedReels(ctx),{esc}=ctx,account=instagramAccount(ctx);
 if(compact)return `<section class="reels-home" data-reels-root data-reels-compact aria-labelledby="reels-home-title"><div class="reels-home-heading"><div><p class="reels-overline">OUR COMMUNITY, IN MOTION / আমাদের গল্প</p><h2 id="reels-home-title">${tx('Little moments.<br><em>People we call home.</em>','ছোট ছোট মুহূর্ত।<br><em>আপন মানুষের গল্প।</em>')}</h2></div><a class="reels-text-link" href="#/reels">${tx('All our reel sections','সব রিল দেখুন')} ↗</a></div>${reels.length?`<div class="reel-grid reels-home-grid">${reels.slice(0,3).map((reel,index)=>reelCard(reel,ctx,index)).join('')}</div>`:`<div class="reels-community-note"><span class="reels-note-mark" aria-hidden="true">▷</span><div><span class="reels-note-account">@${esc(account.handle)}</span><h3>${tx('There’s a story behind every hello.','প্রতিটি পরিচয়ের পেছনে একটা গল্প আছে।')}</h3><p>${tx('Find our community on Instagram. Reels will appear here when public links are added.','ইনস্টাগ্রামে আমাদের কমিউনিটিকে খুঁজে নিন। পাবলিক লিংক যুক্ত হলে এখানে রিল দেখা যাবে।')}</p></div><a href="${esc(account.url)}" target="_blank" rel="noopener noreferrer">${tx('Visit our Instagram','আমাদের ইনস্টাগ্রাম')} ↗</a></div>`}<div class="reels-home-index" aria-label="Reel sections">${REEL_CATEGORIES.map((category,index)=>`<a href="#/reels?category=${encodeURIComponent(category)}"><small>0${index+1}</small>${esc(category)} <span aria-hidden="true">↗</span></a>`).join('')}</div></section>`;
 return `<div class="reels-page" data-reels-root><header class="reels-page-header"><div><p class="reels-overline">THE COMMUNITY REEL ROOM / আমাদের মুহূর্ত</p><h1>${tx('A life together,<br><em>one moment at a time.</em>','একসাথে পথচলা,<br><em>মুহূর্তে মুহূর্তে।</em>')}</h1><p>${tx('The faces, the food, the days we celebrate. A little window into our Bangladesh–Japan community.','মানুষ, খাবার আর আমাদের উৎসবের দিনগুলো। বাংলাদেশ–জাপান কমিউনিটির গল্পের ছোট্ট জানালা।')}</p></div><aside class="reels-account-card"><span class="reels-account-flower" aria-hidden="true">✳</span><span>FOLLOW THE LITTLE MOMENTS</span><strong>@${esc(account.handle)}</strong><p>Our Instagram home</p><a href="${esc(account.url)}" target="_blank" rel="noopener noreferrer">Open Instagram ↗</a></aside></header>
  <div class="reels-tools"><div class="reels-filter-group" role="group" aria-label="Filter reel sections"><button type="button" data-reel-filter="all" aria-pressed="true">All stories</button>${REEL_CATEGORIES.map(category=>`<button type="button" data-reel-filter="${esc(category)}" aria-pressed="false">${esc(category)}</button>`).join('')}</div><label class="reels-search"><span class="sr-only">Search reels</span><span aria-hidden="true">⌕</span><input type="search" data-reel-search-input placeholder="Find a moment…" maxlength="100"></label></div>
  <div class="reels-availability"><p data-reel-count aria-live="polite">${reels.length?`${reels.length} ${reels.length===1?'reel':'reels'} · Choose a section or search the stories.`:'No public reel links have been added here yet. Visit Instagram to see the account’s available posts.'}</p><span>Previews load only when you choose.</span></div>
  <div class="reels-categories">${REEL_CATEGORIES.map(category=>categorySection(category,reels,ctx,account)).join('')}</div>
  <footer class="reels-page-footer"><p>Every memory starts with showing up.</p><a href="#/community?wall=1">Say hello to the community ↗</a><a href="#/events">Find a gathering ↗</a></footer>
 </div>`;
}

export function renderReelsPage(ctx,tx=defaultTx){return renderReelSections(ctx,tx);}

export function mountReels(ctx){
 cleanMount();const disposers=[];
 document.querySelectorAll('[data-reels-root]').forEach(root=>{
  let selected='all';
  const search=root.querySelector('[data-reel-search-input]');
  const filter=()=>{
   const term=(search?.value||'').trim().toLocaleLowerCase();let visible=0;
   root.querySelectorAll('[data-reel-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.reelFilter===selected)));
   root.querySelectorAll('[data-reel-category]').forEach(section=>{
    section.hidden=selected!=='all'&&section.dataset.reelCategory!==selected;let matching=0;
    section.querySelectorAll('[data-reel-card]').forEach(card=>{
     card.hidden=!!term&&!card.dataset.reelSearch.includes(term);if(!card.hidden)matching++;
     if(card.hidden||section.hidden){
      const iframe=card.querySelector('iframe');
      if(iframe){iframe.remove();card.querySelector('.reel-preview-cover').hidden=false;card.querySelector('[data-reel-preview]').classList.remove('is-loaded');const button=card.querySelector('[data-reel-load]');button.innerHTML='Load preview <span aria-hidden="true">▷</span>';button.setAttribute('aria-expanded','false');}
     }
    });
    const empty=section.querySelector('[data-reel-search-empty]');if(empty)empty.hidden=matching>0;
    if(!section.hidden)visible+=matching;
   });
   const count=root.querySelector('[data-reel-count]');
   if(count)count.textContent=term?`${visible} ${visible===1?'reel':'reels'} matching “${search.value.trim()}”${selected==='all'?'':` in ${selected}`}.`:`${visible} ${visible===1?'reel':'reels'}${selected==='all'?' across all sections':` in ${selected}`}. ${visible?'Load a preview or watch on Instagram.':'Public reel links have not been added to this selection yet.'}`;
  };
  const click=event=>{
   const filterButton=event.target.closest?.('[data-reel-filter]');
   if(filterButton&&root.contains(filterButton)){selected=filterButton.dataset.reelFilter;filter();return;}
   const button=event.target.closest?.('[data-reel-load]');if(!button||!root.contains(button))return;
   const card=button.closest('[data-reel-card]'),preview=card.querySelector('[data-reel-preview]'),url=normalizeInstagramReelURL(card.dataset.reelUrl);if(!url)return;
   const open=button.getAttribute('aria-expanded')==='true',cover=preview.querySelector('.reel-preview-cover');
   if(open){preview.querySelector('iframe')?.remove();cover.hidden=false;preview.classList.remove('is-loaded');button.innerHTML='Load preview <span aria-hidden="true">▷</span>';button.setAttribute('aria-expanded','false');}
   else{
    const iframe=document.createElement('iframe');iframe.src=`${url.replace(/\/$/,'')}/embed/`;iframe.title=`Instagram reel: ${card.dataset.reelTitle}`;iframe.loading='lazy';iframe.referrerPolicy='strict-origin-when-cross-origin';iframe.allowFullscreen=true;iframe.setAttribute('allow','fullscreen');
    cover.hidden=true;preview.append(iframe);preview.classList.add('is-loaded');button.innerHTML='Hide preview <span aria-hidden="true">×</span>';button.setAttribute('aria-expanded','true');
   }
  };
  root.addEventListener('click',click);disposers.push(()=>root.removeEventListener('click',click));
  if(search){search.addEventListener('input',filter);disposers.push(()=>search.removeEventListener('input',filter));}
  if(!root.hasAttribute('data-reels-compact')){const query=new URLSearchParams((location.hash.split('?')[1]||'')),category=query.get('category');if(REEL_CATEGORIES.includes(category)){selected=category;filter();}}
 });
 cleanMount=()=>disposers.forEach(dispose=>dispose());
}

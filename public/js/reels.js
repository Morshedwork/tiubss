import {currentRoute} from './router.js';
import {normalizeInstagramReelURL,REEL_CATEGORIES} from './instagram.js';
import {FEATURED_REELS} from './featured-reels-data.js';

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
const REEL_AUTOPLAY_KEY='bss-reel-autoplay';
function autoplayPreference(){
 try{return window.localStorage.getItem(REEL_AUTOPLAY_KEY)!=='off';}catch{return true;}
}
function autoplayControl(){
 const enabled=autoplayPreference();
 return `<button class="reels-autoplay-toggle" type="button" data-reel-autoplay aria-pressed="${enabled}" aria-label="Autoplay previews"><span class="reels-autoplay-switch" aria-hidden="true"></span><span data-reel-autoplay-label>Autoplay ${enabled?'on':'off'}</span></button>`;
}

function publishedReels(ctx){
 const records=ctx.store.getState().reels,seen=new Set();
 // Curated previews take precedence when the same reel is also saved in the CMS.
 return [...FEATURED_REELS,...(Array.isArray(records)?records:[])].filter(reel=>{
  if(!reel||reel.status!=='published')return false;
  const url=normalizeInstagramReelURL(reel.url);if(!url||seen.has(url))return false;
  seen.add(url);return true;
 }).map(reel=>({...reel,url:normalizeInstagramReelURL(reel.url),category:REEL_CATEGORIES.includes(reel.category)?reel.category:REEL_CATEGORIES[0]}));
}

function reelCard(reel,ctx,index){
 const {esc}=ctx,title=String(reel.title||'A TIU BSS community reel');
 const search=`${title} ${reel.caption||''} ${reel.category}`.toLocaleLowerCase();
 const native=typeof reel.video==='string'&&/^assets\/reels\/[A-Za-z0-9._-]+\.(mp4|webm)$/.test(reel.video)&&typeof reel.poster==='string'&&/^assets\/reels\/[A-Za-z0-9._-]+\.(webp|jpg|jpeg|png)$/.test(reel.poster);
 const landscape=reel.aspectRatio==='16/9';
 const duration=Number.isFinite(Number(reel.previewSeconds))&&Number(reel.previewSeconds)>0?`${Number(reel.previewSeconds)}-second ${reel.fullVideo?'reel':'preview'}`:'Community preview';
 const preview=native?`<div class="reel-film-frame"><div class="reel-film-heading"><span><i aria-hidden="true"></i> COMMUNITY PICK</span><span>NO. ${String(index+1).padStart(2,'0')}</span></div><div class="reel-preview reel-native-preview" data-reel-preview>
   <video class="reel-native-video" data-reel-video data-reel-src="${esc(reel.video)}" poster="${esc(reel.poster)}" preload="none" muted loop playsinline controls aria-label="${esc(title)} — ${esc(duration)}"></video>
   <button class="reel-video-start" type="button" data-reel-native-play aria-label="Play preview: ${esc(title)}"><span aria-hidden="true">▶</span><span>Play preview</span></button>
   <span class="reel-video-status" data-reel-video-status>PLAY A LITTLE MOMENT</span>
  </div><div class="reel-film-footer"><span>${esc(duration)}</span><span>TIU BSS · FROM OUR INSTAGRAM ↗</span></div></div>`:`<div class="reel-preview" data-reel-preview><div class="reel-preview-cover"><span class="reel-origin">INSTAGRAM REEL</span><span class="reel-play-mark" aria-hidden="true">▷</span><p>${esc(title)}</p><small>Choose to load from Instagram</small><span class="reel-cover-bottom"><span>COMMUNITY PICKS</span><span>↗</span></span></div></div>`;
 return `<article class="reel-card${native?' reel-card-featured':''}${native&&landscape?' reel-card-landscape':''}" data-reel-card data-reel-search="${esc(search)}" data-reel-url="${esc(reel.url)}" data-reel-title="${esc(title)}">
  ${preview}
  <div class="reel-card-copy"><div class="reel-card-kicker"><span>${esc(reel.category)}</span><span>${native?'COMMUNITY FAVOURITES':String(index+1).padStart(2,'0')}</span></div><h3>${esc(title)}</h3>${reel.caption?`<p>${esc(reel.caption)}</p>`:''}
   <div class="reel-card-actions">${native?'<button type="button" data-reel-toggle aria-pressed="false">Play preview <span aria-hidden="true">▷</span></button><button type="button" class="reel-sound-toggle" data-reel-sound aria-pressed="false" aria-label="Unmute preview">Unmute <span aria-hidden="true">♪</span></button>':'<button type="button" data-reel-load aria-expanded="false">Load preview <span aria-hidden="true">▷</span></button>'}<a href="${esc(reel.url)}" target="_blank" rel="noopener noreferrer">${native?'Full reel on Instagram':'Watch on Instagram'} ↗</a></div>
   <p class="reel-provider-note" data-reel-provider-note>${native?`${esc(duration)} · Full reel on Instagram. Starts muted. Make yourself at home.`:'Loading connects to Instagram. If the preview is unavailable or asks you to sign in, use “Watch on Instagram.”'}</p>
  </div>
 </article>`;
}

function categorySection(category,reels,ctx,account){
 const copy=CATEGORY_COPY[category],{esc}=ctx,items=reels.filter(reel=>reel.category===category),id=categorySlug(category);
 return `<section class="reel-category" id="${id}" data-reel-category="${esc(category)}" aria-labelledby="${id}-title"><div class="reel-category-intro"><span class="reel-category-number">0${REEL_CATEGORIES.indexOf(category)+1}</span><p lang="bn">${copy.bn}</p><h2 id="${id}-title">${copy.heading}</h2><p>${copy.description}</p><span class="reel-category-label">${esc(category)}</span></div><div class="reel-category-content">${items.length?`<div class="reel-grid">${items.map((reel,index)=>reelCard(reel,ctx,index)).join('')}</div><p class="reel-search-empty" data-reel-search-empty hidden>No reels match this search in ${esc(category)}.</p>`:`<div class="reel-category-empty"><span class="reel-empty-label">${copy.short}</span><p>No reels have been added to this section yet.</p><a href="${esc(account.url)}" target="_blank" rel="noopener noreferrer">Visit @${esc(account.handle)} on Instagram ↗</a></div>`}</div></section>`;
}

export function renderReelSections(ctx,tx=defaultTx,{compact=false}={}){
 const reels=publishedReels(ctx),{esc}=ctx,account=instagramAccount(ctx);
 if(compact)return `<section class="reels-home" data-reels-root data-reels-compact aria-labelledby="reels-home-title"><div class="reels-home-heading"><div><p class="reels-overline">THE COMMUNITY SCREEN / আমাদের গল্প</p><h2 id="reels-home-title">${tx('Press play on<br><em>a little piece of home.</em>','দেখুন আমাদের<br><em>এক টুকরো ঘরের গল্প।</em>')}</h2><p class="reels-home-description">${tx('Real faces. Shared celebrations. A little Bangladesh, together in Japan.','চেনা মুখ, একসাথে উৎসব। জাপানের বুকে আমাদের ছোট্ট বাংলাদেশ।')}</p></div><div class="reels-home-controls">${autoplayControl()}<span class="reels-autoplay-caption" data-reel-autoplay-caption>Muted previews · sound is yours to turn on</span><a class="reels-text-link" href="/reels">${tx('Step into the reel room','সব রিল দেখুন')} ↗</a></div></div>${reels.length?`<div class="reels-home-screen-label"><span><i aria-hidden="true"></i> FROM @${esc(account.handle)}</span><span>FRIENDS · FESTIVALS · THE IN-BETWEEN</span><span lang="bn">আমাদের মুহূর্ত</span></div><div class="reel-grid reels-home-grid reels-home-cinema">${reels.slice(0,3).map((reel,index)=>reelCard(reel,ctx,index)).join('')}</div>`:`<div class="reels-community-note"><span class="reels-note-mark" aria-hidden="true">▷</span><div><span class="reels-note-account">@${esc(account.handle)}</span><h3>${tx('There’s a story behind every hello.','প্রতিটি পরিচয়ের পেছনে একটা গল্প আছে।')}</h3><p>${tx('Find our community on Instagram. Reels will appear here when public links are added.','ইনস্টাগ্রামে আমাদের কমিউনিটিকে খুঁজে নিন। পাবলিক লিংক যুক্ত হলে এখানে রিল দেখা যাবে।')}</p></div><a href="${esc(account.url)}" target="_blank" rel="noopener noreferrer">${tx('Visit our Instagram','আমাদের ইনস্টাগ্রাম')} ↗</a></div>`}<div class="reels-home-index" aria-label="Reel sections">${REEL_CATEGORIES.map((category,index)=>`<a href="/reels?category=${encodeURIComponent(category)}"><small>0${index+1}</small>${esc(category)} <span aria-hidden="true">↗</span></a>`).join('')}</div></section>`;
 return `<div class="reels-page" data-reels-root><header class="reels-page-header"><div><p class="reels-overline">THE COMMUNITY REEL ROOM / আমাদের মুহূর্ত</p><h1>${tx('A life together,<br><em>one moment at a time.</em>','একসাথে পথচলা,<br><em>মুহূর্তে মুহূর্তে।</em>')}</h1><p>${tx('The faces, the food, the days we celebrate. A little window into our Bangladesh–Japan community.','মানুষ, খাবার আর আমাদের উৎসবের দিনগুলো। বাংলাদেশ–জাপান কমিউনিটির গল্পের ছোট্ট জানালা।')}</p></div><aside class="reels-account-card"><span class="reels-account-flower" aria-hidden="true">✳</span><span>FOLLOW THE LITTLE MOMENTS</span><strong>@${esc(account.handle)}</strong><p>Our Instagram home</p><a href="${esc(account.url)}" target="_blank" rel="noopener noreferrer">Open Instagram ↗</a></aside></header>
  <div class="reels-tools"><div class="reels-filter-group" role="group" aria-label="Filter reel sections"><button type="button" data-reel-filter="all" aria-pressed="true">All stories</button>${REEL_CATEGORIES.map(category=>`<button type="button" data-reel-filter="${esc(category)}" aria-pressed="false">${esc(category)}</button>`).join('')}</div><label class="reels-search"><span class="sr-only">Search reels</span><span aria-hidden="true">⌕</span><input type="search" data-reel-search-input placeholder="Find a moment…" maxlength="100"></label></div>
  <div class="reels-availability"><p data-reel-count aria-live="polite">${reels.length?`${reels.length} ${reels.length===1?'reel':'reels'} · Choose a section or search the stories.`:'No public reel links have been added here yet. Visit Instagram to see the account’s available posts.'}</p><div class="reels-page-playback">${autoplayControl()}<span data-reel-autoplay-caption>Muted previews as you scroll</span></div></div>
  <div class="reels-categories">${REEL_CATEGORIES.map(category=>categorySection(category,reels,ctx,account)).join('')}</div>
  <footer class="reels-page-footer"><p>Every memory starts with showing up.</p><a href="/community?wall=1">Say hello to the community ↗</a><a href="/events">Find a gathering ↗</a></footer>
 </div>`;
}

export function renderReelsPage(ctx,tx=defaultTx){return renderReelSections(ctx,tx);}

// Native previews are local excerpts, so a visitor sees the poster without an
// Instagram iframe or an offscreen video download. One controller owns each mount.
function mountNativePreviews(root){
 let autoplayEnabled=autoplayPreference();
 const players=[...root.querySelectorAll('[data-reel-video]')].map(video=>{
  const card=video.closest('[data-reel-card]');
  return {video,card,start:card.querySelector('[data-reel-native-play]'),toggle:card.querySelector('[data-reel-toggle]'),sound:card.querySelector('[data-reel-sound]'),status:card.querySelector('[data-reel-video-status]'),inView:false,manualPaused:false,manualStart:false,expectedPause:false,pending:false,starting:false,blocked:false,failed:false};
 });
 let active=true,scheduled=0;
 const disposers=[];
 const shown=player=>!player.card.closest('[hidden]')&&player.card.isConnected;
 const eligible=player=>active&&shown(player)&&player.inView&&!document.hidden;
 const paintPreference=()=>{
  root.querySelectorAll('[data-reel-autoplay]').forEach(button=>{
   button.setAttribute('aria-pressed',String(autoplayEnabled));
   button.querySelector('[data-reel-autoplay-label]').textContent=`Autoplay ${autoplayEnabled?'on':'off'}`;
  });
  root.querySelectorAll('[data-reel-autoplay-caption]').forEach(label=>{label.textContent=autoplayEnabled?'Muted previews · sound is yours to turn on':'Your pace · press play on any preview';});
 };
 const paint=player=>{
  const playing=!player.video.paused&&!player.video.ended,audible=!player.video.muted&&player.video.volume>0;
  player.start.hidden=playing;
  player.toggle.setAttribute('aria-pressed',String(playing));
  player.toggle.innerHTML=playing?'Pause preview <span aria-hidden="true">Ⅱ</span>':'Play preview <span aria-hidden="true">▷</span>';
  if(player.sound){player.sound.setAttribute('aria-pressed',String(audible));player.sound.setAttribute('aria-label',`${audible?'Mute':'Unmute'} preview: ${player.card.dataset.reelTitle}`);player.sound.innerHTML=`${audible?'Mute':'Unmute'} <span aria-hidden="true">♪</span>`;}
  player.card.classList.toggle('is-reel-playing',playing);
  player.status.textContent=player.failed?'PREVIEW UNAVAILABLE · OPEN INSTAGRAM':playing?(audible?'PLAYING · SOUND ON':'PLAYING · MUTED'):player.blocked?'TAP TO PLAY · MUTED PREVIEW':player.manualPaused?'A MOMENT, PAUSED':!autoplayEnabled?'YOUR PACE · PRESS PLAY':'PLAY A LITTLE MOMENT';
 };
 const pause=player=>{
  player.video.autoplay=false;
  if(!player.video.paused){player.expectedPause=true;player.video.pause();}
  paint(player);
 };
 const play=(player,manual=false)=>{
  if(!active)return;
  if(manual){player.manualPaused=false;player.manualStart=true;player.blocked=false;}
  if(player.pending)return;
  if(!manual&&(!eligible(player)||!autoplayEnabled||player.manualPaused||player.blocked||player.failed))return;
  const video=player.video;
  // Every automatic start is silent, including a return from another tab or scroll.
  // Video playback has its own preference; decorative motion settings remain separate.
  if(!manual)video.muted=true;
  if(!video.hasAttribute('src')){
   video.defaultMuted=true;video.playsInline=true;
   video.autoplay=!manual&&autoplayEnabled;video.src=video.dataset.reelSrc;
  }else if(player.failed&&manual){player.failed=false;video.load();}
  player.pending=true;player.starting=true;
  try{
   Promise.resolve(video.play()).then(()=>{
    if(!eligible(player)||(!player.manualStart&&!autoplayEnabled))pause(player);
   }).catch(error=>{
    if(!active)return;
    if(error?.name!=='AbortError'&&eligible(player)){player.blocked=true;player.manualStart=false;paint(player);}
   }).finally(()=>{player.pending=false;player.starting=false;});
  }catch{
   player.pending=false;player.starting=false;player.blocked=true;paint(player);
  }
 };
 const update=()=>{
  players.forEach(player=>{
   if(!eligible(player)){player.manualStart=false;pause(player);}
   else if(!autoplayEnabled&&!player.manualStart)pause(player);
   else if(!player.manualPaused&&!player.blocked&&!player.failed&&player.video.paused)play(player,player.manualStart);
  });
 };
 const measure=(reconcile=true)=>{
  scheduled=0;
  const width=window.innerWidth||document.documentElement.clientWidth,height=window.innerHeight||document.documentElement.clientHeight;
  players.forEach(player=>{
   const rect=player.video.getBoundingClientRect();
   const visibleHeight=Math.max(0,Math.min(rect.bottom,height)-Math.max(rect.top,0));
   const visibleWidth=Math.max(0,Math.min(rect.right,width)-Math.max(rect.left,0));
   player.inView=rect.height>0&&rect.width>0&&visibleHeight*visibleWidth/(rect.height*rect.width)>=.2;
  });
  if(reconcile)update();
 };
 const applyPreference=(enabled,userGesture=false)=>{
  autoplayEnabled=enabled;paintPreference();measure(false);
  players.forEach(player=>{
   if(!enabled){player.manualStart=false;pause(player);}
   else if(userGesture&&eligible(player)){player.manualPaused=false;player.manualStart=false;player.blocked=false;play(player);}
  });
  if(enabled)update();
 };
 const schedule=()=>{if(!scheduled)scheduled=window.requestAnimationFrame(()=>measure());};
 const bind=(target,name,fn,options)=>{target.addEventListener(name,fn,options);disposers.push(()=>target.removeEventListener(name,fn,options));};
 players.forEach(player=>{
  const video=player.video;
  bind(video,'play',()=>{
   player.expectedPause=false;
   if(!player.starting){player.manualPaused=false;player.manualStart=true;player.blocked=false;}
   if(!eligible(player))pause(player);else paint(player);
  });
  bind(video,'pause',()=>{
   if(player.expectedPause)player.expectedPause=false;
   else{player.manualPaused=true;player.manualStart=false;video.autoplay=false;}
   paint(player);
  });
  bind(video,'volumechange',()=>paint(player));
  bind(video,'error',()=>{player.failed=true;player.pending=false;paint(player);});
  bind(video,'playing',()=>{player.failed=false;player.blocked=false;paint(player);});
 });
 bind(root,'click',event=>{
  const autoplayButton=event.target.closest?.('[data-reel-autoplay]');
  if(autoplayButton&&root.contains(autoplayButton)){
   const enabled=!autoplayEnabled;
   try{window.localStorage.setItem(REEL_AUTOPLAY_KEY,enabled?'on':'off');}catch{}
   window.dispatchEvent(new window.CustomEvent('bss:reel-autoplay',{detail:{enabled,userGesture:true}}));return;
  }
  const button=event.target.closest?.('[data-reel-native-play],[data-reel-toggle],[data-reel-sound]');
  if(!button||!root.contains(button))return;
  const player=players.find(item=>item.card===button.closest('[data-reel-card]'));if(!player)return;
  if(button.hasAttribute('data-reel-sound')){
   const audible=!player.video.muted&&player.video.volume>0;
   if(!audible){players.forEach(other=>{if(other!==player)other.video.muted=true;});if(player.video.volume===0)player.video.volume=1;}
   player.video.muted=audible;paint(player);return;
  }
  if(!player.video.paused){player.manualPaused=true;player.manualStart=false;pause(player);}
  else{measure(false);play(player,true);}
 });
 bind(window,'bss:reel-autoplay',event=>applyPreference(event.detail.enabled,event.detail.userGesture));
 bind(window,'storage',event=>{if(event.key===REEL_AUTOPLAY_KEY)applyPreference(event.newValue!=='off');});
 let observer;
 if(typeof IntersectionObserver==='function'){
  observer=new IntersectionObserver(entries=>{
   entries.forEach(entry=>{const player=players.find(item=>item.video===entry.target);if(player)player.inView=entry.isIntersecting&&entry.intersectionRatio>=.2;});update();
  },{threshold:[0,.2]});
  players.forEach(player=>observer.observe(player.video));
 }else{
  // The fallback stays lazy too: only cards that intersect the viewport can load.
  bind(window,'scroll',schedule,{passive:true});bind(window,'resize',schedule,{passive:true});
 }
 bind(document,'visibilitychange',update);
 paintPreference();measure();
 return {
  update:()=>measure(),
  dispose(){
   active=false;observer?.disconnect();
   if(scheduled)window.cancelAnimationFrame(scheduled);
   disposers.forEach(dispose=>dispose());
   players.forEach(player=>{player.video.autoplay=false;player.video.pause();player.video.removeAttribute('src');player.video.load();});
  }
 };
}

export function mountReels(ctx){
 cleanMount();const disposers=[];
 document.querySelectorAll('[data-reels-root]').forEach(root=>{
  let selected='all';
  const search=root.querySelector('[data-reel-search-input]');
  const nativePreviews=mountNativePreviews(root);disposers.push(()=>nativePreviews.dispose());
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
   nativePreviews.update();
   const count=root.querySelector('[data-reel-count]');
   if(count)count.textContent=term?`${visible} ${visible===1?'reel':'reels'} matching “${search.value.trim()}”${selected==='all'?'':` in ${selected}`}.`:`${visible} ${visible===1?'reel':'reels'}${selected==='all'?' across all sections':` in ${selected}`}. ${visible?'Enjoy a preview or open the full reel on Instagram.':'Public reel links have not been added to this selection yet.'}`;
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
  if(!root.hasAttribute('data-reels-compact')){const query=new URLSearchParams((currentRoute().split('?')[1]||'')),category=query.get('category');if(REEL_CATEGORIES.includes(category)){selected=category;filter();}}
 });
 cleanMount=()=>disposers.forEach(dispose=>dispose());
}

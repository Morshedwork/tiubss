/** A browser-local rickshaw art workbench. Exports real raster artwork on demand. */
const DRAFT_KEY = 'tiu-bss-art-draft-v1';
const DEFAULT = {palette:'rose',motif:'rickshaw',title:'একসাথে, আরও দূরে।',note:'A little Bangladesh. A lot of heart.',signature:'FROM DHAKA TO TOKYO, WITH LOVE'};
const PALETTES = [
 {id:'rose',name:'Dhaka afterglow',sub:'Burgundy · rose · gold',bg:'#691e35',ink:'#ffe5a4',accent:'#f59cb6',line:'#e7b343'},
 {id:'green',name:'Bot-tola green',sub:'Forest · cream · vermilion',bg:'#164f40',ink:'#fff0c3',accent:'#ffc45c',line:'#eeb6b3'},
 {id:'blue',name:'Tokyo twilight',sub:'Indigo · sakura · marigold',bg:'#273d75',ink:'#fff0c3',accent:'#f5b3d1',line:'#eeb83f'}
];
const MOTIFS = [
 {id:'rickshaw',name:'Rickshaw ride',image:'assets/rickshaw-cutout-v4.webp'},
 {id:'flower',name:'Painted blooms',image:'assets/rickshaw-flower.svg'},
 {id:'bird',name:'Folk bird',image:'assets/rickshaw-bird.svg'}
];
const tidy = (value,max) => String(value || '').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
function safeDraft(value) {
 return {palette:PALETTES.some(p=>p.id===value?.palette)?value.palette:DEFAULT.palette,motif:MOTIFS.some(m=>m.id===value?.motif)?value.motif:DEFAULT.motif,title:tidy(value?.title??DEFAULT.title,64),note:tidy(value?.note??DEFAULT.note,100),signature:tidy(value?.signature??DEFAULT.signature,48)};
}
function readDraft(){try{const value=localStorage.getItem(DRAFT_KEY);return {value:safeDraft(value?JSON.parse(value):DEFAULT),saved:!!value};}catch{return {value:{...DEFAULT},saved:false};}}
const paletteStyle = p => `--art-bg:${p.bg};--art-ink:${p.ink};--art-accent:${p.accent};--art-line:${p.line}`;

export function renderArtStudio(ctx,tx=(en)=>en){
 const {esc}=ctx,{value:d,saved}=readDraft(),p=PALETTES.find(p=>p.id===d.palette),m=MOTIFS.find(m=>m.id===d.motif);
 return `<div class="art-studio" id="art-studio">
 <header class="art-studio-heading"><div><a class="art-back" href="#/mela">← ${tx('Back to the mela','মেলায় ফিরে যান')}</a><p class="art-eyebrow">THE PAINT SHOP / রঙের দোকান</p><h1>${tx('A little art.<br><em>All yours.</em>','একটু রং।<br><em>পুরোটাই আপনার।</em>')}</h1><p>${tx('Pick your colours. Find your words. Make a little piece of home to take with you.','নিজের রং বেছে নিন। মনের কথা লিখুন। নিজের মতো করে আঁকুন একটুকরো বাংলাদেশ।')}</p></div><div class="art-maker-stamp" aria-hidden="true"><span>MADE WITH</span><b>মন</b><span>A LITTLE HEART</span></div></header>
 <div class="art-workbench">
 <section class="art-controls" aria-labelledby="art-controls-title"><div class="art-controls-top"><h2 id="art-controls-title">Your paint box</h2><span>01—03</span></div>
 <fieldset class="art-fieldset"><legend><b>01</b> Set the mood</legend><div class="art-palettes">${PALETTES.map(p=>`<label class="art-palette" style="${paletteStyle(p)}"><input type="radio" name="art-palette" value="${p.id}" ${d.palette===p.id?'checked':''}><span class="art-palette-swatch" aria-hidden="true"><i></i><i></i><i></i></span><span><strong>${p.name}</strong><small>${p.sub}</small></span><span class="art-check" aria-hidden="true">✓</span></label>`).join('')}</div></fieldset>
 <fieldset class="art-fieldset"><legend><b>02</b> Pick your painted friend</legend><div class="art-motifs">${MOTIFS.map(m=>`<label class="art-motif"><input type="radio" name="art-motif" value="${m.id}" ${d.motif===m.id?'checked':''}><span class="art-motif-tile"><img src="${m.image}" alt="" aria-hidden="true"><span>${m.name}</span></span></label>`).join('')}</div></fieldset>
 <fieldset class="art-fieldset"><legend><b>03</b> Make it your own</legend><label class="art-text-label" for="art-title">Your greeting <span>Bangla or English</span></label><input id="art-title" name="art-title" type="text" value="${esc(d.title)}" maxlength="64" placeholder="A little piece of home" autocomplete="off"><label class="art-text-label" for="art-note">A little note</label><textarea id="art-note" name="art-note" rows="2" maxlength="100" placeholder="For the people who make a place feel like home">${esc(d.note)}</textarea><label class="art-text-label" for="art-signature">The sign-off</label><input id="art-signature" name="art-signature" value="${esc(d.signature)}" maxlength="48" autocomplete="off"><p class="art-text-hint">Short words, big feeling. Your preview updates as you type.</p></fieldset>
 <div class="art-draft-actions"><button type="button" class="art-text-button" data-art-action="draft">Save draft</button><button type="button" class="art-text-button" data-art-action="reset">Start fresh ↺</button></div><p class="art-local-note" data-art-status role="status" aria-live="polite">${saved?'Your saved draft is ready.':'Your art stays in this browser until you download it.'}</p></section>
 <section class="art-preview-area" aria-labelledby="art-preview-title"><div class="art-preview-label"><h2 id="art-preview-title">Your little masterpiece</h2><span>LIVE PREVIEW <i aria-hidden="true"></i></span></div><div class="art-print-mount"><span class="art-tape art-tape-left" aria-hidden="true"></span><span class="art-tape art-tape-right" aria-hidden="true"></span><article class="art-print" style="${paletteStyle(p)}" data-art-print><div class="art-print-frame"><div class="art-print-top"><span>TIU BSS</span><span>✽</span><span>THE PAINT SHOP</span></div><p class="art-print-script" lang="bn">হৃদয়ের রং</p><div class="art-print-picture" data-art-motif="${d.motif}"><img data-art-image src="${m.image}" alt="${m.name} illustration"></div><h3 data-art-title>${esc(d.title)}</h3><p class="art-print-note" data-art-note>${esc(d.note)}</p><div class="art-print-flourish" aria-hidden="true"><span></span>✽<span></span></div><p class="art-print-signature" data-art-signature>${esc(d.signature)}</p><div class="art-print-bottom"><span>BANGLADESH</span><b>↔</b><span>JAPAN</span></div></div></article></div>
 <div class="art-export-actions"><button type="button" class="art-download" data-art-action="download"><span>Download your art</span><span aria-hidden="true">↓</span></button><button type="button" class="art-gallery-save" data-art-action="gallery">Keep in my gallery ↗</button></div><p class="art-export-note">PNG · 1200 × 1500 px · Made by you<br>Gallery saves are private to this browser demo.</p></section>
 </div><footer class="art-studio-footer"><span lang="bn">রং মাখুক মন।</span><p>Inspired by the flowers, birds, and bright hand-painted signs of rickshaw art.</p><a href="#/gallery">Visit the art wall ↗</a></footer></div>`;
}

let cleanup = ()=>{};
export function mountArtStudio(ctx){
 cleanup();
 const root=document.getElementById('art-studio');if(!root)return;
 const controller=new AbortController(),{signal}=controller;
 let alive=true,busy=false,current=readDraft().value;
 cleanup=()=>{alive=false;controller.abort();};
 const active=()=>alive&&root.isConnected;
 const find=s=>root.querySelector(s),status=message=>{if(active())find('[data-art-status]').textContent=message;};
 const update=()=>{
  current=safeDraft({palette:find('[name="art-palette"]:checked')?.value,motif:find('[name="art-motif"]:checked')?.value,title:find('#art-title').value,note:find('#art-note').value,signature:find('#art-signature').value});
  const p=PALETTES.find(p=>p.id===current.palette),m=MOTIFS.find(m=>m.id===current.motif);
  find('[data-art-print]').setAttribute('style',paletteStyle(p));
  find('[data-art-image]').src=m.image;find('[data-art-image]').alt=`${m.name} illustration`;
  find('[data-art-motif]').dataset.artMotif=m.id;
  find('[data-art-title]').textContent=current.title;
  find('[data-art-title]').style.fontSize=`${Math.max(3.3,Math.min(6.2,6.2*Math.sqrt(22/Math.max(1,Array.from(current.title).length))))}cqw`;
  find('[data-art-note]').textContent=current.note;
  find('[data-art-signature]').textContent=current.signature;
 };
 const apply=d=>{for(const el of root.querySelectorAll('[name="art-palette"]'))el.checked=el.value===d.palette;for(const el of root.querySelectorAll('[name="art-motif"]'))el.checked=el.value===d.motif;find('#art-title').value=d.title;find('#art-note').value=d.note;find('#art-signature').value=d.signature;update();};
 for(const el of root.querySelectorAll('input,textarea'))el.addEventListener('input',()=>{update();status('Your colours, your words. Save a draft to keep this version.');},{signal});
 // Change also supports native radio activation in browsers and simple DOM harnesses.
 for(const el of root.querySelectorAll('input[type="radio"]'))el.addEventListener('change',update,{signal});
 for(const button of root.querySelectorAll('[data-art-action]'))button.addEventListener('click',async()=>{
  if(busy)return;
  update();const action=button.dataset.artAction;
  try{
   if(action==='draft'){localStorage.setItem(DRAFT_KEY,JSON.stringify(current));status('Draft saved on this device. Come back whenever you like.');ctx.toast('Your art draft is saved in this browser.');return;}
   if(action==='reset'){apply({...DEFAULT});localStorage.removeItem(DRAFT_KEY);status('A fresh canvas. Make it yours.');return;}
   busy=true;const snapshot={...current};root.setAttribute('aria-busy','true');
   for(const el of root.querySelectorAll('[data-art-action]'))el.disabled=true;
   status(action==='download'?'Painting your full-size PNG…':'Preparing your gallery print…');
   const canvas=await createArtwork(snapshot,action==='download'?1200:840);
   if(!active())return;
   if(action==='download'){
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('The browser could not create a PNG. Please try again.')),'image/png'));
    if(!active())return;
    const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download='my-rickshaw-art.png';document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
    status('Your 1200 × 1500 PNG is ready. Check your downloads.');ctx.toast('Your artwork is ready to download.');
   }else if(action==='gallery'){
    const image=canvas.toDataURL('image/jpeg',0.86);if(image.length>2600000)throw new Error('This artwork is too large for the demo gallery. Download the PNG instead.');
    ctx.store.saveRecord('gallery',{title:snapshot.title.trim()||'My painted postcard',category:'Digital art',image,caption:snapshot.note.trim()||'A postcard made in the TIU BSS Paint Shop.'});
    status('Saved to the gallery in this browser. It has not been published online.');ctx.toast('Your artwork is in your browser’s gallery.');
   }
  }catch(error){const message=error?.message||'Something went wrong. Please try again.';status(message);if(active())ctx.toast(message);}
  finally{busy=false;if(active()){root.removeAttribute('aria-busy');for(const el of root.querySelectorAll('[data-art-action]'))el.disabled=false;}}
 },{signal});
 update();
}

function loadImage(path){return new Promise((resolve,reject)=>{const img=new Image();let done=false;const timer=setTimeout(()=>{if(!done){done=true;reject(new Error('The artwork image took too long to load. Please try again.'));}},15000);img.onload=()=>{if(done)return;done=true;clearTimeout(timer);resolve(img);};img.onerror=()=>{if(done)return;done=true;clearTimeout(timer);reject(new Error('The painted motif could not load. Try another motif.'));};img.src=new URL(path,document.baseURI).href;});}

/** Draw the same postcard composition at a stable, printable size. No remote assets. */
async function createArtwork(value,width){
 const p=PALETTES.find(p=>p.id===value.palette),m=MOTIFS.find(m=>m.id===value.motif);
 if(typeof document.fonts?.load==='function')await Promise.all([document.fonts.load('700 83px "Noto Serif Bengali"',value.title||'বাংলাদেশ'),document.fonts.load('400 33px "Noto Serif Bengali"',value.note||'ভালোবাসা')]);
 if(document.fonts?.ready)await document.fonts.ready;
 const image=await loadImage(m.image),canvas=document.createElement('canvas');canvas.width=width;canvas.height=Math.round(width*1.25);
 let c;try{c=canvas.getContext('2d');}catch{}if(!c)throw new Error('Image export needs a browser with Canvas support. Your draft can still be saved.');
 c.scale(width/1200,width/1200);c.fillStyle=p.bg;c.fillRect(0,0,1200,1500);
 c.strokeStyle=p.line;c.lineWidth=5;c.strokeRect(28,28,1144,1444);c.strokeStyle=p.accent;c.lineWidth=2;c.strokeRect(59,59,1082,1382);c.strokeStyle=p.line;c.lineWidth=3;c.strokeRect(80,80,1040,1340);
 for(let x=46;x<=1154;x+=28){c.beginPath();c.fillStyle=p.accent;c.arc(x,46,4,0,Math.PI*2);c.fill();c.beginPath();c.arc(x,1454,4,0,Math.PI*2);c.fill();}
 for(let y=74;y<=1426;y+=28){c.beginPath();c.arc(46,y,4,0,Math.PI*2);c.fill();c.beginPath();c.arc(1154,y,4,0,Math.PI*2);c.fill();}
 const family='"Noto Serif Bengali", Georgia, serif';
 c.fillStyle=p.ink;c.textBaseline='middle';c.font='600 23px Arial, sans-serif';c.textAlign='left';c.fillText('TIU BSS',125,138);c.textAlign='right';c.fillText('THE PAINT SHOP',1075,138);c.textAlign='center';c.font='38px Georgia';c.fillText('✽',600,140);
 c.strokeStyle=p.line;c.lineWidth=1;c.beginPath();c.moveTo(125,183);c.lineTo(1075,183);c.stroke();
 c.fillStyle=p.accent;c.font=`600 38px ${family}`;c.fillText('হৃদয়ের রং',600,226);
 const area=value.motif==='rickshaw'?{x:185,y:275,w:830,h:545}:{x:365,y:292,w:470,h:495};
 const ratio=Math.min(area.w/image.naturalWidth,area.h/image.naturalHeight),iw=image.naturalWidth*ratio,ih=image.naturalHeight*ratio;
 c.save();c.shadowColor='rgba(0,0,0,.16)';c.shadowBlur=15;c.shadowOffsetY=13;c.drawImage(image,area.x+(area.w-iw)/2,area.y+(area.h-ih)/2,iw,ih);c.restore();
 // Wrap by words, then graphemes for long unbroken input. This prevents clipping in either language.
 const titleLines=fitText(c,value.title,940,3,83,32,family,'700');c.fillStyle=p.ink;const titleGap=titleLines.size*1.32,titleTop=916-(titleLines.lines.length-1)*titleGap/2;c.font=`700 ${titleLines.size}px ${family}`;titleLines.lines.forEach((line,i)=>c.fillText(line,600,titleTop+i*titleGap));
 const note=fitText(c,value.note,860,3,33,24,family,'400');c.fillStyle=p.ink;c.font=`400 ${note.size}px ${family}`;note.lines.forEach((line,i)=>c.fillText(line,600,1089+i*note.size*1.5));
 c.strokeStyle=p.line;c.lineWidth=2;c.beginPath();c.moveTo(400,1260);c.lineTo(545,1260);c.moveTo(655,1260);c.lineTo(800,1260);c.stroke();c.fillStyle=p.accent;c.font='48px Georgia';c.fillText('✽',600,1261);
 const sign=fitText(c,value.signature,940,2,23,19,'Arial, sans-serif','600');c.font=`600 ${sign.size}px Arial, sans-serif`;c.fillStyle=p.ink;sign.lines.forEach((line,i)=>c.fillText(line,600,1321+i*28));
 c.fillStyle=p.accent;c.font='600 19px Arial, sans-serif';c.textAlign='left';c.fillText('BANGLADESH',125,1381);c.textAlign='right';c.fillText('JAPAN',1075,1381);c.textAlign='center';c.font='28px Georgia';c.fillText('↔',600,1381);
 return canvas;
}
function fitText(c,text,maxWidth,maxLines,startSize,minSize,family,weight){
 let lines=[],size=startSize;for(;size>=minSize;size--){c.font=`${weight} ${size}px ${family}`;lines=wrap(c,text,maxWidth);if(lines.length<=maxLines)break;}return {lines,size:Math.max(minSize,size)};
}
function wrap(c,text,maxWidth){
 if(!text.trim())return [];
 const words=text.trim().split(/\s+/),lines=[];let line='';
 const graphemes=value=>typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(value)].map(s=>s.segment):Array.from(value);
 for(const word of words){if(c.measureText(word).width>maxWidth){if(line){lines.push(line);line='';}for(const char of graphemes(word)){if(line&&c.measureText(line+char).width>maxWidth){lines.push(line);line='';}line+=char;}}else{const next=line?line+' '+word:word;if(line&&c.measureText(next).width>maxWidth){lines.push(line);line=word;}else line=next;}}
 if(line)lines.push(line);return lines;
}

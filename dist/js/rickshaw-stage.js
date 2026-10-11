/** Freestanding rickshaw composition and its optional, user-triggered bell. */
export function renderRickshawStage(ctx,tx){
 return `<div class="rv-stage" data-parallax aria-label="A little rickshaw, carrying a little home">
  <svg class="rv-journey" viewBox="0 0 680 170" aria-hidden="true"><path d="M50 110C90 8 214 16 258 85S405 169 489 67 567 38 626 88" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="4 8"/><path d="m618 85 10 4-3-11" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>
  <div class="rv-postage rv-postage-dhaka" aria-hidden="true"><img src="assets/landmark-dhaka-v4.svg" alt="" width="180" height="200"><small>DHAKA / ঢাকা</small></div>
  <div class="rv-postage rv-postage-tokyo" aria-hidden="true"><img src="assets/landmark-tokyo-v4.svg" alt="" width="180" height="200"><small>TOKYO / 東京</small></div>
  <span class="rv-handwritten" aria-hidden="true">a little home,<br>wherever we go.</span>
  <figure class="rv-rickshaw" data-scene-reveal><img data-parallax-layer src="assets/rickshaw-cutout-v4.webp" width="1536" height="1024" alt="Freestanding hand-painted Bangladeshi rickshaw with a pink floral canopy, green peacock panels and blue wheels" fetchpriority="high"><figcaption><span>✽</span> ${tx('COLOURFUL ROOTS. NEW ROUTES.','রঙিন শিকড়। নতুন পথ।')}</figcaption></figure>
  <div class="rv-heart-seal" aria-hidden="true"><span>FROM BANGLADESH</span><strong lang="bn">মনের<br>টানে</strong><small>WITH LOVE</small></div>
  <div class="rv-bell-wrap"><button type="button" class="rv-bell" data-rickshaw-bell aria-label="Ring the rickshaw bell (plays a short sound)" title="Ring the rickshaw bell"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M10 23c0-6 4-11 10-11s10 5 10 11H10Zm-3 3h26M20 12V9m-3 22h6m8-16 4-3M8 15l-4-3"/><circle cx="20" cy="9" r="2"/></svg></button><span>${tx('A little ting-ting?','একটু টিং টিং?')}<small>${tx('Tap the bell · sound','বেল চাপুন · শব্দ')}</small></span></div>
 </div>`;
}

export function mountRickshawStage(ctx){
 document.querySelectorAll('[data-rickshaw-bell]').forEach(button=>{
  let cooling=false;
  button.addEventListener('click',()=>{
   if(cooling)return;
   cooling=true;
   const stage=button.closest('.rv-stage');
   stage?.classList.add('rv-ringing');
   ctx.toast('টিং টিং! There’s always room for one more.');
   try{
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(Audio){
     const audio=new Audio();
     const play=()=>{
      if(audio.state==='closed')return;
      const now=audio.currentTime;
      for(const delay of [0,.18])for(const [freq,volume]of [[1320,.07],[2640,.018],[3520,.012]]){
       const oscillator=audio.createOscillator(),gain=audio.createGain();
       oscillator.type='sine';oscillator.frequency.value=freq;gain.gain.setValueAtTime(.0001,now+delay);gain.gain.exponentialRampToValueAtTime(volume,now+delay+.005);gain.gain.exponentialRampToValueAtTime(.0001,now+delay+.55);oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(now+delay);oscillator.stop(now+delay+.6);
      }
      setTimeout(()=>{if(audio.state!=='closed')audio.close().catch(()=>{});},1100);
     };
     if(audio.state==='suspended')audio.resume().then(play).catch(()=>audio.close().catch(()=>{}));else play();
    }
   }catch{/* The visual acknowledgement works when browser audio is unavailable. */}
   setTimeout(()=>{stage?.classList.remove('rv-ringing');cooling=false;},1100);
  });
 });
}

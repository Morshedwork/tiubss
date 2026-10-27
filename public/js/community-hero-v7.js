/** Original illustrated welcome for TIU's Bangladeshi student community. */
export function renderCommunityHero(ctx,tx){
 const {icon,esc,store}=ctx,profile=store.getState().profile;
 return `<section class="ch-hero culture-hero" aria-labelledby="ch-hero-title">
  <div class="culture-hero-top"><span>TIU BANGLADESH STUDENT SOCIETY</span><span><i class="bridge-flag bridge-flag-bd" aria-hidden="true"></i> BANGLADESH <b>↔</b> JAPAN <i class="bridge-flag" aria-hidden="true"></i></span></div>
  <div class="culture-hero-layout">
   <div class="culture-hero-copy">
    <p class="culture-hero-eyebrow"><img src="assets/rickshaw-flower.svg" width="32" height="32" alt="" aria-hidden="true">${tx('OUR ROOTS. OUR PEOPLE. OUR TIU.','আমাদের শিকড়। আমাদের মানুষ। আমাদের টিআইইউ।')}</p>
    <h1 id="ch-hero-title">${tx('Your <span>Bangladesh,</span><em>right here at TIU.</em>','আপন <span>বাংলাদেশ,</span><em>আমাদের টিআইইউতে।</em>')}</h1>
    <p class="culture-hero-description">${tx('A community of Bangladeshi students at Tokyo International University. Sharing our culture, finding our feet in Japan, and turning new faces into familiar ones.','টোকিও ইন্টারন্যাশনাল ইউনিভার্সিটির বাংলাদেশি শিক্ষার্থীদের আপন কমিউনিটি। সংস্কৃতির টানে, জাপানে নতুন পথচলায়—অচেনা মুখগুলোই হয়ে ওঠে আপনজন।')}</p>
    <div class="culture-hero-actions"><a class="btn culture-hero-primary" href="/${profile?'community':'join'}">${tx(profile?'Find your people':'Come be part of us',profile?'আমাদের মানুষ':'আমাদের সঙ্গী হোন')} ${icon('arrowUp')}</a><a class="culture-hero-link" href="/events">${tx('Find a gathering','আয়োজনে দেখা হোক')} ${icon('arrowUp')}</a></div>
    <div class="culture-hero-welcome"><span lang="bn">একসাথে, আরও দূরে।</span><p>${tx('Students, alumni & friends.<br>There’s a place for your story here.','শিক্ষার্থী, অ্যালামনাই ও বন্ধু।<br>আপনার গল্পের জন্যও এখানে জায়গা আছে।')}</p></div>
   </div>
   <figure class="culture-hero-art" data-parallax>
    <div class="culture-hero-art-note"><span lang="bn">আড্ডায়, আনন্দে, আপনজনের টানে।</span><small>DHAKA ROOTS ↔ TOKYO CHAPTERS</small></div>
    <img class="culture-hero-sketch" src="assets/community-sketch-v7.webp" width="1536" height="1024" alt="Original ink and watercolour sketch of Bangladeshi university students sharing adda and food, surrounded by a painted rickshaw, Bengali folk motifs, Shaheed Minar and Tokyo Tower" fetchpriority="high" data-parallax-layer>
    <figcaption><span aria-hidden="true">✽</span>${tx('A little sketch of the belonging we’re building.','একসাথে গড়ে তোলা আপন ঠিকানার ছোট্ট ছবি।')}</figcaption>
   </figure>
  </div>
  <div class="culture-hero-paths" role="group" aria-label="Find your place in the community">
   <button type="button" data-home-jump="home-people"><span class="culture-path-number">01</span><span><small>${tx('FIND YOUR PEOPLE','আপনজন খুঁজে নিন')}</small><strong>${tx('New faces. Shared roots.','নতুন মুখ। চেনা শিকড়।')}</strong></span>${icon('arrowUp')}</button>
   <button type="button" data-home-jump="community-wall"><span class="culture-path-number">02</span><span><small>${tx('PULL UP A CHAIR','চলুন, গল্প করি')}</small><strong>${tx('Every friendship starts with adda.','আড্ডা থেকেই বন্ধুত্ব।')}</strong></span>${icon('arrowUp')}</button>
   <a href="/culture"><span class="culture-path-number">03</span><span><small>${tx('CARRY HOME WITH YOU','সাথে থাকুক ঘরের টান')}</small><strong>${tx('Two countries. So much to share.','দুই দেশ। কত গল্প।')}</strong></span>${icon('arrowUp')}</a>
  </div>
  ${store.getState().settings?.announcement?`<aside class="culture-hero-announcement"><span aria-hidden="true">✽</span><strong>${tx('From our community','আমাদের কমিউনিটি থেকে')}</strong><p>${esc(store.getState().settings.announcement)}</p><a href="/news">${tx('The journal','আমাদের জার্নাল')} ↗</a></aside>`:''}
 </section>`;
}

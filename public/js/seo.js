/** Shared metadata: used in the initial server response and client navigation. */
export const SITE_URL='https://www.tiubss.com';
export const SITE_NAME='TIU Bangladesh Students’ Society';
export const PAGES={
 '/':['TIU BSS | Bangladeshi Students at Tokyo International University','A community of Bangladeshi students, alumni and friends at Tokyo International University in Japan. Discover our culture, gatherings, reels and people.'],
 '/about':['About TIU BSS | Our Bangladesh Community in Japan','Get to know TIU Bangladesh Students’ Society: shared Bangladeshi roots, student friendships and a sense of belonging at Tokyo International University.'],
 '/community':['Our Community | Bangladeshi Students at TIU','Find your people at Tokyo International University. Meet the TIU BSS community, exchange experiences and connect through our shared roots in Bangladesh.'],
 '/alumni':['Alumni Network | TIU Bangladesh Students’ Society','Connect with TIU BSS alumni and explore shared experiences of university, careers and life in Japan.'],
 '/events':['Events & Gatherings | TIU BSS Japan','Discover published TIU BSS gatherings, cultural celebrations and student events at Tokyo International University.'],
 '/reels':['Community Reels & Videos | TIU BSS','Watch featured TIU BSS Instagram reels: campus friendships, festival preparations and Bangladeshi community moments in Japan.'],
 '/mela':['Digital Mela | Bangladesh Culture at TIU','Visit the TIU BSS digital mela. Explore food stalls, make a rickshaw-inspired artwork and join a conversation with our community in Japan.'],
 '/food':['Food Stalls | TIU BSS Community Gatherings','Explore food stalls for published TIU BSS events. Browse available menus and pickup details when an event opens for food orders.'],
 '/culture':['Bangladesh × Japan | TIU BSS Art & Culture','Explore Bangladeshi rickshaw art, Shaheed Minar, Sangsad Bhaban, Tokyo Tower and the cultural connections our TIU community carries across borders.'],
 '/gallery':['Photos & Artworks | TIU BSS Gallery','Explore community photographs, colourful Bangladeshi art references and original illustrations from TIU Bangladesh Students’ Society.'],
 '/art-studio':['Rickshaw Art Studio | Create a TIU BSS Postcard','Create your own Bangladesh-inspired digital postcard. Choose colours, rickshaw and folk motifs, add Bangla or English words and download your artwork.'],
 '/committee':['Committee & Advisory Board | TIU BSS 2026–2027','Meet the TIU BSS committee and advisory board for 2026–2027 through individual introductions and original Instagram panel announcements.'],
 '/news':['Community Journal | TIU BSS News & Stories','Read published announcements, community stories and updates from TIU Bangladesh Students’ Society in Japan.'],
 '/volunteer':['Volunteer with TIU BSS | Get Involved','Help bring our community together through events, hospitality, photography, design and student support at TIU BSS.'],
 '/mentorship':['Student & Alumni Mentorship | TIU BSS','Find a conversation about university life, careers, skills and settling into Japan through the TIU BSS community.'],
 '/partners':['Community Partners | Support TIU BSS','Explore opportunities to support TIU BSS cultural gatherings, student connections and community activities in Japan.'],
 '/contact':['Contact TIU BSS | Say Hello','Connect with TIU Bangladesh Students’ Society about community membership, gatherings, partnerships and new ideas.'],
 '/privacy':['Privacy | TIU BSS','Read how TIU BSS handles account information, profile choices, community content and administrator sessions.'],
 '/terms':['Community Guidelines | TIU BSS','Read TIU BSS community guidelines for respectful participation, sharing content, events and food pickup.']
};
export const ALIASES={'/home':'/','/mission':'/about','/history':'/about','/stalls':'/mela','/signup':'/join','/login':'/signin','/dashboard':'/profile','/orders':'/tickets','/index.html':'/'};
for(const section of ['events','members','orders','menu','vendors','wall','volunteers','inbox','reports','roles'])ALIASES['/admin/'+section]='/admin/services/'+section;
ALIASES['/admin/food-orders']='/admin/services/orders';
export function normalizePath(path){const p=String(path||'/').split(/[?#]/)[0].replace(/\/+$/,'')||'/';return ALIASES[p]||p;}
export function metadata(path,state={}){
 const pathname=normalizePath(path);let item=PAGES[pathname];
 let articleID='';try{articleID=decodeURIComponent(pathname.slice(6));}catch{}
 let article;if(pathname.startsWith('/news/')){article=(state.news||[]).find(n=>n.id===articleID&&n.status==='published');if(article)item=[`${article.title} | TIU BSS`,String(article.excerpt||article.body||'A story from the TIU BSS community.').replace(/\s+/g,' ').slice(0,160)];}
 const privateName=pathname.startsWith('/admin')?'Admin sign-in':pathname.startsWith('/profile')?'My profile':pathname.startsWith('/tickets')?'My tickets':pathname==='/join'?'Join our community':pathname==='/signin'?'Member sign-in':'Community portal';
 const [title,description]=item||[`${privateName} | TIU BSS`,'Your private TIU BSS community portal. Sign in to manage your account.'];
 const url=SITE_URL+pathname;const image=article?.image&&/^https:\/\//.test(article.image)?article.image:article?.image?.startsWith('/api/media/')?SITE_URL+article.image:SITE_URL+'/assets/community-sketch-v7.webp';
 const org={'@type':'Organization','@id':SITE_URL+'/#organization',name:SITE_NAME,alternateName:'TIU BSS',url:SITE_URL+'/',logo:SITE_URL+'/assets/favicon.svg',description:PAGES['/'][1],sameAs:['https://www.instagram.com/tiu.bss/']};
 const graph=[org,{'@type':'WebSite','@id':SITE_URL+'/#website',url:SITE_URL+'/',name:SITE_NAME,publisher:{'@id':org['@id']},inLanguage:['en','bn']},{'@type':'WebPage','@id':url+'#webpage',url,name:title,description,isPartOf:{'@id':SITE_URL+'/#website'},about:{'@id':org['@id']},inLanguage:'en'}];
 if(pathname!=='/'&&item)graph.push({'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Home',item:SITE_URL+'/'},{'@type':'ListItem',position:2,name:title.split(' | ')[0],item:url}]});
 return {title,description,url,image,indexable:Boolean(item),type:article?'article':'website',jsonld:{'@context':'https://schema.org','@graph':graph}};
}
export function applyMetadata(path,state){const m=metadata(path,state);document.title=m.title;
 const meta=(key,value,property=false)=>{let el=document.head.querySelector(`meta[${property?'property':'name'}="${key}"]`);if(!el){el=document.createElement('meta');el.setAttribute(property?'property':'name',key);document.head.append(el);}el.content=value;};
 meta('description',m.description);meta('robots',m.indexable?'index, follow, max-image-preview:large':'noindex, follow');
 for(const [key,value]of Object.entries({'og:title':m.title,'og:description':m.description,'og:url':m.url,'og:image':m.image,'og:type':m.type,'og:site_name':SITE_NAME}))meta(key,value,true);
 for(const[key,value]of Object.entries({'twitter:card':'summary_large_image','twitter:title':m.title,'twitter:description':m.description,'twitter:image':m.image}))meta(key,value);
 let canonical=document.head.querySelector('link[rel="canonical"]');if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.append(canonical);}canonical.href=m.url;
 let schema=document.getElementById('site-schema');if(!schema){schema=document.createElement('script');schema.id='site-schema';schema.type='application/ld+json';document.head.append(schema);}schema.textContent=JSON.stringify(m.jsonld);
}

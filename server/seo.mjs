import {renderAdminLogin} from '../public/js/standalone-admin.js';
import {adminStyles,communityStyles} from '../public/js/ui-styles.js';
import {PAGES,SITE_URL,SITE_NAME,metadata,normalizePath} from '../public/js/seo.js';
import {createPublicViews} from '../public/js/public-views.js';
import {renderReelsPage} from '../public/js/reels.js';
import {renderMela} from '../public/js/mela.js';
import {renderCulturePage} from '../public/js/culture-v3.js';
import {renderArtStudio} from '../public/js/art-studio.js';
import {renderEvents,renderFoodHub} from '../public/js/events.js';
import {renderCommunity} from '../public/js/community.js';
import {icon} from '../public/js/icons.js';
import {readPublic} from './admin.mjs';
export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function publicState(content={}){
 const arrays=['events','menu','vendors','members','tickets','orders','gallery','reels','news','volunteers','messages','posts','committee','partners','audits','publicMembers'];
 const state={...Object.fromEntries(arrays.map(k=>[k,[]])),...content,profile:null,loading:false,isLive:true,auth:{user:null,configured:true},roles:[],settings:{title:SITE_NAME,instagram:'https://www.instagram.com/tiu.bss/',...content.settings}};
 state.gallery=[{id:'reference-peacocks',title:'Colour, culture & connection',category:'Art & Culture',image:'assets/reference-peacocks.webp',caption:'Artwork supplied as a visual reference for this website.',isArtwork:true},{id:'reference-flowers',title:'Rooted in tradition',category:'Art & Culture',image:'assets/reference-flowers.webp',caption:'Artwork supplied as a visual reference for this website.',isArtwork:true},...state.gallery];return state;
}
const safeDecode=value=>{try{return decodeURIComponent(value);}catch{return '';}};
export function renderPublic(path,state){
 const ctx={store:{getState:()=>state},esc:escapeHTML,icon,money:n=>`¥${Number(n||0).toLocaleString('en-US')}`,formatDate:d=>d?new Date(`${String(d).slice(0,10)}T12:00:00+09:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Tokyo'}):''};
 const tx=en=>en,views=createPublicViews(ctx,{tx,getRoute:()=>path});let body;
 switch(path){
 case '/':body=views.renderHome();break;
 case '/about':body=views.renderAbout();break;
 case '/community':body=renderCommunity(ctx);break;
 case '/alumni':body=renderCommunity(ctx,true);break;
 case '/events':body=renderEvents(ctx);break;
 case '/food':body=renderFoodHub(ctx);break;
 case '/reels':body=renderReelsPage(ctx,tx);break;
 case '/culture':body=renderCulturePage(ctx,tx);break;
 case '/mela':body=renderMela(ctx,tx);break;
 case '/art-studio':body=renderArtStudio(ctx,tx);break;
 case '/committee':body=views.renderCommittee();break;
 case '/gallery':body=views.renderGallery();break;
 case '/news':body=views.renderNews();break;
 case '/contact':case '/volunteer':case '/mentorship':case '/partners':body=views.renderParticipate(path.slice(1));break;
 case '/privacy':body=views.renderLegal();break;
 case '/terms':body=views.renderLegal(true);break;
 default:body=path.startsWith('/news/')?views.renderNews(safeDecode(path.slice(6))):`<section class="page-container"><div class="page-heading"><h1>${escapeHTML(metadata(path,state).title.split(' | ')[0])}</h1><p>Enable JavaScript to use this account service.</p><a href="/" class="btn btn-primary">Return home</a></div></section>`;
 }
 return {body:body.replace(/<main\b/g,'<section').replace(/<\/main>/g,'</section>'),header:views.header(),footer:views.footer(),missing:views.missing()};
}
const knownPrivate=p=>/^\/(?:admin(?:\/(?:login|overview|reels|gallery|news|committee|partners|settings|services(?:\/(?:overview|events|members|orders|menu|vendors|wall|volunteers|inbox|reports|roles))?|team|accept))?|staff(?:\/[^/]+)?|members\/[^/]+|events\/[^/]+(?:\/food)?|profile|tickets|join|signin|forgot-password|setup|verify-certificate(?:\/[^/]+)?)$/.test(p);
export function renderDocument(template,path,content={},options={}){
 const state=publicState(content),m=metadata(path,state),view=renderPublic(path,state);
 const isAdmin=path==='/admin'||path.startsWith('/admin/');
 if(isAdmin){view.body=renderAdminLogin({esc:escapeHTML},{ready:true,error:''}).replace(/<main\b/g,'<section').replace(/<\/main>/g,'</section>');view.header='<div class="top-ribbon"><span>TIU BSS · ADMIN WORKSPACE</span><a href="/" style="color:inherit">Back to the community ↗</a></div>';view.footer='';template=template.replace('<script src="firebase-config.js"></script>','').replace('src="js/app.js"','src="js/admin-page.js"').replace('</head>','<style>'+adminStyles+'\n'+communityStyles+'</style></head>');}
 const found=Boolean(PAGES[path]||knownPrivate(path)||(path.startsWith('/news/')&&m.indexable));
 if(!found){m.title='Page not found | TIU BSS';m.description='This page could not be found. Explore the TIU BSS community, events and culture.';m.indexable=false;}
 const robots=m.indexable?'index, follow, max-image-preview:large':'noindex, follow';
 const initial=JSON.stringify(content).replace(/</g,'\\u003c');
 const head=`<script type="application/json" id="public-content">${initial}</script><link rel="canonical" href="${escapeHTML(m.url)}"><meta name="robots" content="${robots}"><meta property="og:site_name" content="${escapeHTML(SITE_NAME)}"><meta property="og:type" content="${m.type}"><meta property="og:title" content="${escapeHTML(m.title)}"><meta property="og:description" content="${escapeHTML(m.description)}"><meta property="og:url" content="${escapeHTML(m.url)}"><meta property="og:image" content="${escapeHTML(m.image)}"><meta property="og:image:alt" content="Bangladeshi students, rickshaw art and Bangladesh–Japan landmarks"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHTML(m.title)}"><meta name="twitter:description" content="${escapeHTML(m.description)}"><meta name="twitter:image" content="${escapeHTML(m.image)}"><script id="site-schema" type="application/ld+json">${JSON.stringify(m.jsonld).replace(/</g,'\\u003c')}</script>${path==='/'?'<link rel="preload" as="image" href="/assets/community-sketch-v7.webp">':''}<style>html:not([data-motion]) [data-reveal]{opacity:1!important;transform:none!important}noscript{display:block;padding:1rem;text-align:center}</style>`;
 let html=template.replace(/<title>.*?<\/title>/s,`<title>${escapeHTML(m.title)}</title>`).replace(/<meta name="description"[^>]+>/,`<meta name="description" content="${escapeHTML(m.description)}">`).replace('</head>',head+'</head>').replace('<header id="site-header"></header>',`<header id="site-header">${view.header}</header>`).replace(/<div id="app">.*?<\/div><\/div><\/main>/s,`<div id="app">${found?view.body:view.missing}</div></main>`).replace('<footer id="site-footer"></footer>',`<footer id="site-footer">${view.footer}</footer>`);
 const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Robots-Tag':robots};
 return new Response(html,{status:found?200:404,headers});
}
export function sitemap(content={}){const paths=[...Object.keys(PAGES),...(content.news||[]).filter(n=>n.status==='published').map(n=>'/news/'+encodeURIComponent(n.id))];return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+paths.map(p=>`<url><loc>${escapeHTML(SITE_URL+p)}</loc></url>`).join('')+'</urlset>';}
export async function serveSite(request,env,template){
 const url=new URL(request.url),path=normalizePath(url.pathname);
 if(url.hostname==='tiubss.com')return Response.redirect(SITE_URL+path+url.search,308);
 if(path!==url.pathname)return Response.redirect(url.origin+path+url.search,308);
 if(path==='/robots.txt')return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${SITE_URL}/sitemap.xml\n`,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public, max-age=3600'}});
 if(path==='/admin'||path.startsWith('/admin/'))return renderDocument(template,path);
 // Only the published CMS feed is read here; never member, order or admin-session records.
 let content={};try{content=await readPublic(env);}catch(error){console.error('Public content unavailable:',error?.message);if(path==='/sitemap.xml'||path.startsWith('/news/'))return new Response('Community content is temporarily unavailable. Please try again.',{status:503,headers:{'Retry-After':'60','X-Robots-Tag':'noindex','Cache-Control':'no-store'}});}
 if(path==='/sitemap.xml')return new Response(sitemap(content),{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=300'}});
 return renderDocument(template,path,content);
}

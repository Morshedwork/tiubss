import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {PAGES,metadata} from '../public/js/seo.js';
import {renderDocument,sitemap,serveSite} from '../server/seo.mjs';
import {routeTarget,installRouter,navigateRoute,currentRoute} from '../public/js/router.js';
const template=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
test('public pages deliver readable HTML, one heading, clean links and unique metadata before JavaScript',async()=>{
 const titles=new Set();for(const path of Object.keys(PAGES)){
  const response=renderDocument(template,path);assert.equal(response.status,200,path);const html=await response.text();
  assert.equal((html.match(/<h1\b/g)||[]).length,1,path);assert.ok(!html.includes('Finding our way home'),path);assert.ok(!html.includes('href="#/'),path);
  assert.match(html,new RegExp(`rel="canonical" href="https://www.tiubss.com${path}"`));assert.match(html,/<base href="\/">/);assert.match(html,/application\/ld\+json/);
  titles.add(html.match(/<title>(.*?)<\/title>/)[1]);
 }assert.equal(titles.size,Object.keys(PAGES).length);
});
test('account pages stay out of search and unknown URLs return real 404s',async()=>{
 for(const p of ['/admin/login','/admin/settings','/admin/services','/admin/services/members','/admin/services/events','/admin/services/orders','/admin/services/menu','/admin/services/vendors','/admin/services/roles','/profile','/tickets','/staff/food','/members/private-user']){
  const r=renderDocument(template,p);assert.equal(r.status,200,p);assert.match(r.headers.get('x-robots-tag'),/noindex/);assert.equal(r.headers.get('cache-control'),'no-store');
 }
 for(const p of ['/does-not-exist','/news/missing','/culture/nonsense','/news/%E0%A4%A'])assert.equal(renderDocument(template,p).status,404,p);
});
test('published stories are discoverable and serialized content cannot escape its script element',async()=>{
 const content={news:[{id:'story-1',status:'published',title:'A shared celebration',excerpt:'Campus memories',body:'Hello </script><script>alert(1)</script>'}]};
 const r=renderDocument(template,'/news/story-1',content),html=await r.text();assert.equal(r.status,200);assert.match(html,/A shared celebration/);assert.ok(!html.includes('</script><script>alert(1)'));assert.match(sitemap(content),/https:\/\/www.tiubss.com\/news\/story-1/);
 assert.ok(!sitemap({news:[{id:'private',status:'draft'}]}).includes('/news/private'));
});
test('sitemap contains canonical public URLs only; robots advertises it without hiding noindex pages',async()=>{
 const xml=sitemap();assert.equal((xml.match(/<loc>/g)||[]).length,Object.keys(PAGES).length);assert.doesNotMatch(xml,/#\/|\/admin|\/profile|\/tickets|\/signin/);
 const r=await serveSite(new Request('https://www.tiubss.com/robots.txt'),{},template);assert.equal(r.status,200);assert.match(await r.text(),/Sitemap: https:\/\/www.tiubss.com\/sitemap.xml/);
 const fail=await serveSite(new Request('https://www.tiubss.com/news/example'),{},template);assert.equal(fail.status,503);
});
test('aliases redirect permanently and routing rejects external redirect tricks',async()=>{
 for(const [from,to]of [['/home','/'],['/stalls','/mela'],['/culture/','/culture'],['/login','/signin'],['/admin/menu','/admin/services/menu'],['/admin/members','/admin/services/members'],['/admin/orders','/admin/services/orders']]){
  const r=await serveSite(new Request('https://www.tiubss.com'+from+'?x=1'),{},template);assert.equal(r.status,308);assert.equal(r.headers.get('location'),'https://www.tiubss.com'+to+'?x=1');
 }
 assert.equal(routeTarget('/reels?category=Community','https://www.tiubss.com'),'/reels?category=Community');
 for(const p of ['//evil.example/','/\\evil.example/','https://evil.example/','javascript:alert(1)'])assert.equal(routeTarget(p,'https://www.tiubss.com'),null);
});
test('legacy bookmarks, client navigation and browser history stay compatible',()=>{
 const prior={location:globalThis.location,document:globalThis.document,history:globalThis.history,window:globalThis.window};
 const target=new EventTarget();let renders=0;const loc=new URL('https://www.tiubss.com/#/reels?category=Gatherings');
 globalThis.location=loc;globalThis.window=target;globalThis.document=new EventTarget();globalThis.history={replaceState:(_s,_t,p)=>loc.href=new URL(p,loc).href,pushState:(_s,_t,p)=>loc.href=new URL(p,loc).href};
 try{installRouter(()=>renders++);assert.equal(currentRoute(),'/reels?category=Gatherings');navigateRoute('/culture');assert.equal(currentRoute(),'/culture');assert.equal(renders,1);target.dispatchEvent(new Event('popstate'));assert.equal(renders,2);}finally{Object.assign(globalThis,prior);}
});
test('all first-party images referenced in rendered public pages exist',async()=>{
 for(const p of Object.keys(PAGES)){const html=await renderDocument(template,p).text();for(const match of html.matchAll(/(?:src|poster)="(assets\/[^"?]+)"/g))assert.ok(existsSync(new URL('../public/'+match[1],import.meta.url)),match[1]);}
});

test('apex redirects to the canonical www host while preserving paths and queries',async()=>{const r=await serveSite(new Request('https://tiubss.com/reels?category=Community'),{},template);assert.equal(r.status,308);assert.equal(r.headers.get('location'),'https://www.tiubss.com/reels?category=Community');});

test('direct admin pages have their own entry point and username login without Firebase',async()=>{
 for(const path of ['/admin','/admin/login','/admin/reels']){const response=await serveSite(new Request('https://www.tiubss.com'+path),{},template),html=await response.text();assert.equal(response.status,200);assert.match(html,/name="username"/);assert.match(html,/name="password"/);assert.match(html,/js\/admin-page.js/);assert.doesNotMatch(html,/firebase-config.js|src="js\/app.js"/);assert.match(response.headers.get('x-robots-tag'),/noindex/);}
});

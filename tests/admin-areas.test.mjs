import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ADMIN_AREAS,renderAdminAreas} from '../public/js/admin-areas.js';
import {renderDocument} from '../server/seo.mjs';
import {renderCultureTrail} from '../public/js/culture-v3.js';
import {renderArtStudio} from '../public/js/art-studio.js';
import {renderStandaloneAdmin,initializeStandaloneAdmin} from '../public/js/standalone-admin.js';
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const template=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
const c={esc,icon:()=>'',renderMemberServices:()=>'<section>Real service render reached</section>'};
test('every footer area maps to a working Admin route with a page preview',async()=>{
 assert.equal(ADMIN_AREAS.length,18);const html=renderAdminAreas(c);
 for(const [,label,page,manage,,extra]of ADMIN_AREAS){assert.ok(html.includes(esc(label)),label);assert.ok(html.includes('href="'+page+'"'));for(const path of [manage,extra].filter(Boolean)){const response=renderDocument(template,path.split('?')[0]);assert.equal(response.status,200,path);assert.match(await response.text(),/js\/admin-page.js/);}}
});
test('signed-in Admin renders all areas, nested member services and the art studio',async()=>{
 const prior={location:globalThis.location,fetch:globalThis.fetch};
 try{
  globalThis.location=new URL('https://bss.test/admin');
  globalThis.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('/team')?{accounts:[]}:String(url).endsWith('/workspace')?{user:{role:'owner',name:'Admin'},records:[],settings:{},history:[]}:{user:{role:'owner',name:'Admin'}}),{status:200});
  await initializeStandaloneAdmin();
  for(const path of ['/admin/areas','/admin/services','/admin/services/counter','/admin/art-studio']){
   globalThis.location=new URL('https://bss.test'+path);const html=renderStandaloneAdmin(c);assert.match(html,/sa-dashboard/);
   if(path.includes('/services'))assert.match(html,/Real service render reached/);
   if(path.endsWith('/art-studio'))assert.match(html,/Publish to gallery/);
  }
 }finally{Object.assign(globalThis,prior);}
});
test('managed culture records escape HTML and empty publication does not restore hidden defaults',()=>{
 const state={catalogManaged:true,culture:[]};const context={...c,store:{getState:()=>state}};
 assert.equal(renderCultureTrail(context),'');
 state.culture=[{id:'p',name:'<img onerror=alert(1)>',title:'<script>',bn:'',place:'Japan',short:'Intro',image:'assets/reference-peacocks.webp',body:'<svg onload=alert(1)>',invitation:'hello',href:'/community',action:'Visit',source:'https://example.org',sourceLabel:'Reference'}];
 const html=renderCultureTrail(context);assert.doesNotMatch(html,/<script>|<img onerror|<svg onload/);assert.match(html,/&lt;script&gt;/);
 assert.match(renderArtStudio({...c,adminArt:true}),/signed-in Admin workspace/);
});

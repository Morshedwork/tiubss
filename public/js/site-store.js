import {BUILTIN_RECORDS} from './builtin-content.js';
import * as members from './live-store.js';
export * from './live-store.js';

let content={};try{content=JSON.parse(globalThis.document?.getElementById('public-content')?.textContent||'{}');}catch{}const subscribers=new Set();let loading;
export function getState(){const state=members.getState();for(const key of ['reels','gallery','news','committee','partners','panels','culture'])if(Array.isArray(content[key])){const records=new Map((state[key]||[]).filter(row=>!content.catalogManaged||!BUILTIN_RECORDS.some(b=>b.id===row.id||b.id==='builtin_'+key+'_'+row.id)).map(item=>[item.id,item]));for(const item of content[key])records.set(item.id,item);state[key]=[...records.values()];}state.catalogManaged=!!content.catalogManaged;state.settings={...state.settings,...content.settings};return state;}
const emit=()=>subscribers.forEach(fn=>fn(getState()));
members.subscribe(emit);
export function subscribe(fn){subscribers.add(fn);return()=>subscribers.delete(fn);}
export async function refreshWebsiteContent(){if(loading)return loading;loading=(async()=>{try{const response=await fetch('/api/site-content',{cache:'no-store'});if(response.ok){content=await response.json();emit();}}catch{}finally{loading=null;}})();return loading;}
export function initialize(){void refreshWebsiteContent();return members.initialize();}
export async function refresh(){await Promise.all([refreshWebsiteContent(),members.refresh()]);return getState();}
if(typeof window!=='undefined')window.addEventListener('bss-content-updated',refreshWebsiteContent);

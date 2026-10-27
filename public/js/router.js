import {normalizePath} from './seo.js';
export const currentRoute=()=>globalThis.location?location.pathname+location.search:'/';
export function routeTarget(value,origin=location.origin){
 if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//'))return null;
 const url=new URL(value,origin);if(url.origin!==origin)return null;
 return normalizePath(url.pathname)+url.search+url.hash;
}
export function navigateRoute(value,{replace=false}={}){const target=routeTarget(value);if(!target)return false;history[replace?'replaceState':'pushState']({},'',target);window.dispatchEvent(new Event('bss:navigation'));return true;}
export function installRouter(onNavigate,{scope=()=>true}={}){
 const legacy=()=>{if(location.hash.startsWith('#/')){const target=routeTarget(location.hash.slice(1));if(target)history.replaceState({},'',target);}};
 legacy();
 document.addEventListener('click',event=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;const link=event.target.closest('a[href]');if(!link||link.target||link.hasAttribute('download'))return;
 const raw=link.getAttribute('href');if(!raw.startsWith('/')&&!raw.startsWith('#/'))return;const value=raw.startsWith('#/')?raw.slice(1):raw;const url=new URL(value,location.origin);if(url.origin!==location.origin||/^\/(?:api|assets|js)\//.test(url.pathname)||/\.[a-z0-9]{2,6}$/i.test(url.pathname))return;
 if(!scope(url.pathname))return;event.preventDefault();navigateRoute(value);
 });
 const changed=()=>{onNavigate();window.dispatchEvent(new Event('bss:route-changed'));};
 window.addEventListener('popstate',changed);window.addEventListener('bss:navigation',changed);window.addEventListener('hashchange',()=>{if(location.hash.startsWith('#/')){legacy();changed();}});
}

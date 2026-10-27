import html from '../site/index.html?raw';
import {env} from 'cloudflare:workers';
import {serveSite} from '../server/seo.mjs';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>serveSite(request,env,html);

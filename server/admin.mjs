import {builtinRecord,mergeBuiltinRecords} from '../public/js/builtin-content.js';
import { contentSchemas, settingsFields } from '../public/js/admin-content-schema.js';
import { normalizeInstagramReelURL } from '../public/js/instagram.js';

const COOKIE = '__Host-bss_admin';
const SESSION_SECONDS = 8 * 60 * 60;
const encoder = new TextEncoder();
const json = (value, status=200, extra={}) => new Response(JSON.stringify(value), {status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
const failure = (status,message) => Object.assign(new Error(message), {status});
const hex = bytes => [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const digest = async value => hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
const unhex = value => Uint8Array.from(value.match(/.{2}/g)||[], h=>parseInt(h,16));
const sameBytes = (a,b) => {let difference=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)difference|=(a[i]||0)^(b[i]||0);return difference===0;};
function config(env) {
  const encoded=env.BSS_ADMIN_PASSWORD_HASH;
  if(!env.DB || !/^pbkdf2-sha256\$100000\$[a-f0-9]{64}\$[a-f0-9]{64}$/.test(encoded||''))throw failure(503,'Administrator sign-in is awaiting server configuration.');
  return encoded;
}
export async function verifyPassword(password,encoded) {
  const [,iterations,salt,expected]=encoded.split('$');
  const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const actual=await crypto.subtle.deriveBits({name:'PBKDF2',salt:unhex(salt),iterations:Number(iterations),hash:'SHA-256'},key,256);
  return sameBytes(new Uint8Array(actual),unhex(expected));
}
function cookie(request) {
  return request.headers.get('Cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
}
const ownerUser={id:'owner',username:'Admin',name:'Admin',email:'',role:'owner'};
const accountUser=row=>({id:row.id,username:row.email,email:row.email,name:row.name,role:'admin'});
async function hashPassword(password){const salt=crypto.getRandomValues(new Uint8Array(32)),key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},key,256);return 'pbkdf2-sha256$100000$'+hex(salt)+'$'+hex(bits);}
async function issueSession(env,user,encoded){
 const token=randomToken(),now=Date.now(),expiresAt=now+SESSION_SECONDS*1000;
 await env.DB.batch([
  env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').bind(now),
  env.DB.prepare('DELETE FROM admin_login_limits WHERE expires_at <= ?').bind(now),
  env.DB.prepare('INSERT INTO admin_sessions (id, credential_version, expires_at, created_at, account_id) VALUES (?, ?, ?, ?, ?)').bind(await digest(token),await digest(encoded),expiresAt,now,user.id==='owner'?null:user.id)
 ]);
 await audit(env.DB,'admin.sign_in',user.username,user.username);
 return json({user,expiresAt},200,{'Set-Cookie':`${COOKIE}=${token}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`});
}
async function session(request,env) {
  const encoded=config(env),token=cookie(request);
  if(!/^[a-f0-9]{64}$/.test(token))throw failure(401,'Sign in to the admin workspace.');
  const id=await digest(token),row=await env.DB.prepare('SELECT * FROM admin_sessions WHERE id = ?').bind(id).first();
  if(!row || row.expires_at<=Date.now())throw failure(401,'Your admin session has expired. Please sign in again.');
  let verifier=encoded,user=ownerUser;
  if(row.account_id){const account=await env.DB.prepare('SELECT * FROM admin_accounts WHERE id = ?').bind(row.account_id).first();if(!account||account.status!=='active'||!account.password_hash)throw failure(401,'This admin account no longer has access.');verifier=account.password_hash;user=accountUser(account);}
  if(row.credential_version!==await digest(verifier))throw failure(401,'Your admin session has expired. Please sign in again.');
  return {...row,user};
}
function requireOrigin(request) {
  if(request.headers.get('Origin')!==new URL(request.url).origin || request.headers.get('X-BSS-Admin')!=='1')throw failure(403,'This action must be submitted from the admin workspace.');
}
async function readBytes(request,max) {
  if(Number(request.headers.get('Content-Length')||0)>max)throw failure(413,'This request is too large.');
  const reader=request.body?.getReader();if(!reader)return new Uint8Array();
  const parts=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw failure(413,'This request is too large.');}parts.push(value);}
  const result=new Uint8Array(size);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;
}
async function body(request,max=60000) {
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw failure(415,'A JSON request is required.');
  if(Number(request.headers.get('Content-Length')||0)>max)throw failure(413,'This request is too large.');
  const raw=new TextDecoder().decode(await readBytes(request,max));
  let value;try{value=JSON.parse(raw);}catch{throw failure(400,'The request could not be read.');}
  if(!value || Array.isArray(value) || typeof value!=='object')throw failure(400,'Invalid request.');
  return value;
}
async function limitLogin(request,env) {
  const now=Date.now(),bucket=Math.floor(now/900000),ip=request.headers.get('CF-Connecting-IP')||'unknown';
  const keys=[['ip:'+await digest(ip)+':'+bucket,8],['account:'+bucket,60]];
  for(const [id,max] of keys){const row=await env.DB.prepare('INSERT INTO admin_login_limits (id, attempts, expires_at) VALUES (?, 1, ?) ON CONFLICT(id) DO UPDATE SET attempts = attempts + 1 RETURNING attempts').bind(id,now+1800000).first();if(row.attempts>max)throw failure(429,'Too many sign-in attempts. Please try again in 15 minutes.');}
}
function publicRecord(row){return {...JSON.parse(row.data),id:row.id,version:row.version,createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString()};}
async function audit(db,action,target,actor='Admin'){return db.prepare('INSERT INTO admin_audit (id, action, target, created_at, actor) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(),action,target,Date.now(),actor).run();}
function safeURL(value,image=false) {
  if(image && /^assets\/[A-Za-z0-9_./-]+$/.test(value) && !value.split('/').includes('..'))return true;
  if(image && /^\/api\/media\/[a-f0-9-]+\.(jpg|png|webp)$/.test(value))return true;
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}
}
function fields(input,descriptors) {
  const result={};
  for(const [key,label,required,max,type] of descriptors){const value=String(input[key]??'').trim();if(required&&!value)throw failure(400,`${label} is required.`);if(value.length>max)throw failure(400,`${label} is too long.`);if(value&&['url','image'].includes(type)&&!safeURL(value,type==='image'))throw failure(400,`${label} must be a valid HTTPS link or an uploaded image.`);if(value&&type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw failure(400,'Enter a valid contact email.');if(type==='path'&&value&&(!/^\/[a-zA-Z0-9][a-zA-Z0-9/?=&_%.-]*$/.test(value)||value.includes('..')))throw failure(400,'Use a website path such as /community or /events.');if(type==='images'&&value.split('\n').filter(Boolean).some(url=>!safeURL(url.trim(),true)))throw failure(400,'Each picture must be a valid image link.');if(type==='date'&&value&&!/^\d{4}-\d{2}-\d{2}$/.test(value))throw failure(400,'Enter a valid date.');result[key]=type==='images'?value.split('\n').map(line=>line.trim()).filter(Boolean).join('\n'):value;}
  return result;
}
export function validateRecord(kind,input) {
  const schema=contentSchemas[kind];if(!schema)throw failure(404,'This content section does not exist.');
  const data=fields(input,schema.fields);
  if(!['draft','published'].includes(input.status))throw failure(400,'Choose Draft or Published.');data.status=input.status;
  if(kind==='reels'){data.url=normalizeInstagramReelURL(data.url);if(!data.url)throw failure(400,'Use a direct Instagram reel link.');}
  if(kind==='panels'&&!['leadership','secretaries','support','advisory'].includes(data.category))throw failure(400,'Choose leadership, secretaries, support or advisory.');
  if(kind==='news'&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug))throw failure(400,'Use lowercase words separated by hyphens for the page slug.');
  return data;
}
export async function readPublic(env) {
  if(!env.DB)throw failure(503,'Website content is not available yet.');
  const rows=await env.DB.prepare('SELECT * FROM website_records ORDER BY created_at DESC LIMIT 1000').all();
  const result=Object.fromEntries(Object.keys(contentSchemas).map(k=>[k,[]]));
  for(const row of mergeBuiltinRecords((rows.results||[]).map(row=>({...publicRecord(row),collection:row.collection}))).filter(row=>row.status==='published'))if(result[row.collection])result[row.collection].push(row);
  result.catalogManaged=true;
  const settings=await env.DB.prepare("SELECT data FROM website_settings WHERE id = 'main'").first();
  result.settings=settings?JSON.parse(settings.data):{};return result;
}
export async function handleAdminAPI(request,env) {
  const url=new URL(request.url),path=url.pathname,method=request.method;
  try{
    if(path==='/api/site-content'&&method==='GET')return json(await readPublic(env),200,{'Cache-Control':'public, max-age=30'});
    if(path.startsWith('/api/media/')&&method==='GET'){
      const key=path.slice('/api/media/'.length);if(!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(key))throw failure(404,'Image not found.');
      const object=await env.BUCKET?.get('admin-media/'+key);if(!object)throw failure(404,'Image not found.');
      return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'application/octet-stream','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
    }
    if(!path.startsWith('/api/admin/'))throw failure(404,'Not found.');
    if(!['GET','POST','PUT','DELETE'].includes(method))throw failure(405,'Method not allowed.');
    if(method!=='GET')requireOrigin(request);
    if(path==='/api/admin/login'&&method==='POST'){
      const rootVerifier=config(env);await limitLogin(request,env);const data=await body(request,1000);
      const username=String(data.username||'').trim().toLowerCase(),password=typeof data.password==='string'?data.password:'';
      if(password.length>128||username.length>254)throw failure(401,'The username/email or password is incorrect.');
      const account=username==='admin'?null:await env.DB.prepare("SELECT * FROM admin_accounts WHERE email = ? AND status = 'active'").bind(username).first();
      const encoded=account?.password_hash||rootVerifier,valid=await verifyPassword(password,encoded);
      if(!valid||(username!=='admin'&&!account?.password_hash))throw failure(401,'The username/email or password is incorrect.');
      return issueSession(env,account?accountUser(account):ownerUser,encoded);
    }
    if(['/api/admin/invitation/inspect','/api/admin/invitation/accept'].includes(path)&&method==='POST'){
      config(env);await limitLogin(request,env);const data=await body(request,1200),token=String(data.token||'');
      if(!/^[a-f0-9]{64}$/.test(token))throw failure(400,'This invitation is invalid or expired. Ask the owner for a new link.');
      const invitationHash=await digest(token),now=Date.now();
      const row=await env.DB.prepare("SELECT * FROM admin_accounts WHERE invite_hash = ? AND status = 'pending' AND invite_expires_at > ?").bind(invitationHash,now).first();
      if(!row)throw failure(400,'This invitation is invalid or expired. Ask the owner for a new link.');
      if(path.endsWith('/inspect'))return json({email:row.email,name:row.name,expiresAt:row.invite_expires_at});
      const password=typeof data.password==='string'?data.password:'';
      if(password.length<12||password.length>128)throw failure(400,'Use a password between 12 and 128 characters.');
      const encoded=await hashPassword(password);
      const accepted=await env.DB.prepare("UPDATE admin_accounts SET password_hash=?,status='active',invite_hash=NULL,invite_expires_at=NULL,updated_at=? WHERE id=? AND invite_hash=? AND status='pending' AND invite_expires_at>? RETURNING id").bind(encoded,Date.now(),row.id,invitationHash,Date.now()).first();
      if(!accepted)throw failure(409,'This invitation was already used or expired. Ask the owner for a new link.');
      await audit(env.DB,'admin.invitation_accepted',row.email,row.email);
      return issueSession(env,accountUser(row),encoded);
    }
    const current=await session(request,env);
    if(path==='/api/admin/session'&&method==='GET')return json({user:current.user,expiresAt:current.expires_at});
    if(path==='/api/admin/logout'&&method==='POST'){
      await env.DB.prepare('DELETE FROM admin_sessions WHERE id = ?').bind(current.id).run();
      return json({ok:true},200,{'Set-Cookie':`${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`});
    }
    if(path==='/api/admin/workspace'&&method==='GET'){
      const records=await env.DB.prepare('SELECT * FROM website_records ORDER BY created_at DESC LIMIT 1000').all();
      const settings=await env.DB.prepare("SELECT data,version FROM website_settings WHERE id = 'main'").first();
      const history=await env.DB.prepare('SELECT action, target, created_at, actor FROM admin_audit ORDER BY created_at DESC LIMIT 20').all();
      return json({records:mergeBuiltinRecords((records.results||[]).map(row=>({...publicRecord(row),collection:row.collection}))),settings:settings?JSON.parse(settings.data):{},settingsVersion:settings?.version||0,history:history.results||[],user:current.user});
    }
    if(path==='/api/admin/team'||path.startsWith('/api/admin/team/')){
      if(current.user.role!=='owner')throw failure(403,'Only the owner can manage admin access.');
      if(path==='/api/admin/team'&&method==='GET'){
        const rows=await env.DB.prepare('SELECT id,email,name,status,invite_expires_at,created_at,updated_at FROM admin_accounts ORDER BY created_at DESC LIMIT 100').all();return json({accounts:rows.results||[]});
      }
      if(path==='/api/admin/team'&&method==='POST'){
        const input=await body(request,1200),email=String(input.email||'').trim().toLowerCase(),name=String(input.name||'').trim();
        if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)||email.split('@').length!==2)throw failure(400,'Enter a valid email address.');
        if(!name||name.length>100)throw failure(400,'Enter a name of up to 100 characters.');
        const existing=await env.DB.prepare('SELECT id,status FROM admin_accounts WHERE email=?').bind(email).first();
        if(existing?.status==='active')throw failure(409,'This email already has an active admin account.');
        const count=await env.DB.prepare('SELECT COUNT(*) AS count FROM admin_accounts').first();if(!existing&&count.count>=100)throw failure(409,'The admin team has reached its account limit.');
        const token=randomToken(),id=existing?.id||crypto.randomUUID(),now=Date.now(),expiresAt=now+24*60*60*1000,tokenHash=await digest(token);
        if(existing)await env.DB.prepare("UPDATE admin_accounts SET name=?,status='pending',password_hash=NULL,invite_hash=?,invite_expires_at=?,updated_at=? WHERE id=? AND status!='active'").bind(name,tokenHash,expiresAt,now,id).run();
        else await env.DB.prepare("INSERT INTO admin_accounts (id,email,name,status,invite_hash,invite_expires_at,created_at,updated_at) VALUES (?,?,?,'pending',?,?,?,?)").bind(id,email,name,tokenHash,expiresAt,now,now).run();
        await audit(env.DB,'admin.invitation_created',email,current.user.username);
        return json({id,email,expiresAt,invitationUrl:new URL(request.url).origin+'/admin/accept#invite='+token},201);
      }
      const accountId=path.slice('/api/admin/team/'.length);
      if(method==='DELETE'&&/^[a-f0-9-]{36}$/.test(accountId)){
        const row=await env.DB.prepare("UPDATE admin_accounts SET status='revoked',password_hash=NULL,invite_hash=NULL,invite_expires_at=NULL,updated_at=? WHERE id=? RETURNING email").bind(Date.now(),accountId).first();
        if(!row)throw failure(404,'Admin account not found.');
        await env.DB.prepare('DELETE FROM admin_sessions WHERE account_id=?').bind(accountId).run();
        await audit(env.DB,'admin.access_revoked',row.email,current.user.username);return json({ok:true});
      }
      throw failure(404,'This team action is unavailable.');
    }
    if(path==='/api/admin/settings'&&method==='PUT'){
      const input=await body(request),data=fields(input,settingsFields),expected=input.version;
      if(!Number.isInteger(expected)||expected<0)throw failure(400,'Refresh the settings before saving.');
      const row=await env.DB.prepare("INSERT INTO website_settings (id,data,version,updated_at) SELECT 'main',?,1,? WHERE ? = 0 ON CONFLICT(id) DO NOTHING RETURNING version").bind(JSON.stringify(data),Date.now(),expected).first();
      let updated=row;
      if(!row)updated=await env.DB.prepare("UPDATE website_settings SET data=?,version=version+1,updated_at=? WHERE id='main' AND version=? RETURNING version").bind(JSON.stringify(data),Date.now(),expected).first();
      if(!updated)throw failure(409,'Settings changed in another session. Refresh before saving.');
      await audit(env.DB,'settings.updated','main',current.user.username);return json({ok:true,version:updated.version});
    }
    if(path==='/api/admin/upload'&&method==='POST'){
      if(!env.BUCKET)throw failure(503,'Image storage is not configured.');
      const type=request.headers.get('Content-Type'),extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
      if(!extensions[type])throw failure(415,'Use a JPG, PNG or WebP image.');
      if(Number(request.headers.get('Content-Length')||0)>5*1024*1024)throw failure(413,'Images must be smaller than 5 MB.');
      const b=await readBytes(request,5*1024*1024),data=b.buffer;
      if(!b.length||b.length>5*1024*1024)throw failure(413,'Images must be smaller than 5 MB.');
      const valid=type==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:type==='image/png'?hex(b.slice(0,8))==='89504e470d0a1a0a':new TextDecoder().decode(b.slice(0,4))==='RIFF'&&new TextDecoder().decode(b.slice(8,12))==='WEBP';
      if(!valid)throw failure(400,'The file content does not match its image type.');
      const key=crypto.randomUUID()+'.'+extensions[type];await env.BUCKET.put('admin-media/'+key,data,{httpMetadata:{contentType:type}});
      await audit(env.DB,'image.uploaded',key,current.user.username);return json({url:new URL(request.url).origin+'/api/media/'+key});
    }
    const match=path.match(/^\/api\/admin\/records\/([a-z]+)(?:\/([a-zA-Z0-9_-]+))?$/);
    if(match){
      const [,kind,id]=match;if(!contentSchemas[kind])throw failure(404,'This section does not exist.');
      if(method==='POST'&&!id){
        const input=await body(request),data=validateRecord(kind,input),recordId='site_'+crypto.randomUUID(),now=Date.now();
        const count=await env.DB.prepare('SELECT COUNT(*) AS count FROM website_records').first();if(count.count>=1000)throw failure(409,'This workspace has reached its 1,000-record limit.');
        await env.DB.prepare('INSERT INTO website_records (id,collection,status,data,version,created_at,updated_at) VALUES (?,?,?,?,1,?,?)').bind(recordId,kind,data.status,JSON.stringify(data),now,now).run();
        await audit(env.DB,'content.created',recordId,current.user.username);return json({id:recordId,version:1},201);
      }
      if(id&&['PUT','DELETE'].includes(method)){
        const input=await body(request),builtin=builtinRecord(kind,id);if(!Number.isInteger(input.version)||input.version<(builtin?0:1))throw failure(400,'Refresh this item before saving.');
        let result;
        if(builtin){
          const existing=await env.DB.prepare('SELECT * FROM website_records WHERE id=? AND collection=?').bind(id,kind).first();
          const data=method==='DELETE'?{...(existing?JSON.parse(existing.data):builtin),status:'draft'}:validateRecord(kind,input);
          if(input.version===0)result=await env.DB.prepare('INSERT INTO website_records (id,collection,status,data,version,created_at,updated_at) VALUES (?,?,?,?,1,?,?) ON CONFLICT(id) DO NOTHING RETURNING id,version').bind(id,kind,data.status,JSON.stringify(data),Date.now(),Date.now()).first();
          else result=await env.DB.prepare('UPDATE website_records SET data=?,status=?,version=version+1,updated_at=? WHERE id=? AND collection=? AND version=? RETURNING id,version').bind(JSON.stringify(data),data.status,Date.now(),id,kind,input.version).first();
        }
        else if(method==='DELETE')result=await env.DB.prepare('DELETE FROM website_records WHERE id=? AND collection=? AND version=? RETURNING id').bind(id,kind,input.version).first();
        else{const data=validateRecord(kind,input);result=await env.DB.prepare('UPDATE website_records SET data=?,status=?,version=version+1,updated_at=? WHERE id=? AND collection=? AND version=? RETURNING id,version').bind(JSON.stringify(data),data.status,Date.now(),id,kind,input.version).first();}
        if(!result)throw failure(409,'This item changed or was removed in another session. Refresh and try again.');
        await audit(env.DB,method==='DELETE'?'content.removed':'content.updated',id,current.user.username);return json({ok:true,...result});
      }
    }
    throw failure(404,'This action is not available.');
  }catch(error){return json({error:error.status?error.message:'The admin service could not complete this request. Please retry.'},error.status||500,error.status===429?{'Retry-After':'900'}:{});}
}

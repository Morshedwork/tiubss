import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { handleAdminAPI } from '../server/admin.mjs';

const password='test-only-admin-password';
const salt=randomBytes(32);
const verifier='pbkdf2-sha256$100000$'+salt.toString('hex')+'$'+pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex');
function fixture(){
  const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  const DB={prepare(sql){let params=[];return {bind(...values){params=values;return this;},async first(){return sqlite.prepare(sql).get(...params)||null;},async all(){return {results:sqlite.prepare(sql).all(...params)};},async run(){return sqlite.prepare(sql).run(...params);}};},async batch(statements){sqlite.exec('BEGIN');try{const result=await Promise.all(statements.map(s=>s.run()));sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  const images=new Map();const BUCKET={async put(key,data,options){images.set(key,{body:data,httpMetadata:options.httpMetadata});},async get(key){return images.get(key);}};
  const env={DB,BUCKET,BSS_ADMIN_PASSWORD_HASH:verifier};
  const call=(path,{method='GET',data,token,origin='https://bss.test',headers={},body}={})=>handleAdminAPI(new Request('https://bss.test/api/'+path,{method,headers:{...(method!=='GET'?{'Origin':origin,'X-BSS-Admin':'1','Content-Type':'application/json'}:{}),...(token?{'Cookie':token}:{}),...headers},...(method!=='GET'?{body:body??JSON.stringify(data||{})}:{})}),env);
  const login=async()=>{const response=await call('admin/login',{method:'POST',data:{username:'Admin',password}});assert.equal(response.status,200,await response.clone().text());return response.headers.get('Set-Cookie').split(';')[0];};
  return {sqlite,env,call,login,images};
}
test('independent login verifies a server-held password and rejects missing, forged or cross-origin access',async()=>{
  const f=fixture();
  assert.equal((await f.call('admin/workspace')).status,401);
  assert.equal((await f.call('admin/workspace',{token:'__Host-bss_admin='+'a'.repeat(64)})).status,401);
  assert.equal((await f.call('admin/login',{method:'POST',data:{username:'Admin',password:'incorrect',roles:['admin']}})).status,401);
  assert.equal((await f.call('admin/login',{method:'POST',data:{username:'Member',password}})).status,401);
  assert.equal((await f.call('admin/login',{method:'POST',origin:'https://evil.test',data:{username:'Admin',password}})).status,403);
  const response=await f.call('admin/login',{method:'POST',data:{username:' admin ',password}});
  assert.equal(response.status,200);assert.match(response.headers.get('Set-Cookie'),/HttpOnly; Secure; SameSite=Strict/);
  const data=await response.json();assert.equal(data.user.username,'Admin');assert.equal(data.token,undefined);
  const cookie=response.headers.get('Set-Cookie').split(';')[0];assert.equal((await f.call('admin/session',{token:cookie})).status,200);
  const row=f.sqlite.prepare('SELECT * FROM admin_sessions').get();assert.notEqual(row.id,cookie.split('=')[1]);assert.ok(!JSON.stringify(row).includes(password));
});
test('protected content persists, drafts stay private, stale updates fail, and publication appears publicly',async()=>{
  const f=fixture(),token=await f.login();
  const draft={title:'A community moment',url:'https://instagram.com/reel/CzLvp0CR5Fq/?share=1',category:'Community',caption:'Together',status:'draft'};
  assert.equal((await f.call('admin/records/reels',{method:'POST',data:draft})).status,401);
  const created=await f.call('admin/records/reels',{method:'POST',token,data:draft});assert.equal(created.status,201);const record=await created.json();
  assert.equal((await (await f.call('site-content')).json()).reels.length,0);
  const changed=await f.call('admin/records/reels/'+record.id,{method:'PUT',token,data:{...draft,status:'published',version:1}});assert.equal(changed.status,200);
  assert.equal((await f.call('admin/records/reels/'+record.id,{method:'PUT',token,data:{...draft,version:1}})).status,409);
  const published=await (await f.call('site-content')).json();assert.equal(published.reels[0].url,'https://www.instagram.com/reel/CzLvp0CR5Fq/');
  const workspace=await (await f.call('admin/workspace',{token})).json();assert.equal(workspace.records.length,1);
  assert.equal((await f.call('admin/records/reels/'+record.id,{method:'DELETE',token,data:{version:2}})).status,200);
  assert.equal((await (await f.call('site-content')).json()).reels.length,0);
});
test('logout, expiry and password rotation each invalidate the server session',async()=>{
  const f=fixture();let token=await f.login();
  const out=await f.call('admin/logout',{method:'POST',token});assert.equal(out.status,200);assert.match(out.headers.get('Set-Cookie'),/Max-Age=0/);assert.equal((await f.call('admin/workspace',{token})).status,401);
  token=await f.login();f.sqlite.prepare('UPDATE admin_sessions SET expires_at = 1').run();assert.equal((await f.call('admin/workspace',{token})).status,401);
  token=await f.login();f.env.BSS_ADMIN_PASSWORD_HASH=verifier.slice(0,-1)+(verifier.endsWith('a')?'b':'a');assert.equal((await f.call('admin/workspace',{token})).status,401);
});
test('login rate limits persist across requests and the server fails closed without its verifier',async()=>{
  const f=fixture();for(let n=0;n<8;n++)assert.equal((await f.call('admin/login',{method:'POST',data:{username:'Admin',password:'wrong'}})).status,401);
  assert.equal((await f.call('admin/login',{method:'POST',data:{username:'Admin',password}})).status,429);
  delete f.env.BSS_ADMIN_PASSWORD_HASH;assert.equal((await f.call('admin/login',{method:'POST',data:{username:'Admin',password}})).status,503);
});
test('settings use optimistic concurrency and reject unsafe links',async()=>{
  const f=fixture(),token=await f.login();const data={title:'TIU BSS',announcement:'Welcome',instagram:'https://www.instagram.com/tiu.bss/',email:'team@example.test',version:0};
  assert.equal((await f.call('admin/settings',{method:'PUT',token,data})).status,200);
  assert.equal((await f.call('admin/settings',{method:'PUT',token,data})).status,409);
  assert.equal((await f.call('admin/settings',{method:'PUT',token,data:{...data,version:1,instagram:'javascript:alert(1)'}})).status,400);
  assert.equal((await f.call('admin/settings',{method:'PUT',token,data:{...data,version:1,announcement:'Updated'}})).status,200);
  assert.equal((await (await f.call('site-content')).json()).settings.announcement,'Updated');
});
test('image uploads require admin access and a matching image signature',async()=>{
  const f=fixture(),token=await f.login();const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0]);
  assert.equal((await f.call('admin/upload',{method:'POST',body:png,headers:{'Content-Type':'image/png'}})).status,401);
  assert.equal((await f.call('admin/upload',{method:'POST',token,body:'<svg></svg>',headers:{'Content-Type':'image/png'}})).status,400);
  const response=await f.call('admin/upload',{method:'POST',token,body:png,headers:{'Content-Type':'image/png'}});assert.equal(response.status,200);const {url}=await response.json();
  const image=await f.call(url.split('/api/')[1]);assert.equal(image.status,200);assert.equal(image.headers.get('Content-Type'),'image/png');assert.equal(f.images.size,1);
});

test('owner can invite an email; single-use acceptance creates a separate hashed-password account',async()=>{
 const f=fixture(),owner=await f.login();
 assert.equal((await f.call('admin/team',{method:'POST',data:{email:'new@example.test',name:'New admin'}})).status,401);
 const invite=await f.call('admin/team',{method:'POST',token:owner,data:{email:'New@Example.test',name:'New admin'}});assert.equal(invite.status,201);const details=await invite.json();
 assert.equal(details.email,'new@example.test');const secret=new URL(details.invitationUrl).hash.slice(8);assert.equal(secret.length,64);
 const row=f.sqlite.prepare('SELECT * FROM admin_accounts').get();assert.notEqual(row.invite_hash,secret);assert.equal(row.password_hash,null);
 const inspect=await f.call('admin/invitation/inspect',{method:'POST',data:{token:secret}});assert.equal((await inspect.json()).email,'new@example.test');
 assert.equal((await f.call('admin/invitation/accept',{method:'POST',data:{token:secret,password:'short'}})).status,400);
 const accepted=await f.call('admin/invitation/accept',{method:'POST',data:{token:secret,password:'a-new-test-password',role:'owner'}});assert.equal(accepted.status,200);assert.equal((await accepted.clone().json()).user.role,'admin');
 const saved=f.sqlite.prepare('SELECT * FROM admin_accounts').get();assert.equal(saved.status,'active');assert.equal(saved.invite_hash,null);assert.match(saved.password_hash,/^pbkdf2-sha256\$/);assert.ok(!saved.password_hash.includes('a-new-test-password'));
 assert.equal((await f.call('admin/invitation/accept',{method:'POST',data:{token:secret,password:'another-test-password'}})).status,400);
 const login=await f.call('admin/login',{method:'POST',data:{username:'NEW@example.test',password:'a-new-test-password'}});assert.equal(login.status,200);const cookie=login.headers.get('Set-Cookie').split(';')[0];
 const workspace=await(await f.call('admin/workspace',{token:cookie})).json();assert.equal(workspace.user.email,'new@example.test');assert.equal(workspace.user.role,'admin');
 const list=await(await f.call('admin/team',{token:owner})).json();assert.equal(list.accounts[0].password_hash,undefined);assert.equal(list.accounts[0].invite_hash,undefined);
 assert.equal((await (await f.call('site-content')).json()).accounts,undefined);
});
test('delegated admins cannot grant access, and owner revocation invalidates all their sessions',async()=>{
 const f=fixture(),owner=await f.login(),invite=await(await f.call('admin/team',{method:'POST',token:owner,data:{email:'editor@example.test',name:'Editor'}})).json();
 const token=new URL(invite.invitationUrl).hash.slice(8),accepted=await f.call('admin/invitation/accept',{method:'POST',data:{token,password:'editor-test-password'}}),editor=accepted.headers.get('Set-Cookie').split(';')[0];
 for(const method of ['GET','POST'])assert.equal((await f.call('admin/team',{method,token:editor,data:{name:'Escalation',email:'evil@example.test'}})).status,403);
 assert.equal((await f.call('admin/team/'+invite.id,{method:'DELETE',token:editor})).status,403);
 assert.equal((await f.call('admin/records/news',{method:'POST',token:editor,data:{title:'Editor story',slug:'editor-story',date:'2026-10-27',category:'Community',excerpt:'Hello',body:'Body',status:'draft'}})).status,201);
 assert.equal((await f.call('admin/team/'+invite.id,{method:'DELETE',token:owner})).status,200);
 assert.equal((await f.call('admin/workspace',{token:editor})).status,401);assert.equal((await f.call('admin/login',{method:'POST',data:{username:'editor@example.test',password:'editor-test-password'}})).status,401);
 assert.equal((await f.call('admin/workspace',{token:owner})).status,200);
 assert.equal(f.sqlite.prepare("SELECT actor FROM admin_audit WHERE action='content.created'").get().actor,'editor@example.test');
});
test('expired, revoked and superseded invitations cannot be used',async()=>{
 const f=fixture(),owner=await f.login(),data={name:'Invited',email:'invited@example.test'};
 const create=async()=>await(await f.call('admin/team',{method:'POST',token:owner,data})).json();
 let invitation=await create(),token=new URL(invitation.invitationUrl).hash.slice(8);f.sqlite.prepare('UPDATE admin_accounts SET invite_expires_at=1').run();
 assert.equal((await f.call('admin/invitation/inspect',{method:'POST',data:{token}})).status,400);
 invitation=await create();const second=new URL(invitation.invitationUrl).hash.slice(8);assert.notEqual(token,second);assert.equal((await f.call('admin/invitation/accept',{method:'POST',data:{token,password:'invited-test-password'}})).status,400);
 await f.call('admin/team/'+invitation.id,{method:'DELETE',token:owner});assert.equal((await f.call('admin/invitation/accept',{method:'POST',data:{token:second,password:'invited-test-password'}})).status,400);
 assert.equal((await f.call('admin/team/owner',{method:'DELETE',token:owner})).status,404);
});
test('invitation creation and acceptance reject invalid email, weak passwords, forged identities and cross-origin requests',async()=>{
 const f=fixture(),owner=await f.login();
 for(const email of ['not-email','a@@b.test','a b@c.test'])assert.equal((await f.call('admin/team',{method:'POST',token:owner,data:{email,name:'Admin'}})).status,400);
 assert.equal((await f.call('admin/login',{method:'POST',data:{username:'unknown@example.test',password}})).status,401);
 assert.equal((await f.call('admin/invitation/accept',{method:'POST',origin:'https://evil.test',data:{token:'a'.repeat(64),password:'test-password-123'}})).status,403);
 assert.equal((await f.call('admin/invitation/accept',{method:'POST',data:{token:'a'.repeat(64),password:'test-password-123',role:'owner'}})).status,400);
});

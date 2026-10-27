import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { handleAdminAPI } from '../server/admin.mjs';

const password='test-only-admin-password';
const salt=randomBytes(32);
const verifier='pbkdf2-sha256$100000$'+salt.toString('hex')+'$'+pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex');
export function fixture(){
  const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  const DB={prepare(sql){let params=[];return {bind(...values){params=values;return this;},async first(){return sqlite.prepare(sql).get(...params)||null;},async all(){return {results:sqlite.prepare(sql).all(...params)};},async run(){return sqlite.prepare(sql).run(...params);}};},async batch(statements){sqlite.exec('BEGIN');try{const result=await Promise.all(statements.map(s=>s.run()));sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  const images=new Map();const BUCKET={async put(key,data,options){images.set(key,{body:data,httpMetadata:options.httpMetadata});},async get(key){return images.get(key);}};
  const env={DB,BUCKET,BSS_ADMIN_PASSWORD_HASH:verifier};
  const call=(path,{method='GET',data,token,origin='https://bss.test',headers={},body}={})=>handleAdminAPI(new Request('https://bss.test/api/'+path,{method,headers:{...(method!=='GET'?{'Origin':origin,'X-BSS-Admin':'1','Content-Type':'application/json'}:{}),...(token?{'Cookie':token}:{}),...headers},...(method!=='GET'?{body:body??JSON.stringify(data||{})}:{})}),env);
  const login=async()=>{const response=await call('admin/login',{method:'POST',data:{username:'Admin',password}});assert.equal(response.status,200,await response.clone().text());return response.headers.get('Set-Cookie').split(';')[0];};
  return {sqlite,env,call,login,images};
}

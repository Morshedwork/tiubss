import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {resolveFirebaseCli,appCheckDiagnostics} from '../firebase/scripts/preflight-support.mjs';

const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const runtime=join(projectRoot,'.sites-runtime');
function fixture() {
  mkdirSync(runtime,{recursive:true});
  const root=mkdtempSync(join(runtime,'preflight-test-'));
  return {root,packageAt(directory){mkdirSync(join(directory,'lib','bin'),{recursive:true});writeFileSync(join(directory,'package.json'),JSON.stringify({name:'firebase-tools',bin:{firebase:'lib/bin/firebase.js'}}));const entry=join(directory,'lib','bin','firebase.js');writeFileSync(entry,"console.log('14.0.0-fixture');");return entry;},cleanup(){assert.equal(dirname(root),runtime);rmSync(root,{recursive:true,force:true});}};
}

test('Firebase CLI resolver prefers an explicit existing JavaScript entrypoint without shell execution',()=>{
  const f=fixture();try {
    const entry=f.packageAt(join(f.root,'explicit install & tools'));
    f.packageAt(join(f.root,'node_modules','firebase-tools'));
    assert.deepEqual(resolveFirebaseCli({projectRoot:f.root,env:{FIREBASE_CLI_PATH:entry},platform:'win32'}),{command:process.execPath,args:[entry],source:'explicit'});
    const missing=resolveFirebaseCli({projectRoot:f.root,env:{FIREBASE_CLI_PATH:join(f.root,'not-installed.js')},platform:'win32'});
    assert.match(missing.error,/FIREBASE_CLI_PATH/);assert.equal(missing.command,undefined);
  }finally{f.cleanup();}
});

test('Firebase CLI resolver finds project and checkout-local runtime installations',()=>{
  for(const location of ['project','runtime']) {
    const f=fixture();try {
      const directory=location==='project'?join(f.root,'node_modules','firebase-tools'):join(f.root,'.sites-runtime','firebase-cli','node_modules','firebase-tools');
      const entry=f.packageAt(directory);
      assert.deepEqual(resolveFirebaseCli({projectRoot:f.root,env:{},platform:'win32'}),{command:process.execPath,args:[entry],source:location});
    }finally{f.cleanup();}
  }
});

test('Windows global and project Firebase shims resolve to their JavaScript package entrypoints',()=>{
  for(const localBin of [false,true]) {
    const f=fixture();try {
      const prefix=join(f.root,'npm prefix with spaces');
      const directory=localBin?join(prefix,'node_modules','.bin'):prefix;
      const entry=f.packageAt(join(prefix,'node_modules','firebase-tools'));
      mkdirSync(directory,{recursive:true});const shim=join(directory,'firebase.cmd');writeFileSync(shim,'@echo This shim must never run');
      assert.deepEqual(resolveFirebaseCli({projectRoot:f.root,env:{Path:'"'+directory+'"'},platform:'win32'}),{command:process.execPath,args:[entry],source:'path'});
      assert.deepEqual(resolveFirebaseCli({projectRoot:f.root,env:{FIREBASE_CLI_PATH:shim},platform:'win32'}),{command:process.execPath,args:[entry],source:'explicit'});
    }finally{f.cleanup();}
  }
});

test('CLI resolution retains POSIX PATH fallback and never launches a Windows shell fallback',()=>{
  const f=fixture();try {
    assert.deepEqual(resolveFirebaseCli({projectRoot:f.root,env:{},platform:'linux'}),{command:'firebase',args:[],source:'path-command'});
    assert.equal(resolveFirebaseCli({projectRoot:f.root,env:{},platform:'win32'}),null);
  }finally{f.cleanup();}
});

test('App Check diagnostics match Enterprise, legacy v3, and reject unknown providers without exposing keys',()=>{
  const key='fixture-public-site-key-not-for-output';
  const enterprise=appCheckDiagnostics({BSS_FIREBASE_APP_CHECK_PROVIDER:'recaptcha-enterprise',BSS_FIREBASE_APP_CHECK_KEY:key});
  assert.equal(enterprise.supported,true);assert.equal(enterprise.keyPresent,true);assert.equal(enterprise.label,'reCAPTCHA Enterprise');assert.match(enterprise.consoleInstruction,/Enterprise using a score-based website key/);assert.doesNotMatch(enterprise.consoleInstruction,/v3/);
  const legacy=appCheckDiagnostics({BSS_FIREBASE_APP_CHECK_KEY:key});assert.equal(legacy.label,'reCAPTCHA v3');assert.match(legacy.consoleInstruction,/reCAPTCHA v3/);
  const unsupported=appCheckDiagnostics({BSS_FIREBASE_APP_CHECK_PROVIDER:'unknown',BSS_FIREBASE_APP_CHECK_KEY:key});assert.equal(unsupported.supported,false);assert.match(unsupported.consoleInstruction,/select the supported/);
  assert.equal(appCheckDiagnostics({BSS_FIREBASE_APP_CHECK_KEY:'YOUR_PLACEHOLDER'}).keyPresent,false);
  for(const diagnostic of [enterprise,legacy,unsupported])assert.ok(!JSON.stringify(diagnostic).includes(key));
});

test('local preflight detects a JS CLI on Windows and prints the configured provider without key values',()=>{
  const f=fixture();try {
    const entry=f.packageAt(join(f.root,'explicit CLI & spaces'));
    const result=spawnSync(process.execPath,[join(projectRoot,'firebase','scripts','preflight.mjs')],{cwd:projectRoot,encoding:'utf8',env:{...process.env,FIREBASE_CLI_PATH:entry},windowsHide:true});
    assert.equal(result.error,undefined);assert.ok([0,2].includes(result.status));
    assert.match(result.stdout,/OK: An existing Firebase CLI is available/);
    const context={window:{}};runInNewContext(readFileSync(join(projectRoot,'public','firebase-config.js'),'utf8'),context);
    const diagnostic=appCheckDiagnostics(context.window);
    assert.ok(result.stdout.includes(diagnostic.consoleInstruction));
    for(const value of [context.window.BSS_FIREBASE_CONFIG?.apiKey,context.window.BSS_FIREBASE_APP_CHECK_KEY])if(value)assert.ok(!result.stdout.includes(value));
    assert.match(result.stdout,/Remote account, project and function checks skipped/);
  }finally{f.cleanup();}
});

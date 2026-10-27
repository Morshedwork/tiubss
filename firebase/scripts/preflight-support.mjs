import {existsSync,readFileSync,realpathSync,statSync} from 'node:fs';
import {dirname,extname,join,resolve} from 'node:path';

const isFile=path=>{try{return statSync(path).isFile();}catch{return false;}};
const isDirectory=path=>{try{return statSync(path).isDirectory();}catch{return false;}};
const isJavaScript=path=>/\.(?:c|m)?js$/i.test(extname(path));
function packageEntry(directory) {
  try {
    const metadata=JSON.parse(readFileSync(join(directory,'package.json'),'utf8'));
    const binary=typeof metadata.bin==='string'?metadata.bin:metadata.bin?.firebase;
    if(metadata.name!=='firebase-tools'||typeof binary!=='string')return null;
    const entry=resolve(directory,binary);
    return isJavaScript(entry)&&isFile(entry)?entry:null;
  }catch{return null;}
}
function entriesNear(directory) {
  return [join(directory,'node_modules','firebase-tools'),resolve(directory,'..','firebase-tools'),resolve(directory,'..','lib','node_modules','firebase-tools')].map(packageEntry).find(Boolean)||null;
}
function explicitEntry(path) {
  if(isFile(path)) {
    const real=realpathSync(path);
    if(isJavaScript(real))return real;
    return entriesNear(dirname(path));
  }
  if(isDirectory(path))return packageEntry(path)||entriesNear(path);
  return null;
}

// Resolve existing JavaScript only: never execute a Windows shim through a shell.
export function resolveFirebaseCli({projectRoot=process.cwd(),env=process.env,platform=process.platform,execPath=process.execPath}={}) {
  const command=(entry,source)=>({command:execPath,args:[entry],source});
  const explicit=env.FIREBASE_CLI_PATH?.trim();
  if(explicit) {
    const entry=explicitEntry(resolve(projectRoot,explicit));
    return entry?command(entry,'explicit'):{error:'FIREBASE_CLI_PATH does not identify an existing Firebase CLI JavaScript entrypoint or installation.'};
  }
  for(const [directory,source] of [[join(projectRoot,'node_modules','firebase-tools'),'project'],[join(projectRoot,'firebase','node_modules','firebase-tools'),'project'],[join(projectRoot,'.sites-runtime','firebase-cli','node_modules','firebase-tools'),'runtime']]) {
    const entry=packageEntry(directory);if(entry)return command(entry,source);
  }
  const pathKey=Object.keys(env).find(key=>key.toLowerCase()==='path');
  const searchPath=pathKey?String(env[pathKey]):'';
  for(const raw of searchPath.split(platform==='win32'?';':':')) {
    const directory=raw.trim().replace(/^"|"$/g,'');if(!directory)continue;
    const shims=platform==='win32'?['firebase.cmd','firebase.ps1','firebase.exe','firebase']:['firebase'];
    for(const name of shims) {
      const shim=join(directory,name);if(!existsSync(shim))continue;
      const entry=explicitEntry(shim);if(entry)return command(entry,'path');
    }
  }
  return platform==='win32'?null:{command:'firebase',args:[],source:'path-command'};
}

export function appCheckDiagnostics(configuration={}) {
  const provider=configuration.BSS_FIREBASE_APP_CHECK_PROVIDER||'recaptcha-v3';
  const label=provider==='recaptcha-enterprise'?'reCAPTCHA Enterprise':provider==='recaptcha-v3'?'reCAPTCHA v3':null;
  const key=configuration.BSS_FIREBASE_APP_CHECK_KEY;
  const keyPresent=typeof key==='string'&&key.trim().length>10&&!/YOUR_|PLACEHOLDER|REPLACE/i.test(key);
  return {
    supported:!!label,label,keyPresent,
    consoleInstruction:label
      ?'App Check: this web app registered for '+label+(provider==='recaptcha-enterprise'?' using a score-based website key':'')+' with the same website hostnames; public key matches the local configuration.'
      :'App Check: select the supported recaptcha-enterprise or recaptcha-v3 provider in public/firebase-config.js, then register the matching web provider and website hostnames.'
  };
}

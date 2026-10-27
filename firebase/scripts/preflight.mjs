#!/usr/bin/env node
// Read-only activation check. Never deploys, changes rules/roles, or prints credentials.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { spawnSync } from 'node:child_process';
import { resolveFirebaseCli, appCheckDiagnostics } from './preflight-support.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectId = 'tiu-bss';
const args = process.argv.slice(2);
if (args.some(arg => !['--remote', '--help'].includes(arg))) {
  console.error('Usage: node firebase/scripts/preflight.mjs [--remote]');
  process.exit(1);
}
if (args.includes('--help')) {
  console.log('Checks the optional Firebase Functions/Storage backend configuration and built files. The current website uses Sites D1/R2 and only Firebase member sign-in. --remote additionally runs existing Firebase CLI read-only account/project/function checks. No packages are installed and no cloud settings are changed.');
  process.exit(0);
}
console.log('Optional Firebase backend check: the current website uses Sites D1/R2 for data and images; these deployment checks are not its activation requirements.');
let blockers = 0;
const report = (status, message) => {
  console.log(`${status}: ${message}`);
  if (status === 'BLOCKED') blockers++;
};
const read = path => readFileSync(resolve(root, path), 'utf8');
const json = path => JSON.parse(read(path));
const required = ['firebase.json', 'firestore.rules', 'firestore.indexes.json', 'storage.rules', 'functions/package.json', 'functions/package-lock.json', 'functions/tsconfig.json', 'functions/src/index.ts', 'functions/src/profile-validation.ts', 'scripts/bootstrap-admin.cjs'];
const absent = required.filter(path => !existsSync(resolve(root, path)));
report(absent.length ? 'BLOCKED' : 'OK', absent.length ? `Missing source: ${absent.join(', ')}` : 'Firebase deployment source, rules, indexes and bootstrap script are present.');

let web = {};
try {
  const context = { window: {} };
  runInNewContext(read('../public/firebase-config.js'), context, { timeout: 100, contextCodeGeneration: { strings: false, wasm: false } });
  web = context.window;
  const config = web.BSS_FIREBASE_CONFIG || {};
  report(config.projectId === projectId ? 'OK' : 'BLOCKED', `Web configuration must target ${projectId}${config.projectId === projectId ? ' (confirmed).' : '.'}`);
  const complete = ['apiKey', 'authDomain', 'appId', 'storageBucket'].every(key => typeof config[key] === 'string' && config[key].trim());
  report(complete ? 'OK' : 'BLOCKED', complete ? 'Required public Firebase web identifiers are present (values withheld).' : 'Required Firebase web identifiers are missing.');
  const appCheck = appCheckDiagnostics(web);
  report(appCheck.supported ? 'OK' : 'BLOCKED', appCheck.supported ? 'App Check provider: '+appCheck.label+'.' : 'The configured App Check provider is unsupported. Use recaptcha-enterprise or recaptcha-v3.');
  report(appCheck.keyPresent ? 'OK' : 'BLOCKED', appCheck.keyPresent ? 'An App Check public site key is set; its live registration still needs verification.' : 'Set the registered App Check public site key (matching the configured provider) in public/firebase-config.js. Callable writes remain blocked.');
} catch {
  report('BLOCKED', 'Could not read the public Firebase web configuration.');
}

let functionNames = [];
try {
  const settings = json('firebase.json');
  const packageInfo = json('functions/package.json');
  const indexes = json('firestore.indexes.json');
  const source = read('functions/src/index.ts');
  functionNames = [...source.matchAll(/export const (\w+) = (?:callable|onSchedule)\(/g)].map(match => match[1]);
  const declarationsValid = settings.functions?.some(entry => entry.source === 'functions' && entry.codebase === 'tiu-bss') && settings.firestore?.rules === 'firestore.rules' && settings.firestore?.indexes === 'firestore.indexes.json' && settings.storage?.rules === 'storage.rules';
  report(declarationsValid ? 'OK' : 'BLOCKED', declarationsValid ? 'Deployment configuration includes Functions, Firestore and Storage.' : 'firebase.json is missing the expected backend declarations.');
  report(packageInfo.engines?.node === '22' ? 'OK' : 'BLOCKED', 'Functions runtime declaration: Node.js 22 required.');
  report(Number(process.versions.node.split('.')[0]) >= 22 ? 'OK' : 'BLOCKED', 'Local build requires Node.js 22 or later.');
  report(source.includes("region: 'asia-northeast1'") && source.includes('enforceAppCheck: true') ? 'OK' : 'BLOCKED', 'Callable source must use Tokyo and enforce App Check.');
  report(Array.isArray(indexes.indexes) && indexes.indexes.length > 0 ? 'OK' : 'BLOCKED', `Firestore index file contains ${indexes.indexes?.length || 0} composite definitions; live readiness is not checked locally.`);
  const inputs = ['functions/src/index.ts', 'functions/src/profile-validation.ts', 'functions/tsconfig.json'];
  const outputs = ['functions/lib/index.js', 'functions/lib/profile-validation.js'];
  const built = outputs.every(path => existsSync(resolve(root, path)));
  const fresh = built && Math.min(...outputs.map(path => statSync(resolve(root, path)).mtimeMs)) >= Math.max(...inputs.map(path => statSync(resolve(root, path)).mtimeMs));
  report(fresh ? 'OK' : 'BLOCKED', fresh ? `Compiled backend is present for ${functionNames.length} exported functions.` : 'Run npm --prefix firebase/functions run build before deployment; compiled output is missing or older than source.');
} catch {
  report('BLOCKED', 'A deployment configuration/source file could not be parsed.');
}

if (existsSync(resolve(root, '.firebaserc'))) {
  try {
    const configured = json('.firebaserc').projects?.default;
    report(!configured || configured === projectId ? 'OK' : 'BLOCKED', !configured || configured === projectId ? 'No conflicting default Firebase project alias.' : 'The default Firebase project alias differs from tiu-bss. Always deploy with --project tiu-bss.');
  } catch { report('BLOCKED', '.firebaserc is not valid JSON.'); }
}

const cliEnv = { ...process.env, CI: '1', FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true' };
const cliResolution = resolveFirebaseCli({projectRoot:resolve(root, '..'),env:cliEnv});
if (cliResolution?.error) report('CHECK', cliResolution.error);
const cli = command => cliResolution?.command
  ? spawnSync(cliResolution.command, [...cliResolution.args, ...command], { cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024, env: cliEnv, windowsHide:true })
  : {error:new Error('Firebase CLI unavailable'),status:null};
const version = cli(['--version']);
const cliAvailable = !version.error && version.status === 0;
report(cliAvailable ? 'OK' : 'CHECK', cliAvailable ? 'An existing Firebase CLI is available.' : 'Firebase CLI is not available here; use an authorized Firebase integration or install the CLI in your own deployment environment.');
if (args.includes('--remote')) {
  if (!cliAvailable) report('BLOCKED', 'Remote checks were requested but the Firebase CLI is unavailable.');
  else {
    const remote = command => {
      const result = cli([...command, '--json', '--non-interactive']);
      if (result.error || result.status !== 0) return null;
      try { const parsed = JSON.parse(result.stdout); return parsed.status === 'success' ? parsed.result : null; } catch { return null; }
    };
    const accounts = remote(['login:list']);
    report(accounts === null ? 'CHECK' : 'OK', accounts === null ? 'CLI account listing unavailable; no account details or credentials were printed.' : 'Read-only CLI account check completed; no account details or credentials were printed.');
    const projects = remote(['projects:list']);
    const findRecords = value => Array.isArray(value) ? value.flatMap(findRecords) : value && typeof value === 'object' ? [value, ...Object.values(value).filter(item => item && typeof item === 'object').flatMap(findRecords)] : [];
    const projectVisible = projects !== null && findRecords(projects).some(value => value.projectId === projectId);
    report(projectVisible ? 'OK' : 'BLOCKED', projectVisible ? 'The CLI can read the tiu-bss project.' : 'The CLI could not confirm access to tiu-bss. Authenticate the intended project owner before deployment.');
    if (projectVisible) {
      const deployed = remote(['functions:list', '--project', projectId]);
      if (deployed === null) report('BLOCKED', 'Could not list deployed functions. Check project access and enabled backend services.');
      else {
        const records = findRecords(deployed);
        const missing = functionNames.filter(name => !records.some(record => [record.id, record.name, record.functionName].some(value => typeof value === 'string' && (value === name || value.endsWith('/' + name))) && [record.region, record.location, record.name].some(value => typeof value === 'string' && value.includes('asia-northeast1'))));
        report(missing.length ? 'BLOCKED' : 'OK', missing.length ? `Tokyo functions not confirmed: ${missing.join(', ')}.` : 'All source function names are listed in Tokyo. This does not verify matching deployed code or callable execution.');
      }
    }
  }
} else report('CHECK', 'Remote account, project and function checks skipped. Use --remote with an already authorized CLI.');

console.log('\nConsole checks still required:');
console.log('- Authentication: Email/Password and Google enabled. Authorized domains: www.tiubss.com, tiubss.com, tiu-bss.firebaseapp.com, and the active Sites hostname when used.');
console.log('- '+appCheckDiagnostics(web).consoleInstruction);
console.log('- Billing/Storage/Functions: owner confirms Blaze activation and Storage provisioning; never change billing as part of this check.');
console.log('- Firestore: deployed rules and enabled indexes; organizer custom claims and matching staffAssignments document.');
console.log('- Verify sign-in, private profile persistence, organizer access and one test registration/order with owned test accounts.');
console.log(`\n${blockers ? `Not ready: ${blockers} local/remote check(s) blocked.` : 'Available checks passed; console and end-to-end verification remain required.'} No cloud settings or records were changed.`);
process.exitCode = blockers ? 2 : 0;

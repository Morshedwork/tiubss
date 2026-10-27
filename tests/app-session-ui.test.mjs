import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source=await readFile(new URL('../public/js/app.js',import.meta.url),'utf8');
// Run the actual store subscription against a minimal DOM and render boundary.
const subscription=source.slice(source.indexOf('function sessionIdentity('),source.indexOf('subscribeStandaloneAdmin('));
function fixture({userId='alice',roles=[],busy=false,focused=false}={}) {
  let state={auth:{user:userId?{uid:userId}:null},roles},notify;
  const result={renders:0,closed:0,screenUser:userId,dialogUser:userId,header:{innerHTML:''}};
  runInNewContext(subscription,{
    store:{getState:()=>state,subscribe:fn=>notify=fn},
    document:{querySelector:()=>busy?{}:null,activeElement:focused?{tagName:'INPUT',closest:()=>({})}:null},
    $:()=>result.header,header:()=>state.auth.user?.uid || 'signed out',
    closeModal(){result.closed++;result.dialogUser=null;},
    render(){result.renders++;result.screenUser=state.auth.user?.uid || null;}
  });
  return {result,update(userId,roles=[]){state={auth:{user:userId?{uid:userId}:null},roles};notify(state);}};
}

test('cross-tab sign-out clears the private form and dialog despite a dirty, busy, or focused form',()=>{
  for(const guard of [{busy:true},{focused:true},{busy:true,focused:true}]) {
    const f=fixture(guard);f.update(null);
    assert.equal(f.result.renders,1);assert.equal(f.result.closed,1);
    assert.equal(f.result.screenUser,null);assert.equal(f.result.dialogUser,null);
  }
});

test('switching accounts or changing privileges replaces protected UI even during editing',()=>{
  const switching=fixture({busy:true,focused:true});switching.update('bob');
  assert.equal(switching.result.screenUser,'bob');assert.equal(switching.result.closed,1);
  const demotion=fixture({roles:['admin'],busy:true});demotion.update('alice',['member']);
  assert.equal(demotion.result.renders,1);assert.equal(demotion.result.closed,1);
});

test('same-account refreshes and reordered roles preserve unsaved form input',()=>{
  for(const guard of [{busy:true},{focused:true}]) {
    const f=fixture({...guard,roles:['member','content_editor']});f.update('alice',['content_editor','member']);
    assert.equal(f.result.renders,0);assert.equal(f.result.closed,0);assert.equal(f.result.header.innerHTML,'alice');
  }
});

test('initial account creation preserves its busy signup form until the save finishes',()=>{
  const f=fixture({userId:null,busy:true});f.update('new-member');
  assert.equal(f.result.renders,0);assert.equal(f.result.closed,0);assert.equal(f.result.header.innerHTML,'new-member');
});

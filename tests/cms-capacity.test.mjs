import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './operations-fixture.mjs';
import {BUILTIN_RECORDS} from '../public/js/builtin-content.js';

async function data(response,expected=200){
  assert.equal(response.status,expected,await response.clone().text());
  return response.json();
}
function seedCustomRecords(f,count,status='draft'){
  const insert=f.sqlite.prepare('INSERT INTO website_records (id,collection,status,data,version,created_at,updated_at) VALUES (?,?,?,?,1,?,?)');
  for(let i=0;i<count;i++)insert.run('site_seed_'+i,'news',status,JSON.stringify({title:'Story '+i,slug:'story-'+i,status}),i+2,i+2);
}

test('older hidden builtin overrides stay private and editable beyond 1,000 saved rows',async()=>{
  const f=fixture();
  try {
    const token=await f.login();
    const [first,second]=BUILTIN_RECORDS.filter(row=>row.collection==='reels');
    const route=row=>'admin/records/'+row.collection+'/'+row.id;
    await data(await f.call(route(first),{method:'DELETE',token,data:{version:0}}));
    f.sqlite.prepare('UPDATE website_records SET created_at=1 WHERE id=?').run(first.id);
    seedCustomRecords(f,999);
    await data(await f.call(route(second),{method:'DELETE',token,data:{version:0}}));
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM website_records').get().count,1001);

    const publicData=await data(await f.call('site-content'));
    assert.equal(publicData.reels.some(row=>row.id===first.id||row.id===second.id),false);
    const workspace=await data(await f.call('admin/workspace',{token}));
    const hidden=workspace.records.find(row=>row.id===first.id);
    assert.equal(hidden.status,'draft');
    assert.equal(hidden.version,1);
    assert.equal(workspace.records.filter(row=>row.id===first.id).length,1);
    const edited={...hidden,title:'Saved hidden title',version:hidden.version};
    const update=await data(await f.call(route(first),{method:'PUT',token,data:edited}));
    assert.equal(update.version,2);
    assert.equal((await data(await f.call('site-content'))).reels.some(row=>row.id===first.id),false);
    await data(await f.call(route(first),{method:'PUT',token,data:{...edited,status:'published',version:update.version}}));
    const restored=(await data(await f.call('site-content'))).reels.find(row=>row.id===first.id);
    assert.equal(restored.title,'Saved hidden title');
    assert.equal(restored.version,3);
  } finally {f.sqlite.close();}
});

test('custom rows retain their independent 1,000-record read cap while older builtin overrides remain visible to admins',async()=>{
  const f=fixture();
  try {
    const token=await f.login(),builtin=BUILTIN_RECORDS[0];
    await data(await f.call('admin/records/'+builtin.collection+'/'+builtin.id,{method:'DELETE',token,data:{version:0}}));
    f.sqlite.prepare('UPDATE website_records SET created_at=1 WHERE id=?').run(builtin.id);
    seedCustomRecords(f,1001,'published');
    const publicData=await data(await f.call('site-content'));
    assert.equal(publicData.news.length,1000);
    assert.equal(publicData.news.some(row=>row.id==='site_seed_0'),false);
    assert.equal(publicData.news[0].id,'site_seed_1000');
    assert.equal(publicData[builtin.collection].some(row=>row.id===builtin.id),false);
    const workspace=await data(await f.call('admin/workspace',{token}));
    assert.equal(workspace.records.filter(row=>!row.builtin).length,1000);
    assert.equal(workspace.records.find(row=>row.id===builtin.id).status,'draft');
    assert.equal(workspace.records.find(row=>row.id===builtin.id).version,1);
  } finally {f.sqlite.close();}
});

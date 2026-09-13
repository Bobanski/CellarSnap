import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay } from './contract.mjs';
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('request photo batch preserves source privacy, existence, owner and anonymous boundaries without capabilities', async () => {
  const db = await replay();
  const owner=uid(1), viewer=uid(2), entry=uid(100), path=`${owner}/${entry}/label/test.jpg`;
  const read = paths => db.query('select public.readable_wine_photo_paths($1) path',[paths]);
  const role = async who => { await db.exec('reset role; set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]); };
  try {
    await db.query('insert into auth.users(id,email) values ($1,$2),($3,$4)',[owner,'photo-owner@example.invalid',viewer,'photo-viewer@example.invalid']);
    await db.query("insert into wine_entries(id,user_id,entry_privacy,label_photo_privacy,label_image_path) values ($1,$2,'public','public',$3)",[entry,owner,path]);
    await db.exec("insert into storage.buckets(id,name,public) values ('wine-photos','wine-photos',false),('other','other',false)");
    await db.query("insert into storage.objects(bucket_id,name) values ('wine-photos',$1),('other',$2)",[path,`${owner}/other.jpg`]);
    await role(viewer);
    assert.deepEqual((await read([path,path,`${owner}/missing.jpg`,`${owner}/other.jpg`])).rows,[{path}]);
    await db.exec('reset role'); await db.query("update wine_entries set label_photo_privacy='private' where id=$1",[entry]);
    await role(viewer); assert.deepEqual((await read([path])).rows,[]);
    await role(owner); assert.deepEqual((await read([path])).rows,[{path}]);
    assert.deepEqual((await read([])).rows,[]);
    for (const paths of [null, [null], ['x'.repeat(2049)], Array(101).fill(path)]) await assert.rejects(read(paths),{code:'22023'});
    await db.exec("reset role; set storage.allow_delete_query='true'"); await db.query('delete from storage.objects where name=$1',[path]);
    await role(owner); assert.deepEqual((await read([path])).rows,[]);
    await db.exec('reset role; set role anon'); await assert.rejects(read([path]),/permission denied/);
    await db.exec('reset role; set role service_role'); await assert.rejects(read([path]),/permission denied/);
    await role(''); await assert.rejects(read([path]),{code:'42501'});
    await db.exec('reset role');
    assert.deepEqual((await db.query("select prosecdef,proconfig from pg_proc where proname='readable_wine_photo_paths'")).rows,[{prosecdef:false,proconfig:['search_path=""']}]);
  } finally { await db.close(); }
});

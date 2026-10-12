const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');const {createMetaGuard}=require('./meta-guard');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'meta-guard-'));let time=1000000,calls=0,active=0,maxActive=0,fail=false;
 const file=path.join(dir,'rate.json'),fetcher=async()=>{calls++;active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setImmediate(r));active--;return fail?{ok:false,status:400,headers:new Headers({'x-business-use-case-usage':JSON.stringify({123:[{estimated_time_to_regain_access:20}]})}),json:async()=>({error:{code:17,message:'too many calls to this ad-account'}})}:{ok:true,headers:new Headers(),json:async()=>({id:'result',data:[{id:'one'}]})}};
 const create=()=>createMetaGuard({file,fetcher,now:()=>time});let g=create();
 const read=(route='/act_123/ads?fields=id')=>g.request(route,'https://graph.example/',{},'123','SECRET');
 const many=await Promise.all([read(),read(),read()]);assert.equal(calls,1);many[0].data[0].id='mutated';assert.equal((await read()).data[0].id,'one');assert.equal(calls,1);
 await Promise.all([read('/a'),read('/b'),read('/c')]);assert.equal(maxActive,1);
 await g.request('/act_123/ads','https://graph.example/',{method:'POST'},'123','SECRET');await read();assert.equal(calls,6);
 fail=true;let thrown;try{await read('/uncached')}catch(e){thrown=e}assert(thrown.metaRate);assert.equal(Date.parse(thrown.retryAt),time+20*60000);
 const n=calls;for(let i=0;i<4;i++){await assert.rejects(()=>g.request('/act_123/campaigns','https://graph.example/',{method:'POST'},'123','SECRET'),e=>e.metaRate)}assert.equal(calls,n);
 g=create();await assert.rejects(()=>read('/restart'),e=>e.metaRate);assert.equal(calls,n);
 time+=20*60000+1;fail=false;await read('/restart');assert.equal(calls,n+1);assert.equal(g.status('123').blockedUntil,null);
 time+=120001;fail=true;await assert.rejects(()=>read('/again'),e=>e.metaRate);assert(Date.parse(g.status('123').blockedUntil)>=time+30*60000);
 assert(!fs.readFileSync(file,'utf8').includes('SECRET'));fs.rmSync(dir,{recursive:true,force:true});
 console.log('PASS: concurrent deduplication, cache isolation, serialized calls, write invalidation, Meta retry hint, persisted cooldown, blocked writes not retried, recovery, exponential backoff.');
})().catch(e=>{console.error(e);process.exitCode=1});


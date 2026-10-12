'use strict';
const fs=require('fs'),crypto=require('crypto'),path=require('path');
function createMetaGuard({file,fetcher=fetch,now=()=>Date.now(),initialAccount='',initialUntil=0}){
 let state={};try{state=JSON.parse(fs.readFileSync(file,'utf8'))}catch(e){if(e.code!=='ENOENT')throw Error('Cannot read Meta rate state')}
 for(const value of Object.values(state))if(value.until>Date.now())console.info(JSON.stringify({event:'meta_rate_state',blockedUntil:new Date(value.until).toISOString(),strikes:value.strikes}));
 const cache=new Map(),pending=new Map();let tail=Promise.resolve(),queued=0;
 const save=()=>{fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state),{mode:0o600});fs.renameSync(tmp,file)};
 if(initialAccount&&initialUntil>now()&&!state[initialAccount]){state[initialAccount]={until:initialUntil,strikes:1};save()}
 const getState=account=>({blockedUntil:state[account]?.until>now()?new Date(state[account].until).toISOString():null});
 const limited=account=>{const until=state[account]?.until||0;if(until<=now())return null;const e=Error('Meta จำกัดคำขอของบัญชีโฆษณา โปรแกรมพักการเรียกจนถึง '+new Date(until).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})+' (เวลาไทย) หลังพ้นช่วงพักจึงเรียก Meta ได้อีกครั้ง');e.metaRate=true;e.retryAt=new Date(until).toISOString();e.meta={code:17};return e};
 function hint(headers){let minutes=0,seconds=0;try{const usage=JSON.parse(headers?.get('x-business-use-case-usage')||'{}');for(const rows of Object.values(usage))for(const row of Array.isArray(rows)?rows:[])minutes=Math.max(minutes,Number(row.estimated_time_to_regain_access)||0)}catch{}
 const retry=headers?.get('retry-after');if(retry){seconds=/^\d+$/.test(retry)?Number(retry):Math.max(0,(Date.parse(retry)-now())/1000)}return Math.max(minutes*60000,seconds*1000);}
 function block(account,headers){const strikes=Math.min(8,(state[account]?.strikes||0)+1);state[account]={until:now()+Math.min(86400000,Math.max(15*60000*Math.pow(2,Math.min(strikes-1,3)),hint(headers))),strikes};save();console.info(JSON.stringify({event:'meta_rate_block',blockedUntil:new Date(state[account].until).toISOString(),strikes,providerWaitMs:hint(headers)}));return limited(account)}
 function ttl(route){if(/\/me\/accounts|\/assigned_pages/.test(route))return 10*60000;if(/fields=id,name,picture|fields=id,name,account_status/.test(route))return 5*60000;if(/insights|\/ads\?/.test(route))return 120000;return 60000}
 async function request(route,url,opt,account,token){
 const method=String(opt.method||'GET').toUpperCase(),read=method==='GET';
 const key=account+':'+crypto.createHash('sha256').update(token).digest('hex')+':'+route;
 if(read&&cache.get(key)?.expires>now())return structuredClone(cache.get(key).value);
 if(read&&pending.has(key))return structuredClone(await pending.get(key));
 const blocked=limited(account);if(blocked)throw blocked;if(queued>=100)throw Error('มีคำขอ Meta รออยู่มากเกินไป กรุณารอสักครู่');
 queued++;
 const task=tail.then(async()=>{
 const stop=limited(account);if(stop)throw stop;
 const r=await fetcher(url,{...opt,signal:opt.signal||AbortSignal.timeout(45000)}),j=await r.json();
 if(!r.ok){const m=j.error||{};if(r.status===429||[4,17,32,341,613,80000,80004].includes(Number(m.code))||/too many calls|rate.?limit|request limit reached/i.test(m.message||''))throw block(account,r.headers);
 const e=Error(m.error_user_msg||m.message||'Meta API error');e.meta={code:m.code,subcode:m.error_subcode,title:m.error_user_title,message:m.message,userMessage:m.error_user_msg,traceId:m.fbtrace_id};throw e;}
 if(read){if(cache.size>=500)cache.delete(cache.keys().next().value);cache.set(key,{value:structuredClone(j),expires:now()+ttl(route)})}
 else{for(const k of cache.keys())if(k.startsWith(account+':'))cache.delete(k)}
 return j;
 });
 tail=task.catch(()=>{});if(read)pending.set(key,task);
 try{return structuredClone(await task)}finally{queued--;if(read)pending.delete(key)}
 }
 return {request,status:getState};
}
module.exports={createMetaGuard};

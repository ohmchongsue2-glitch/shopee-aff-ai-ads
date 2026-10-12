'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
function installAdJobs(app,{dir,seal,cfg,meta,rateStatus,run}){
 const file=path.join(dir,'ad-jobs.json');let jobs=[];const locks=new Set();
 try{jobs=seal.decode(JSON.parse(fs.readFileSync(file,'utf8')));if(!Array.isArray(jobs))throw Error()}catch(e){if(e.code!=='ENOENT')throw Error('Cannot load ad jobs')}
 function save(){fs.mkdirSync(dir,{recursive:true,mode:0o700});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(seal.encode(jobs)),{mode:0o600});fs.renameSync(tmp,file)}
 let changed=false;for(const j of jobs)if(j.status==='RUNNING'){j.status='REVIEW_REQUIRED';j.error='การทำงานหยุดระหว่างสร้าง ต้องตรวจใน Meta ก่อนเพื่อป้องกันแอดซ้ำ';changed=true}if(changed)save();
 function input(b){const x={};for(const key of ['pageId','postId','name','dailyBudget','subId','startTime','websiteUrl','ageMin','ageMax']){if(b[key]!==undefined&&!['string','number'].includes(typeof b[key]))throw Error('ข้อมูลสร้างแอดไม่ถูกต้อง');if(b[key]!==undefined)x[key]=String(b[key]).trim();if((x[key]||'').length>(key==='websiteUrl'?4096:200))throw Error('ข้อมูลสร้างแอดยาวเกินกำหนด')}x.scheduled=b.scheduled===true;return x}
 function validInput(b){const x=input(b);if(!/^\d+$/.test(x.pageId||'')||!/^\d+_\d+$/.test(x.postId||'')||!x.postId.startsWith(x.pageId+'_')||!x.name)throw Error('กรุณาเลือกเพจ โพสต์ และกรอกชื่อให้ครบ');if(!Number.isFinite(Number(x.dailyBudget))||Number(x.dailyBudget)<1||Number(x.dailyBudget)>1000000)throw Error('งบรายวันไม่ถูกต้อง');let url;try{url=new URL(x.websiteUrl);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error()}catch{throw Error('กรอกลิงก์ปลายทางให้ครบ')}return x}
 const fingerprint=b=>crypto.createHash('sha256').update(JSON.stringify(b)).digest('hex');
 const snapshot=j=>({...j,retryAt:rateStatus(j.account).blockedUntil||j.retryAt||null});
 const get=q=>jobs.find(j=>j.id===q.params.id&&j.account===cfg().account);
 function paused(s,job){const until=rateStatus(cfg().account).blockedUntil;if(!until)return false;if(job){job.status='WAITING';job.retryAt=until;job.updatedAt=new Date().toISOString();job.error='พักคำขอ Meta จนถึง '+new Date(until).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})+' (เวลาไทย)';save()}s.status(429).json({error:job?.error||'Meta อยู่ในช่วงพักคำขอ',jobId:job?.id,retryAt:until});return true}
 async function execute(q,s,job){
 job.status='RUNNING';job.stage='validate';job.created={};job.retryAt=null;job.updatedAt=new Date().toISOString();job.attempts=(job.attempts||0)+1;save();
 let sent=false,code=200;const response={status(n){code=n;return this},json(payload){
 job.stage=payload.stage||job.stage;job.created=payload.created||job.created;job.updatedAt=new Date().toISOString();
 if(payload.ok){job.status='SUCCEEDED';job.result=payload;job.error=null}
 else{job.error=String(payload.error||'สร้างไม่สำเร็จ');job.retryAt=payload.retryAt||null;job.status=payload.retryAt?'WAITING':(['campaign','adset','creative','ad'].includes(job.stage)&&!payload.details?.code?'REVIEW_REQUIRED':'FAILED')}
 job.history=job.history||[];job.history.push({at:job.updatedAt,status:job.status,stage:job.stage,created:{...job.created},error:job.error});
 save();sent=true;s.status(code).json({...payload,jobId:job.id,jobStatus:job.status});
 }};
 try{await run({...q,body:job.request},response,(stage,created)=>{job.stage=stage;job.created={...created};job.updatedAt=new Date().toISOString();save()})}
 catch{job.status='REVIEW_REQUIRED';job.error='ผลการสร้างไม่แน่นอน ต้องตรวจ Meta ก่อนรันใหม่';job.updatedAt=new Date().toISOString();try{save()}catch{}if(!sent)s.status(500).json({error:job.error,jobId:job.id})}
 finally{locks.delete(job.account)}
 }
 app.get('/api/ad-jobs',(q,s)=>s.json({data:jobs.filter(j=>j.account===cfg().account).slice().reverse().map(snapshot),rateLimit:rateStatus(cfg().account)}));
 app.post('/api/ad-jobs',(q,s)=>{
 try{const account=cfg().account,request=validInput(q.body||{}),hash=fingerprint(request);const existing=jobs.find(j=>j.account===account&&j.fingerprint===hash);if(existing)return s.json({ok:true,jobId:existing.id,status:existing.status,existing:true});
 if(jobs.length>=500)return s.status(400).json({error:'รายการงานเต็ม'});
 const until=rateStatus(account).blockedUntil,job={id:crypto.randomUUID(),account,fingerprint:hash,request,status:until?'WAITING':'PENDING',retryAt:until,created:{},stage:'saved',attempts:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};jobs.push(job);save();s.json({ok:true,jobId:job.id,status:job.status});
 }catch(e){s.status(400).json({error:e.message})}
 });
 app.post('/api/meta/create-existing-post',async(q,s)=>{
 let account=cfg().account;
 try{
 if(locks.has(account))return s.status(409).json({error:'บัญชีนี้กำลังสร้างแอดอยู่ กรุณารอ'});
 const request=validInput(q.body||{}),hash=fingerprint(request),requestId=String(q.body?.requestId||'');
 if(requestId.length>100)return s.status(400).json({error:'รหัสคำขอไม่ถูกต้อง'});
 const previous=jobs.find(j=>j.account===account&&((requestId&&j.requestId===requestId)||(j.fingerprint===hash&&j.status!=='SUCCEEDED')));
 if(previous)return s.status(previous.status==='SUCCEEDED'?200:409).json(previous.status==='SUCCEEDED'?{...previous.result,jobId:previous.id}:{error:'งานนี้บันทึกไว้แล้ว ให้กดรันใหม่จากรายการงาน',jobId:previous.id,jobStatus:previous.status,retryAt:snapshot(previous).retryAt});
 if(jobs.length>=500)return s.status(400).json({error:'รายการงานเต็ม กรุณาจัดการงานเดิมก่อน'});
 const job={id:crypto.randomUUID(),account,requestId,fingerprint:hash,request,status:'PENDING',created:{},stage:'validate',attempts:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};jobs.push(job);save();
 if(paused(s,job))return;locks.add(account);await execute(q,s,job);
 }catch(e){locks.delete(account);s.status(400).json({error:e.message})}
 });
 app.post('/api/ad-jobs/:id/retry',async(q,s)=>{
 const job=get(q);if(!job)return s.status(404).json({error:'ไม่พบงานในบัญชีที่เลือก'});
 if(!['FAILED','WAITING','PENDING'].includes(job.status))return s.status(409).json({error:job.status==='SUCCEEDED'?'งานนี้สำเร็จแล้ว ไม่สร้างซ้ำ':'งานนี้ต้องตรวจ Meta ก่อนรันใหม่',jobId:job.id});
 if(locks.has(job.account))return s.status(409).json({error:'บัญชีนี้กำลังสร้างแอดอยู่'});
 if(paused(s,job))return;
 if(job.request.scheduled&&Date.parse(job.request.startTime+':00+07:00')<=Date.now())return s.status(400).json({error:'เวลาเริ่มแอดผ่านไปแล้ว ให้กดนำค่าไปแก้ไขและเลือกเวลาใหม่'});
 locks.add(job.account);
 try{
 job.status='RUNNING';job.stage='retry_check';save();
 if(job.created.ad){
 const existing=await meta('/'+job.created.ad+'?fields=id,account_id,status');if(existing.account_id!==job.account)throw Error('แอดไม่อยู่ในบัญชีเดิม');
 job.status='SUCCEEDED';job.result={ok:true,ad:existing.id,status:existing.status,existing:true,name:job.request.name};job.error=null;save();locks.delete(job.account);return s.json({...job.result,jobId:job.id,message:'พบแอดที่สร้างแล้ว ระบบไม่สร้างซ้ำ กรุณาตรวจสถานะใน Meta'});
 }
 for(const id of [job.created.campaign,job.created.adset].filter(Boolean)){
 const existing=await meta('/'+id+'?fields=id,account_id,status');if(existing.account_id!==job.account)throw Error('รายการที่สร้างค้างไม่อยู่ในบัญชีเดิม');
 if(existing.status!=='PAUSED'){await meta('/'+id,{method:'POST',body:JSON.stringify({status:'PAUSED'})});const actual=await meta('/'+id+'?fields=id,account_id,status');if(actual.status!=='PAUSED')throw Error('ยังพักรายการที่สร้างค้างไม่ได้')}
 }
 await execute(q,s,job);
 }catch(e){locks.delete(job.account);job.status=e.metaRate?'WAITING':'FAILED';job.error=e.message;job.retryAt=e.retryAt||null;job.updatedAt=new Date().toISOString();save();s.status(e.metaRate?429:400).json({error:e.message,jobId:job.id,retryAt:job.retryAt})}
 });
}
module.exports={installAdJobs};

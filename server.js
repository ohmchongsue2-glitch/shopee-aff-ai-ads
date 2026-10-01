const express=require('express');
const app=express();
app.use(express.json({limit:'2mb'})); app.use(express.static('public'));
const G='https://graph.facebook.com/v24.0';
function cfg(){return {token:process.env.META_ACCESS_TOKEN,account:(process.env.META_AD_ACCOUNT_ID||'').replace(/^act_/,''),page:process.env.META_PAGE_ID,openai:process.env.OPENAI_API_KEY}}
async function meta(path,opts={}){const c=cfg(); if(!c.token) throw new Error('ยังไม่ได้ตั้ง META_ACCESS_TOKEN'); const u=new URL(G+path); u.searchParams.set('access_token',c.token); const r=await fetch(u,{...opts,headers:{'content-type':'application/json',...(opts.headers||{})}}); const j=await r.json(); if(!r.ok) throw new Error(j?.error?.message||'Meta API error'); return j}
app.get('/health',(q,s)=>s.json({ok:true}));
app.get('/api/config',(q,s)=>{const c=cfg();s.json({meta:!!(c.token&&c.account&&c.page),openai:!!c.openai,account:c.account?'act_'+c.account:'',page:c.page||''})});
app.get('/api/meta/test',async(q,s)=>{try{const c=cfg();const j=await meta('/act_'+c.account+'?fields=id,name,account_status,currency');s.json({ok:true,data:j})}catch(e){s.status(400).json({ok:false,error:e.message})}});
app.get('/api/meta/ads',async(q,s)=>{try{const c=cfg();const j=await meta('/act_'+c.account+'/ads?fields=id,name,status,effective_status,adset{id,name,daily_budget},campaign{id,name},insights.date_preset(today){spend,clicks,cpc}&limit=100');s.json(j)}catch(e){s.status(400).json({error:e.message})}});
app.post('/api/meta/status',async(q,s)=>{try{const {id,status}=q.body;if(!id||!['ACTIVE','PAUSED'].includes(status))throw new Error('ข้อมูลไม่ครบ');const j=await meta('/'+id,{method:'POST',body:JSON.stringify({status})});s.json({ok:true,data:j})}catch(e){s.status(400).json({ok:false,error:e.message})}});
app.post('/api/meta/create',async(q,s)=>{try{
 const c=cfg(),b=q.body;if(!b.name||!b.url||!b.dailyBudget||!b.imageHash)throw new Error('กรอกชื่อ, AFF URL, งบ และ Image Hash ให้ครบ');
 const camp=await meta('/act_'+c.account+'/campaigns',{method:'POST',body:JSON.stringify({name:b.name+' Campaign',objective:'OUTCOME_TRAFFIC',special_ad_categories:[],status:'PAUSED'})});
 const adset=await meta('/act_'+c.account+'/adsets',{method:'POST',body:JSON.stringify({name:b.name+' Ad Set',campaign_id:camp.id,daily_budget:Math.round(Number(b.dailyBudget)*100),billing_event:'IMPRESSIONS',optimization_goal:'LINK_CLICKS',bid_strategy:'LOWEST_COST_WITHOUT_CAP',targeting:{geo_locations:{countries:['TH']},age_min:Number(b.ageMin||18),age_max:Number(b.ageMax||65)},status:'PAUSED'})});
 const creative=await meta('/act_'+c.account+'/adcreatives',{method:'POST',body:JSON.stringify({name:b.name+' Creative',object_story_spec:{page_id:c.page,link_data:{link:b.url,message:b.text||'',name:b.headline||b.name,image_hash:b.imageHash,call_to_action:{type:'SHOP_NOW',value:{link:b.url}}}}})});
 const ad=await meta('/act_'+c.account+'/ads',{method:'POST',body:JSON.stringify({name:b.name,adset_id:adset.id,creative:{creative_id:creative.id},status:'PAUSED'})});
 s.json({ok:true,campaign:camp.id,adset:adset.id,creative:creative.id,ad:ad.id});
}catch(e){s.status(400).json({ok:false,error:e.message})}});
app.post('/api/ai',async(q,s)=>{try{const key=cfg().openai;if(!key)throw new Error('ยังไม่ได้ตั้ง OPENAI_API_KEY');const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-5.6-luna',input:'วิเคราะห์โฆษณา Shopee Affiliate แบบกระชับ และห้ามสั่งใช้เงินเอง ข้อมูล: '+JSON.stringify(q.body)})});const j=await r.json();if(!r.ok)throw new Error(j.error?.message||'OpenAI error');s.json({ok:true,text:j.output_text||j.output?.flatMap(x=>x.content||[]).map(x=>x.text).filter(Boolean).join('\n')||''})}catch(e){s.status(400).json({ok:false,error:e.message})}});
const port=Number(process.env.PORT||3000);app.listen(port,'0.0.0.0',()=>console.log('Shopee AFF AI Ads listening on',port));
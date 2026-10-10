'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),vm=require('vm'),crypto=require('crypto'),{createRequire}=require('module');
const req=createRequire(path.join(__dirname,'server.js')),security=req('./security');
let passed=0,externalCalls=0;
const check=(value,label)=>{assert(value,label);passed++};
const origin='https://ads.example.test',dir=fs.mkdtempSync(path.join(os.tmpdir(),'aff-security-'));
const token=crypto.randomBytes(32).toString('hex'),key=crypto.randomBytes(32).toString('hex');
const env={PORT:'0',SETTINGS_DIR:dir,APP_ORIGIN:origin,SETTINGS_ENCRYPTION_KEY:key,ADMIN_SETUP_TOKEN_HASH:crypto.createHash('sha256').update(token).digest('hex'),ADMIN_SETUP_EXPIRES:String(Date.now()+3600000)};
const nativeFetch=fetch;
const savedKey='FAKE_META_TOKEN_FOR_TEST_ONLY_00001';
fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({META_ACCESS_TOKEN:savedKey,META_AD_ACCOUNT_ID:'123'}));
function start(){
 const ctx={require:p=>p==='./security'?{...security,installSecurity:(app,opts)=>security.installSecurity(app,{...opts,env})}:req(p),process:{env},console:{info(){},log(){}},__dirname,URL,AbortSignal,Date,Number,String,Object,Math,JSON,Error,Buffer,setInterval:()=>({unref(){}}),fetch:async(url,options)=>{externalCalls++;return {ok:true,json:async()=>({id:'act_123',name:'Test',account_status:1,currency:'THB'})}}};
 const server=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'server.js'),'utf8')+'\nhttpServer;',ctx);
 return new Promise(resolve=>server.on('listening',()=>resolve(server)));
}
async function request(server,p,{method='GET',body,cookie,csrf,requestOrigin=origin,ip='1.2.3.4',headers={}}={}){
 const h={'X-Forwarded-Proto':'https','X-Forwarded-For':ip,...headers};if(cookie)h.Cookie=cookie;if(csrf)h['X-CSRF-Token']=csrf;if(method!=='GET'){h.Origin=requestOrigin;h['Content-Type']='application/json'}
 const r=await nativeFetch('http://127.0.0.1:'+server.address().port+p,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});const text=await r.text();let data;try{data=JSON.parse(text)}catch{}return {r,text,data};
}
(async()=>{
 const server=await start();
 try{
 const encrypted=JSON.parse(fs.readFileSync(path.join(dir,'settings.json')));check(encrypted.encrypted===true,'legacy settings migrated');check(!JSON.stringify(encrypted).includes(savedKey),'no key plaintext');check(security.secretStore(key).decode(encrypted).META_ACCESS_TOKEN===savedKey,'decrypt retains settings');
 let x=await request(server,'/api/config');check(x.r.status===401,'anonymous config denied');check(externalCalls===0,'anonymous makes no Meta call');
 for(const p of ['/api/settings','/api/meta/create-existing-post','/api/meta/status','/api/telegram/test','/api/affiliate/import']){x=await request(server,p,{method:'POST',body:{}});check(x.r.status===401,p+' unauthorized')}
 x=await request(server,'/settings.html');check(x.r.status===302&&x.r.headers.get('location')==='/login.html','HTML login gate');
 x=await request(server,'/health');check(x.r.status===200&&x.data.ok,'health open for Railway');
 x=await request(server,'/login.html');check(x.r.status===200,'login page accessible');check(x.r.headers.get('content-security-policy').includes("script-src 'self'")&&!x.r.headers.get('content-security-policy').includes('unsafe-eval'),'strict CSP');check(x.r.headers.get('x-frame-options')==='DENY','frame blocked');check(x.r.headers.get('strict-transport-security')!==null,'HSTS');check(!x.r.headers.has('x-powered-by'),'server header suppressed');
 x=await request(server,'/api/auth/setup',{method:'POST',body:{setupToken:'bad',username:'admin',password:'Valid-Testing-Password-Only!'}});check(x.r.status===403,'bootstrap rejects wrong token');
 x=await request(server,'/api/auth/setup',{method:'POST',requestOrigin:'https://attacker.test',body:{setupToken:token,username:'admin',password:'Valid-Testing-Password-Only!'}});check(x.r.status===403,'bootstrap rejects cross origin');
 x=await request(server,'/api/auth/setup',{method:'POST',body:{setupToken:token,username:'admin',password:'Valid-Testing-Password-Only!'}});check(x.r.status===200,'bootstrap success');let cookie=x.r.headers.get('set-cookie').split(';')[0],csrf=x.data.csrf;
 check(x.r.headers.get('set-cookie').includes('HttpOnly')&&x.r.headers.get('set-cookie').includes('Secure')&&x.r.headers.get('set-cookie').includes('SameSite=Strict'),'secure cookie');
 check(!fs.readFileSync(path.join(dir,'admin-auth.json'),'utf8').includes('Valid-Testing-Password-Only!'),'password hash persisted');
 x=await request(server,'/api/auth/setup',{method:'POST',body:{setupToken:token,username:'other',password:'Valid-Testing-Password-Only!'}});check(x.r.status===409,'bootstrap one use');
 x=await request(server,'/api/config',{cookie});check(x.r.status===200&&x.data.metaTokenSaved,'authenticated config');check(!x.text.includes(savedKey),'config hides secrets');
 x=await request(server,'/api/meta/test',{cookie});check(x.r.status===200&&externalCalls===1,'authenticated Meta integration works');
 x=await request(server,'/api/settings',{method:'POST',cookie,body:{telegramChat:'999'}});check(x.r.status===403,'missing CSRF rejected');
 x=await request(server,'/api/settings',{method:'POST',cookie,csrf,requestOrigin:'null',body:{telegramChat:'999'}});check(x.r.status===403,'null origin rejected');
 x=await request(server,'/api/settings',{method:'POST',cookie,csrf,body:{telegramChat:'999'}});check(x.r.status===200,'valid settings save');check(security.secretStore(key).decode(JSON.parse(fs.readFileSync(path.join(dir,'settings.json')))).TELEGRAM_CHAT_ID==='999','encrypted save retained');
 for(const p of ['/','/create.html','/settings.html']){x=await request(server,p,{cookie});check(x.r.status===200&&x.text.includes('/security-client.js'),'authenticated '+p);check(!/<script>|\bon(?:click|change|input)=/.test(x.text),'no inline script '+p);}
 x=await request(server,'/api/meta/page?pageId=123%3Ffields=access_token',{cookie});check(x.r.status===400,'Graph path injection blocked');
 x=await request(server,'/api/meta/status',{method:'POST',cookie,csrf,body:{id:'123?fields=access_token',status:'ACTIVE'}});check(x.r.status===400,'status ID validation');
 x=await request(server,'/api/auth/login',{method:'POST',body:{username:'admin',password:'Valid-Testing-Password-Only!',remember:true},ip:'2.2.2.2'});check(x.r.status===200,'login works');const otherCookie=x.r.headers.get('set-cookie').split(';')[0];check(x.r.headers.get('set-cookie').includes('Max-Age=2592000'),'remember 30 days');
 x=await request(server,'/api/auth/password',{method:'POST',cookie,csrf,body:{currentPassword:'Valid-Testing-Password-Only!',newPassword:'Changed-Testing-Password-Only!'}});check(x.r.status===200,'change password');cookie=x.r.headers.get('set-cookie').split(';')[0];csrf=x.data.csrf;
 x=await request(server,'/api/config',{cookie:otherCookie});check(x.r.status===401,'other sessions revoked');
 const second=await start();try{x=await request(second,'/api/config',{cookie});check(x.r.status===200,'session survives restart')}finally{await new Promise(resolve=>second.close(resolve))}
 x=await request(server,'/api/auth/logout',{method:'POST',cookie,csrf,body:{}});check(x.r.status===200,'logout');x=await request(server,'/api/config',{cookie});check(x.r.status===401,'logged out cookie rejected');
 for(let i=0;i<6;i++)x=await request(server,'/api/auth/login',{method:'POST',body:{username:'admin',password:'wrong'},ip:'3.3.3.3'});check(x.r.status===429,'bruteforce rate limited');
 for(const f of fs.readdirSync(path.join(__dirname,'public')).filter(f=>f.endsWith('.js')))new vm.Script(fs.readFileSync(path.join(__dirname,'public',f),'utf8'));
 check(true,'all frontend scripts parse');
 console.log('PASS: '+passed+' security and integration assertions; no live external calls.');
 }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});


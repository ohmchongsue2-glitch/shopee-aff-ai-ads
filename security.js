'use strict';
const express=require('express');
const crypto=require('crypto'),fs=require('fs'),path=require('path'),{promisify}=require('util');
const scrypt=promisify(crypto.scrypt);
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value),{mode:0o600});fs.chmodSync(tmp,0o600);fs.renameSync(tmp,file)}
function read(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch(e){if(e.code==='ENOENT')return fallback;throw Error('Cannot read security state')}}
function installSecurity(app,{dir,origin,env=process.env,now=()=>Date.now()}){
 if(!origin)throw Error('APP_ORIGIN is required');const expectedOrigin=new URL(origin).origin;
 const secure=expectedOrigin.startsWith('https:'),cookieName=secure?'__Host-aff_session':'aff_session';
 const adminFile=path.join(dir,'admin-auth.json'),sessionFile=path.join(dir,'admin-sessions.json');
 let admin=read(adminFile,null),sessions=read(sessionFile,{}),settingUp=false,passwordJobs=0;
 const limits=new Map();let lastClean=0;const pending=new Set();
 app.disable('x-powered-by');app.set('trust proxy',1);app.set('json escape',true);
 function audit(event,q){console.info(JSON.stringify({event,at:new Date(now()).toISOString(),ipHash:digest(q.ip||'unknown').slice(0,16)}))}
 function limited(key,count,windowMs){const t=now();if(t-lastClean>60000){for(const [k,v] of limits)if(v.until<=t)limits.delete(k);lastClean=t}if(limits.size>=10000&&!limits.has(key))return true;let v=limits.get(key);if(!v||v.until<=t){v={count:0,until:t+windowMs};limits.set(key,v)}return ++v.count>count}
 function cookie(s,token,ttl){s.cookie(cookieName,token,{secure,httpOnly:true,sameSite:'strict',path:'/',maxAge:ttl});}
 function clearCookie(s){s.clearCookie(cookieName,{secure,httpOnly:true,sameSite:'strict',path:'/'});}
 function getSession(q){const part=String(q.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='));if(!part)return null;const token=part.slice(cookieName.length+1);if(!/^[a-f0-9]{64}$/.test(token))return null;const id=digest(token),session=sessions[id];if(!admin||!session||session.expires<=now()||session.version!==admin.version)return null;return {...session,id}}
 function issue(q,s,remember=false){for(const [id,v] of Object.entries(sessions))if(v.expires<=now()||v.version!==admin.version)delete sessions[id];
 const token=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(32).toString('hex'),ttl=remember?30*86400000:12*3600000;
 if(Object.keys(sessions).length>=20)delete sessions[Object.keys(sessions)[0]];
 sessions[digest(token)]={csrf,expires:now()+ttl,username:admin.username,version:admin.version};atomic(sessionFile,sessions);cookie(s,token,ttl);return {ok:true,username:admin.username,csrf};
 }
 async function derive(password,salt){if(passwordJobs>=2)throw Object.assign(Error('กรุณาลองใหม่อีกสักครู่'),{status:429});passwordJobs++;try{return (await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024})).toString('hex')}finally{passwordJobs--}}
 function validateNew(username,password){if(typeof username!=='string'||!/^[A-Za-z0-9_.-]{3,64}$/.test(username))throw Error('ชื่อผู้ใช้ 3–64 ตัว ใช้ตัวอักษรอังกฤษ ตัวเลข _ . -');if(typeof password!=='string'||password.length<12||password.length>128||Buffer.byteLength(password)>512)throw Error('รหัสผ่านต้องยาว 12–128 ตัวอักษร')}
 function writeAllowed(q,s){if(q.get('origin')!==expectedOrigin||!q.is('application/json')){s.status(403).json({error:'คำขอไม่ผ่านการตรวจสอบแหล่งที่มา'});return false}return true}
 const wrap=fn=>(q,s,next)=>Promise.resolve(fn(q,s,next)).catch(e=>s.status(e.status||400).json({error:e.status===429?e.message:'ข้อมูลบัญชีไม่ถูกต้องหรือไม่พร้อมใช้งาน'}));
 app.use((q,s,next)=>{
 s.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",'Cache-Control':'no-store'});
 if(secure)s.set('Strict-Transport-Security','max-age=31536000');
 if(q.path==='/health')return next();
 if(secure&&!q.secure){s.status(400).json({error:'ต้องเชื่อมต่อผ่าน HTTPS'});return}
 if(q.get('sec-fetch-site')==='cross-site'&&q.path.startsWith('/api/'))return s.status(403).json({error:'ไม่อนุญาตคำขอจากเว็บอื่น'});
 if(limited('global:'+q.ip,240,60000)){s.set('Retry-After','60');return s.status(429).json({error:'คำขอมากเกินไป กรุณารอสักครู่'})}
 next();
 });
 app.use('/api/auth',express.json({limit:'8kb',strict:true}));
 app.get('/api/auth/session',(q,s)=>{const session=getSession(q);s.json(session?{authenticated:true,username:session.username,csrf:session.csrf}:{authenticated:false,setupRequired:!admin,setupAvailable:!admin&&/^[a-f0-9]{64}$/.test(env.ADMIN_SETUP_TOKEN_HASH||'')&&Number(env.ADMIN_SETUP_EXPIRES)>now()})});
 app.post('/api/auth/setup',wrap(async(q,s)=>{
 if(!writeAllowed(q,s))return;if(limited('setup:'+q.ip,5,15*60000))return s.status(429).json({error:'ลองตั้งค่ามากเกินไป กรุณารอ 15 นาที'});
 if(admin)return s.status(409).json({error:'ตั้งบัญชีผู้ดูแลแล้ว กรุณาเข้าสู่ระบบ'});
 const b=q.body||{};if(typeof b.setupToken!=='string'||b.setupToken.length>256||!env.ADMIN_SETUP_TOKEN_HASH||Number(env.ADMIN_SETUP_EXPIRES)<=now()||!equal(digest(b.setupToken),env.ADMIN_SETUP_TOKEN_HASH)){audit('setup_denied',q);return s.status(403).json({error:'รหัสตั้งค่าครั้งแรกไม่ถูกต้องหรือหมดอายุ'})}
 if(settingUp)return s.status(409).json({error:'กำลังบันทึกบัญชี'});validateNew(b.username,b.password);settingUp=true;
 try{const salt=crypto.randomBytes(16).toString('hex'),hash=await derive(b.password,salt);admin={username:b.username,salt,hash,version:crypto.randomBytes(16).toString('hex'),createdAt:new Date(now()).toISOString()};atomic(adminFile,admin);audit('admin_setup',q);s.json(issue(q,s));}finally{settingUp=false}
 }));
 app.post('/api/auth/login',wrap(async(q,s)=>{
 if(!writeAllowed(q,s))return;
 if(limited('login:'+q.ip,5,15*60000)||limited('login-global',100,15*60000)){s.set('Retry-After','900');return s.status(429).json({error:'ลองเข้าสู่ระบบมากเกินไป กรุณารอ 15 นาที'})}
 const b=q.body||{};if(!admin||typeof b.username!=='string'||typeof b.password!=='string'||b.password.length>128)return s.status(401).json({error:'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'});
 const candidate=await derive(b.password,admin.salt);if(!equal(candidate,admin.hash)||!equal(b.username,admin.username)){audit('login_denied',q);return s.status(401).json({error:'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'})}
 audit('login_success',q);s.json(issue(q,s,b.remember===true));
 }));
 app.use((q,s,next)=>{
 const publicPaths=new Set(['/health','/login.html','/login.js','/security-client.js']);if(publicPaths.has(q.path))return next();
 const session=getSession(q);if(!session){if(q.path.startsWith('/api/'))return s.status(401).json({error:'กรุณาเข้าสู่ระบบก่อนใช้งาน'});return s.redirect(302,'/login.html')}
 q.auth=session;
 if(q.path.startsWith('/api/')){
 if(limited('api:'+session.id,180,60000))return s.status(429).json({error:'เรียกข้อมูลมากเกินไป'});
 if(!['GET','HEAD','OPTIONS'].includes(q.method)){if(!writeAllowed(q,s))return;if(!equal(q.get('x-csrf-token')||'',session.csrf))return s.status(403).json({error:'เซสชันไม่ถูกต้อง กรุณารีเฟรชหน้าเว็บ'});
 if(limited('write:'+session.id,20,60000))return s.status(429).json({error:'ส่งคำสั่งถี่เกินไป กรุณารอหนึ่งนาที'})}
 }
 next();
 });
 app.post('/api/auth/logout',(q,s)=>{delete sessions[q.auth.id];atomic(sessionFile,sessions);clearCookie(s);audit('logout',q);s.json({ok:true})});
 app.post('/api/auth/password',wrap(async(q,s)=>{
 if(limited('password:'+q.auth.id,3,15*60000))return s.status(429).json({error:'ลองเปลี่ยนรหัสผ่านมากเกินไป'});
 const b=q.body||{};validateNew(admin.username,b.newPassword);if(typeof b.currentPassword!=='string'||b.currentPassword.length>128)return s.status(400).json({error:'ข้อมูลไม่ถูกต้อง'});
 const previous=admin;if(!equal(await derive(b.currentPassword,previous.salt),previous.hash)||admin.version!==previous.version)return s.status(401).json({error:'รหัสผ่านปัจจุบันไม่ถูกต้อง'});
 const salt=crypto.randomBytes(16).toString('hex'),hash=await derive(b.newPassword,salt);admin={...admin,salt,hash,version:crypto.randomBytes(16).toString('hex')};atomic(adminFile,admin);sessions={};atomic(sessionFile,sessions);audit('password_changed',q);s.json(issue(q,s));
 }));
 app.use('/api/meta/create-existing-post',(q,s,next)=>{if(q.method!=='POST')return next();const key=q.auth.id;if(pending.has(key))return s.status(409).json({error:'กำลังสร้างแอดอยู่ กรุณารอให้เสร็จ'});pending.add(key);const done=()=>pending.delete(key);s.once('finish',done);s.once('close',done);next()});
 return {isConfigured:()=>!!admin};
}
function secretStore(keyHex){
 if(!/^[a-f0-9]{64}$/.test(keyHex||''))throw Error('SETTINGS_ENCRYPTION_KEY is required');
 const key=Buffer.from(keyHex,'hex');
 return {
 encode(value){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return {version:1,encrypted:true,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')}},
 decode(value){if(!value?.encrypted)return value;if(value.version!==1)throw Error('Unsupported encrypted settings');const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(value.iv,'base64'));decipher.setAuthTag(Buffer.from(value.tag,'base64'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data,'base64')),decipher.final()]).toString('utf8'))}
 };
}
module.exports={installSecurity,secretStore};

'use strict';
(()=>{
 const nativeFetch=window.fetch.bind(window);let session=null;
 const ready=nativeFetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'}).then(r=>r.json()).then(j=>{session=j;if(!j.authenticated)location.replace('/login.html');return j});
 window.fetch=async(input,options={})=>{
 const url=new URL(typeof input==='string'?input:input.url,location.href);
 if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return nativeFetch(input,options);
 const auth=await ready;if(!auth.authenticated)throw Error('กรุณาเข้าสู่ระบบ');
 const headers=new Headers(options.headers||(input instanceof Request?input.headers:undefined));
 if(!['GET','HEAD','OPTIONS'].includes(String(options.method||(input instanceof Request?input.method:'GET')).toUpperCase()))headers.set('X-CSRF-Token',session.csrf);
 const r=await nativeFetch(input,{...options,headers,credentials:'same-origin',cache:'no-store'});
 if(r.status===429){try{const j=await r.clone().json();if(j.retryAt)window.dispatchEvent(new CustomEvent('meta-rate-limit',{detail:{until:j.retryAt}}))}catch{}}
 if(r.status===401){location.replace('/login.html');throw Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่')}return r;
 };
 document.addEventListener('DOMContentLoaded',()=>{
 const banner=document.createElement('aside');banner.id='metaRateBanner';banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');banner.style.cssText='margin:16px auto;padding:16px 20px;max-width:1140px;border:1px solid #f5b74f;border-radius:12px;background:#fff5dc;color:#744100;font:16px/1.7 Arial,sans-serif';banner.textContent='กำลังตรวจสถานะขีดจำกัด Meta…';const navTop=document.querySelector('.nav');if(navTop)navTop.after(banner);else document.body.prepend(banner);
 let until=0;
 function draw(){const seconds=Math.max(0,Math.ceil((until-Date.now())/1000));window.metaBlockedUntil=until;
 if(seconds){const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;banner.textContent='⚠ Meta จำกัดคำขอ • พักถึง '+new Date(until).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})+' (เวลาไทย) • เหลือ '+(h?h+' ชม. ':'')+m+' นาที '+s+' วินาที • เก็บงานไว้ได้ แต่ยังรันใหม่ไม่ได้';banner.style.background='#fff5dc'}
 else{banner.textContent='ไม่มีช่วงพักคำขอ Meta ที่บันทึกไว้ • ตรวจอัตโนมัติทุก 6 ชั่วโมง • กดตรวจหรือสร้างแอดเมื่อต้องการ';banner.style.background='#eef6ff'}
 const button=document.getElementById('createBtn');if(button){if(seconds&&!button.disabled){button.dataset.rateLocked='1';button.disabled=true}else if(!seconds&&button.dataset.rateLocked==='1'){delete button.dataset.rateLocked;if(!button.dataset.busy)button.disabled=false}}
 document.querySelectorAll('[data-retry-job]').forEach(b=>{b.disabled=!!seconds||b.dataset.busy==='1'});
 }
 async function refreshRate(){try{const r=await fetch('/api/config'),j=await r.json();if(!r.ok)return;until=Date.parse(j.metaRateLimit?.blockedUntil||'')||0;draw()}catch{banner.textContent='ตรวจสถานะขีดจำกัดไม่ได้ กรุณารีเฟรชหน้าเว็บ'}}
 window.addEventListener('meta-rate-limit',e=>{until=Date.parse(e.detail.until)||0;draw()});
 refreshRate();setInterval(draw,1000);setInterval(()=>{if(!document.hidden)refreshRate()},60000);

 const nav=document.querySelector('.nav');if(nav){const account=document.createElement('a');account.href='/account.html';account.textContent='บัญชีผู้ดูแล';nav.append(account);const logout=document.createElement('a');logout.href='/login.html';logout.textContent='ออกจากระบบ';logout.addEventListener('click',async e=>{e.preventDefault();try{const r=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw Error();location.replace('/login.html')}catch{alert('ออกจากระบบไม่สำเร็จ กรุณาลองใหม่')}});nav.append(logout);}
 });
})();

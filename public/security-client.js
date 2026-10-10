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
 if(r.status===401){location.replace('/login.html');throw Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่')}return r;
 };
 document.addEventListener('DOMContentLoaded',()=>{
 const nav=document.querySelector('.nav');if(nav){const account=document.createElement('a');account.href='/account.html';account.textContent='บัญชีผู้ดูแล';nav.append(account);const logout=document.createElement('a');logout.href='/login.html';logout.textContent='ออกจากระบบ';logout.addEventListener('click',async e=>{e.preventDefault();try{const r=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw Error();location.replace('/login.html')}catch{alert('ออกจากระบบไม่สำเร็จ กรุณาลองใหม่')}});nav.append(logout);}
 });
})();

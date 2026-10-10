'use strict';
let setup=false;
const $=id=>document.getElementById(id),message=$('message'),button=$('submit');
const fragment=new URLSearchParams(location.hash.slice(1)),setupToken=fragment.get('setup');
if(setupToken){$('setupToken').value=setupToken;history.replaceState(null,'',location.pathname);}
fetch('/api/auth/session',{cache:'no-store'}).then(r=>r.json()).then(j=>{
 if(j.authenticated){location.replace('/');return}
 setup=j.setupRequired;$('setupFields').hidden=!setup;$('confirmFields').hidden=!setup;$('rememberFields').hidden=setup;
 $('password').autocomplete=setup?'new-password':'current-password';$('password').minLength=setup?12:1;
 $('title').textContent=setup?'ตั้งบัญชีผู้ดูแล':'เข้าสู่ระบบ';button.textContent=setup?'ตั้งบัญชีและเข้าใช้งาน':'เข้าสู่ระบบ';button.disabled=false;
 if(setup&&!j.setupAvailable){message.textContent='รหัสตั้งค่าครั้งแรกหมดอายุหรือยังไม่ได้เปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ';button.disabled=true}
}).catch(()=>{message.textContent='เชื่อมต่อระบบไม่ได้ กรุณารีเฟรชหน้าเว็บ'});
$('authForm').addEventListener('submit',async e=>{
 e.preventDefault();message.textContent='';
 if(setup&&$('password').value!==$('confirm').value){message.textContent='รหัสผ่านทั้งสองช่องไม่ตรงกัน';return}
 button.disabled=true;try{
 const r=await fetch(setup?'/api/auth/setup':'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('username').value.trim(),password:$('password').value,setupToken:$('setupToken').value.trim(),remember:$('remember').checked})}),j=await r.json();
 if(!r.ok)throw Error(j.error||'เข้าสู่ระบบไม่สำเร็จ');
 $('password').value='';$('confirm').value='';$('setupToken').value='';location.replace('/');
 }catch(e){message.textContent=e.message}finally{button.disabled=false}
});

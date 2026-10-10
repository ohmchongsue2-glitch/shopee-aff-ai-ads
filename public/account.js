'use strict';
const $=id=>document.getElementById(id);
fetch('/api/auth/session').then(r=>r.json()).then(j=>$('user').textContent='ชื่อผู้ใช้: '+j.username);
$('passwordForm').addEventListener('submit',async e=>{
 e.preventDefault();if($('new').value!==$('confirm').value){$('message').textContent='รหัสผ่านใหม่ไม่ตรงกัน';return}
 $('change').disabled=true;try{const r=await fetch('/api/auth/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:$('current').value,newPassword:$('new').value})}),j=await r.json();if(!r.ok)throw Error(j.error);$('passwordForm').reset();location.replace('/login.html')}catch(e){$('message').textContent=e.message}finally{$('change').disabled=false}
});

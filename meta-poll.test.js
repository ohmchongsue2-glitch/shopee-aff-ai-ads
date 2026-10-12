const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),vm=require('vm'),{createRequire}=require('module');const req=createRequire(path.join(__dirname,'server.js')),security=req('./security');
(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'meta-poll-'));let time=Date.now(),metaCalls=0,tgCalls=0;const key='a'.repeat(64),env={PORT:'0',SETTINGS_DIR:dir,APP_ORIGIN:'https://example.test',SETTINGS_ENCRYPTION_KEY:key};
fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({META_ACCESS_TOKEN:'FAKE_FOR_TEST',META_AD_ACCOUNT_ID:'123',TELEGRAM_BOT_TOKEN:'FAKE_FOR_TEST',TELEGRAM_CHAT_ID:'123'}));
fs.writeFileSync(path.join(dir,'ad-notifications.json'),JSON.stringify({queue:[],ads:{},seededAccount:'123'}));
class Clock extends Date {constructor(...v){super(...(v.length?v:[time]))}static now(){return time}}
const ctx={require:p=>p==='./security'?{...security,installSecurity:(a,o)=>security.installSecurity(a,{...o,env})}:req(p),process:{env},console,__dirname,URL,AbortSignal,Date:Clock,JSON,Math,Object,Number,String,Error,Buffer,setInterval:()=>({unref(){}}),fetch:async u=>{if(String(u).includes('graph.facebook.com'))metaCalls++;else tgCalls++;return {ok:true,headers:new Headers(),json:async()=>String(u).includes('graph.facebook.com')?{id:'123',name:'Test',account_status:1,currency:'THB'}:{ok:true,result:{message_id:1}}}}};
const result=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'server.js'),'utf8')+'\n({server:httpServer,poll:checkNotifications});',ctx);
await new Promise(resolve=>result.server.on('listening',resolve));
try{await result.poll();time+=5*3600000;await result.poll();assert.equal(metaCalls,0);assert(tgCalls>=1);time+=3600000;await result.poll();assert.equal(metaCalls,1);time+=60000;await result.poll();assert.equal(metaCalls,1);
console.log('PASS: no Meta calls before six hours; Telegram queue continues; one connection check at six hours; minute queue pump does not re-poll Meta.');
}finally{await new Promise(resolve=>result.server.close(resolve));fs.rmSync(dir,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});

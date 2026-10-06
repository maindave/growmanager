const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
async function test(native,available=true){
 const listeners={},nodes={},calls=[];
 const ctx={URL,console,Date,document:{readyState:'complete',getElementById(id){return nodes[id]??={hidden:true,addEventListener(e,fn){listeners[id]=fn}}}},navigator:{},addEventListener(){},window:{open(...args){calls.push(['web',...args])}},fetch:async()=>({ok:true,json:async()=>({apkAvailable:true,versionCode:32,versionName:'2.6.12',apkUrl:'https://maindave.github.io/growmanager/downloads/growmanager-latest.apk'})})};
 // Android JSExport provides Plugins methods; registerPlugin is absent.
 ctx.Capacitor={isNativePlatform:()=>native,Plugins:{App:{getInfo:async()=>({version:'2.6.10',build:30})}},nativePromise:async(id,method,options)=>calls.push([id,method,options])};
 if(available)ctx.Capacitor.Plugins.ApkDownload={open:options=>ctx.Capacitor.nativePromise('ApkDownload','open',options)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app-update.js'),'utf8'),ctx);await new Promise(r=>setImmediate(r));await listeners.downloadAppUpdate();
 if(native&&available){assert.equal(calls.length,1);assert.equal(calls[0][0],'ApkDownload');assert.equal(calls[0][1],'open');assert.equal(calls[0][2].url,'https://maindave.github.io/growmanager/downloads/growmanager-latest.apk?v=32')}
 else if(native){assert.equal(calls.length,0);assert.match(nodes.appUpdateMessage.textContent,/Chrome/)}
 else {assert.equal(calls[0][0],'web')}
}
(async()=>{await test(true);await test(true,false);await test(false);console.log('PASS: Android injected bridge without registerPlugin, missing bridge message, web download')})().catch(e=>{console.error(e);process.exit(1)});

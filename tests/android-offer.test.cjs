const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const src=fs.readFileSync(path.join(__dirname,'../app-update.js'),'utf8');const code=src.slice(src.indexOf('function offerAndroidApp'),src.indexOf('async function installPwa'));
function scenario({android=true,native=false,hidden=false,seen=false}={}){
 const nodes={androidAppOfferHide:{checked:false},androidAppOfferDownload:{}},prefs=new Map(hidden?[['growmanager.android.offer.hidden','true']]:[]),session=new Map(seen?[['growmanager.android.offer.seen','true']]:[]);let offered=0,closed=0;
 const closeButtons=[{},{}];const dialog={setAttribute(){},querySelectorAll:()=>closeButtons,addEventListener(){},showModal(){offered++},close(){closed++},remove(){}};
 const ctx={URL,native:()=>native,navigator:{userAgent:android?'Mozilla Android':'Mozilla iPhone'},latest:{apkAvailable:true,apkUrl:'https://maindave.github.io/growmanager/downloads/growmanager-latest.apk',versionCode:33},$:id=>id==='androidAppOffer'?null:nodes[id],localStorage:{getItem:k=>prefs.get(k),setItem:(k,v)=>prefs.set(k,v)},sessionStorage:{getItem:k=>session.get(k),setItem:(k,v)=>session.set(k,v)},document:{querySelector:()=>null,createElement:()=>dialog,body:{append(){}}}};
 vm.runInNewContext(code,ctx);ctx.offerAndroidApp();
 const expected=android&&!native&&!hidden&&!seen;assert.equal(offered,expected?1:0);
 if(expected){assert.equal(nodes.androidAppOfferDownload.href,'https://maindave.github.io/growmanager/downloads/growmanager-latest.apk?v=33');nodes.androidAppOfferHide.checked=true;closeButtons[0].onclick();assert.equal(prefs.get('growmanager.android.offer.hidden'),'true');assert.equal(closed,1)}
}
scenario();scenario({android:false});scenario({native:true});scenario({hidden:true});scenario({seen:true});console.log('PASS: Android web only, APK link, permanent opt-out, session dismissal');

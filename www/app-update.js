(()=>{'use strict';
const PUBLIC_ROOT='https://maindave.github.io/growmanager/';
const $=id=>document.getElementById(id);
let latest=null,deferredInstall=null;
function native(){return Boolean(globalThis.Capacitor?.isNativePlatform?.())}
function message(text,type='info'){const node=$('appUpdateMessage');if(!node)return;node.textContent=text;node.className=`message show ${type}`}
async function version(){const base=native()?PUBLIC_ROOT:'./';const response=await fetch(`${base}app-version.json?t=${Date.now()}`,{cache:'no-store'});if(!response.ok)throw new Error('No se pudo consultar la versión publicada.');return response.json()}
async function installed(){if(!native())return{version:'web',build:0};try{return await globalThis.Capacitor.Plugins.App.getInfo()}catch{return{version:'android',build:0}}}
async function check({manual=false}={}){try{latest=await version();const current=await installed(),newNative=native()&&latest.apkAvailable&&Number(latest.versionCode)>Number(current.build||0),panel=$('appUpdatePanel');if(newNative){panel.hidden=false;$('appUpdateTitle').textContent=`GrowManager ${latest.versionName} disponible`;$('appUpdateText').textContent=latest.releaseNotes||'Hay una nueva versión de la aplicación.';$('downloadAppUpdate').hidden=false}else if(manual)message(native()?`Tu app está actualizada (${current.version}, compilación ${current.build}).`:'La versión web se actualiza automáticamente.','success');return newNative}catch(error){if(manual)message(error.message,'error');return false}}
async function download(){if(!latest)return;const url=new URL(latest.apkUrl);url.searchParams.set('v',latest.versionCode);try{if(native()){const downloader=globalThis.Capacitor.registerPlugin('ApkDownload');await downloader.open({url:url.href});message('La descarga se abrió en tu navegador. Cuando termine, abrí el APK desde Descargas.')}else window.open(url.href,'_blank','noopener')}catch(error){message(error.message||'Abrí el enlace de descarga en Chrome para actualizar.','error')}}
async function installPwa(){if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$('installPwaButton').hidden=true}
function registerPwa(){if(native()||!('serviceWorker'in navigator))return;navigator.serviceWorker.register('./sw.js').then(registration=>{registration.update();navigator.serviceWorker.addEventListener('controllerchange',()=>{if(sessionStorage.getItem('growmanager-sw-reload'))return;sessionStorage.setItem('growmanager-sw-reload','1');location.reload()})}).catch(console.warn)}
function init(){registerPwa();$('downloadAppUpdate')?.addEventListener('click',download);$('checkAppUpdateButton')?.addEventListener('click',()=>check({manual:true}));$('installPwaButton')?.addEventListener('click',installPwa);addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstall=event;$('installPwaButton').hidden=false});check()}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
globalThis.GrowAppUpdate=Object.freeze({check});
})();

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
let user={id:'a',user_metadata:{growmanagerConnect:{enabled:true,address:'192.168.1.25',name:'Salas',channels:{}}}};
function device(){const cache=new Map(),context={localStorage:{getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v)},GrowSupabase:{client:{auth:{getUser:async()=>({data:{user}}),updateUser:async({data})=>{user.user_metadata={...user.user_metadata,...data};return{}}}}}};context.globalThis=context;vm.runInNewContext(fs.readFileSync(new URL('../controller-account.js',import.meta.url),'utf8'),context);return context.ControllerAccount}
const desktop=device();await desktop.nameChannel('192.168.1.25',1,'Luz flora');await desktop.nameChannel('192.168.1.25',2,'Luz vege');await desktop.save({enabled:false});
const mobile=device();let loaded=await mobile.load();assert.equal(loaded.channels['192.168.1.25']['1'],'Luz flora');assert.equal(loaded.channels['192.168.1.25']['2'],'Luz vege');assert.equal(loaded.enabled,false);assert.equal(loaded.name,'Salas');
await mobile.save({enabled:true,address:'192.168.1.30',name:'Nuevo controlador'});loaded=await desktop.load();assert.equal(loaded.address,'192.168.1.30');assert.equal(loaded.channels['192.168.1.25']['1'],'Luz flora');
user={id:'b',user_metadata:{}};loaded=await desktop.load();assert.equal(Object.keys(loaded.channels).length,0);assert.equal(loaded.enabled,false);
console.log('Controller account: cross-device configuration, channel names and account isolation passed');

import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
let metadata={growmanagerConnect:{enabled:true,address:'192.168.1.25',channels:{'192.168.1.25':{1:'Luz existente'}},equipmentRooms:{other:[{id:'old',name:'Anterior',sensors:[1],relays:[]}]}}};
const storage=new Map();
const auth={
 getSession:async()=>({data:{session:{user:{id:'user',user_metadata:metadata}}}}),
 getUser:async()=>({data:{user:{id:'user',user_metadata:metadata}}}),
 updateUser:async({data})=>{metadata={...metadata,...data};return{data:{user:{id:'user',user_metadata:metadata}}};}
};
const context=vm.createContext({console,
 localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
 GrowAuth:{isLocal:()=>false},GrowSupabase:{client:{auth}}
});
vm.runInContext(await readFile(new URL('../controller-account.js',import.meta.url),'utf8'),context);
await Promise.all([context.ControllerAccount.save({equipmentRooms:{a:[{id:'a',name:'Mi sala',sensors:[2],relays:[4]}]}}),context.ControllerAccount.save({equipmentRooms:{b:[]}})]);
assert.equal(metadata.growmanagerConnect.equipmentRooms.other[0].name,'Anterior');
assert.equal(metadata.growmanagerConnect.equipmentRooms.a[0].name,'Mi sala');
assert.ok(Array.isArray(metadata.growmanagerConnect.equipmentRooms.b));
assert.equal(metadata.growmanagerConnect.channels['192.168.1.25'][1],'Luz existente');
const saved=await context.ControllerAccount.load();assert.equal(saved.equipmentRooms.a[0].sensors[0],2);
console.log('Equipment room account persistence: scoped merge, concurrent saves and channel preservation passed');

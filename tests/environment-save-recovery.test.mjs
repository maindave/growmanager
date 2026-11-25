import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../environment.js',import.meta.url),'utf8');
const handler=source.split(" $('environmentForm').onsubmit=async ev=>{")[1].split('\n };\n\n if(!dialog.open)')[0];
assert.ok(handler?.includes('transfer_environment_device'));
function setup({rpcError=null,localFailures=0,pairFailures=0}={}){
 const calls=[],message={textContent:''},button={disabled:false},form={values:{roomId:'flora',vpdMin:'1',vpdMax:'1.5'},elements:{enabled:{checked:true},exchangeOnSensorFailure:{checked:false}}};
 const context={console,Error,Number,String,Object,Boolean,FormData:class{constructor(f){return Object.entries(f.values)}},e:{},local:{environment:{roomId:'vege',enabled:true,cloud:{configured:true}}},pendingTransfer:null,provisioning:false,rooms:[{id:'vege',name:'Vegetativo'},{id:'flora',name:'Flora'}],room:{id:'flora',name:'Flora'},confirmRoomChange:()=>true,$:()=>message,refreshRemote:async()=>{},client:()=>({rpc:async(name,args)=>{calls.push(['rpc',name,args]);return rpcError?{error:new Error(rpcError)}:{data:'test-token'}}}),GrowDevice:{address:()=> '192.168.1.25',post:async(path,values)=>{calls.push(['post',path,{...values}]);if(localFailures-->0)throw new Error('local_unavailable');context.local.environment={...context.local.environment,roomId:values.roomId,enabled:values.enabled==='1'};},postForm:async(path,values)=>{calls.push(['pair',path,{...values}]);if(pairFailures-->0)throw new Error('pair_unavailable');},refresh:async()=>{calls.push(['refresh']);}}};
 const ctx=vm.createContext(context);vm.runInContext('globalThis.submit=async ev=>{'+handler+'\n}',ctx);
 return {calls,context,message,button,save:()=>ctx.submit({preventDefault(){},currentTarget:form,submitter:button})};
}
let f=setup({rpcError:'source_device_mismatch'});await f.save();assert.equal(f.calls.filter(c=>c[0]==='post').length,0);assert.equal(f.context.local.environment.enabled,true);assert.equal(f.button.disabled,false);assert.equal(f.context.provisioning,false);
f=setup();await f.save();assert.equal(f.calls[0][0],'rpc');assert.equal(f.calls[1][0],'post');assert.equal(f.calls[1][2].roomId,'flora');assert.equal(f.calls[1][2].enabled,'1');assert.equal(f.calls.filter(c=>c[0]==='post').length,1);assert.match(f.message.textContent,/Configuración guardada/);
f=setup({localFailures:1});await f.save();assert.ok(f.context.pendingTransfer);await f.save();assert.equal(f.calls.filter(c=>c[0]==='rpc').length,1);assert.equal(f.context.pendingTransfer,null);assert.match(f.message.textContent,/Configuración guardada/);
f=setup({pairFailures:1});await f.save();assert.ok(f.context.pendingTransfer);await f.save();assert.equal(f.calls.filter(c=>c[0]==='rpc').length,1);assert.equal(f.context.pendingTransfer,null);assert.equal(f.context.local.environment.roomId,'flora');assert.match(f.message.textContent,/Configuración guardada/);
console.log('Actual save handler: failed transfer preserves control; local/pairing retries complete without duplicate transfer');

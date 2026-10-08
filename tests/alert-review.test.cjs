const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const nodes={operationFilter:{value:'alerts'},operationRelation:{value:'all'},operationPeriod:{value:'all'},operationSearch:{value:''},operationSummary:{},operationList:{}};
const context={document:{addEventListener(){},getElementById:id=>nodes[id]},globalThis:null,CultivoRepository:{getCurrentWorkspace:()=>({role:'owner'})},console};context.globalThis=context;vm.createContext(context);
vm.runInContext(fs.readFileSync('today-models.js','utf8'),context);
let source=fs.readFileSync('operations.js','utf8').replace('Object.freeze({init,load,','Object.freeze({setRows(v){rows=v;render()},init,load,');vm.runInContext(source,context);
context.Operations.setRows([{id:'1',source:'log',kind:'system',severity:'warning',title:'Pérdida de comunicación',category:'device_offline',description:'Sin respuesta local',occurredAt:'2026-10-08T12:00:00Z'},{id:'2',source:'log',severity:'warning',reviewedAt:'2026-10-08',occurredAt:'2026-10-08T12:00:00Z'},{id:'3',source:'log',severity:'info',occurredAt:'2026-10-08T12:00:00Z'}]);
assert.match(nodes.operationSummary.innerHTML,/Avisos por revisar/);
assert.match(nodes.operationList.innerHTML,/Qué pasó/);assert.match(nodes.operationList.innerHTML,/Qué hacer/);
assert.match(nodes.operationList.innerHTML,/data-review-alert/);assert.doesNotMatch(nodes.operationList.innerHTML,/data-delete-history|data-operation-id="2"|data-operation-id="3"/);
assert.match(nodes.operationList.innerHTML,/no confirma un corte/);
context.Operations.setRows([{id:'env',source:'environment',kind:'environment',severity:'warning',title:'Temperatura crítica',description:'Histórico incompleto',details:[],occurredAt:'2026-10-08T12:00:00Z'}]);assert.match(nodes.operationList.innerHTML,/data-review-alert/);assert.match(nodes.operationList.innerHTML,/Un registro histórico no confirma/);
console.log('PASS exact pending filter, understandable guidance, persistent review action, no deletion in alert view');

context.Operations.setRows([1,2,3].map(id=>({id:String(id),source:'log',kind:'system',severity:'warning',title:'Conexión',category:'device_offline',occurredAt:'2026-10-08T12:00:00Z'})));assert.equal((nodes.operationList.innerHTML.match(/<article/g)||[]).length,1);assert.match(nodes.operationList.innerHTML,/Marcar estos 3 avisos revisados/);

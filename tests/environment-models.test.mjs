import assert from 'node:assert/strict';
import '../environment-models.js';
const M=globalThis.EnvironmentModels;
assert.ok(Math.abs(M.vpd(25,60)-1.267)<.01);
for(const [t,h] of [[null,60],[25,null],[25,0],[NaN,50],[25,101]]) assert.equal(M.vpd(t,h),null);
const at=1700000000000,base={temperature:25,humidity:60,dht:{fresh:true,lastSuccessAgeSeconds:0},environment:{vpdMin:.8,vpdMax:1.2,alarms:18}};
assert.equal(M.interpret(base,at,at).state,'high');
assert.equal(M.interpret({...base,humidity:70},at,at).state,'optimal');
assert.equal(M.interpret({...base,humidity:90},at,at).state,'low');
assert.equal(M.interpret(base,at,at+16000).state,'unknown');
assert.equal(M.interpret({...base,dht:{fresh:false}},at,at).state,'unknown');
assert.equal(M.alarms(18).length,2);
assert.equal(M.stageForCultivation('rooting'),0);assert.equal(M.stageForCultivation('mother'),1);assert.equal(M.stageForCultivation('flowering'),2);
assert.equal(M.interpret(base,at,at+60000,120).state,'high');
console.log('Environmental presentation: passed');

assert.match(M.alarms(16,{environment:{failedOutputs:2},relays:[{id:2,function:'extraction'}]})[0],/Extracción/);
assert.doesNotMatch(M.alarms(16,{environment:{failedOutputs:2},relays:[{id:2,function:'extraction'}]})[0],/Calefacción detenida/);
assert.match(M.alarms(16,{environment:{failedOutputs:4},relays:[{id:3,function:'heater'}]})[0],/Calefacción detenida/);

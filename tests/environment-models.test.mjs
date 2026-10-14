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
assert.doesNotMatch(M.alarms(16,{environment:{failedOutputs:4},relays:[{id:3,function:'heater'}]})[0],/detenida/);

const env={heaterSensorProtectionEnabled:true,heaterSensorTimeoutSeconds:300,safety:[0,0,0,2]};
assert.equal(M.heaterProtection({id:4,function:'heater'},env).blocked,true);
for(const fn of ['light','ventilation','extraction','intake','incubator','pump','none'])assert.equal(M.heaterProtection({id:4,function:fn},env).blocked,false);
assert.equal(M.heaterProtection({id:3,function:'heater'},env).blocked,false);
assert.equal(M.heaterProtection({id:4,function:'heater'},{}).blocked,false);
assert.equal(M.heaterProtection({id:4,function:'heater'},env).minutes,5);

const targets={tempMin:23,tempMax:27,humidityMin:55,humidityMax:70,criticalCold:10,criticalHot:35,criticalHumidity:90,vpdMin:.8,vpdMax:1.2};
const reading=(t=25,h=65,environment=targets)=>({temperature:t,humidity:h,environment});
let states=M.sensorStates(reading(),true);
for(const state of Object.values(states))assert.equal(state.state,'ok');
states=M.sensorStates(reading(27,60),true);assert.equal(states.temperature.state,'ok');assert.equal(states.vpd.state,'warning');assert.equal(states.vpd.label,'Alto');assert.equal(states.vpd.icon,'wind');
states=M.sensorStates(reading(25,85),true);assert.equal(states.humidity.label,'Alta');assert.equal(states.vpd.label,'Bajo');assert.equal(states.vpd.icon,'cloud-rain');
assert.equal(M.sensorStates(reading(25,40),true).humidity.label,'Baja');
assert.equal(M.sensorStates(reading(19,65),true).temperature.icon,'thermometer-cold');
assert.equal(M.sensorStates(reading(35,65),true).temperature.state,'critical');
assert.equal(M.sensorStates(reading(10,65),true).temperature.label,'Frío crítico');
assert.equal(M.sensorStates(reading(25,90),true).humidity.state,'critical');
for(const state of Object.values(M.sensorStates(reading(40,99),false))){assert.equal(state.state,'unknown');assert.equal(state.value,null);}
assert.equal(M.sensorStates(reading(25,65,{}),true).temperature.state,'unconfigured');
assert.equal(M.sensorStates(reading(25,65,{...targets,humidityMin:70,humidityMax:55}),true).humidity.state,'unconfigured');
assert.equal(M.sensorStates(reading(25,65,{...targets,humidityMin:60,humidityMax:64}),true).humidity.state,'warning');
console.log('Sensor colors: configured targets, critical thresholds, missing data and invalid ranges passed');

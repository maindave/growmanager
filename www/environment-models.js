(()=>{'use strict';
const stages=Object.freeze([{id:0,label:'Propagación',min:0.4,max:0.8},{id:1,label:'Vegetativo',min:0.8,max:1.2},{id:2,label:'Floración',min:1,max:1.5},{id:3,label:'Personalizado',min:0.8,max:1.2}]);
const finite=v=>typeof v==='number'&&Number.isFinite(v);
function valid(t,h){return finite(t)&&finite(h)&&t>=-20&&t<=80&&h>0&&h<=100}
function vpd(t,h){return valid(t,h)?0.6108*Math.exp(17.27*t/(t+237.3))*(1-h/100):null}
function interpret(status,at=Date.now(),now=Date.now(),maximumAge=15){
 const env=status?.environment||{},age=Math.max(0,(now-at)/1000)+Number(status?.dht?.lastSuccessAgeSeconds||0),fresh=valid(status?.temperature,status?.humidity)&&status?.dht?.fresh!==false&&age<=maximumAge;
 const value=fresh?vpd(status.temperature,status.humidity):null,min=env.vpdMin,max=env.vpdMax,target=finite(min)&&finite(max)&&max>min;
 return{value,age,fresh,state:value===null?'unknown':!target?'unconfigured':value<min?'low':value>max?'high':'optimal',alarms:Number(env.alarms)||0};
}
const alarmLabels=Object.freeze({1:'Sensor sin lectura válida: calefacción protegida.',2:'Temperatura crítica alta.',4:'Temperatura crítica baja.',8:'Humedad crítica alta.',16:'El ambiente no respondió como se esperaba. Revisá los equipos; la calefacción sin respuesta queda detenida.'});
function stageForCultivation(stage){return ['germination','clone','rooting'].includes(stage)?0:['vegetative','mother'].includes(stage)?1:stage==='flowering'?2:3}
function alarms(mask){return Object.entries(alarmLabels).filter(([bit])=>mask&Number(bit)).map(([,text])=>text)}
globalThis.EnvironmentModels=Object.freeze({stages,valid,vpd,interpret,alarms,stageForCultivation});
})();

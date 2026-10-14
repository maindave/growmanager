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
const alarmLabels=Object.freeze({1:'Sensor sin lectura válida.',2:'Temperatura crítica alta.',4:'Temperatura crítica baja.',8:'Humedad crítica alta.',32:'Protección local activada: salida detenida hasta revisar y rearmar.',16:'No se detectó la respuesta ambiental esperada. Revisá los equipos; esto no confirma una falla eléctrica.'});
function stageForCultivation(stage){return ['germination','clone','rooting'].includes(stage)?0:['vegetative','mother'].includes(stage)?1:stage==='flowering'?2:3}
function alarms(mask,status){return Object.entries(alarmLabels).filter(([bit])=>mask&Number(bit)).map(([bit,text])=>{if(Number(bit)===32&&status?.environment?.safety){const reasons={2:'lectura de sensor inválida',3:'temperatura crítica',4:'límite de encendido continuo'};return 'Protección local: '+status.environment.safety.map((reason,i)=>reason?'Relé '+(i+1)+' detenido por '+(reasons[reason]||'seguridad'):null).filter(Boolean).join('; ')+'. Revisá y rearmá desde Ambiente y protección.';}if(Number(bit)!==16||!status?.environment?.failedOutputs)return text;const failed=(status.relays||[]).filter(r=>status.environment.failedOutputs&(1<<(Number(r.id)-1)));const names={heater:'Calefacción',extraction:'Extracción',intake:'Intracción',ventilation:'Ventilación'};return 'Respuesta ambiental insuficiente: '+failed.map(r=>names[r.function]||'Relé '+r.id).join(', ')+'. Revisá los equipos.'})}
function heaterProtection(relay,env={}) {
 const supported=typeof env.heaterSensorProtectionEnabled==='boolean';
 const blocked=relay?.function==='heater'&&Number(env.safety?.[Number(relay.id)-1])!==0&&Number.isFinite(Number(env.safety?.[Number(relay.id)-1]));
 const minutes=Number(env.heaterSensorTimeoutSeconds??300)/60;
 return {supported,blocked,minutes,enabled:env.heaterSensorProtectionEnabled!==false,
  text:blocked?'Calefacción bloqueada por pérdida del sensor. Recuperá la lectura y rearmá desde Ambiente y protección.':''};
}
// Presentation only: these states never issue actuator commands.
function sensorStates(status,fresh){
 const e=status?.environment||{},t=status?.temperature,h=status?.humidity;
 const definitions={
  temperature:{name:'Temperatura',value:t,unit:'°C',digits:1,min:e.tempMin,max:e.tempMax,criticalLow:e.criticalCold,criticalHigh:e.criticalHot,low:'Baja',high:'Alta',normal:'thermometer',lowIcon:'thermometer-cold',highIcon:'thermometer-hot'},
  humidity:{name:'Humedad',value:h,unit:'%',digits:0,min:e.humidityMin,max:e.humidityMax,criticalHigh:e.criticalHumidity,low:'Baja',high:'Alta',normal:'drop',lowIcon:'droplet-low',highIcon:'droplets'},
  vpd:{name:'VPD',value:vpd(t,h),unit:'kPa',digits:2,min:e.vpdMin,max:e.vpdMax,low:'Bajo',high:'Alto',normal:'gauge',lowIcon:'cloud-rain',highIcon:'wind'}
 };
 return Object.fromEntries(Object.entries(definitions).map(([key,d])=>{
  const known=finite(d.min)&&finite(d.max)&&d.max>d.min;
  const current=fresh&&finite(d.value),below=known&&d.value<d.min,above=known&&d.value>d.max;
  const cold=current&&finite(d.criticalLow)&&d.value<=d.criticalLow,hot=current&&finite(d.criticalHigh)&&d.value>=d.criticalHigh;
  const critical=cold||hot,state=!current?'unknown':critical?'critical':!known?'unconfigured':below||above?'warning':'ok';
  const label=!current?'Sin datos':critical?(key==='temperature'&&cold?'Frío crítico':key==='temperature'?'Calor crítico':'Crítica'):!known?'Sin objetivo':below?d.low:above?d.high:'En rango';
  const icon=!current?'sensor-unknown':below||cold?d.lowIcon:above||hot?d.highIcon:d.normal;
  const marker=!current||!known&&!critical?'sensor-unknown':critical?'alert':below?'arrow-down':above?'arrow-up':'check';
  const format=n=>n.toLocaleString('es-AR',{maximumFractionDigits:2});
  return [key,{...d,value:current?d.value:null,state,label,icon,marker,target:known?format(d.min)+'–'+format(d.max)+(key==='vpd'?'':' '+d.unit):'Sin objetivo configurado'}];
 }));
}
globalThis.EnvironmentModels=Object.freeze({stages,valid,vpd,interpret,alarms,stageForCultivation,heaterProtection,sensorStates});
})();

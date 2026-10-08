(()=>{'use strict';
const label={none:'Canal',light:'Luz',ventilation:'Ventilación',extraction:'Extracción',intake:'Intracción',heater:'Calefacción',incubator:'Incubadora'};
function eventDetails(event,previous=null){const e=event.snapshot?.event||{},relays=event.snapshot?.relays||[],before=previous?.bootId===event.bootId?previous.outputs:null,changed=before===null?0:(before^event.outputs),actions=[];
 for(let i=0;i<4;i++)if(changed&(1<<i)){const relay=relays.find(r=>Number(r.id)===i+1),role=Number(e.roles)>>i*3&7,fn=({1:'ventilation',2:'extraction',3:'intake',4:'heater'})[role]||relay?.function||'none';actions.push({id:i+1,label:`${label[fn]||'Canal'} ${i+1}`,on:Boolean(event.outputs&(1<<i)),mode:e.testing&(1<<i)?'Prueba temporal':e.automatic&(1<<i)?'Automático':'Manual'});}
 const value=EnvironmentModels.vpd(e.temperature,e.humidity),state=e.state==null?'Sin clasificación histórica':({0:'VPD bajo',1:'VPD óptimo',2:'VPD alto',3:'Sin lectura'})[e.state];
 return{actions,value,state,min:e.vpdMin,max:e.vpdMax,alarms:EnvironmentModels.alarms(event.alarms),baseline:before===null,gap:previous?.bootId===event.bootId&&event.sequence>previous.sequence+1,enabled:e.enabled};
}
function summarize(events,now=Date.now()){
 const groups=new Map(),previous=new Map(),starts=new Map(),active=new Map(),incidents=[];
 function group(e,at){const hour=new Date(at);hour.setMinutes(0,0,0);const start=hour.getTime(),id=`${e.roomId}:${start}`;if(!groups.has(id))groups.set(id,{id,roomId:e.roomId,start,end:Math.min(start+3600000,now),details:[],values:[],devices:new Map(),incomplete:false,outside:false});return groups.get(id)}
 for(const e of [...events].sort((a,b)=>Date.parse(a.occurredAt)-Date.parse(b.occurredAt))){const at=Date.parse(e.occurredAt);if(!Number.isFinite(at)||at>now)continue;const prev=previous.get(e.roomId),d=eventDetails(e,prev),g=group(e,at);g.details.push({...e,detail:d});if(d.value!=null)g.values.push(d.value);g.outside ||= e.snapshot?.event?.state===0||e.snapshot?.event?.state===2;g.incomplete ||= d.gap;
  if(d.baseline||d.gap){for(const key of starts.keys())if(key.startsWith(e.roomId+':'))starts.delete(key);}
  for(const a of d.actions){let device=g.devices.get(a.id);if(!device){device={label:a.label,cycles:0,minutes:0,paired:0,manual:0};g.devices.set(a.id,device)}if(a.mode!=='Automático')device.manual++;const key=`${e.roomId}:${a.id}`;if(a.on){device.cycles++;starts.set(key,{at,label:a.label})}else{const begin=starts.get(key);if(begin){for(let t=begin.at;t<at;){const bucket=group(e,t),end=Math.min(bucket.start+3600000,at);let dev=bucket.devices.get(a.id);if(!dev){dev={label:begin.label,cycles:0,minutes:0,paired:0,manual:0};bucket.devices.set(a.id,dev)}dev.minutes+=(end-t)/60000;dev.paired++;t=end;}starts.delete(key)}}}
  for(const bit of [1,2,4,8,16,32]){const key=`${e.roomId}:${bit}`,exists=active.get(key);if(e.alarms&bit){if(exists&&exists.bootId===e.bootId){exists.details.push({...e,detail:d});exists.incomplete ||= d.gap;}else{const incident={id:`alarm:${e.roomId}:${e.bootId}:${e.sequence}:${bit}`,roomId:e.roomId,occurredAt:e.occurredAt,bootId:e.bootId,title:EnvironmentModels.alarms(bit)[0],details:[{...e,detail:d}],resolvedAt:null,incomplete:d.baseline||d.gap};if(exists)exists.incomplete=true;incidents.push(incident);active.set(key,incident)}}else if(exists){if(exists.bootId===e.bootId&&!d.gap){exists.resolvedAt=e.occurredAt;exists.details.push({...e,detail:d})}else exists.incomplete=true;active.delete(key)}}previous.set(e.roomId,e);
 }
 return{hours:[...groups.values()],incidents};
}
globalThis.EnvironmentTimelineModels=Object.freeze({eventDetails,summarize});
})();

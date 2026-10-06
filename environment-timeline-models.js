(()=>{'use strict';
const label={none:'Canal',light:'Luz',ventilation:'Ventilación',extraction:'Extracción',intake:'Intracción',heater:'Calefacción'};
function eventDetails(event,previous=null){const e=event.snapshot?.event||{},relays=event.snapshot?.relays||[],before=previous?.bootId===event.bootId?previous.outputs:null,changed=before===null?0:(before^event.outputs),actions=[];
 for(let i=0;i<4;i++)if(changed&(1<<i)){const relay=relays.find(r=>Number(r.id)===i+1),role=Number(e.roles)>>i*3&7,fn=({1:'ventilation',2:'extraction',3:'intake',4:'heater'})[role]||relay?.function||'none';actions.push({id:i+1,label:`${label[fn]||'Canal'} ${i+1}`,on:Boolean(event.outputs&(1<<i)),mode:e.testing&(1<<i)?'Prueba temporal':e.automatic&(1<<i)?'Automático':'Manual'});}
 const value=EnvironmentModels.vpd(e.temperature,e.humidity),state=e.state==null?'Sin clasificación histórica':({0:'VPD bajo',1:'VPD óptimo',2:'VPD alto',3:'Sin lectura'})[e.state];
 return{actions,value,state,min:e.vpdMin,max:e.vpdMax,alarms:EnvironmentModels.alarms(event.alarms),baseline:before===null,gap:previous?.bootId===event.bootId&&event.sequence>previous.sequence+1,enabled:e.enabled};
}
globalThis.EnvironmentTimelineModels=Object.freeze({eventDetails});
})();

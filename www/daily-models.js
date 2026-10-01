(() => {
  'use strict';
  const TYPES=Object.freeze({irrigation:'Riego',pruning:'Poda',transplant:'Trasplante',measurement:'Medición',application:'Aplicación',observation:'Observación',incident:'Incidente',stage_change:'Cambio de etapa'});
  function range(mode,anchor=new Date()) {
    const start=new Date(anchor);start.setHours(0,0,0,0);
    if(mode==='week')start.setDate(start.getDate()-((start.getDay()+6)%7));
    const end=new Date(start);end.setDate(end.getDate()+(mode==='week'?7:1));return {start,end};
  }
  function build(input,lot) {
    if(!TYPES[input.type])throw new Error('Elegí una actividad válida.');
    if(!lot)throw new Error('Elegí el cultivo donde realizaste la tarea.');
    const at=new Date(input.at);if(!Number.isFinite(at.getTime()))throw new Error('Revisá la fecha.');
    if(at.getTime()>Date.now()+60000)throw new Error('Para una tarea futura, usá Planificar en Agenda.');
    const shared={cultivationId:lot.cultivationId,lotId:lot.id};
    const number=(key,min,max)=>{if(input[key]===''||input[key]==null)return null;const n=Number(input[key]);if(!Number.isFinite(n)||n<min||n>max)throw new Error(`Revisá ${key}.`);return n;};
    if(input.type==='irrigation')return {store:'irrigations',value:{...shared,status:'completed',scheduledAt:at.toISOString(),completedAt:at.toISOString(),waterLiters:number('waterLiters',0.001,9999999),ph:number('ph',0,14),ec:number('ec',0,99999),notes:input.notes||'',supplies:[]}};
    if(input.type==='incident')return {store:'logs',value:{kind:'incident',category:'general',title:'Incidente',description:input.notes||'',severity:'warning',occurredAt:at.toISOString(),metadata:{...shared,lotName:lot.name,source:'daily-register'}}};
    return {store:'activities',value:{...shared,spaceId:lot.spaceId||null,type:input.type,occurredAt:at.toISOString(),observations:input.notes||'',details:{source:'daily-register'}}};
  }
  function completedAt(event,history) {if(event.metadata?.execution?.completedAt)return event.metadata.execution.completedAt;return history.find(row=>row.eventId===event.id&&row.action==='status_changed'&&row.details?.status==='completed')?.createdAt||null;}
  function executionText(value){return [value.waterLiters!=null?`${value.waterLiters} L totales`:'',value.ph!=null?`pH ${value.ph}`:'',value.ec!=null?`EC ${value.ec}`:'',value.recipe?`${value.recipe.name} · v${value.recipe.version}`:'',value.notes||''].filter(Boolean).join(' · ')}
  globalThis.DailyModels=Object.freeze({TYPES,range,build,completedAt,executionText});
})();

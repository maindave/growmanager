(()=>{'use strict';
const KEY='growmanager.environment.v1',WINDOW=48*3600000,SAMPLE=300000,MAX=1200,$=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const cloudSyncAt=new Map();let request=0,historyRows=[],historyEvents=[],historyMetric="vpd",historySource="cloud",historyContext={};
const valid=(t,h)=>EnvironmentModels.valid(t,h),deviceKey=a=>String(a||'primary-wemos').trim().toLowerCase().replace(/[^a-z0-9.:-]/g,'-').slice(0,80);
function load(){try{const r=JSON.parse(localStorage.getItem(KEY));return Array.isArray(r)?r:[]}catch{return[]}}
function localRows(device,context={}){
 const workspaceId=globalThis.CultivoRepository?.getCurrentWorkspace?.()?.id||'local';
 const legacyDevice=context.sensorId===1?device.replace(/:sensor-1$/,''):null;
 return load().filter(r=>{
  const legacy=r.device===legacyDevice&&context.roomId&&r.payload?.environment?.roomId===context.roomId;
  const sameWorkspace=r.workspaceId===workspaceId||(!r.workspaceId&&legacy);
  return (r.device===device||legacy)&&Date.now()-r.at<=WINDOW&&valid(r.temperature,r.humidity)&&(!context.sensorId||sameWorkspace);
 }).sort((a,b)=>a.at-b.at);
}
function track(s,address){
 const now=Date.now(),base=deviceKey(address),workspaceId=globalThis.CultivoRepository?.getCurrentWorkspace?.()?.id||'local';
 const rows=load().filter(r=>now-r.at<=WINDOW);let changed=false;
 const sensors=Array.isArray(s?.sensors)&&s.sensors.length?s.sensors:[null];
 for(const sensor of sensors){
  const temperature=sensor?sensor.temperature:s?.temperature,humidity=sensor?sensor.humidity:s?.humidity,fresh=sensor?sensor.fresh:s?.dht?.fresh;
  if(fresh===false||!valid(temperature,humidity))continue;
  const device=sensor?EnvironmentHistoryModels.sensorKey(base,sensor.room):base;
  const last=rows.filter(r=>r.device===device&&r.workspaceId===workspaceId).at(-1);
  if(last&&now-last.at<SAMPLE)continue;
  rows.push({at:now,temperature,humidity,device,workspaceId,payload:{environment:s.environment,relays:s.relays,dht:{fresh:true}}});changed=true;
  if(workspaceId!=='local'&&now-(cloudSyncAt.get(device)||0)>=SAMPLE){
   cloudSyncAt.set(device,now);CultivoRepository.saveEnvironmentReading({deviceKey:device,sampledAt:now,temperature,humidity}).catch(()=>cloudSyncAt.delete(device));
  }
 }
 if(changed)localStorage.setItem(KEY,JSON.stringify(rows.slice(-MAX)));return changed;
}
function actionItems(events){const ascending=[...events].sort((a,b)=>Date.parse(a.occurredAt)-Date.parse(b.occurredAt));return ascending.flatMap((e,i)=>EnvironmentTimelineModels.eventDetails(e,ascending[i-1]).actions.map(action=>({...action,at:Date.parse(e.occurredAt)})))}
function render(rows,metric,source){
 const now=Date.now(),period=$('environmentHistoryPeriod').value,validRows=rows.filter(r=>valid(r.temperature,r.humidity)&&r.payload?.dht?.fresh!==false&&r.at>=now-WINDOW).map(r=>({...r,vpd:EnvironmentModels.vpd(r.temperature,r.humidity)}));
 const start=period==='available'?Math.max(now-WINDOW,Math.min(...validRows.map(r=>r.at),now-3600000)):now-Number(period)*3600000,duration=now-start,key=metric,unit=key==='temperature'?'°C':key==='humidity'?'%':'kPa';rows=validRows.filter(r=>r.at>=start);
 const values=rows.map(r=>r[key]),targets=key==='vpd'?rows.flatMap(r=>{const e=r.payload?.environment;return e?[e.vpdMin,e.vpdMax].filter(Number.isFinite):[]}):[],all=[...values,...targets],padding=key==='vpd'?.08:key==='humidity'?1:.3,lo=all.length?Math.max(key==='vpd'?0:-40,Math.min(...all)-padding):0,hi=all.length?Math.max(...all)+padding:key==='vpd'?2:100;
 $('environmentHistoryStats').innerHTML=values.length?['Mínimo','Promedio','Máximo'].map((name,i)=>`<div><span>${name}</span><strong>${[Math.min(...values),values.reduce((a,b)=>a+b,0)/values.length,Math.max(...values)][i].toFixed(key==='vpd'?2:1)} ${unit}</strong></div>`).join(''):'<p>Sin muestras válidas en este período.</p>';
 const width=Math.max(280,$('environmentHistoryChart').clientWidth-16),height=width<500?250:300,left=48,right=width-12,top=18,bottom=height-36,x=t=>left+(t-start)/duration*(right-left),y=v=>bottom-(v-lo)/(hi-lo)*(bottom-top),ticks=width<500?3:5;
 const grid=Array.from({length:5},(_,i)=>{const yy=top+(bottom-top)*i/4;return `<line class="environment-grid" x1="${left}" y1="${yy}" x2="${right}" y2="${yy}"/><text class="environment-axis" x="${left-8}" y="${yy+4}" text-anchor="end">${(hi-(hi-lo)*i/4).toFixed(key==='vpd'?2:1)}</text>`}).join('');
 const labels=Array.from({length:ticks},(_,i)=>{const t=start+duration*i/(ticks-1),label=new Date(t).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});return `<text class="environment-axis" x="${x(t)}" y="${height-10}" text-anchor="${i===0?'start':i===ticks-1?'end':'middle'}">${label}</text>`}).join('');
 const bands=key==='vpd'?rows.map(r=>{const e=r.payload?.environment;if(!Number.isFinite(e?.vpdMin)||!Number.isFinite(e?.vpdMax))return'';return`<rect class="environment-target-band" x="${x(r.at)}" y="${y(e.vpdMax)}" width="${Math.max(0,Math.min(x(r.at+SAMPLE),right)-x(r.at))}" height="${y(e.vpdMin)-y(e.vpdMax)}"><title>Objetivo ${e.vpdMin}–${e.vpdMax} kPa</title></rect>`}).join(''):'';
 let segments=[],segment=[];for(const row of rows){if(segment.length&&row.at-segment.at(-1).at>2*SAMPLE){segments.push(segment);segment=[]}segment.push(row)}if(segment.length)segments.push(segment);
 const actions=key==='vpd'?actionItems(historyEvents).filter(a=>a.at>=start&&a.at<=now&&(!Array.isArray(historyContext.relayIds)||historyContext.relayIds.includes(a.id))):[],markers=actions.map(a=>{const nearest=rows.reduce((best,r)=>!best||Math.abs(r.at-a.at)<Math.abs(best.at-a.at)?r:best,null);if(!nearest||Math.abs(nearest.at-a.at)>2*SAMPLE)return'';return `<circle class="environment-actuation ${a.on?'is-on':'is-off'}" cx="${x(a.at)}" cy="${y(nearest.vpd)}" r="4"><title>${esc(new Date(a.at).toLocaleString('es-AR'))} · ${esc(a.label)} ${a.on?'ON':'OFF'} · ${esc(a.mode)}</title></circle>`}).join('');
 $('environmentHistoryChart').innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(metric)}: evolución y marcas de actuaciones"><title>${esc(metric)} · ${unit}</title>${bands}${grid}${labels}${segments.map(a=>a.length>1?`<polyline class="environment-${key==='humidity'?'humidity':'temp'}-path" points="${a.map(r=>`${x(r.at)},${y(r[key])}`).join(' ')}"/>`:`<circle cx="${x(a[0].at)}" cy="${y(a[0][key])}" r="3" fill="currentColor"/>`).join('')}${markers}${rows.map(r=>`<circle class="environment-sample-hit" cx="${x(r.at)}" cy="${y(r[key])}" r="5"><title>${esc(new Date(r.at).toLocaleString("es-AR"))} · ${r[key].toFixed(key==='vpd'?2:1)} ${unit}</title></circle>`).join('')}</svg>`;
 $('environmentHistoryLegend').textContent=`${key==='vpd'?'VPD · Banda verde: objetivo · ● ON / ○ OFF':key==='humidity'?'Humedad':'Temperatura'} · ${unit}`;
 $('environmentHistoryNote').textContent=`${rows.length} muestras ${source==='cloud'?'del proyecto':source==='combined'?'del proyecto y respaldo local':'locales'} · Intervalo aproximado: 5 min. Los huecos indican falta de datos.${key==='vpd'?' Marcas: órdenes al relé; no confirman respuesta física.':''}`;
 $('environmentHistoryActions').hidden=key!=='vpd';$('environmentHistoryActions').innerHTML=key==='vpd'?`<span>${actions.length} ${actions.length===1?'cambio':'cambios'} de salida en este período</span><button type="button" class="text-button" id="historyOpenJournal">Ver en Bitácora →</button>`:'';
 const journal=$('historyOpenJournal');if(journal)journal.onclick=async()=>{$('environmentHistoryDialog').close();$('operationFilter').value='environment';$('operationPeriod').value='2';await GrowNavigation.showView('operations');const relation=$('operationRelation');if(historyContext.roomId&&[...relation.options].some(o=>o.value===historyContext.roomId)){relation.value=historyContext.roomId;relation.dispatchEvent(new Event('change'));}};
}
function updateChart(){render(historyRows,historyMetric,historySource)}
async function open(metric,address,context={}){
 historyMetric=metric;historyContext=context;historyRows=[];historyEvents=[];
 $('environmentHistoryPeriod').value='available';$('environmentHistoryPeriod').onchange=updateChart;
 const token=++request,base=deviceKey(address),device=context.sensorId?EnvironmentHistoryModels.sensorKey(base,context.sensorId):base,w=globalThis.CultivoRepository?.getCurrentWorkspace?.()?.id;
 const names={humidity:'Humedad',temperature:'Temperatura',vpd:'VPD y actuaciones'};
 $('environmentHistoryTitle').textContent=`${names[metric]} · ${context.roomName||'Sala'}`;
 $('environmentHistoryStats').innerHTML='<p>Cargando…</p>';$('environmentHistoryChart').innerHTML='';$('environmentHistoryActions').innerHTML='';$('environmentHistoryNote').textContent='';
 const dialog=$('environmentHistoryDialog');if(!dialog.open)dialog.showModal();
 const local=localRows(device,context);
 try{
  if(!w)throw new Error('Sin proyecto');
  const jobs=[CultivoRepository.getEnvironmentReadings(device,48),context.roomId?CultivoRepository.getEnvironmentSamples(context.roomId,48):[],metric==='vpd'&&context.roomId?CultivoRepository.getEnvironmentEvents(context.roomId,48):[],context.sensorId===1?CultivoRepository.getEnvironmentReadings(base,48):[]];
  const [readings,samples,events,legacy]=await Promise.all(jobs);
  if(token!==request||w!==CultivoRepository.getCurrentWorkspace()?.id)return;
  const snapshots=context.sensorId?samples.map(row=>EnvironmentHistoryModels.sensorRow(row,context.sensorId)).filter(Boolean):samples;
  historyRows=EnvironmentHistoryModels.merge(legacy,readings,snapshots,local);historyEvents=events;historySource=local.length?'combined':'cloud';updateChart();
 }catch(error){
  if(token!==request)return;historyRows=local;historySource='local';updateChart();
  $('environmentHistoryNote').textContent+=' No se pudo consultar el histórico remoto: '+error.message;
 }
}
if(globalThis.ResizeObserver)new ResizeObserver(()=>{if($('environmentHistoryDialog').open&&historyRows.length)updateChart()}).observe($('environmentHistoryChart'));
globalThis.EnvironmentHistory=Object.freeze({track,open,valid});
})();

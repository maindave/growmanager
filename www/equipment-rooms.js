(()=>{'use strict';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let groups=[],draft=[],context={},scope='',loaded=false,revision=0;
const workspace=()=>globalThis.CultivoRepository?.getCurrentWorkspace?.();
const address=()=>globalThis.GrowDevice?.address?.()||'192.168.1.25';
const localMode=()=>globalThis.GrowAuth?.isLocal?.()||document.documentElement.dataset.localMode==='true';
const scopeKey=()=>`${localMode()?'local':globalThis.GrowAuth?.getUser?.()?.id||'signed-out'}:${workspace()?.id||'local'}:${address()}`;
const cacheKey=()=>`growmanager.equipment-rooms.${localMode()?'local':globalThis.GrowAuth?.getUser?.()?.id||'account'}.${scopeKey()}`;
const clone=v=>JSON.parse(JSON.stringify(v));
function validate(rows){
 const usedSensors=new Set(),usedRelays=new Set(),ids=new Set();
 if(!Array.isArray(rows))throw Error('Configuración de salas inválida.');
 return rows.map(row=>{
  const name=String(row.name||'').trim(),id=String(row.id||'');
  if(!name||name.length>60)throw Error('Cada sala necesita un nombre de hasta 60 caracteres.');
  if(!id||ids.has(id))throw Error('Identificador de sala inválido.');ids.add(id);
  const sensors=row.sensors||[],relays=row.relays||[];
  for(const [values,allowed,used,label] of [[sensors,[1,2],usedSensors,'sensor'],[relays,[1,2,3,4],usedRelays,'relé']]){
   if(!Array.isArray(values))throw Error('Asignación inválida.');
   for(const value of values){if(!allowed.includes(value)||used.has(value))throw Error(`Cada ${label} puede pertenecer a una sola sala.`);used.add(value);}
  }
  return{id,name,sensors:[...sensors],relays:[...relays]};
 });
}
async function load(){
 const current=scopeKey(),request=++revision;scope=current;loaded=false;groups=[];draft=[];editor();render();
 // Never borrow assignments from another project, controller or account.
 try{if(localMode()){const value=JSON.parse(localStorage.getItem(cacheKey())||'[]');groups=validate(value)}else{
  const saved=await ControllerAccount.load();if(request!==revision||current!==scopeKey())return;
  groups=validate(saved.equipmentRooms?.[current]||[]);
 }}catch(error){if(request!==revision)return;$('equipmentRoomsMessage').textContent='No se pudieron cargar las salas: '+error.message;}
 if(request!==revision)return;loaded=true;draft=clone(groups);editor();render();
}
function editor(){
 $('equipmentRoomEditor').innerHTML=draft.map((g,index)=>`<fieldset class="equipment-room-fields" data-group-index="${index}"><div class="section-heading"><label>Nombre de la sala<input data-group-name value="${esc(g.name)}" maxlength="60" required placeholder="Nombre que quieras"></label><button type="button" data-remove-group="${index}" class="text-button">Quitar sala</button></div><div class="form-grid two"><div><strong>Sensores</strong>${[1,2].map(id=>`<label class="check-field"><input type="checkbox" data-group-sensor="${id}" ${g.sensors.includes(id)?'checked':''}> Sensor ${id} · ${id===1?'D5':'D3'}</label>`).join('')}</div><div><strong>Relés</strong>${[1,2,3,4].map(id=>`<label class="check-field"><input type="checkbox" data-group-relay="${id}" ${g.relays.includes(id)?'checked':''}> Relé ${id}</label>`).join('')}</div></div></fieldset>`).join('')||'<p class="field-help">Todavía no creaste salas para agrupar tus equipos.</p>';
}
function readDraft(){return [...$('equipmentRoomEditor').querySelectorAll('[data-group-index]')].map(node=>({id:draft[Number(node.dataset.groupIndex)].id,name:node.querySelector('[data-group-name]').value,sensors:[...node.querySelectorAll('[data-group-sensor]:checked')].map(n=>Number(n.dataset.groupSensor)),relays:[...node.querySelectorAll('[data-group-relay]:checked')].map(n=>Number(n.dataset.groupRelay))}));}
function source(){
 if(context.local&&Date.now()-context.localAt<15000)return{status:context.local,fresh:true,label:'Local'};
 const rows=(context.remote||[]).filter(row=>row.device_key===address()).sort((a,b)=>Date.parse(b.sampled_at)-Date.parse(a.sampled_at));
 const row=rows[0];return{status:row?.payload,fresh:!!row&&Date.now()-Date.parse(row.sampled_at)<120000,label:'Remoto'};
}
function reading(sensor,fresh){
 const valid=fresh&&sensor?.fresh===true&&EnvironmentModels.valid(sensor.temperature,sensor.humidity);
 return{valid,temperature:valid?sensor.temperature:null,humidity:valid?sensor.humidity:null,vpd:valid?EnvironmentModels.vpd(sensor.temperature,sensor.humidity):null};
}
const format=(value,digits=1)=>value===null?'—':Number(value).toLocaleString('es-AR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
function render(){
 const host=$('equipmentRoomDashboard');if(!host)return;
 const {status,fresh,label}=source(),dual=Array.isArray(status?.sensors),active=groups.length>0||dual;
 $('legacyEnvironmentReadings').hidden=active;
 const picker=$('dashboardEnvironmentRoom');if(active)picker.hidden=true;
 if(!active){host.innerHTML='';return;}
 if(!groups.length){host.innerHTML='<p class="field-help">Asigná los sensores y relés a tus salas desde Configuración.</p><button class="secondary-button" data-view="integrations">Configurar salas</button>';return;}
 host.innerHTML=groups.map(group=>`<section class="equipment-room" data-equipment-room="${esc(group.id)}"><div class="section-heading"><h4>${esc(group.name)}</h4><span class="field-help">${fresh?esc(label):'Sin conexión actual'}</span></div>${group.sensors.map(id=>{
  const sensor=status?.sensors?.find(s=>Number(s.room)===id),r=reading(sensor,fresh);
  return `<div class="equipment-room-sensor" data-room-sensor="${id}"><p class="field-help">Sensor ${id} · ${id===1?'D5':'D3'} · ${r.valid?'Lectura actual':'Sin lectura actual'}</p><div class="equipment-room-metrics">${[['Temperatura',r.temperature,'°C',1],['Humedad',r.humidity,'%',1],['VPD',r.vpd,'kPa',2]].map(([name,value,unit,digits])=>`<div><span>${name}</span><strong>${format(value,digits)} <small>${unit}</small></strong></div>`).join('')}</div></div>`;
 }).join('')||'<p class="field-help">Sin sensor asignado.</p>'}<div class="equipment-room-relays">${group.relays.map(id=>{const relay=status?.relays?.find(r=>r.id===id);return `<span class="equipment-relay ${fresh&&relay?.state?'is-on':''}">Relé ${id} · ${!fresh||!relay?'Sin datos':relay.state?'Encendido':'Apagado'}</span>`}).join('')||'<span class="field-help">Sin relés asignados.</span>'}</div></section>`).join('');

}
function init(){
 $('addEquipmentRoom').onclick=()=>{if(!loaded)return;draft=readDraft();draft.push({id:globalThis.crypto?.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16)).join('-'),name:'',sensors:[],relays:[]});editor();$('equipmentRoomEditor').querySelector('[data-group-index]:last-child input').focus()};
 $('equipmentRoomEditor').onclick=event=>{const button=event.target.closest('[data-remove-group]');if(!button)return;draft=readDraft();draft.splice(Number(button.dataset.removeGroup),1);editor()};
 $('equipmentRoomsForm').onsubmit=async event=>{
  event.preventDefault();const button=event.submitter,current=scopeKey(),request=revision;
  try{
   if(!loaded)throw Error('Esperá a que se carguen las salas.');
   const value=validate(readDraft());button.disabled=true;
   if(localMode())localStorage.setItem(cacheKey(),JSON.stringify(value));
   else await ControllerAccount.save({equipmentRooms:{[current]:value}});
   if(request!==revision||current!==scopeKey())return;
   groups=value;draft=clone(value);$('equipmentRoomsMessage').textContent='Salas y asignaciones guardadas.';render();
  }catch(error){$('equipmentRoomsMessage').textContent=error.message}finally{button.disabled=false}
 };
 addEventListener('grow-workspace-changed',load);
 setInterval(()=>{if(scope!==scopeKey())load();else render()},5000);
 load();
}
function update(value){context=value;if(scope!==scopeKey())load();else render()}
globalThis.EquipmentRooms=Object.freeze({init,update,validate,reading});
})();

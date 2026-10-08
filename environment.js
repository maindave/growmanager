(()=>{'use strict';
const $=id=>document.getElementById(id),M=()=>EnvironmentModels,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let rooms=[],crops=[],local=null,localAt=0,remote=[],remoteEvents=[],busy=false,epoch=0;
const labels={low:'Bajo',optimal:'Óptimo',high:'Alto',unknown:'Sin lectura actual',unconfigured:'Sin objetivo configurado'};
const workspace=()=>CultivoRepository.getCurrentWorkspace?.();
const client=()=>GrowSupabase.client;
function render(){
 const now=Date.now(),isLocal=local&&now-localAt<15000;
 const selected=$('dashboardEnvironmentRoom')?.value||local?.environment?.roomId||remote[0]?.room_id;
 const row=remote.find(r=>r.room_id===selected)||(!selected&&remote.length===1?remote[0]:null);
 const useLocal=isLocal&&(!selected||local.environment?.roomId===selected);
 const status=useLocal?local:row?.payload,at=useLocal?localAt:row?Date.parse(row.sampled_at):0;
 document.querySelectorAll('.today-environment,.today-systems').forEach(n=>n.dataset.remoteAvailable=String(Boolean(row)));
 const report=M().interpret(status,at,now,useLocal?15:120),env=status?.environment||{},room=rooms.find(r=>r.id===env.roomId);
 $('dashboardEnvironmentRoom').hidden=!rooms.length;
 $('todayEnvironmentStatus').textContent=status?(useLocal?'Medición local':'Medición remota')+(report.fresh?'':' · Lectura desactualizada'):'Sin mediciones disponibles para esta Sala.';
 $('environmentVpd').textContent=report.value===null?'—':report.value.toFixed(2);
 const age=at?Math.max(0,Math.round((now-at)/1000)):null;
 $('environmentSummary').textContent=status?`${room?.name||(env.roomId?'Sala vinculada':'Sala sin vincular')} · ${useLocal?'Local':`Remoto · muestra de hace ${age} s`} · ${labels[report.state]}${env.vpdMin!=null?` · Objetivo ${env.vpdMin}–${env.vpdMax} kPa`:''}${env.enabled?'':' · Control supervisado desactivado'}`:'Sin conexión local ni telemetría remota disponible.';
 {$('temperature').textContent=status&&M().valid(status.temperature,status.humidity)?status.temperature.toFixed(1):'—';$('humidity').textContent=status&&M().valid(status.temperature,status.humidity)?status.humidity.toFixed(1):'—'}
 const alerts=M().alarms(report.alarms,status);if(status&&!report.fresh)alerts.unshift('La lectura está desactualizada. No permite evaluar el estado ambiental actual.');
 if(!useLocal&&!status)globalThis.GrowDevice?.renderRemoteRelays?.([],false);
 if(status?.relays)globalThis.GrowDevice?.renderRemoteRelays?.(status.relays,report.fresh);
 $('environmentAlerts').innerHTML=alerts.map(text=>`<p>${esc(text)}</p>`).join('');
 document.querySelectorAll('[data-room-environment]').forEach(node=>{const id=node.dataset.roomEnvironment,l=isLocal&&local.environment?.roomId===id,r=remote.find(x=>x.room_id===id),s=l?local:r?.payload,a=l?localAt:r?Date.parse(r.sampled_at):0,v=M().interpret(s,a,Date.now(),l?15:120);node.innerHTML=s?`<strong>Ambiente · ${l?'Local':'Remoto'}</strong> ${M().valid(s.temperature,s.humidity)?`${esc(s.temperature)} °C · ${esc(s.humidity)} %`:'Sin lectura'} · VPD ${v.value===null?'—':v.value.toFixed(2)+' kPa'} · ${esc(labels[v.state])}${M().alarms(v.alarms).length?`<br>${esc(M().alarms(v.alarms).join(' '))}`:''}`:'Ambiente sin controlador vinculado.'});
 if($('environmentRemoteMessage')&&isLocal&&$('environmentRoom')?.value===local.environment?.roomId&&local.environment?.cloud){const c=local.environment.cloud,names={unconfigured:'Sin vincular',offline:'Sin Wi-Fi',waiting_clock:'Esperando hora válida',publishing:'Publicando',connected:'Datos enviados',retrying:'Reintentando',blocked:'Publicación detenida: revisá el vínculo o el diagnóstico',ready:'Lista para publicar'};$('environmentRemoteMessage').textContent=`${names[c.state]||c.state}${c.lastSuccessAgeSeconds!=null?` · Último envío hace ${c.lastSuccessAgeSeconds} s`:''} · ${c.pendingReadings||0} muestras pendientes${c.droppedReadings?` · ${c.droppedReadings} muestras antiguas descartadas`:''}${c.lastResult<0?` · Diagnóstico ${c.lastResult}`:''}`;}
 if($('environmentEvents')){
  const list=isLocal?(local.environment?.events||[]).slice().reverse().map(e=>({alarms:e.alarms,outputs:e.outputs,time:`Hace ${Math.max(0,Math.round(((Number(local.environment?.uptimeMs)||Number(local.uptime)*1000)-e.uptimeMs)/1000))} s`})):remoteEvents.filter(e=>e.room_id===($('environmentRoom')?.value||selected)).map(e=>({...e,time:new Date(e.occurred_at).toLocaleString('es-AR')}));
  $('environmentEvents').innerHTML=list.slice(0,16).map(e=>`<p><strong>${esc(e.time)}</strong> · ${esc(M().alarms(e.alarms).join(' ')||'Sin alertas activas')} · Salidas ordenadas: ${[1,2,3,4].filter(id=>e.outputs&(1<<(id-1))).join(', ')||'ninguna'}</p>`).join('')||'<p>Sin eventos disponibles.</p>';
 }
}
let provisioning=false,provisionAttempt=0;
async function ensureRemote(){const w=workspace();if(provisioning||Date.now()-provisionAttempt<60000||!local?.environment?.roomId||local.environment.cloud?.configured||!['owner','editor'].includes(w?.role)||!rooms.some(r=>r.id===local.environment.roomId)||Date.now()-localAt>15000)return;provisioning=true;provisionAttempt=Date.now();const roomId=local.environment.roomId,workspaceId=w.id;try{const{data,error}=await client().rpc('provision_environment_device',{p_room_id:roomId,p_device_key:GrowDevice.address()});if(error)throw error;if(workspace()?.id!==workspaceId||local.environment.roomId!==roomId)return;await GrowDevice.postForm('/api/environment/cloud',{roomId,token:data});await GrowDevice.refresh()}catch(error){console.warn('Vinculación remota:',error.message)}finally{provisioning=false}}
function update(data){local=data;localAt=Date.now();render();ensureRemote()}
function offline(){localAt=0;render()}
async function loadRooms(){
 const version=++epoch,w=workspace()?.id;if(!w)return;
 try{const[r,c]=await Promise.all([CultivoRepository.getAll('rooms'),CultivoRepository.getAll('cultivations')]);if(version!==epoch||workspace()?.id!==w)return;rooms=r;crops=c;const picker=$('dashboardEnvironmentRoom'),selected=picker.value;picker.innerHTML=r.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');picker.value=r.some(x=>x.id===selected)?selected:r.some(x=>x.id===local?.environment?.roomId)?local.environment.roomId:r[0]?.id||'';localStorage.setItem(`growmanager.environment.rooms.${w}`,JSON.stringify(r));await refreshRemote();render();ensureRemote()}catch(error){console.warn('Salas ambientales:',error.message)}
}
async function refreshRemote(){
 const w=workspace()?.id;if(!w||busy)return;busy=true;
 try{const[status,events]=await Promise.all([client().from('environment_status').select('room_id,device_key,sampled_at,payload').eq('workspace_id',w),client().from('environment_events').select('room_id,occurred_at,alarms,outputs').eq('workspace_id',w).order('occurred_at',{ascending:false}).limit(100)]);if(workspace()?.id!==w)return;if(status.error)throw status.error;if(events.error)throw events.error;remote=status.data||[];remoteEvents=events.data||[];const picker=$('dashboardEnvironmentRoom');if(!picker.dataset.chosen&&remote.length&&!remote.some(r=>r.room_id===picker.value))picker.value=remote[0].room_id;render()}catch(error){console.warn('Telemetría remota:',error.message)}finally{busy=false}
}
function currentFields(status=local){const e=status?.environment||{};return{enabled:e.enabled||false,roomId:e.roomId||'',stage:e.stage??1,vpdMin:e.vpdMin??0.8,vpdMax:e.vpdMax??1.2,criticalHot:e.criticalHot??35,criticalCold:e.criticalCold??10,criticalHumidity:e.criticalHumidity??90,minimumSwitchSeconds:e.minimumSwitchSeconds??30,responseSeconds:e.responseSeconds??300,responseDelta:e.responseDelta??0.3,humidityResponseDelta:e.humidityResponseDelta??2,exchangeOnSensorFailure:e.exchangeOnSensorFailure||false}}
function historyContext(){const id=$('dashboardEnvironmentRoom').value||local?.environment?.roomId;const r=remote.find(r=>r.room_id===id),s=local?.environment?.roomId===id&&Date.now()-localAt<15000?local:r?.payload;return{roomId:id,roomName:rooms.find(r=>r.id===id)?.name||'Sala',environment:s?.environment,relays:s?.relays||[]};}
function open(requestedRoom=null,technical=false){
 const roomId=requestedRoom||local?.environment?.roomId||$('dashboardEnvironmentRoom').value,room=rooms.find(r=>r.id===roomId),same=local?.environment?.roomId===roomId;
 const status=same?local:remote.find(r=>r.room_id===roomId)?.payload,e=currentFields(status);e.roomId=roomId;
 const available=Boolean(local?.environment)&&Date.now()-localAt<15000&&(['owner','editor'].includes(workspace()?.role)||(!workspace()&&same&&document.documentElement.dataset.localMode==='true'));

 const dialog=$('environmentSettingsDialog');
 if(!technical){dialog.innerHTML=`<div class="dialog-form"><div class="dialog-heading"><h3>${esc(room?.name||'Ambiente de la Sala')}</h3><button type="button" data-environment-close class="icon-button" aria-label="Cerrar">×</button></div><p>${room?.lengthM?`${esc(room.lengthM)} × ${esc(room.widthM)} × ${esc(room.heightM)} m · ${(room.lengthM*room.widthM*room.heightM).toLocaleString('es-AR',{maximumFractionDigits:2})} m³`:'Cargá las dimensiones desde Editar sala.'}</p><p>${status?`${esc(status.temperature??'—')} °C · ${esc(status.humidity??'—')} % · VPD ${M().vpd(status.temperature,status.humidity)?.toFixed(2)||'—'} kPa`:'Esta Sala todavía no tiene un medidor vinculado.'}</p><p>Objetivo: ${e.vpdMin}–${e.vpdMax} kPa · ${M().stages.find(s=>s.id===e.stage)?.label||'Sin etapa'}</p><p class="field-help">${status?'Medidor asociado a esta Sala. Consulta remota incluida.':'Asigná el medidor desde Control.'}</p><button type="button" data-environment-technical class="secondary-button">Ir a Control</button></div>`;
 dialog.querySelector('[data-environment-close]').onclick=()=>dialog.close();dialog.querySelector('[data-environment-technical]').onclick=async()=>{dialog.close();await GrowNavigation.showView('control');open(roomId,true)};dialog.showModal();return;}
 const fields=[['vpdMin','VPD mínimo (kPa)',.1,4,.1],['vpdMax','VPD máximo (kPa)',.1,4,.1]],advanced=[['criticalHot','Temperatura crítica alta (°C)',0,60,.5],['criticalCold','Temperatura crítica baja (°C)',-20,50,.5],['criticalHumidity','Humedad crítica (%)',70,100,1],['minimumSwitchSeconds','Tiempo entre cambios (s)',5,300,1],['responseSeconds','Plazo de respuesta (s)',60,1800,1],['responseDelta','Respuesta térmica mínima (°C)',.1,3,.1],['humidityResponseDelta','Descenso mínimo de humedad (%)',.5,10,.5]];
 const inputs=items=>items.map(([name,label,min,max,step])=>`<label>${label}<input name="${name}" type="number" min="${min}" max="${max}" step="${step}" value="${e[name]}" required ${available?'':'readonly'}></label>`).join('');
 dialog.innerHTML=`<form id="environmentForm" class="dialog-form"><div class="dialog-heading"><h3>Ambiente y protección</h3><button type="button" data-environment-close class="icon-button" aria-label="Cerrar">×</button></div><label>Sala<select id="environmentRoom" name="roomId">${rooms.map(r=>`<option value="${esc(r.id)}" ${r.id===roomId?'selected':''}>${esc(r.name)}</option>`).join('')||`<option value="${esc(roomId||'')}">Sala vinculada</option>`}</select></label><section class="environment-connection"><h4>Conexión y diagnóstico</h4><p>${same?esc(local.device||'Wemos'):available?'Wemos disponible para esta Sala':status?'Medidor remoto vinculado':'Sin medidor en esta Sala'}</p><p id="environmentRemoteMessage" class="field-help">${status?'Consulta remota incluida.':'Al guardar el vínculo se habilita la publicación remota.'}</p><p class="field-help">${available?'Conexión local disponible.':'Para cambiar el controlador necesitás estar en su red Wi-Fi. La consulta remota sigue disponible.'}</p></section><div class="form-grid two"><label>Etapa ambiental<select name="stage" ${available?'':'disabled'}>${M().stages.map(s=>`<option value="${s.id}" ${s.id===e.stage?'selected':''}>${s.label}</option>`).join('')}</select></label>${inputs(fields)}</div><label class="check-field"><input name="enabled" type="checkbox" ${same&&e.enabled?'checked':''} ${available?'':'disabled'}> Activar control ambiental supervisado en el Wemos</label><details><summary>Protección avanzada</summary><p class="field-help">${e.heaterMaximumOnSeconds?'Protección local: calefacción hasta 15 minutos continuos; luz manual hasta 1 hora. Los cortes de seguridad requieren rearme.':'Los nuevos límites de seguridad requieren instalar el firmware 2.6.5 en el Wemos.'}</p><div class="form-grid two">${inputs(advanced)}</div><label class="check-field"><input name="exchangeOnSensorFailure" type="checkbox" ${e.exchangeOnSensorFailure?'checked':''} ${available?'':'disabled'}> Mantener extracción/intracción al perder el sensor</label><button id="ackEnvironment" type="button" class="secondary-button" ${available?'':'disabled'}>Rearmar supervisión</button></details><p id="environmentFormMessage" class="field-help" role="status">${available?'Objetivos y protección se guardan en el Wemos.':'Consulta disponible; edición local requerida.'}</p><div class="form-actions"><button type="submit" class="primary-button" ${available?'':'disabled'}>Guardar</button><button type="button" class="text-button" data-environment-log>Ver eventos en Bitácora →</button></div></form>`;
 let confirmedFrom=null,pendingTransfer=null;
 const enabledInput=dialog.querySelector('[name=enabled]');
 function confirmRoomChange(){
 const from=local?.environment?.roomId;
 if(!from||from===roomId)return true;
 if(confirmedFrom===from)return true;
 const sourceName=rooms.find(r=>r.id===from)?.name||'otra Sala';
 const warning=local.environment.enabled?'El control ambiental está activo en '+sourceName+'.':'El Wemos está asignado a '+sourceName+'.';
 if(!confirm(warning+' ¿Querés activarlo en '+(room?.name||'esta Sala')+' y dejarlo desactivado en '+sourceName+' al guardar?'))return false;
 confirmedFrom=from;return true;
 }
 enabledInput.onchange=()=>{if(enabledInput.checked&&!confirmRoomChange())enabledInput.checked=false};
 dialog.querySelector('[data-environment-close]').onclick=()=>dialog.close();$('environmentRoom').onchange=()=>open($('environmentRoom').value,true);
 dialog.querySelector('[name=stage]').onchange=ev=>{const profile=M().stages.find(s=>s.id===Number(ev.target.value));dialog.querySelector('[name=vpdMin]').value=profile.min;dialog.querySelector('[name=vpdMax]').value=profile.max};
 dialog.querySelector('[data-environment-log]').onclick=async()=>{dialog.close();$('operationFilter').value='environment';await GrowNavigation.showView('operations')};
 $('ackEnvironment').onclick=async()=>{try{await GrowDevice.post('/api/environment/acknowledge');await GrowDevice.refresh();$('environmentFormMessage').textContent='Supervisión rearmada.'}catch(error){$('environmentFormMessage').textContent=error.message}};
 $('environmentForm').onsubmit=async ev=>{
 ev.preventDefault();const form=ev.currentTarget,b=ev.submitter;
 const values=Object.fromEntries(new FormData(form));values.enabled=form.elements.enabled.checked?'1':'0';values.exchangeOnSensorFailure=form.elements.exchangeOnSensorFailure.checked?'1':'0';
 let saving=false;
 try{
 if(!values.roomId)throw new Error('Seleccioná una Sala.');
 if(Number(values.vpdMax)<=Number(values.vpdMin))throw new Error('El VPD máximo debe superar al mínimo.');
 const from=local?.environment?.roomId,switching=Boolean(from&&from!==values.roomId)||Boolean(pendingTransfer);
 if(switching&&values.enabled!=='1'){ $('environmentFormMessage').textContent='Control desactivado en esta Sala. El Wemos sigue asignado a '+(rooms.find(r=>r.id===from)?.name||'su Sala actual')+'.';return }
 if(switching&&!pendingTransfer&&!confirmRoomChange())return;
 b.disabled=true;provisioning=true;saving=true;
 if(switching&&!pendingTransfer){
 await GrowDevice.post('/api/environment',{roomId:from,enabled:'0'});
 const {data,error}=await client().rpc('transfer_environment_device',{p_from_room:from,p_to_room:values.roomId,p_device_key:GrowDevice.address()});
 if(error)throw error;pendingTransfer={token:data,roomId:values.roomId};
 }
 await GrowDevice.post('/api/environment',values);
 if(pendingTransfer){
 await GrowDevice.postForm('/api/environment/cloud',{roomId:values.roomId,token:pendingTransfer.token});
 pendingTransfer=null;
 }else{
 await GrowDevice.refresh();
 if(!local.environment.cloud?.configured){
 const {data,error}=await client().rpc('provision_environment_device',{p_room_id:values.roomId,p_device_key:GrowDevice.address()});
 if(error)throw error;await GrowDevice.postForm('/api/environment/cloud',{roomId:values.roomId,token:data});
 }
 }
 await GrowDevice.refresh();await refreshRemote();
 $('environmentFormMessage').textContent=values.enabled==='1'?'Control ambiental activo en '+(room?.name||'esta Sala')+'.':'Control ambiental desactivado.';
 }catch(error){$('environmentFormMessage').textContent='No se completó el guardado: '+error.message}
 finally{if(saving){b.disabled=false;provisioning=false}}
 };

 if(!dialog.open)dialog.showModal();render();
}
function init(){const dialog=document.createElement('dialog');dialog.id='environmentSettingsDialog';dialog.className='app-dialog';document.body.append(dialog);$('openEnvironmentControl').onclick=()=>open(null,true);$('dashboardEnvironmentRoom').onchange=()=>{$('dashboardEnvironmentRoom').dataset.chosen='1';render()};document.addEventListener('click',event=>{const button=event.target.closest('[data-open-room-environment]');if(button)open(button.dataset.openRoomEnvironment)});setInterval(()=>{render();if(!document.hidden)refreshRemote()},60000);setInterval(render,5000);addEventListener('grow-workspace-changed',()=>{epoch++;delete $('dashboardEnvironmentRoom').dataset.chosen;rooms=[];crops=[];remote=[];remoteEvents=[];loadRooms()});addEventListener('grow-rooms-rendered',()=>loadRooms())}
function historyDevice(){const id=$('dashboardEnvironmentRoom').value||local?.environment?.roomId;return remote.find(r=>r.room_id===id)?.device_key||GrowDevice.address()}
globalThis.GrowEnvironmentUI=Object.freeze({init,update,offline,loadRooms,refreshRemote,historyDevice,historyContext});
})();

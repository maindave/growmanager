/* Phase 1: read-only overview and contextual links to existing modules. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const paths = {
    home:'m3 10 9-7 9 7v10H3Z M9 20v-7h6v7',
    flower:'M12 8c-5-8-9-2-5 2-8 0-5 8 0 5-1 8 8 8 6 0 8 3 10-5 3-5 4-7-2-10-4-2Z M10 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z',
    leaf:'M20 4C9 2 3 7 5 15c7 5 16-1 15-11Z M4 21 15 10',
    plus:'M12 5v14 M5 12h14', calendar:'M5 5h14v16H5Z M8 3v4 M16 3v4 M5 10h14',
    menu:'M5 6h14 M5 12h14 M5 18h14', spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z',
    book:'M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Z M12 5v15',
    history:'M4 8a9 9 0 1 1-1 7 M3 3v6h6 M12 7v6l4 2',
    sliders:'M4 7h16 M4 17h16 M8 4v6 M16 14v6', folder:'M3 6h7l2 3h9v11H3Z',
    users:'M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M2 21v-3c0-5 12-5 12 0v3 M16 4a4 4 0 0 1 0 7 M17 15c4 0 5 2 5 6',
    drop:'M12 3C10 7 5 11 5 15a7 7 0 0 0 14 0c0-4-5-8-7-12Z',
    alert:'m12 3 10 18H2Z M12 9v5 M12 17v1', light:'M9 17h6 M10 21h4 M8 13a6 6 0 1 1 8 0l-1 4H9Z',
    wind:'M3 8h12c5 0 5-6 1-6 M3 12h16c4 0 4 6 0 6 M3 16h7', heat:'M7 20c-6-6 6-10 0-16 M12 20c-6-6 6-10 0-16 M17 20c-6-6 6-10 0-16'
  };
  function icon(name) { return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.leaf}"/></svg>`; }
  let cropPlants=[],cropRooms=[];
  let data={events:[],lots:[],cultivations:[],nutritionProgress:[]}, records=[], loaded=false, selectedLot=null, tab='today', device={online:null}, epoch=0, cloud='';
  const stage = lot => CultivoModels.LOT_STAGE_LABELS[lot.stage] || lot.stage;
  const editable = () => ['owner','editor'].includes(CultivoRepository.getCurrentWorkspace()?.role);
  const date = value => value ? new Intl.DateTimeFormat('es-AR',{day:'numeric',month:'short',year:'numeric'}).format(new Date(`${String(value).slice(0,10)}T12:00:00`)) : 'Sin definir';
  const time = value => new Intl.DateTimeFormat('es-AR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
  function phase(lot) {
    const current=NutritionCalendar.phaseAt(lot,TodayModels.dayKey(),data.nutritionProgress);
    if(!current)return '';
    const saved=data.nutritionProgress.find(r=>r.lotId===lot.id&&r.weekNumber===current.weekNumber);
    const states={aligned:'Etapa confirmada · alineada al plan',ahead:'Etapa confirmada · adelantada',behind:'Etapa confirmada · atrasada'};
    return `<span>${esc(NutritionCalendar.LABELS[current.stage])} <small>· ${current.isObserved?'observada':'prevista'}</small></span><small>${esc(saved?.actualStage ? states[saved.stageStatus]||'Etapa confirmada' : 'Etapa real sin confirmar')}</small>`;
  }
  function relation(event) { return data.lots.find(l=>l.id===event.lotId)?.name || data.cultivations.find(c=>c.id===event.cultivationId)?.name || 'Proyecto general'; }
  function eventRow(event) {
    return `<article class="today-event"><span class="semantic-icon ${event.eventType==='irrigation'?'water':'plant'}">${icon(event.eventType==='irrigation'?'drop':'calendar')}</span><div><strong>${esc(event.title)}</strong><span>${esc(relation(event))}</span><small>${time(event.occurrenceStart||event.startsAt)}</small></div><button class="text-button" data-today-event="${esc(event.id)}">Ver evento →</button></article>`;
  }
  function updateAgenda(snapshot) { data=snapshot; loaded=true; render(); }
  function updateActivity(rows) { records=rows; renderRecent(); renderAttention(); }
  function render() {
    $('todayDate').textContent=new Intl.DateTimeFormat('es-AR',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
    const upcoming=TodayModels.upcoming(data.events,Agenda.occurrences);
    $('dashboardAgenda').innerHTML=upcoming.length?upcoming.map(eventRow).join(''):'<div class="today-empty"><strong>No hay próximos eventos pendientes</strong><p>Consultá el calendario para ver tu planificación.</p><button class="text-button" data-view="agenda">Abrir agenda →</button></div>';
    const active=data.lots.filter(l=>l.active);
    $('dashboardCultivations').innerHTML=active.length?active.map(l=>`<button class="today-lot" data-open-lot="${esc(l.id)}"><span class="semantic-icon ${l.stage==='flowering'?'flowering':'plant'}">${icon(l.stage==='flowering'?'flower':'leaf')}</span><span class="today-lot-copy"><strong>${esc(l.name)}</strong><span>${esc(stage(l))} · ${NutritionCalendar.profileKey(l)==='mothers'?'Continuo':esc(TodayModels.lotAge(l))}</span>${phase(l)}</span><span aria-hidden="true">→</span></button>`).join(''):'<div class="today-empty"><strong>Tus cultivos aparecerán acá</strong><p>Creá una sala y agregá su cultivo.</p><button class="text-button" data-view="cultivation">Ver cultivos →</button></div>';
    renderAttention(); if(selectedLot)renderLot();
  }
  function renderAttention() {
    const items=[];
    const overdue=TodayModels.overdue(data.events);
    if(overdue.length)items.push({tasks:overdue,text:`${overdue.length} ${overdue.length===1?'tarea vencida':'tareas vencidas'}`});
    const alerts=TodayModels.alerts(records);
    if(alerts.length)items.push({text:`${alerts.length} ${alerts.length===1?'alerta sin resolver':'alertas sin resolver'} en la bitácora`,view:'operations'});
    if(device.online===true && device.sensorValid===false)items.push({text:'El sensor ambiental no entrega una lectura actual',view:'hardware'});
    // No hardware response is not a crop alert for a user who has no device configured.
    if(device.online===false && device.wasConnected)items.push({text:'Se perdió la conexión con el dispositivo',view:'connection'});
    if(cloud==='error'||cloud==='cached')items.push({text:cloud==='cached'?'Mostrando datos guardados en este dispositivo':'No se pudieron actualizar algunos datos del proyecto',view:'dashboard'});
    const node=$('todayAttention'),expanded=Boolean(node.querySelector('.attention-tasks')?.open);node.hidden=!items.length;
    node.innerHTML=items.length?`<div class="attention-heading">${icon('alert')}<strong>${overdue.length?`${overdue.length} ${overdue.length===1?'tarea vencida':'tareas vencidas'}`:'Avisos'}</strong></div>${items.map(x=>x.tasks?`<details class="attention-tasks" ${expanded?'open':''}><summary>Ver tareas pendientes</summary><div>${x.tasks.map(event=>`<button class="attention-row" data-today-event="${esc(event.id)}"><span><strong>${esc(event.title)}</strong><small>${esc(relation(event))} · ${time(event.endsAt||event.startsAt)}</small></span><span aria-hidden="true">→</span></button>`).join('')}</div></details>`:`<button class="attention-row" data-view="${x.view}"><span>${esc(x.text)}</span><span aria-hidden="true">→</span></button>`).join('')}`:'';
  }
  function renderRecent() {
    const recent=records.slice(0,3);
    $('todayRecent').innerHTML=recent.length?recent.map(r=>`<button class="today-record" data-view="operations"><span class="semantic-icon ${r.kind==='irrigation'?'water':'neutral'}">${icon(r.kind==='irrigation'?'drop':'history')}</span><span><strong>${esc(r.title)}</strong><small>${time(r.occurredAt)}</small></span><span aria-hidden="true">→</span></button>`).join(''):'<p class="field-help">Todavía no hay actividad registrada en este proyecto.</p>';
  }
  function updateDevice(next) {
    device={...device,...next,wasConnected:device.wasConnected||next.online===true};
    $('todayEnvironmentStatus').textContent=device.online===false
      ? (device.wasConnected?'Sin conexión al dispositivo. Se conservan los últimos datos conocidos.':'No hay un dispositivo conectado. Podés seguir consultando tus cultivos.')
      : device.online===true ? (device.sensorValid===false?'Sensor sin lectura actual. Revisá el detalle del dispositivo.':`Última lectura recibida ${new Date(device.at||Date.now()).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}.`) : 'Buscando el dispositivo local…';
    renderAttention();
  }
  async function load() {
    const token=++epoch,workspace=CultivoRepository.getCurrentWorkspace()?.id;
    if(!workspace)return;
    const result=await Promise.allSettled([Agenda.load(),Operations.load()]);
    const [ps,rs]=await Promise.all([CultivoRepository.getAll('plants'),CultivoRepository.getAll('rooms')]);
    if(token!==epoch)return;cropPlants=ps;cropRooms=rs;
    if(token!==epoch||workspace!==CultivoRepository.getCurrentWorkspace()?.id)return;
    const error=result.some(r=>r.status==='rejected'||r.value===false);
    $('todayLoadMessage').textContent=error?'No se pudieron actualizar todos los datos. Podés reintentar desde Actualizar.':'';
    $('todayLoadMessage').className=error?'message show error':'message';
  }
  async function openLot(id) { await load();selectedLot=id;tab='today';await GrowNavigation.showView('lot');renderLot(); }
  function renderLot() {
    const lot=data.lots.find(l=>l.id===selectedLot),root=$('lotContextRoot');
    if(!lot){root.innerHTML='<div class="panel empty-state"><h2>Cultivo no disponible</h2><p>Elegí un cultivo del proyecto actual.</p></div>';return;}
    const cultivation=data.cultivations.find(c=>c.id===lot.cultivationId);
    const tabs=[['today','Hoy'],['history','Historial'],['plan','Plan'],['plants','Plantas'],['photos','Fotos'],['data','Datos']];
    const upcoming=TodayModels.upcoming(data.events.filter(e=>e.lotId===lot.id||(!e.lotId&&e.cultivationId===lot.cultivationId)),Agenda.occurrences);
    const history=records.filter(r=>r.metadata?.destinationCultivationId===lot.cultivationId||r.lotId===lot.id||r.metadata?.lotId===lot.id||(!(r.lotId||r.metadata?.lotId)&&(r.cultivationId||r.metadata?.cultivationId)===lot.cultivationId)).slice(0,20);
    const lastWater=history.find(r=>r.kind==='irrigation');
    const emptyToday=`<p class="subtle">Sin tareas pendientes.</p>${lastWater?`<p class="tanda-summary"><strong>Último riego</strong> ${time(lastWater.occurredAt)}<br>${esc(lastWater.description||'')}</p>`:''}${device.online===true&&device.sensorValid?`<p class="tanda-summary"><strong>Ambiente del dispositivo</strong> ${esc($('temperature').textContent)} °C · ${esc($('humidity').textContent)} %</p>`:''}`;
    const content=tab==='today'?`<button class="primary-button" data-daily-type="observation" data-lot-id="${esc(lot.id)}">+ Registrar en este cultivo</button><h3>Próximo en este cultivo</h3>${upcoming.length?upcoming.map(eventRow).join(''):emptyToday}`
      :tab==='history'?`<h3>Historial de este cultivo</h3>${history.map(r=>`<article class="tanda-history-row"><div><small>${time(r.occurredAt)}</small><strong>${esc(r.title)}</strong><p>${esc(r.description||'')}</p>${GrowPhotos.gallery(r)}${r.source==='agenda'?'<small>Realizado desde Agenda</small>':''}</div></article>`).join('')||'<p class="subtle">Todavía no hay registros en este cultivo.</p>'}<button class="secondary-button" data-lot-link="history">Ver historial del cultivo →</button>`
      :tab==='photos'?`<h3>Fotos del cultivo</h3>${editable()?`<button class="primary-button" data-journal-photos="${lot.cultivationId}">Agregar fotos</button>`:''}${records.filter(r=>(r.cultivationId||r.metadata?.cultivationId)===lot.cultivationId&&(r.metadata?.photos||[]).length).map(r=>`<article class="tanda-history-row"><strong>${esc(r.title)}</strong><small>${time(r.occurredAt)}</small><p>${esc(r.description||'')}</p>${GrowPhotos.gallery(r)}</article>`).join('')||'<p class="subtle">Todavía no hay fotos para este cultivo.</p>'}`
      :tab==='plants'?`<h3>Plantas del cultivo</h3>${editable()&&lot.active?`<button class="primary-button" data-add-plants="${lot.id}">Agregar plantas</button>`:''}${cropPlants.filter(p=>p.lotId===lot.id).map(p=>`<article class="tanda-history-row"><strong>${esc(p.code)}</strong><p>${esc(p.variety||'Sin variedad')} · ${esc(p.status==='active'?'Activa':p.status==='harvested'?'Cosechada':'Inactiva')}</p>${editable()?`<button class="text-button" data-edit-plant="${p.id}">Editar</button>`:''}</article>`).join('')||'<p class="subtle">Todavía no hay plantas registradas.</p>'}`
      :tab==='plan'?'<h3>Tu planificación</h3><p class="subtle">El calendario conserva los eventos y responsables. El plan de nutrición muestra el programa y las etapas confirmadas.</p><div class="inline-actions"><button class="secondary-button" data-lot-link="agenda">Ver agenda del cultivo →</button><button class="secondary-button" data-lot-link="nutrition">Ver plan de nutrición →</button></div>'
      :`<h3>Datos del cultivo</h3><dl class="lot-data"><div><dt>Sala</dt><dd>${esc(cropRooms.find(r=>r.id===cultivation?.roomId)?.name||'Sin definir')}</dd></div><div><dt>Tabla nutricional</dt><dd>${esc(NutritionCalendar.PROFILE_LABELS[NutritionCalendar.profileKey(lot)])}</dd></div><div><dt>Estado</dt><dd>${lot.active?'Activo':'Finalizado'}</dd></div></dl><p class="subtle">${esc(lot.description||'Sin descripción.')}</p>${editable()?'<button class="secondary-button" data-lot-link="edit">Editar datos del cultivo →</button>':'<p class="field-help">Tu acceso a este proyecto es de lectura.</p>'}`;
    root.innerHTML=`<div class="page-heading"><div><p class="project-subtitle">${esc(cropRooms.find(r=>r.id===cultivation?.roomId)?.name||'Cultivo')}</p><h2>${esc(lot.name)}</h2><p class="subtle">${esc(stage(lot))} · ${esc(TodayModels.lotAge(lot))}</p></div></div><div class="lot-phase">${phase(lot)}</div><dl class="lot-dates"><div><dt>Inicio</dt><dd>${date(lot.timelineStartedOn)}</dd></div><div><dt>Fin estimado</dt><dd>${NutritionCalendar.profileKey(lot)==='mothers'?'Continuo':date(lot.timelineEndOn)}</dd></div></dl><nav class="context-tabs" aria-label="Secciones del cultivo">${tabs.map(([id,label])=>`<button class="${id===tab?'active':''}" data-lot-tab="${id}" aria-current="${id===tab?'page':'false'}">${label}</button>`).join('')}</nav><section class="lot-context-content">${content}</section>`;GrowPhotos.hydrate(root);
  }
  async function lotLink(target) {
    const id=selectedLot;
    if(target==='history'){await GrowNavigation.showView('operations');Operations.filterLot(id);}
    if(target==='agenda'){await GrowNavigation.showView('agenda');NutritionCalendar.setFace('events');Agenda.filterLot(id);}
    if(target==='nutrition'){await GrowNavigation.showView('agenda');await NutritionCalendar.openLot(id);}
    if(target==='edit'){await GrowNavigation.showView('cultivation');Cultivation.editLot(id);}
  }
  function showRegister() {
    const canEdit=editable();
    $('quickRegisterDialog').querySelectorAll('[data-existing-action],[data-daily-type]').forEach(b=>b.disabled=!canEdit&&b.dataset.existingAction!=='assistant');
    $('registerRoleNote').textContent=!CultivoRepository.getCurrentWorkspace()?'Cargando el proyecto. Cerrá y volvé a abrir en un momento.':canEdit?'Registrá lo realizado o planificá una tarea futura.':'Este proyecto es de lectura. Podés consultar al asistente.';
    $('quickRegisterDialog').showModal();
  }
  async function existingAction(action) {
    $('quickRegisterDialog').close();
    if(action==='assistant'){$('voiceAssistantButton').click();return;}
    if(!editable())return;
    if(action==='record'){await GrowNavigation.showView('operations');$('newOperationButton').click();}
    if(action==='event'){await GrowNavigation.showView('agenda');NutritionCalendar.setFace('events');$('openAgendaEvent').click();}
  }
  function init() {
    $('quickRegisterDialog').querySelector('[value=cancel]').onclick=()=>$('quickRegisterDialog').close();

    document.querySelectorAll('[data-ui-icon]').forEach(n=>n.innerHTML=icon(n.dataset.uiIcon));
    $('todayDate').textContent=new Intl.DateTimeFormat('es-AR',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
    document.addEventListener('click',async event=>{
      const b=event.target.closest('[data-open-lot],[data-today-event],[data-lot-tab],[data-lot-link],[data-open-register],[data-existing-action]');
      if(!b)return;
      try {
        if(b.hasAttribute('data-open-register'))showRegister();
        if(b.dataset.existingAction)await existingAction(b.dataset.existingAction);
        if(b.dataset.openLot)await openLot(b.dataset.openLot);
        if(b.dataset.lotTab){tab=b.dataset.lotTab;renderLot();$('lotContextRoot').querySelector(`[data-lot-tab="${tab}"]`)?.focus();}
        if(b.dataset.lotLink)await lotLink(b.dataset.lotLink);
        if(b.dataset.todayEvent){await GrowNavigation.showView('agenda');Agenda.openById(b.dataset.todayEvent);}
      } catch(error){$('todayLoadMessage').textContent=error.message;$('todayLoadMessage').className='message show error';}
    });
    addEventListener('grow-workspace-changed',()=>{epoch++;data={events:[],lots:[],cultivations:[],nutritionProgress:[]};records=[];selectedLot=null;loaded=false;render();renderRecent();$('lotContextRoot').innerHTML='';load();});
    addEventListener('grow-sync-status',event=>{cloud=event.detail.state;renderAttention();});
  }
  globalThis.GrowToday=Object.freeze({async refreshCrop(){await load();if(selectedLot)renderLot()},init,load,updateAgenda,updateActivity,updateDevice,openLot,icon});
})();

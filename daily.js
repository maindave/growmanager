(() => {
  'use strict';
  const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let lots=[],workspace=null,busy=false,opening=0,plans=[],recipes=[],lockedPlan=null;
  const canEdit=()=>['owner','editor'].includes(CultivoRepository.getCurrentWorkspace()?.role);
  async function open(type='observation',lotId='',plan=null) {
    if(!canEdit()&&!plan?.assignees?.some(a=>a.userId===GrowAuth.getUser()?.id))return;lockedPlan=plan;
    const token=++opening,id=CultivoRepository.getCurrentWorkspace()?.id;
    const [values,events,recipeRows]=await Promise.all([CultivoRepository.getAll('lots'),CultivoRepository.getAgendaEvents(),CultivoRepository.getAll('recipes')]);plans=events;recipes=recipeRows.filter(r=>r.active&&r.type==='irrigation');if(token!==opening||id!==CultivoRepository.getCurrentWorkspace()?.id)return;
    lots=values.filter(l=>l.active||l.id===plan?.lotId);workspace=id;
    const form=$('dailyRecordForm');form.reset();form.elements.type.value=type;form.elements.at.value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
    form.elements.lotId.innerHTML='<option value="">Elegí una tanda</option>'+lots.map(l=>`<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('');
    if(lotId)form.elements.lotId.value=lotId;else if(lots.length===1)form.elements.lotId.value=lots[0].id;
    form.elements.type.disabled=Boolean(plan);form.elements.lotId.disabled=Boolean(plan?.lotId);form.elements.recipeId.innerHTML='<option value="">Sin receta</option>'+recipes.map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
    $('dailyRecordMessage').textContent=lots.length?'':'Primero creá una tanda en Cultivos.';update();syncPlans();prefill();$('dailyRecordDialog').showModal();
  }
  function update(){const irrigation=$('dailyRecordForm').elements.type.value==='irrigation';$('dailyWaterFields').hidden=!irrigation;$('dailyWaterFields').querySelectorAll('input,select').forEach(n=>n.disabled=!irrigation);}
  function syncPlans(){
    const f=$('dailyRecordForm'),old=f.elements.eventId.value,type=f.elements.type.value;
    const candidates=lockedPlan?[lockedPlan]:plans.filter(e=>!e.archivedAt&&!['completed','cancelled'].includes(e.status)&&(!e.recurrence||e.recurrence==='none')&&e.lotId===f.elements.lotId.value&&e.eventType===type&&TodayModels.dayKey(e.startsAt)===String(f.elements.at.value).slice(0,10));
    f.elements.eventId.innerHTML=(lockedPlan?'':'<option value="">Sin plan · nuevo registro</option>')+candidates.map(e=>`<option value="${esc(e.id)}">${esc(e.title)} · ${new Date(e.startsAt).toLocaleString('es-AR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</option>`).join('');
    f.elements.eventId.value=candidates.some(e=>e.id===old)?old:candidates.length===1?candidates[0].id:'';
    f.elements.eventId.disabled=Boolean(lockedPlan);$('dailyPlanLabel').hidden=!candidates.length;
  }
  function prefill(){const f=$('dailyRecordForm'),plan=plans.find(e=>e.id===f.elements.eventId.value)||lockedPlan;if(!plan)return;const meta=plan.metadata||{};for(const k of ['waterLiters','ph','ec'])if(meta[k]!=null)f.elements[k].value=meta[k];f.elements.notes.value=plan.description||'';const recipeId=meta.recipeId||meta.supplies?.find(s=>s.recipeId)?.recipeId;if(recipeId)f.elements.recipeId.value=recipeId;}
  function init(){
    $('dailyRecordForm').elements.type.innerHTML=Object.entries(DailyModels.TYPES).map(([id,label])=>`<option value="${id}">${label}</option>`).join('');
    $('dailyRecordForm').elements.type.addEventListener('change',()=>{update();syncPlans();prefill()});['lotId','at'].forEach(key=>$('dailyRecordForm').elements[key].addEventListener('change',()=>{syncPlans();prefill()}));$('dailyRecordForm').elements.eventId.addEventListener('change',prefill);
    document.addEventListener('click',async e=>{const b=e.target.closest('[data-daily-type]');if(!b)return;$('quickRegisterDialog').close();try{await open(b.dataset.dailyType,b.dataset.lotId)}catch(error){$('todayLoadMessage').textContent=error.message;$('todayLoadMessage').className='message show error';}});
    $('closeDailyRecord').onclick=()=>{if(!busy)$('dailyRecordDialog').close()};
    $('dailyRecordDialog').addEventListener('cancel',e=>{if(busy)e.preventDefault()});
    $('dailyRecordForm').addEventListener('submit',async e=>{e.preventDefault();if(busy)return;const form=e.currentTarget,message=$('dailyRecordMessage');
      try{
        if((!canEdit()&&!lockedPlan?.assignees?.some(a=>a.userId===GrowAuth.getUser()?.id))||workspace!==CultivoRepository.getCurrentWorkspace()?.id)throw new Error('El proyecto cambió. Cerrá y volvé a abrir el registro.');
        const input={...Object.fromEntries(new FormData(form)),type:form.elements.type.value,lotId:form.elements.lotId.value,eventId:form.elements.eventId.value},payload=DailyModels.build(input,lots.find(l=>l.id===input.lotId));
        busy=true;e.submitter.disabled=true;message.textContent='Guardando…';
        const version=input.recipeId?await CultivoRepository.getCurrentRecipeVersion(input.recipeId):null,recipe=recipes.find(r=>r.id===input.recipeId);
        if(input.recipeId&&!version)throw new Error('La receta no tiene una versión guardada.');
        if(input.eventId){await CultivoRepository.completeAgendaExecution(input.eventId,{lotId:input.lotId,completedAt:new Date(input.at).toISOString(),waterLiters:payload.value.waterLiters??null,ph:payload.value.ph??null,ec:payload.value.ec??null,notes:input.notes,recipeVersionId:version?.id||null});}
        else if(payload.store==='irrigations'){if(version)payload.value.supplies=[{recipeVersionId:version.id,recipeId:recipe.id,recipeName:recipe.name,version:version.version}];await CultivoRepository.createIrrigation(payload.value);}
        else if(payload.store==='logs')await CultivoRepository.createOperationLog(payload.value);
        else await CultivoRepository.create(payload.store,payload.value);
        // The write has succeeded. Close before refreshing so a refresh failure cannot invite a duplicate submission.
        $('dailyRecordDialog').close();await GrowNavigation.showView('operations');Operations.filterLot(input.lotId);
        $('operationsMessage').textContent='Registro guardado. Ya está en el historial de la tanda.';$('operationsMessage').className='message show success';
      }catch(error){if($('dailyRecordDialog').open)message.textContent=error.message;else{$('operationsMessage').textContent='El registro se guardó, pero no pudimos actualizar el historial. Usá Actualizar.';$('operationsMessage').className='message show error';}}finally{busy=false;form.querySelector('[type=submit]').disabled=false;}
    });
    addEventListener('grow-workspace-changed',()=>{opening++;if(!busy)$('dailyRecordDialog').close()});
  }
  globalThis.GrowDaily=Object.freeze({init,open});
})();

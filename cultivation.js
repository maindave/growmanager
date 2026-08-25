(() => {
  'use strict';

  const M=()=>globalThis.CultivoModels;
  const esc=value=>{const node=document.createElement('div');node.textContent=String(value??'');return node.innerHTML};
  const date=value=>value?new Intl.DateTimeFormat('es-AR').format(new Date(`${value}T12:00:00`)):'Sin definir';
  let root,active=null,cultivations=[],spaces=[],lots=[];

  function message(text,type='success'){const node=root.querySelector('#cultivationMessage');node.textContent=text;node.className=`message show ${type}`}
  function clearMessage(){const node=root.querySelector('#cultivationMessage');node.textContent='';node.className='message'}
  function stageOptions(selected='vegetative'){return M().LOT_STAGES.map(code=>`<option value="${code}" ${code===selected?'selected':''}>${M().LOT_STAGE_LABELS[code]}</option>`).join('')}
  function statusLabel(value){return M().CULTIVATION_STATUS_LABELS[value]||value}

  function render(){
    const activeBlock=active?`<section class="panel cultivation-hero"><div><p class="eyebrow">CULTIVO ACTIVO</p><h3>${esc(active.name)}</h3><p>${date(active.startDate)} · <span class="status-chip active">Activo</span></p>${active.notes?`<p class="card-copy">${esc(active.notes)}</p>`:''}</div><button class="secondary-button" data-action="edit-cultivation" data-id="${active.id}">Editar cultivo</button></section>`:`<section class="panel empty-state"><span class="empty-icon">✦</span><h3>Todavía no hay un cultivo activo</h3><p>Creá tu primer cultivo para organizar espacios y lotes.</p><button class="primary-button" data-action="new-cultivation">Crear cultivo</button></section>`;
    const spacesBlock=active?`<section class="cultivation-section"><div class="section-heading"><div><p class="eyebrow">ORGANIZACIÓN</p><h3>Espacios y lotes</h3></div><button class="primary-button compact" data-action="new-space">+ Nuevo espacio</button></div><div class="space-list">${spaces.length?spaces.map(renderSpace).join(''):'<div class="panel empty-state compact-empty"><p>Todavía no agregaste espacios a este cultivo.</p><button class="secondary-button" data-action="new-space">Agregar espacio</button></div>'}</div></section>`:'';
    const history=cultivations.filter(item=>item.id!==active?.id);
    root.innerHTML=`<div id="cultivationMessage" class="message"></div>${activeBlock}${spacesBlock}<section class="panel history-panel"><details ${!active?'open':''}><summary>Cultivos anteriores <span>${history.length}</span></summary><div class="history-list">${history.length?history.map(item=>`<article><div><strong>${esc(item.name)}</strong><small>${date(item.startDate)} · ${statusLabel(item.status)}</small></div><div class="inline-actions"><button class="text-button" data-action="edit-cultivation" data-id="${item.id}">Editar</button>${item.status!=='archived'?`<button class="text-button" data-action="activate-cultivation" data-id="${item.id}">Activar</button>`:''}</div></article>`).join(''):'<p class="field-help">No hay cultivos históricos.</p>'}</div></details></section><dialog id="cultivationDialog" class="app-dialog"></dialog>`;
  }

  function renderSpace(space){
    const spaceLots=lots.filter(lot=>lot.spaceId===space.id);
    return `<article class="panel space-card ${space.active?'':'is-inactive'}"><div class="space-heading"><div><p class="eyebrow">ESPACIO ${space.active?'ACTIVO':'INACTIVO'}</p><h3>${esc(space.name)}</h3>${space.description?`<p class="card-copy">${esc(space.description)}</p>`:''}</div><div class="inline-actions"><button class="text-button" data-action="edit-space" data-id="${space.id}">Editar</button><button class="text-button" data-action="toggle-space" data-id="${space.id}">${space.active?'Desactivar':'Activar'}</button></div></div><div class="lot-list">${spaceLots.length?spaceLots.map(lot=>`<article class="lot-card ${lot.active?'':'is-inactive'}"><div><strong>${esc(lot.name)}</strong><span class="stage-chip">${M().LOT_STAGE_LABELS[lot.stage]||lot.stage}</span>${lot.description?`<p>${esc(lot.description)}</p>`:''}</div><div class="inline-actions"><button class="text-button" data-action="edit-lot" data-id="${lot.id}">Editar</button><button class="text-button" data-action="toggle-lot" data-id="${lot.id}">${lot.active?'Desactivar':'Activar'}</button></div></article>`).join(''):'<p class="field-help">Este espacio todavía no tiene lotes.</p>'}</div><button class="secondary-button compact" data-action="new-lot" data-space="${space.id}">+ Nuevo lote</button></article>`;
  }

  function openDialog(kind,id=null,spaceId=null){
    const dialog=root.querySelector('#cultivationDialog');
    if(kind==='cultivation'){
      const item=cultivations.find(value=>value.id===id)||{};
      dialog.innerHTML=`<form method="dialog" class="dialog-form" data-form="cultivation" data-id="${id||''}"><div class="dialog-heading"><div><p class="eyebrow">${id?'EDITAR':'NUEVO'}</p><h3>Cultivo</h3></div><button class="icon-button" value="cancel" aria-label="Cerrar">×</button></div><label>Nombre<input name="name" value="${esc(item.name||'')}" maxlength="80" required></label><div class="form-grid two"><label>Fecha de inicio<input name="startDate" type="date" value="${item.startDate||''}" required></label><label>Fecha de finalización<input name="endDate" type="date" value="${item.endDate||''}"></label></div><label>Estado<select name="status">${M().CULTIVATION_STATUSES.map(code=>`<option value="${code}" ${code===(item.status||'active')?'selected':''}>${statusLabel(code)}</option>`).join('')}</select></label><label>Notas<textarea name="notes" rows="3">${esc(item.notes||'')}</textarea></label><div class="form-actions split"><button class="secondary-button" value="cancel">Cancelar</button><button class="primary-button" type="submit" value="default">Guardar</button></div></form>`;
    }else if(kind==='space'){
      const item=spaces.find(value=>value.id===id)||{};
      dialog.innerHTML=`<form method="dialog" class="dialog-form" data-form="space" data-id="${id||''}"><div class="dialog-heading"><h3>${id?'Editar':'Nuevo'} espacio</h3><button class="icon-button" value="cancel" aria-label="Cerrar">×</button></div><label>Nombre<input name="name" value="${esc(item.name||'')}" maxlength="60" required></label><label>Descripción<textarea name="description" rows="3">${esc(item.description||'')}</textarea></label><label class="check-field"><input name="active" type="checkbox" ${item.active!==false?'checked':''}> Espacio activo</label><div class="form-actions split"><button class="secondary-button" value="cancel">Cancelar</button><button class="primary-button" type="submit" value="default">Guardar</button></div></form>`;
    }else{
      const item=lots.find(value=>value.id===id)||{};
      dialog.innerHTML=`<form method="dialog" class="dialog-form" data-form="lot" data-id="${id||''}" data-space="${spaceId||item.spaceId}"><div class="dialog-heading"><h3>${id?'Editar':'Nuevo'} lote</h3><button class="icon-button" value="cancel" aria-label="Cerrar">×</button></div><label>Nombre<input name="name" value="${esc(item.name||'')}" maxlength="70" required></label><label>Descripción<textarea name="description" rows="3">${esc(item.description||'')}</textarea></label><label>Etapa<select name="stage">${stageOptions(item.stage)}</select></label><label class="check-field"><input name="active" type="checkbox" ${item.active!==false?'checked':''}> Lote activo</label><div class="form-actions split"><button class="secondary-button" value="cancel">Cancelar</button><button class="primary-button" type="submit" value="default">Guardar</button></div></form>`;
    }
    dialog.showModal();
  }

  async function load(){
    [cultivations,spaces,lots]=await Promise.all([CultivoDB.getAll('cultivations'),CultivoDB.getAll('spaces'),CultivoDB.getAll('lots')]);
    active=cultivations.find(item=>item.status==='active')||null;
    spaces=spaces.filter(item=>item.cultivationId===active?.id).sort((a,b)=>a.name.localeCompare(b.name,'es'));
    lots=lots.filter(item=>item.cultivationId===active?.id).sort((a,b)=>a.name.localeCompare(b.name,'es'));
    render();
  }

  async function submit(event){
    const form=event.target.closest('[data-form]');if(!form)return;event.preventDefault();
    const data=Object.fromEntries(new FormData(form));const id=form.dataset.id||null;
    try{
      if(form.dataset.form==='cultivation'){
        const value=M().assertValid(M().validateCultivation({...data,notes:M().normalizeText(data.notes),endDate:data.endDate||null}));
        const saved=id?await CultivoDB.update('cultivations',id,value):await CultivoDB.create('cultivations',value);
        if(value.status==='active')await CultivoDB.activateCultivation(saved.id);
      }else if(form.dataset.form==='space'){
        const value=M().assertValid(M().validateSpace({...data,cultivationId:active.id,description:M().normalizeText(data.description),active:data.active==='on'}));
        if(id)await CultivoDB.update('spaces',id,value);else await CultivoDB.create('spaces',value);
      }else{
        const value=M().assertValid(M().validateLot({...data,cultivationId:active.id,spaceId:form.dataset.space,description:M().normalizeText(data.description),active:data.active==='on'}));
        if(id)await CultivoDB.update('lots',id,value);else await CultivoDB.create('lots',value);
      }
      form.closest('dialog').close();await load();message('Cambios guardados correctamente.');
    }catch(error){message(error.message,'error')}
  }

  async function click(event){
    const button=event.target.closest('[data-action]');if(!button)return;const action=button.dataset.action;clearMessage();
    try{
      if(action==='new-cultivation')openDialog('cultivation');
      if(action==='edit-cultivation')openDialog('cultivation',button.dataset.id);
      if(action==='new-space')openDialog('space');
      if(action==='edit-space')openDialog('space',button.dataset.id);
      if(action==='new-lot')openDialog('lot',null,button.dataset.space);
      if(action==='edit-lot')openDialog('lot',button.dataset.id);
      if(action==='toggle-space'){const item=spaces.find(v=>v.id===button.dataset.id);await CultivoDB.setActive('spaces',item.id,!item.active);await load();message(`Espacio ${item.active?'desactivado':'activado'}.`)}
      if(action==='toggle-lot'){const item=lots.find(v=>v.id===button.dataset.id);await CultivoDB.setActive('lots',item.id,!item.active);await load();message(`Lote ${item.active?'desactivado':'activado'}.`)}
      if(action==='activate-cultivation'){await CultivoDB.activateCultivation(button.dataset.id);await load();message('Cultivo activado. El cultivo anterior quedó finalizado.')}
    }catch(error){message(error.message,'error')}
  }

  function init(){root=document.getElementById('cultivationRoot');root.addEventListener('click',click);root.addEventListener('submit',submit)}
  globalThis.Cultivation=Object.freeze({init,load});
})();

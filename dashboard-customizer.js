(()=>{'use strict';
const DEFINITIONS={recent:'Actividad reciente',environment:'Temperatura y humedad',cultivations:'Cultivos concurrentes',agenda:'Próximos eventos',systems:'Luces y climatización',telemetry:'Datos del dispositivo',energy:'Consumo de energía'};
const key=()=>`growmanager.dashboard.widgets.${CultivoRepository.getCurrentWorkspace()?.id||'default'}`;
function current(){try{return{...Object.fromEntries(Object.keys(DEFINITIONS).map(name=>[name,true])),...JSON.parse(localStorage.getItem(key())||'{}')}}catch{return Object.fromEntries(Object.keys(DEFINITIONS).map(name=>[name,true]))}}
function apply(){const state=current();document.querySelectorAll('[data-dashboard-widget]').forEach(node=>node.hidden=state[node.dataset.dashboardWidget]===false)}
function choices(){const state=current(),root=document.getElementById('dashboardWidgetChoices');root.innerHTML=Object.entries(DEFINITIONS).filter(([name])=>!['telemetry','energy'].includes(name)&&(globalThis.GrowDevice?.isEnabled()||!['environment','systems'].includes(name))).map(([name,label])=>`<label><input type="checkbox" data-widget-choice="${name}" ${state[name]!==false?'checked':''}><span><strong>${label}</strong><small>${state[name]!==false?'Visible':'Oculto'}</small></span></label>`).join('')}
function save(){const state=current();document.querySelectorAll('[data-widget-choice]').forEach(input=>state[input.dataset.widgetChoice]=input.checked);localStorage.setItem(key(),JSON.stringify(state));apply();choices()}
function init(){const open=document.getElementById('customizeDashboard'),dialog=document.getElementById('dashboardCustomizerDialog');if(!open||!dialog)return;open.addEventListener('click',()=>{choices();dialog.showModal()});dialog.addEventListener('change',save);document.getElementById('dashboardRestoreDefaults').addEventListener('click',()=>{localStorage.removeItem(key());apply();choices()});addEventListener('grow-workspace-changed',apply);apply()}
addEventListener('DOMContentLoaded',init);
})();

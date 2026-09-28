(()=>{'use strict';
const prefix='growmanager:section:';
function key(node){return prefix+(node.dataset.collapseKey||node.id||'section')}
function stored(node){try{const value=localStorage.getItem(key(node));return value===null?null:value==='open'}catch{return null}}
function setState(node,open,persist=true){node.classList.toggle('is-collapsed',!open);const button=node.querySelector(':scope > [data-collapse-header] .section-collapse-button,:scope > .section-collapse-button');if(button){button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'Contraer sección':'Abrir sección');button.title=open?'Contraer':'Abrir';button.innerHTML=`<span>${open?'Ocultar':'Mostrar'}</span><i aria-hidden="true">⌄</i>`}if(persist)try{localStorage.setItem(key(node),open?'open':'closed')}catch{}}
function enhance(node){if(node.dataset.collapseReady)return;const header=node.querySelector(':scope > [data-collapse-header]')||node.querySelector(':scope > .section-heading')||node.querySelector(':scope > .space-heading');if(!header)return;node.dataset.collapseReady='true';header.dataset.collapseHeader='';const button=document.createElement('button');button.type='button';button.className='section-collapse-button';button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();setState(node,node.classList.contains('is-collapsed'))});header.append(button);[...node.children].forEach(child=>{if(child!==header)child.dataset.collapseContent=''});const saved=stored(node);setState(node,saved??node.dataset.defaultOpen==='true',false)}
function scan(root=document){root.querySelectorAll?.('[data-collapsible]').forEach(enhance)}
function init(){scan();new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType!==1)return;if(node.matches?.('[data-collapsible]'))enhance(node);scan(node)}))).observe(document.body,{childList:true,subtree:true})}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
globalThis.UiSections=Object.freeze({scan,setState});
})();

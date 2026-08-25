(() => {
  'use strict';

  const DB_NAME = 'cultivo-energy-db';
  const STORE = 'relayEvents';
  const CONFIG_KEY = 'flora.energyConfig.v1';
  const DEFAULT_CONFIG = { tariff:150, devices:[{relayId:1,name:'LED Flora 1',watts:350},{relayId:2,name:'Extractor',watts:45},{relayId:3,name:'Calefactor',watts:1000},{relayId:4,name:'Libre',watts:0}] };
  let db;
  let initialized = false;
  let previousStates = new Map();
  let offlineAt = null;
  let config = loadEnergyConfig();

  function loadEnergyConfig(){try{const saved=JSON.parse(localStorage.getItem(CONFIG_KEY));if(!saved)return structuredClone(DEFAULT_CONFIG);return{tariff:Math.max(0,Number(saved.tariff)||0),devices:DEFAULT_CONFIG.devices.map(base=>{const item=saved.devices?.find(d=>Number(d.relayId)===base.relayId);return{relayId:base.relayId,name:String(item?.name||base.name),watts:Math.max(0,Number(item?.watts)||0)}})}}catch{return structuredClone(DEFAULT_CONFIG)}}
  function saveEnergyConfig(next){config={tariff:Math.max(0,Number(next.tariff)||0),devices:DEFAULT_CONFIG.devices.map(base=>{const item=next.devices.find(d=>Number(d.relayId)===base.relayId);return{relayId:base.relayId,name:String(item?.name||`Relay ${base.relayId}`).trim(),watts:Math.max(0,Number(item?.watts)||0)}})};localStorage.setItem(CONFIG_KEY,JSON.stringify(config));return getConfig()}
  function getConfig(){return JSON.parse(JSON.stringify(config))}

  function initEnergyDB(){return new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>{const store=request.result.createObjectStore(STORE,{keyPath:'id',autoIncrement:true});store.createIndex('timestamp','timestamp')};request.onsuccess=()=>{db=request.result;resolve(db)};request.onerror=()=>reject(request.error)})}
  function transaction(mode='readonly'){if(!db)throw new Error('La base de energía no está inicializada.');return db.transaction(STORE,mode).objectStore(STORE)}
  function addRelayEvent(relayId,state,timestamp=Date.now(),extra={}){return new Promise((resolve,reject)=>{const request=transaction('readwrite').add({relayId:Number(relayId),state:Boolean(state),timestamp:Number(timestamp),...extra});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
  function getRelayEvents(){return new Promise((resolve,reject)=>{const request=transaction().getAll();request.onsuccess=()=>resolve(request.result.sort((a,b)=>a.timestamp-b.timestamp||a.id-b.id));request.onerror=()=>reject(request.error)})}
  async function getEnergyEventsForPeriod(start,end=Date.now()){const all=await getRelayEvents();const before=new Map();const within=[];for(const event of all){if(event.timestamp<=start)before.set(event.relayId,event);else if(event.timestamp<=end)within.push(event)}return[...before.values(),...within].sort((a,b)=>a.timestamp-b.timestamp||a.id-b.id)}
  function clearHistory(){return new Promise((resolve,reject)=>{const request=transaction('readwrite').clear();request.onsuccess=()=>{initialized=false;previousStates=new Map();offlineAt=null;resolve()};request.onerror=()=>reject(request.error)})}

  async function trackStatus(relays){const now=Date.now();const current=new Map(relays.map(r=>[Number(r.id),Boolean(r.state)]));if(!initialized){const events=await getRelayEvents();for(const [id,state] of current){const latest=events.filter(e=>e.relayId===id).at(-1);if(!latest||latest.state!==state){/* Baseline de seguimiento, no se interpreta como un cambio físico observado. */await addRelayEvent(id,state,now,{baseline:true})}}previousStates=current;initialized=true;offlineAt=null;return}
    if(offlineAt!==null){for(const [id,wasOn] of previousStates){if(wasOn)await addRelayEvent(id,false,offlineAt,{trackingBoundary:true})}for(const [id,state] of current)await addRelayEvent(id,state,now,{reconnection:true});offlineAt=null;previousStates=current;return}
    for(const [id,state] of current){if(previousStates.get(id)!==state)await addRelayEvent(id,state,now)}previousStates=current
  }
  function markOffline(){if(initialized&&offlineAt===null)offlineAt=Date.now()}

  // V1 usa la potencia configurada actualmente también para eventos históricos.
  function calculateEnergy(events,start,end,powerByRelay){let totalWh=0;const ids=new Set([...events.map(e=>e.relayId),...Object.keys(powerByRelay).map(Number)]);for(const id of ids){let on=false;let onAt=null;for(const event of events.filter(e=>e.relayId===id).sort((a,b)=>a.timestamp-b.timestamp)){if(event.timestamp<=start){on=event.state;onAt=on?start:null;continue}if(event.timestamp>end)break;if(event.state&&!on){on=true;onAt=Math.max(start,event.timestamp)}else if(!event.state&&on){totalWh+=(Math.max(0,event.timestamp-onAt)/3600000)*(Number(powerByRelay[id])||0);on=false;onAt=null}}if(on&&onAt!==null)totalWh+=(Math.max(0,end-onAt)/3600000)*(Number(powerByRelay[id])||0)}return totalWh/1000}
  async function getSummary(relays=[],online=true){const now=Date.now();const today=new Date(now);today.setHours(0,0,0,0);const month=new Date(today.getFullYear(),today.getMonth(),1);const events=await getRelayEvents();const power=Object.fromEntries(config.devices.map(d=>[d.relayId,d.watts]));const effectiveEnd=!online&&offlineAt!==null?offlineAt:now;const todayKwh=calculateEnergy(events,today.getTime(),effectiveEnd,power);const monthKwh=calculateEnergy(events,month.getTime(),effectiveEnd,power);const states=new Map(relays.map(r=>[Number(r.id),Boolean(r.state)]));const instantW=online?config.devices.reduce((sum,d)=>sum+(states.get(d.relayId)?d.watts:0),0):0;return{instantW,todayKwh,monthKwh,todayCost:todayKwh*config.tariff,monthCost:monthKwh*config.tariff}}

  window.Energy={initEnergyDB,addRelayEvent,getRelayEvents,getEnergyEventsForPeriod,clearHistory,trackStatus,markOffline,getSummary,getConfig,saveEnergyConfig,calculateEnergy};
})();

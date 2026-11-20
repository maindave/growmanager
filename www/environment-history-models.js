(()=>{'use strict';
const SAMPLE=300000;
const baseKey=value=>String(value||'primary-wemos').trim().toLowerCase().replace(/[^a-z0-9.:-]/g,'-').slice(0,80);
const sensorKey=(value,id)=>`${baseKey(value).slice(0,70)}:sensor-${Number(id)}`;
function sensorRow(row,id){
 const payload=row.payload||{},sensors=payload.sensors;
 if(Array.isArray(sensors)&&sensors.length){
  const sensor=sensors.find(s=>Number(s.room)===Number(id));
  if(!sensor||sensor.fresh!==true||!EnvironmentModels.valid(sensor.temperature,sensor.humidity))return null;
  return{...row,temperature:sensor.temperature,humidity:sensor.humidity,payload:{...payload,dht:{fresh:true}}};
 }
 // Older snapshots and primary readings contain sensor 1 only.
 if(Number(id)!==1||payload.dht?.fresh===false||!EnvironmentModels.valid(row.temperature,row.humidity))return null;
 return row;
}
function merge(...lists){const rows=new Map();for(const row of lists.flat()){
 if(!row||!Number.isFinite(row.at)||!EnvironmentModels.valid(row.temperature,row.humidity))continue;
 const key=Math.floor(row.at/SAMPLE),prior=rows.get(key);
 if(!prior||row.at>=prior.at||(!prior.payload&&row.payload))rows.set(key,row);
 }return [...rows.values()].sort((a,b)=>a.at-b.at);}
globalThis.EnvironmentHistoryModels=Object.freeze({baseKey,sensorKey,sensorRow,merge});
})();

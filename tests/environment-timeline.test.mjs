import assert from 'node:assert/strict';
import '../environment-models.js';import '../environment-timeline-models.js';
const m=globalThis.EnvironmentTimelineModels,previous={bootId:1,outputs:0,sequence:1};
const event={bootId:1,outputs:2,sequence:2,alarms:0,snapshot:{event:{temperature:25,humidity:50,vpdMin:1,vpdMax:1.5,state:2,roles:1<<3,automatic:2,testing:0,enabled:true}}};
let d=m.eventDetails(event,previous);assert.equal(d.actions[0].label,'Ventilación 2');assert.equal(d.actions[0].mode,'Automático');assert(d.value>1.5);assert.equal(d.min,1);
event.snapshot.event.testing=2;assert.equal(m.eventDetails(event,previous).actions[0].mode,'Prueba temporal');
event.bootId=2;assert.equal(m.eventDetails(event,previous).actions.length,0,'A reboot is a baseline, not an inferred activation');
event.bootId=1;event.sequence=4;assert.equal(m.eventDetails(event,previous).gap,true);
console.log('Historical VPD targets, action origin and incomplete event sequences: passed');

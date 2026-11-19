const {chromium}=require('playwright');
const fs=require('fs'),assert=require('node:assert/strict'),path=require('path'),root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.setDefaultTimeout(8000);
 page.on('pageerror',e=>errors.push(e.message));
 let html=fs.readFileSync(root+'/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
 await page.route('http://rooms.test/**',r=>r.fulfill({contentType:'text/html',body:html}));await page.goto('http://rooms.test/');
 for(const file of ['style.css','ui-foundations.css','environment.css'])await page.addStyleTag({content:fs.readFileSync(root+'/'+file,'utf8')});
 await page.evaluate(()=>{
 document.documentElement.dataset.localMode='true';document.documentElement.dataset.connect='true';document.getElementById('appLayout').hidden=false;document.getElementById('authGate').hidden=true;
 window.currentWorkspace='project-a';window.CultivoRepository={getCurrentWorkspace:()=>({id:currentWorkspace})};window.GrowAuth={isLocal:()=>true};window.GrowDevice={address:()=> '192.168.1.25'};
 document.querySelector('[data-view-panel="integrations"]').classList.add('active');
 });
 for(const file of ['environment-models.js','equipment-rooms.js'])await page.addScriptTag({content:fs.readFileSync(root+'/'+file,'utf8')});
 await page.evaluate(()=>EquipmentRooms.init());
 await page.locator('#addEquipmentRoom').click();await page.locator('[data-group-name]').fill('Mi sala A');
 await page.locator('[data-group-sensor="2"]').check();await page.locator('[data-group-relay="4"]').check();
 await page.locator('#addEquipmentRoom').click();await page.locator('[data-group-name]').nth(1).fill('Mi sala B');
 await page.locator('[data-group-index="1"] [data-group-sensor="1"]').check();
 await page.locator('#equipmentRoomsForm button[type="submit"]').click();assert.match(await page.locator('#equipmentRoomsMessage').innerText(),/guardadas/);
 await page.evaluate(()=>{
 window.fixture={sensors:[{room:1,temperature:20,humidity:50,fresh:true},{room:2,temperature:29,humidity:70,fresh:true}],relays:[{id:4,state:true}]};
 EquipmentRooms.update({local:fixture,localAt:Date.now(),remote:[]});
 });
 assert.match(await page.locator('[data-equipment-room]').nth(0).innerText(),/Mi sala A[\s\S]*29,0[\s\S]*Encendido/);
 assert.match(await page.locator('[data-equipment-room]').nth(1).innerText(),/Mi sala B[\s\S]*20,0/);
 assert.equal(await page.locator('#legacyEnvironmentReadings').isHidden(),true);
 if(process.env.ROOM_SCREENSHOT)await page.locator('.today-environment').screenshot({path:process.env.ROOM_SCREENSHOT});
 await page.locator('[data-group-index="1"] [data-group-sensor="2"]').check();await page.locator('#equipmentRoomsForm button[type="submit"]').click();assert.match(await page.locator('#equipmentRoomsMessage').innerText(),/una sola sala/);
 await page.evaluate(()=>{fixture.sensors[1].fresh=false;EquipmentRooms.update({local:fixture,localAt:Date.now(),remote:[]});});
 assert.match(await page.locator('[data-equipment-room]').nth(0).innerText(),/sin confirmar actualidad/);assert.match(await page.locator('[data-equipment-room]').nth(0).innerText(),/29,0/);
 await page.evaluate(()=>{EquipmentRooms.update({local:fixture,localAt:Date.now()-20000,remote:[]});});
 assert.match(await page.locator('[data-equipment-room]').nth(1).innerText(),/conexión sin actualizar/);
 assert.match(await page.locator('[data-equipment-room]').nth(1).innerText(),/20,0/);
 await page.evaluate(()=>{fixture.sensors[1]={room:2,pin:'D5',temperature:null,humidity:null,fresh:false,readStatus:'read_failed',lastValid:{temperature:28,humidity:61,ageSeconds:35}};EquipmentRooms.update({local:fixture,localAt:Date.now(),remote:[]});});
 assert.match(await page.locator('[data-equipment-room]').nth(0).innerText(),/Última lectura válida[\s\S]*35 s[\s\S]*28,0/);
 await page.evaluate(()=>{fixture.sensors[1]={room:2,temperature:-30,humidity:0,fresh:false,readStatus:'out_of_range'};EquipmentRooms.update({local:fixture,localAt:Date.now(),remote:[]});});
 assert.match(await page.locator('[data-equipment-room]').nth(0).innerText(),/fuera de rango[\s\S]*-30,0/);
 await page.evaluate(()=>{fixture.sensors[1]={room:2,temperature:null,humidity:null,fresh:false,lastValid:null};EquipmentRooms.update({local:fixture,localAt:Date.now(),remote:[]});});
 assert.match(await page.locator('[data-equipment-room]').nth(0).innerText(),/Sin lectura recibida/);
 // Reload the configuration and verify persisted assignments, rather than the invalid draft.
 await page.evaluate(()=>window.dispatchEvent(new Event('grow-workspace-changed')));
 assert.equal(await page.locator('[data-group-name]').nth(0).inputValue(),'Mi sala A');
 assert.equal(await page.locator('[data-group-index="1"] [data-group-sensor="2"]').isChecked(),false);
 // Another project must not inherit either group's assignments.
 await page.evaluate(()=>{currentWorkspace='project-b';window.dispatchEvent(new Event('grow-workspace-changed'));});
 assert.equal(await page.locator('[data-group-name]').count(),0);
 assert.deepEqual(errors,[]);console.log('Equipment rooms: custom names, assignment isolation, persistence, duplicate rejection and stale/invalid readings passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const html=fs.readFileSync(root+'/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
 await page.route('http://environment.test/**',r=>r.fulfill({contentType:'text/html',body:html}));await page.goto('http://environment.test/');
 await page.evaluate(()=>{
  window.calls=[];window.fixture={device:'Wemos',temperature:null,humidity:null,dht:{fresh:false},sensors:[{room:1,pin:'D15',fresh:false},{room:2,pin:'D13',fresh:true,temperature:24.5,humidity:47.5}],relays:[],environment:{roomId:'vege',enabled:false,sensorId:1,humidityMin:55,humidityMax:70,heaterSensorProtectionEnabled:false,cloud:{configured:true}}};
  window.CultivoRepository={getCurrentWorkspace:()=>({id:'project',role:'owner'}),getAll:async t=>t==='rooms'?[{id:'vege',name:'Sala Vege'},{id:'flora',name:'Sala Flora'}]:[]};
  window.GrowSupabase={client:{rpc:async(name,args)=>{calls.push({type:'rpc',name,args});return {data:'test-token'}},from:()=>({select(){return this},eq(){return this},order(){return this},limit(){return this},then(resolve){resolve({data:[]})}})}};
  window.EquipmentRooms={init(){},update(){},sensorForRoom:r=>r.name==='Sala Flora'?2:1,sensorLabel:id=>'Sensor '+id};
  window.GrowDevice={address:()=> '192.168.1.25',renderRemoteRelays(){},post:async(path,v)=>{calls.push({type:'post',path,values:{...v}});if(v.enabled==='1'&&v.sensorId!=='2'){const e=new Error('environment_sensor_unavailable');e.code=e.message;throw e;}fixture.environment={...fixture.environment,...v,enabled:v.enabled==='1',sensorId:Number(v.sensorId)};},postForm:async()=>{},refresh:async()=>GrowEnvironmentUI.update(fixture)};
 });
 for(const f of ['environment-models.js','environment.js'])await page.addScriptTag({content:fs.readFileSync(root+'/'+f,'utf8')});
 await page.evaluate(async()=>{GrowEnvironmentUI.init();GrowEnvironmentUI.update(fixture);await GrowEnvironmentUI.loadRooms();GrowEnvironmentUI.openProtection();});
 await page.locator('#environmentRoom').selectOption('flora');
 assert.equal(await page.locator('[name=sensorId]').inputValue(),'2');
 assert.match(await page.locator('#environmentSensorHelp').innerText(),/lecturas actuales/);
 await page.locator('[name=enabled]').check();
 await page.locator('#environmentForm .form-actions [type=submit]').click();
 await page.waitForFunction(()=>document.querySelector('#environmentFormMessage').textContent.includes('Configuración guardada'));
 const calls=await page.evaluate(()=>window.calls);assert.equal(calls.filter(c=>c.type==='post').length,1);assert.equal(calls.find(c=>c.type==='post').values.sensorId,'2');assert.equal(calls.find(c=>c.type==='post').values.enabled,'1');
 assert.deepEqual(errors,[]);console.log('Real settings form selects Flora sensor 2 and saves despite sensor 1 being offline');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});

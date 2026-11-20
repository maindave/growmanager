const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict'),path=require('path'),root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 const html=fs.readFileSync(root+'/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
 await page.route('http://history.test/**',r=>r.fulfill({contentType:'text/html',body:html}));await page.goto('http://history.test/');
 for(const file of ['style.css','ui-foundations.css','environment.css'])await page.addStyleTag({content:fs.readFileSync(root+'/'+file,'utf8')});
 await page.evaluate(()=>{
 window.workspaceId='project';window.saved=[];window.queries=[];window.failRemote=false;
 const env={vpdMin:.8,vpdMax:1.2},now=Date.now();
 const sample=(at,t1,t2)=>({at,temperature:t1,humidity:60,payload:{temperature:t1,humidity:60,dht:{fresh:t1!==null},environment:env,sensors:[{room:1,temperature:t1,humidity:60,fresh:t1!==null},{room:2,temperature:t2,humidity:50,fresh:true}]}});
 window.samples=[sample(now-20*3600000,null,30),sample(now-10*60000,21,29)];
 window.CultivoRepository={getCurrentWorkspace:()=>({id:workspaceId}),saveEnvironmentReading:async r=>saved.push(r),getEnvironmentReadings:async device=>{queries.push(device);if(failRemote)throw Error('offline');return device==='device'?[{at:now-30*60000,temperature:10,humidity:60}]:[]},getEnvironmentSamples:async()=>samples,getEnvironmentEvents:async()=>[]};
 document.getElementById('appLayout').hidden=false;document.getElementById('authGate').hidden=true;
 });
 for(const file of ['environment-models.js','environment-history-models.js','environment-timeline-models.js','environment-history.js'])await page.addScriptTag({content:fs.readFileSync(root+'/'+file,'utf8')});
 assert.equal(await page.evaluate(()=>EnvironmentHistory.track({temperature:null,humidity:null,dht:{fresh:false},environment:{vpdMin:.8,vpdMax:1.2},sensors:[{room:1,temperature:null,humidity:null,fresh:false},{room:2,temperature:27,humidity:60,fresh:true}]},'device')),true);
 assert.equal(await page.evaluate(()=>saved[0].deviceKey),'device:sensor-2');
 assert.equal(await page.evaluate(()=>EnvironmentHistory.track({sensors:[{room:2,temperature:28,humidity:60,fresh:true}]},'device')),false);
 await page.evaluate(()=>EnvironmentHistory.open('temperature','device',{sensorId:2,roomId:'room',roomName:'Flora',relayIds:[4]}));
 assert.equal(await page.locator('#environmentHistoryTitle').innerText(),'Temperatura · Flora');
 assert.match(await page.locator('#environmentHistoryStats').innerText(),/27\.0[\s\S]*30\.0/);
 assert.equal(await page.locator('#environmentHistoryChart svg').count(),1);
 assert.equal(await page.evaluate(()=>queries.includes('device')),false,'Sensor 2 must not load primary sensor history');
 await page.locator('#environmentHistoryPeriod').selectOption('6');
 assert.match(await page.locator('#environmentHistoryStats').innerText(),/27\.0[\s\S]*29\.0/);
 assert.doesNotMatch(await page.locator('#environmentHistoryStats').innerText(),/30\.0/);
 await page.evaluate(()=>EnvironmentHistory.open('humidity','device',{sensorId:2,roomId:'room',roomName:'Flora'}));
 assert.match(await page.locator('#environmentHistoryStats').innerText(),/50\.0 %[\s\S]*60\.0 %/);
 await page.evaluate(()=>EnvironmentHistory.open('vpd','device',{sensorId:2,roomId:'room',roomName:'Flora'}));
 assert.equal(await page.locator('.environment-target-band').count(),3);assert.match(await page.locator('#environmentHistoryStats').innerText(),/kPa/);
 await page.evaluate(()=>EnvironmentHistory.open('temperature','device',{sensorId:1,roomId:'room',roomName:'Vege'}));
 assert.match(await page.locator('#environmentHistoryStats').innerText(),/10\.0[\s\S]*21\.0/);
 assert.doesNotMatch(await page.locator('#environmentHistoryStats').innerText(),/29\.0|30\.0/);
 await page.evaluate(()=>{failRemote=true;return EnvironmentHistory.open('temperature','device',{sensorId:2,roomId:'room',roomName:'Flora'});});
 assert.match(await page.locator('#environmentHistoryStats').innerText(),/27\.0/);assert.match(await page.locator('#environmentHistoryNote').innerText(),/offline/);
 await page.evaluate(()=>{workspaceId='other';return EnvironmentHistory.open('temperature','device',{sensorId:2,roomId:'room',roomName:'Other'});});
 assert.match(await page.locator('#environmentHistoryStats').innerText(),/Sin muestras/);
 assert.deepEqual(errors,[]);console.log('Dual history browser: independent sensor sampling, legacy sensor 1, no mixing, all metrics, period filters, VPD objectives and offline/project isolation passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

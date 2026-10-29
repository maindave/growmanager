const {chromium}=require('playwright');
const fs=require('fs'),assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const html=fs.readFileSync(root+'/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
 await page.route('http://ac.test/**',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.goto('http://ac.test/');
 await page.addStyleTag({content:fs.readFileSync(root+'/style.css','utf8')+'\n'+fs.readFileSync(root+'/ui-foundations.css','utf8')});
 await page.evaluate(()=>{
  document.getElementById('appLayout').hidden=false;document.getElementById('authGate').hidden=true;
  localStorage.setItem('growmanager.connect.enabled','true');
  window.CultivoRepository={getCurrentWorkspace:()=>null};window.GrowSupabase={client:{}};
  window.fixture={lightStartHour:18,lightStartMinute:0,lightDurationHours:12,tempMin:23,tempMax:27,acOffTemperature:24,acOnTemperature:26,ventilationMode:'combined',ventilationIntervalMinutes:10,ventilationDurationMinutes:2,ventilationEmergencyDurationMinutes:3};
  window.posts=[];
  window.fetch=async(url,options={})=>{
   if(options.method==='POST'){
    const values=Object.fromEntries(new URL(url).searchParams);posts.push(values);
    fixture.acOffTemperature=Number(values.acOff);fixture.acOnTemperature=Number(values.acOn);
    return {ok:true,text:async()=>JSON.stringify({ok:true})};
   }
   return {ok:true,text:async()=>JSON.stringify(fixture)};
  };
 });
 for(const file of ['today-models.js','today.js','environment-models.js'])await page.addScriptTag({content:fs.readFileSync(root+'/'+file,'utf8')});
 const app=fs.readFileSync(root+'/app.js','utf8').replace('  boot();','  globalThis.testAC={State,renderControl,renderDashboardRelays,loadConfig};');
 await page.addScriptTag({content:app});
 await page.evaluate(async()=>{
  testAC.State.online=true;
  testAC.State.functions={supportedFunctions:['ac','incubator']};
  testAC.renderControl([1,2,3,4].map(id=>({id,function:'none',mode:'manual',state:false})));
  testAC.renderDashboardRelays([{id:2,function:'ac',mode:'auto',state:true}]);
  await testAC.loadConfig();
 });
 assert.equal(await page.locator('option[value="ac"]:not(:disabled)').count(),4);
 assert.equal(await page.locator('#dashboardRelays .function-ac.is-on svg').count(),1);
 assert.match(await page.locator('#dashboardRelays').innerText(),/Encendida.*Automático/);
 await page.evaluate(()=>testAC.renderDashboardRelays([{id:2,function:'ac',mode:'auto',state:false}]));
 assert.equal(await page.locator('#dashboardRelays .function-ac.is-on').count(),0);
 assert.match(await page.locator('#dashboardRelays').innerText(),/Apagada/);
 await page.evaluate(()=>document.querySelectorAll('[data-view-panel]').forEach(n=>n.classList.toggle('active',n.dataset.viewPanel==='automation')));
 await page.locator('[name="acOff"]').fill('27');
 await page.locator('[name="acOn"]').fill('26');
 await page.locator('#automationForm').evaluate(f=>f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(await page.evaluate(()=>posts.length),0);
 assert.match(await page.locator('#automationMessage').innerText(),/apagado debe ser menor/);
 await page.locator('[name="acOff"]').fill('24.5');await page.locator('[name="acOn"]').fill('27');
 await page.locator('#automationForm').evaluate(f=>f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 await page.waitForFunction(()=>posts.length===1&&document.querySelector('#automationMessage').textContent.includes('guardadas'));
 assert.deepEqual(await page.evaluate(()=>({acOff:posts[0].acOff,acOn:posts[0].acOn})),{acOff:'24.5',acOn:'27'});
 await page.evaluate(async()=>{delete fixture.acOffTemperature;delete fixture.acOnTemperature;await testAC.loadConfig();testAC.State.functions={supportedFunctions:['incubator']};testAC.renderControl([{id:1,function:'none',mode:'manual'}]);});
 assert.equal(await page.locator('[name="acOn"]').isDisabled(),true);
 assert.equal(await page.locator('option[value="ac"]').evaluate(el=>el.disabled),true);
 assert.equal(await page.locator('#acFirmwareStatus').isVisible(),true);
 console.log('AC UI: all outlets, dashboard ON/OFF, input validation, save, old firmware passed.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});

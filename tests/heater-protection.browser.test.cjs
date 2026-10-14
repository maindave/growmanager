const {chromium}=require('playwright');
const fs=require('fs');const assert=require('assert/strict');
const root=require('path').resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 let html=fs.readFileSync(root+'/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
 await page.route('http://heater.test/**',route=>route.fulfill({contentType:'text/html',body:html}));
 await page.goto('http://heater.test/');
 await page.addStyleTag({content:fs.readFileSync(root+'/style.css','utf8')+'\n'+fs.readFileSync(root+'/environment.css','utf8')});
 await page.evaluate(()=>{
 document.getElementById('appLayout').hidden=false;document.getElementById('authGate').hidden=true;localStorage.setItem('growmanager.connect.enabled','true');
 window.GrowToday={icon:()=>'<svg viewBox="0 0 24 24"><path d="M12 2v20"/></svg>'};
 window.CultivoRepository={getCurrentWorkspace:()=>null};window.GrowSupabase={client:{}};
 document.documentElement.dataset.localMode='true';
 });
 await page.addScriptTag({content:fs.readFileSync(root+'/environment-models.js','utf8')});
 let app=fs.readFileSync(root+'/app.js','utf8').replace('  boot();','  globalThis.testHeaterUI={State,renderControl,syncControlState,renderDashboardRelays};');
 await page.addScriptTag({content:app});
 await page.addScriptTag({content:fs.readFileSync(root+'/environment.js','utf8')});
 await page.evaluate(()=>{
 const status={device:'Wemos',temperature:22,humidity:60,dht:{fresh:true},environment:{enabled:false,roomId:'',safety:[0,0,0,2],heaterSensorProtectionEnabled:true,heaterSensorTimeoutSeconds:300},relays:[{id:1,function:'light',mode:'manual',state:true},{id:2,function:'ventilation',mode:'manual',state:true},{id:3,function:'incubator',mode:'manual',state:true},{id:4,function:'heater',mode:'manual',state:false}]};
 window.fixture=status;testHeaterUI.State.status=status;testHeaterUI.State.online=true;
 testHeaterUI.renderControl(status.relays);testHeaterUI.renderDashboardRelays(status.relays);
 window.posts=[];window.failRearm=false;
 window.GrowDevice={address:()=>'',renderRemoteRelays:(relays,fresh,env)=>testHeaterUI.renderDashboardRelays(relays,env),post:async(path,values)=>{
 posts.push({path,values});if(path.endsWith('/acknowledge')){if(failRearm)throw Object.assign(new Error('unsafe_to_rearm'),{code:'unsafe_to_rearm'});fixture.environment.safety=[0,0,0,0];}
 if(path==='/api/environment'){fixture.environment.heaterSensorProtectionEnabled=values.heaterSensorProtectionEnabled==='1';fixture.environment.heaterSensorTimeoutSeconds=Number(values.heaterSensorTimeoutSeconds);if(!fixture.environment.heaterSensorProtectionEnabled)fixture.environment.safety=[0,0,0,0];}
 },refresh:async()=>{GrowEnvironmentUI.update(fixture);testHeaterUI.syncControlState(fixture.relays);}};
 GrowEnvironmentUI.init();GrowEnvironmentUI.update(status);
 document.querySelectorAll('[data-view-panel]').forEach(n=>n.classList.toggle('active',n.dataset.viewPanel==='control'));
 });
 assert.equal(await page.locator('#dashboardRelays .heater-block-dot').count(),1);
 assert.equal(await page.locator('[data-relay="4"] .heater-block-dot').isVisible(),true);
 assert.match(await page.locator('[data-relay="4"] .mode-pill').innerText(),/Bloqueada/);
 if(process.env.HEATER_SCREENSHOT){await page.locator('[data-relay="4"]').scrollIntoViewIfNeeded();await page.screenshot({path:process.env.HEATER_SCREENSHOT.replace(/\.png$/,'-control.png'),fullPage:true});}
 await page.locator('[data-action="heater-protection"]').click();
 assert.equal(await page.locator('[name="heaterSensorTimeoutMinutes"]').inputValue(),'5');
 assert.equal(await page.locator('[name="heaterSensorProtectionEnabled"]').isChecked(),true);
 if(process.env.HEATER_SCREENSHOT)await page.screenshot({path:process.env.HEATER_SCREENSHOT,fullPage:true});
 await page.evaluate(()=>{failRearm=true;});await page.locator('#ackEnvironment').click();
 assert.match(await page.locator('#environmentFormMessage').innerText(),/sensor/);
 await page.evaluate(()=>{failRearm=false;});await page.locator('#ackEnvironment').click();
 assert.match(await page.locator('#heaterProtectionStatus').innerText(),/Sin bloqueo/);
 await page.locator('[name="heaterSensorTimeoutMinutes"]').fill('10');
 await page.locator('[name="heaterSensorProtectionEnabled"]').uncheck();
 await page.getByRole('button',{name:'Guardar protección',exact:true}).click();
 assert.match(await page.locator('#environmentFormMessage').innerText(),/Configuración guardada/);
 const save=await page.evaluate(()=>posts.find(p=>p.path==='/api/environment'));
 assert.equal(save.values.heaterSensorTimeoutSeconds,'600');assert.equal(save.values.heaterSensorProtectionEnabled,'0');
 await page.locator('[data-environment-close]').click();
 await page.evaluate(()=>{fixture.relays[3].function='incubator';fixture.environment.safety[3]=2;testHeaterUI.renderControl(fixture.relays);testHeaterUI.renderDashboardRelays(fixture.relays);});
 assert.equal(await page.locator('#dashboardRelays .heater-block-dot').count(),0);
 assert.equal(await page.locator('[data-relay="4"] .heater-block-dot').isVisible(),false);
 assert.equal(await page.locator('[data-action="heater-protection"]').count(),0);
 console.log('Mobile browser: heater dot, other equipment unaffected, settings, rearm errors, timeout saving, disabling and reassignment passed.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

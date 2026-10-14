const {chromium}=require('playwright');
const fs=require('fs'),assert=require('assert/strict'),root=require('path').resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const html=fs.readFileSync(root+'/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
 await page.route('http://sensor.test/**',r=>r.fulfill({contentType:'text/html',body:html}));await page.goto('http://sensor.test/');
 for(const file of ['style.css','ui-foundations.css','environment.css'])await page.addStyleTag({content:fs.readFileSync(root+'/'+file,'utf8')});
 await page.evaluate(()=>{document.getElementById('appLayout').hidden=false;document.getElementById('authGate').hidden=true;localStorage.setItem('growmanager.connect.enabled','true');document.documentElement.dataset.localMode='true';document.documentElement.dataset.theme='light';window.CultivoRepository={getCurrentWorkspace:()=>null};window.GrowSupabase={client:{}};});
 for(const file of ['today.js','environment-models.js','environment.js'])await page.addScriptTag({content:fs.readFileSync(root+'/'+file,'utf8')});
 await page.addScriptTag({content:fs.readFileSync(root+'/app.js','utf8').replace('  boot();','')});
 await page.evaluate(()=>{
 window.fixture={temperature:27,humidity:60,dht:{fresh:true},environment:{roomId:'',enabled:false,tempMin:23,tempMax:27,humidityMin:55,humidityMax:70,vpdMin:.8,vpdMax:1.2,criticalCold:10,criticalHot:35,criticalHumidity:90,heaterSensorProtectionEnabled:true,heaterSensorTimeoutSeconds:300,safety:[0,0,0,0]},relays:[]};
 window.posts=[];window.historyClicks=[];
 window.EnvironmentHistory={open:(...args)=>historyClicks.push(args)};
 window.GrowDevice={address:()=>'',renderRemoteRelays:()=>{},post:async(path,values)=>{posts.push({path,values});if(values.humidityMin){fixture.environment.humidityMin=Number(values.humidityMin);fixture.environment.humidityMax=Number(values.humidityMax);}},refresh:async()=>GrowEnvironmentUI.update(fixture)};
 GrowEnvironmentUI.init();GrowEnvironmentUI.update(fixture);
 });
 const card=key=>page.locator(`[data-environment-metric="${key}"]`);
 assert.equal(await card('vpd').getAttribute('data-sensor-state'),'warning');assert.equal(await card('temperature').getAttribute('data-sensor-state'),'ok');
 assert.equal(await card('vpd').locator('.metric-icon svg').count(),1);
 const accent=await card('vpd').locator('.metric-icon svg').evaluate(el=>getComputedStyle(el).color);assert.equal(accent,'rgb(255, 98, 46)');
 await card('vpd').click();assert.equal(await page.evaluate(()=>historyClicks[0][0]),'vpd');
 for(const theme of ['light','dark'])for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:844});await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;},theme);
  const boxes=await page.locator('[data-environment-metric]').evaluateAll(cards=>cards.map(el=>({top:el.getBoundingClientRect().top,bg:getComputedStyle(el).backgroundColor})));assert.ok(boxes.every(b=>Math.abs(b.top-boxes[0].top)<=1.1),'Three readings must share a row: '+JSON.stringify({width,theme,boxes}));assert.notEqual(boxes[0].bg,boxes[2].bg,'State backgrounds must differ');
  const overflow=await page.locator('[data-environment-metric]').evaluateAll(cards=>cards.some(el=>el.scrollWidth>el.clientWidth+1));assert.equal(overflow,false,`Card overflow at ${width}, ${theme}`);
  if(process.env.SENSOR_SCREENSHOTS&&width===390)await page.locator('.today-environment').screenshot({path:`/tmp/sensor-cards-${theme}.png`});
 }
 await page.evaluate(()=>{fixture.temperature=36;fixture.humidity=95;GrowEnvironmentUI.update(fixture);});assert.equal(await card('temperature').getAttribute('data-sensor-state'),'critical');assert.equal(await card('humidity').getAttribute('data-sensor-state'),'critical');
 await page.evaluate(()=>{fixture.dht.fresh=false;GrowEnvironmentUI.update(fixture);});for(const key of ['temperature','humidity','vpd']){assert.equal(await card(key).getAttribute('data-sensor-state'),'unknown');}
 assert.equal(await page.locator('#temperature').innerText(),'—');
 await page.evaluate(()=>{fixture.temperature=25;fixture.humidity=65;fixture.dht.fresh=true;GrowEnvironmentUI.update(fixture);GrowEnvironmentUI.openProtection();});
 await page.locator('[name="humidityMax"]').fill('40');await page.getByRole('button',{name:'Guardar',exact:true}).click();assert.match(await page.locator('#environmentFormMessage').innerText(),/humedad máxima/);assert.equal(await page.evaluate(()=>posts.length),0);
 await page.locator('[name="humidityMin"]').fill('60');await page.locator('[name="humidityMax"]').fill('80');await page.getByRole('button',{name:'Guardar',exact:true}).click();assert.match(await page.locator('#environmentFormMessage').innerText(),/Configuración guardada/);
 assert.equal(await page.evaluate(()=>posts[0].values.humidityMin),'60');assert.equal(await page.evaluate(()=>posts[0].values.humidityMax),'80');
 assert.match(await card('humidity').locator('[data-sensor-target]').innerText(),/60–80/);
 assert.deepEqual(errors,[]);console.log('Sensor cards browser: color #FF622E, icons, states, history, responsive themes and humidity settings passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});

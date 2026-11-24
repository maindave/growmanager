const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict'),path=require('path'),root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}});page.setDefaultTimeout(8000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const html=fs.readFileSync(root+'/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
 await page.route('http://hardware.test/**',r=>r.fulfill({contentType:'text/html',body:html}));await page.goto('http://hardware.test/');
 await page.evaluate(()=>{document.getElementById('appLayout').hidden=false;document.getElementById('authGate').hidden=true;localStorage.setItem('growmanager.connect.enabled','true');window.Energy={getConfig:()=>({devices:[]})};window.Operations={resetConnection:()=>{}};window.GrowEnvironmentUI={update:()=>{},offline:()=>{}};});
 for(const file of ['style.css','ui-foundations.css','environment.css'])await page.addStyleTag({content:fs.readFileSync(root+'/'+file,'utf8')});
 await page.addScriptTag({content:fs.readFileSync(root+'/app.js','utf8').replace('  boot();','')});
 let configuredPins=null;
 await page.route('http://192.168.1.25/api/**',async route=>{
 const endpoint=new URL(route.request().url()).pathname;
 if(route.request().method()==='POST'){configuredPins=Object.fromEntries(new URL(route.request().url()).searchParams);return route.fulfill({contentType:'application/json',body:'{"ok":true,"restartRequired":true}'});}
 const sensors=[{room:1,type:'AM2301',pin:'D5',configurable:true,fresh:false,readCount:5,successCount:0,failureCount:5},{room:2,type:'AM2301',pin:'D3',configurable:true,fresh:true,readCount:5,successCount:5,failureCount:0}];
 const data=endpoint==='/api/hardware'?{sensors,configuredPins,relays:[{id:1,pin:'D4'},{id:2,pin:'D2'},{id:3,pin:'D6'},{id:4,pin:'D7'}],digitalPins:[3,1,16,5,4,14,12,13,0,2,15,13,12,14,4,5].map((gpio,i)=>({name:'D'+i,gpio,assignable:![0,10].includes(i),note:i>10?'Equivale a D'+({11:7,12:6,13:5,14:4,15:3}[i]):''}))}:{sensors};
 return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.evaluate(()=>GrowDevice.enterLocal());await page.evaluate(()=>GrowNavigation.showView('hardware'));
 assert.equal(await page.locator('#hardwareFields select').count(),6);
 assert.equal(await page.locator('select[name="dht"] option').count(),16);
 assert.equal(await page.locator('select[name="dht"] option[value="D0"]').isDisabled(),true);
 assert.equal(await page.locator('select[name="dht"] option[value="D10"]').isDisabled(),true);
 assert.equal(await page.locator('select[name="dht"] option[value="D14"]').isDisabled(),true);
 assert.equal(await page.getByLabel('Pin de Sensor 1 · AM2301').inputValue(),'D5');
 assert.equal(await page.getByLabel('Pin de Sensor 2 · AM2301').inputValue(),'D3');
 assert.equal(await page.getByLabel('Pin de Relé 1',{exact:true}).inputValue(),'D4');
 assert.equal(await page.locator('select[name="relay1"] option[value="D3"]').isDisabled(),true);
 assert.match(await page.locator('#dhtDiagnostics').innerText(),/Sensor 1[\s\S]*0\/5[\s\S]*Sensor 2[\s\S]*5\/5/);
 if(process.env.HARDWARE_SCREENSHOT)await page.locator('#hardwareForm').screenshot({path:process.env.HARDWARE_SCREENSHOT});
 await page.getByLabel('Pin de Sensor 1 · AM2301').selectOption('D9');
 const request=page.waitForRequest(r=>r.method()==='POST'&&new URL(r.url()).pathname==='/api/hardware');
 await page.getByRole('button',{name:'Guardar asignación',exact:true}).click();
 const values=new URL((await request).url()).searchParams;assert.equal(values.get('dht'),'D9');assert.equal(values.get('dht2'),'D3');assert.equal(values.get('relay1'),'D4');
 await page.waitForFunction(()=>document.querySelector('#hardwareMessage').textContent.includes('guardada')&&!document.querySelector('#hardwareForm [type="submit"]').disabled);
 await page.getByLabel('Pin de Sensor 2 · AM2301').selectOption('D8');
 await page.getByLabel('Pin de Sensor 1 · AM2301').selectOption('D15');
 await page.getByLabel('Pin de Sensor 2 · AM2301').selectOption('D13');
 await page.getByRole('button',{name:'Guardar asignación',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('select[name="dht"]').value==='D15'&&document.querySelector('select[name="dht2"]').value==='D13'&&!document.querySelector('#hardwareForm [type="submit"]').disabled);
 await page.evaluate(()=>GrowNavigation.showView('hardware'));
 assert.equal(await page.getByLabel('Pin de Sensor 1 · AM2301').inputValue(),'D15');
 assert.equal(await page.getByLabel('Pin de Sensor 2 · AM2301').inputValue(),'D13');
 if(process.env.PIN_ALIGNMENT_SCREENSHOT)await page.locator('#hardwareForm').screenshot({path:process.env.PIN_ALIGNMENT_SCREENSHOT});
 assert.deepEqual(errors,[]);console.log('Dual hardware: six pin fields, sensor diagnostics, collision prevention and both sensor pins saved passed');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

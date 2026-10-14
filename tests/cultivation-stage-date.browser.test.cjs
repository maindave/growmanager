const {chromium}=require('playwright');
const fs=require('fs'),assert=require('assert/strict'),root=require('path').resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const html=fs.readFileSync(root+'/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
 await page.route('http://crop.test/**',r=>r.fulfill({contentType:'text/html',body:html}));await page.goto('http://crop.test/');
 for(const name of ['style.css','ui-foundations.css','environment.css'])await page.addStyleTag({content:fs.readFileSync(root+'/'+name,'utf8')});
 await page.evaluate(()=>{
 document.getElementById('appLayout').hidden=false;document.getElementById('authGate').hidden=true;document.documentElement.dataset.theme='dark';document.querySelectorAll('[data-view-panel]').forEach(el=>el.classList.toggle('active',el.dataset.viewPanel==='cultivation'));
 const crop={id:'c',roomId:'r',name:'24 Esquejes para SOG (11 OB / 13 WG)',currentStage:'clone',cultivationMode:'cycle',startDate:'2026-10-15',stageStartedOn:'2026-11-05',status:'active',plannedEndDate:'2026-12-01',notes:'Notas originales'};
 window.updates=[];window.GrowToday={refreshCrop:async()=>{}};
 window.CultivoRepository={getCurrentWorkspace:()=>({id:'w',role:'owner'}),getAll:async table=>({rooms:[{id:'r',name:'Sala Vegetativo',role:'vegetative',active:true}],cultivations:[crop],lots:[],plants:[]}[table]),update:async(table,id,value)=>{updates.push({table,id,value});Object.assign(crop,value);}};
 });
 for(const name of ['cultivo-models.js','cultivation.js'])await page.addScriptTag({content:fs.readFileSync(root+'/'+name,'utf8')});
 await page.evaluate(async()=>{Cultivation.init();await Cultivation.load();});
 await page.locator('details.action-menu').filter({has:page.locator('[data-crop-edit="c"]')}).locator('summary').click();await page.locator('[data-crop-edit="c"]').click();
 assert.equal(await page.locator('[name="stageStartedOn"]').inputValue(),'2026-11-05');
 await page.locator('[name="startDate"]').fill('2026-10-14');await page.locator('[name="stageStartedOn"]').fill('2026-10-13');await page.getByRole('button',{name:'Guardar',exact:true}).click();
 assert.match(await page.locator('#cropFormMessage').innerText(),/inicio de etapa no puede ser anterior/);assert.equal(await page.evaluate(()=>updates.length),0);
 await page.locator('[name="stageStartedOn"]').fill('2026-10-15');await page.locator('[name="plannedEndDate"]').fill('2026-10-24');await page.getByRole('button',{name:'Guardar',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#cultivationMessage')?.textContent==='Cambios guardados.');
 const update=await page.evaluate(()=>updates[0]);assert.equal(update.value.currentStage,'clone');assert.equal(update.value.startDate,'2026-10-14');assert.equal(update.value.stageStartedOn,'2026-10-15');assert.equal(update.value.plannedEndDate,'2026-10-24');assert.equal(update.value.notes,'Notas originales');
 assert.deepEqual(errors,[]);console.log('Crop edit browser: saved dates from screenshot, preserved stage/notes and blocked invalid dates passed');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});

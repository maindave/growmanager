(() => {
  'use strict';
  const VERSION=1;
  const LEGACY_STORES=['cultivations','spaces','lots','plants','products','recipes','recipeVersions','activities'];
  let dialog,statusNode,userId;
  const total=counts=>Object.values(counts).reduce((sum,value)=>sum+value,0);
  async function counts(source){const result={};for(const store of LEGACY_STORES)result[store]=(await source.getAll(store)).length;return result}
  async function inspect(user){userId=user.id;const mark=await CultivoDB.getMeta(`supabaseMigration:${VERSION}:${user.id}`);const localCounts=await counts(CultivoDB);if(mark?.status==='complete'||mark?.status==='skipped'||total(localCounts)===0)return{needed:false,mark,localCounts};const remoteCounts={};for(const store of LEGACY_STORES)remoteCounts[store]=(await CultivoRepository.getAll(store)).length;return{needed:true,localCounts,remoteCounts,hasRemote:total(remoteCounts)>0}}
  function show(info){dialog=document.getElementById('migrationDialog');statusNode=dialog.querySelector('[data-migration-status]');dialog.querySelector('[data-local-count]').textContent=total(info.localCounts);dialog.querySelector('[data-remote-warning]').hidden=!info.hasRemote;dialog.querySelector('[data-confirm-import]').hidden=!info.hasRemote;dialog.querySelector('[data-import]').disabled=info.hasRemote;dialog.dataset.hasRemote=String(info.hasRemote);dialog.showModal()}
  async function setProgress(progress){await CultivoDB.setMeta(`supabaseMigration:${VERSION}:${userId}`,progress)}
  async function importAll(){
    const key=`supabaseMigration:${VERSION}:${userId}`;const saved=await CultivoDB.getMeta(key);const maps=saved?.maps||{cultivations:{},spaces:{},lots:{},plants:{},products:{},recipes:{},recipeVersions:{}};await setProgress({status:'importing',maps});
    const local={};for(const store of LEGACY_STORES)local[store]=await CultivoDB.getAll(store);
    const remember=async(type,oldId,record)=>{maps[type][oldId]=record.id;await setProgress({status:'importing',maps});return record};
    const createMapped=async(type,item,payload)=>maps[type][item.id]?{id:maps[type][item.id]}:remember(type,item.id,await CultivoRepository.create(type,payload));
    statusNode.textContent='Importando cultivos…';
    for(const item of [...local.cultivations].sort((a,b)=>(a.status==='active')-(b.status==='active')))await createMapped('cultivations',item,{...item,id:undefined});
    statusNode.textContent='Importando espacios y lotes…';
    for(const item of local.spaces)await createMapped('spaces',item,{...item,cultivationId:maps.cultivations[item.cultivationId]});
    for(const item of local.lots)await createMapped('lots',item,{...item,cultivationId:maps.cultivations[item.cultivationId],spaceId:maps.spaces[item.spaceId]});
    for(const item of local.plants)await createMapped('plants',item,{...item,lotId:maps.lots[item.lotId]});
    statusNode.textContent='Importando productos…';
    for(const item of local.products)await createMapped('products',item,{...item});
    statusNode.textContent='Importando recetas y versiones…';
    for(const recipe of local.recipes){
      if(maps.recipes[recipe.id])continue;const recipeVersions=local.recipeVersions.filter(v=>v.recipeId===recipe.id).sort((a,b)=>a.version-b.version);if(!recipeVersions.length)continue;
      const mapVersion=v=>({...v,items:v.items.map(item=>({...item,productId:maps.products[item.productId]}))});
      const created=await CultivoRepository.createRecipeWithVersion(recipe,mapVersion(recipeVersions[0]));maps.recipes[recipe.id]=created.recipe.id;maps.recipeVersions[recipeVersions[0].id]=created.version.id;await setProgress({status:'importing',maps});
      for(const version of recipeVersions.slice(1)){const remote=await CultivoRepository.createRecipeVersion(created.recipe.id,mapVersion(version));maps.recipeVersions[version.id]=remote.id;await setProgress({status:'importing',maps})}
    }
    statusNode.textContent='Importando actividades existentes…';
    for(const item of local.activities){if(!maps.activities)maps.activities={};if(maps.activities[item.id])continue;const created=await CultivoRepository.create('activities',{...item,cultivationId:maps.cultivations[item.cultivationId],spaceId:maps.spaces[item.spaceId]||null,lotId:maps.lots[item.lotId],plantId:maps.plants[item.plantId]||null});maps.activities[item.id]=created.id;await setProgress({status:'importing',maps})}
    await setProgress({status:'complete',maps,completedAt:Date.now(),localCounts:Object.fromEntries(LEGACY_STORES.map(store=>[store,local[store].length]))});statusNode.textContent='Importación completada. IndexedDB se conservó como respaldo.';setTimeout(()=>{dialog.close();location.reload()},900)
  }
  async function click(event){const action=event.target.dataset.migrationAction;if(!action)return;if(action==='confirm'){dialog.querySelector('[data-import]').disabled=!event.target.checked;return}if(action==='skip'){await setProgress({status:'skipped',skippedAt:Date.now()});dialog.close();return}if(action==='import'){dialog.querySelectorAll('button,input').forEach(node=>node.disabled=true);try{await importAll()}catch(error){console.error('Migración local:',error);statusNode.textContent=`No se completó la importación: ${error.message} Podés reintentar sin duplicar los registros ya procesados.`;dialog.querySelectorAll('button,input').forEach(node=>node.disabled=false)}}}
  function init(){dialog=document.getElementById('migrationDialog');dialog.addEventListener('click',click)}
  async function prompt(user){const info=await inspect(user);if(info.needed)show(info);return info}
  globalThis.CultivoMigration=Object.freeze({VERSION,init,inspect,prompt});
})();

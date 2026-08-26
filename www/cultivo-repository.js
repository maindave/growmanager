(() => {
  'use strict';
  const TABLES=Object.freeze({cultivations:'cultivations',spaces:'spaces',lots:'lots',plants:'plants',products:'products',recipes:'recipes',recipeVersions:'recipe_versions',activities:'activities'});
  const WRITABLE_FIELDS=Object.freeze({
    cultivations:['name','startDate','endDate','status','notes'],spaces:['cultivationId','name','description','active'],lots:['cultivationId','spaceId','name','description','stage','active'],plants:['lotId','code','variety','status','notes'],products:['name','brand','type','baseUnit','description','notes','active'],recipes:['name','type','description','notes','active'],activities:['cultivationId','spaceId','lotId','plantId','type','occurredAt','observations','details']
  });
  let ownerId=null;

  const snake=key=>key.replace(/[A-Z]/g,letter=>`_${letter.toLowerCase()}`);
  const camel=key=>key.replace(/_([a-z])/g,(_,letter)=>letter.toUpperCase());
  function signal(state,detail=''){globalThis.dispatchEvent(new CustomEvent('grow-sync-status',{detail:{state,detail,at:Date.now()}}))}
  function requireClient(){if(!GrowSupabase.configured)throw new Error('Supabase no está configurado.');return GrowSupabase.client}
  async function requireUser(){if(ownerId)return ownerId;const{data,error}=await requireClient().auth.getUser();if(error||!data.user)throw new Error('Iniciá sesión para acceder a los datos centralizados.');ownerId=data.user.id;return ownerId}
  function fromRow(row){if(!row)return row;const result={};for(const[key,value]of Object.entries(row)){if(key==='owner_id')continue;if(key==='recipe_items'){result.items=(value||[]).map(item=>({productId:item.product_id,productSnapshot:{name:item.product_name_snapshot,brand:item.product_brand_snapshot},amount:Number(item.amount),unit:item.unit}));continue}result[camel(key)]=value}if('targetPh'in result&&result.targetPh!==null)result.targetPh=Number(result.targetPh);if('targetEc'in result&&result.targetEc!==null)result.targetEc=Number(result.targetEc);return result}
  function toPayload(storeName,input){const allowed=WRITABLE_FIELDS[storeName]||[];const result={};for(const key of allowed)if(Object.hasOwn(input,key)){let value=input[key];if(key==='occurredAt'&&typeof value==='number')value=new Date(value).toISOString();result[snake(key)]=value}return result}
  function readableError(error){console.error('Supabase:',error);if(!navigator.onLine||/fetch|network/i.test(error?.message||''))return new Error('No hay conexión con Supabase. Se mostrarán datos guardados cuando estén disponibles.');if(error?.code==='42501')return new Error('No tenés permiso para realizar esta operación.');if(error?.code==='23505')return new Error('Ya existe un registro con esos datos o ya hay un cultivo activo.');if(error?.code==='23503')return new Error('La relación seleccionada ya no está disponible.');return new Error(error?.message||'No se pudo completar la operación en Supabase.')}
  async function cached(storeName){const user=await requireUser();return CultivoDB.cacheGetAll(storeName,user)}
  async function cache(storeName,records){const user=await requireUser();await CultivoDB.cacheSetAll(storeName,user,records);return records}
  async function getAll(storeName){
    const table=TABLES[storeName];if(!table)throw new Error(`Repositorio desconocido: ${storeName}`);await requireUser();signal('syncing');
    try{let query=requireClient().from(table).select(storeName==='recipeVersions'?'*,recipe_items(*)':'*');const{data,error}=await query;if(error)throw error;const records=(data||[]).map(fromRow);await cache(storeName,records);signal('synced');return records}catch(error){const records=await cached(storeName);if(records.length){signal('cached','Sin conexión; mostrando caché local.');return records}signal('error');throw readableError(error)}
  }
  async function get(storeName,id){const records=await getAll(storeName);return records.find(item=>item.id===id)||null}
  async function create(storeName,input){
    await requireUser();const table=TABLES[storeName];let payload=toPayload(storeName,input);
    try{if(storeName==='cultivations'&&payload.status==='active')payload={...payload,status:'finished'};const{data,error}=await requireClient().from(table).insert(payload).select().single();if(error)throw error;let result=fromRow(data);if(storeName==='cultivations'&&input.status==='active'){await activateCultivation(result.id);result={...result,status:'active'}}signal('synced');return result}catch(error){signal('error');throw readableError(error)}
  }
  async function update(storeName,id,changes){await requireUser();try{const{data,error}=await requireClient().from(TABLES[storeName]).update(toPayload(storeName,changes)).eq('id',id).select().single();if(error)throw error;signal('synced');return fromRow(data)}catch(error){signal('error');throw readableError(error)}}
  async function setActive(storeName,id,active){return update(storeName,id,{active:Boolean(active)})}
  async function activateCultivation(id){await requireUser();try{const{error}=await requireClient().rpc('activate_cultivation',{p_cultivation_id:id});if(error)throw error;signal('synced');return get('cultivations',id)}catch(error){signal('error');throw readableError(error)}}
  function rpcItems(items){return items.map(item=>({product_id:item.productId,product_name_snapshot:item.productSnapshot.name,product_brand_snapshot:item.productSnapshot.brand||'',amount:Number(item.amount),unit:item.unit}))}
  async function createRecipeWithVersion(recipe,version){await requireUser();try{const{data,error}=await requireClient().rpc('create_recipe_with_version',{p_name:recipe.name,p_type:recipe.type,p_description:recipe.description||'',p_notes:recipe.notes||'',p_active:recipe.active!==false,p_target_ph:version.targetPh,p_target_ec:version.targetEc,p_version_notes:version.notes||'',p_items:rpcItems(version.items)});if(error)throw error;signal('synced');return{recipe:await get('recipes',data),version:await getCurrentRecipeVersion(data)}}catch(error){signal('error');throw readableError(error)}}
  async function createRecipeVersion(recipeId,version){await requireUser();try{const{data,error}=await requireClient().rpc('create_recipe_version',{p_recipe_id:recipeId,p_target_ph:version.targetPh,p_target_ec:version.targetEc,p_notes:version.notes||'',p_items:rpcItems(version.items)});if(error)throw error;signal('synced');return get('recipeVersions',data)}catch(error){signal('error');throw readableError(error)}}
  async function getCurrentRecipeVersion(recipeId){const recipe=await get('recipes',recipeId);return recipe?.currentVersionId?get('recipeVersions',recipe.currentVersionId):null}
  async function getRecipeVersions(recipeId){return(await getAll('recipeVersions')).filter(item=>item.recipeId===recipeId).sort((a,b)=>b.version-a.version)}
  async function init(){await requireUser();return true}
  function resetSession(){ownerId=null}
  function schema(){return{provider:'supabase',projectId:GrowSupabase.projectId,cache:'flora-cultivo-db',cacheVersion:CultivoDB.DB_VERSION}}
  globalThis.CultivoRepository=Object.freeze({init,resetSession,schema,get,getAll,create,update,setActive,activateCultivation,createRecipeWithVersion,createRecipeVersion,getCurrentRecipeVersion,getRecipeVersions});
})();

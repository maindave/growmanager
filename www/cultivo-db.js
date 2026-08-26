(() => {
  'use strict';

  const DB_NAME='flora-cultivo-db';
  const DB_VERSION=2;
  const STORE_NAMES=Object.freeze(['cultivations','spaces','lots','plants','products','recipes','recipeVersions','activities','remoteCache','syncMeta']);
  const IMMUTABLE_STORES=new Set(['recipeVersions']);
  const ACTIVE_STORES=new Set(['spaces','lots','products','recipes']);
  let database=null;

  function requestResult(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
  function transactionDone(transaction){return new Promise((resolve,reject)=>{transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error||new Error('La transacción fue cancelada.'))})}
  function createStore(db,name,options,indexes){const store=db.createObjectStore(name,options);for(const [index,keyPath,indexOptions] of indexes)store.createIndex(index,keyPath,indexOptions);return store}
  function migrate(db,oldVersion,transaction){
    if(oldVersion<1){
      createStore(db,'cultivations',{keyPath:'id'},[['status','status'],['startDate','startDate']]);
      createStore(db,'spaces',{keyPath:'id'},[['cultivationId','cultivationId'],['activeKey','activeKey'],['cultivationName',['cultivationId','name']]]);
      createStore(db,'lots',{keyPath:'id'},[['cultivationId','cultivationId'],['spaceId','spaceId'],['activeKey','activeKey'],['stage','stage']]);
      createStore(db,'plants',{keyPath:'id'},[['lotId','lotId'],['code','code'],['status','status']]);
      createStore(db,'products',{keyPath:'id'},[['name','name'],['type','type'],['activeKey','activeKey']]);
      createStore(db,'recipes',{keyPath:'id'},[['name','name'],['type','type'],['activeKey','activeKey'],['currentVersionId','currentVersionId']]);
      createStore(db,'recipeVersions',{keyPath:'id'},[['recipeId','recipeId'],['recipeVersion',['recipeId','version'],{unique:true}]]);
      createStore(db,'activities',{keyPath:'id'},[['occurredAt','occurredAt'],['type','type'],['lotId','lotId'],['cultivationId','cultivationId']]);
    }
    if(oldVersion<2){
      createStore(db,'remoteCache',{keyPath:'key'},[['storeOwner',['storeName','ownerId']],['cachedAt','cachedAt']]);
      createStore(db,'syncMeta',{keyPath:'key'},[['updatedAt','updatedAt']]);
    }
    // Las migraciones futuras se agregan como bloques `if (oldVersion < N)` sin destruir stores existentes.
    void transaction;
  }

  function init(){if(database)return Promise.resolve(database);return new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,DB_VERSION);request.onupgradeneeded=event=>migrate(request.result,event.oldVersion,request.transaction);request.onsuccess=()=>{database=request.result;database.onversionchange=()=>close();resolve(database)};request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('La base de cultivo está bloqueada por otra pestaña.'))})}
  function close(){if(database)database.close();database=null}
  async function reopen(){close();return init()}
  function ensureStore(name){if(!STORE_NAMES.includes(name))throw new Error(`Store desconocida: ${name}`)}
  function prepareRecord(storeName,input,{creating=false}={}){const now=Date.now();const record={...input};if(creating){record.id=record.id||CultivoModels.createId(storeName.replace(/s$/,''));record.createdAt=record.createdAt||now}record.updatedAt=now;if(ACTIVE_STORES.has(storeName)){record.active=record.active!==false;record.activeKey=record.active?1:0}if(storeName==='activities')record.plantId=record.plantId??null;return record}
  function publicRecord(record){if(!record)return record;const result={...record};delete result.activeKey;return result}
  async function withStore(name,mode,operation){ensureStore(name);const db=await init();const transaction=db.transaction(name,mode);const done=transactionDone(transaction);const result=await operation(transaction.objectStore(name));await done;return result}
  async function create(storeName,input){const record=prepareRecord(storeName,input,{creating:true});await withStore(storeName,'readwrite',store=>requestResult(store.add(record)));return publicRecord(record)}
  async function get(storeName,id){return publicRecord(await withStore(storeName,'readonly',store=>requestResult(store.get(id))))}
  async function getAll(storeName){const records=await withStore(storeName,'readonly',store=>requestResult(store.getAll()));return records.map(publicRecord)}
  async function update(storeName,id,changes){if(IMMUTABLE_STORES.has(storeName))throw new Error(`${storeName} es inmutable; creá una nueva versión.`);return withStore(storeName,'readwrite',async store=>{const current=await requestResult(store.get(id));if(!current)throw new Error(`No existe ${storeName}/${id}.`);const record=prepareRecord(storeName,{...current,...changes,id,createdAt:current.createdAt});await requestResult(store.put(record));return publicRecord(record)})}
  async function setActive(storeName,id,active){if(!ACTIVE_STORES.has(storeName))throw new Error(`${storeName} no admite activación.`);return update(storeName,id,{active:Boolean(active)})}
  async function query(storeName,indexName,value,{direction='next',limit=0}={}){ensureStore(storeName);const db=await init();const transaction=db.transaction(storeName,'readonly');const done=transactionDone(transaction);const index=transaction.objectStore(storeName).index(indexName);const records=[];await new Promise((resolve,reject)=>{const request=index.openCursor(IDBKeyRange.only(value),direction);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const cursor=request.result;if(!cursor||limit>0&&records.length>=limit)return resolve();records.push(publicRecord(cursor.value));cursor.continue()}});await done;return records}
  async function createRecipeVersion(recipeId,versionData){const validated=CultivoModels.assertValid(CultivoModels.validateRecipeVersion(versionData));const db=await init();const transaction=db.transaction(['recipes','recipeVersions'],'readwrite');const done=transactionDone(transaction);const recipes=transaction.objectStore('recipes');const versions=transaction.objectStore('recipeVersions');const recipe=await requestResult(recipes.get(recipeId));if(!recipe)throw new Error(`No existe recipes/${recipeId}.`);const existing=await requestResult(versions.index('recipeId').getAll(recipeId));const version=existing.reduce((max,item)=>Math.max(max,Number(item.version)||0),0)+1;const createdAt=Date.now();const record={...validated,id:CultivoModels.createId('recipeVersion'),recipeId,version,createdAt};await requestResult(versions.add(record));await requestResult(recipes.put({...recipe,currentVersionId:record.id,updatedAt:createdAt}));await done;return publicRecord(record)}
  async function createRecipeWithVersion(recipeData,versionData){const recipe=CultivoModels.assertValid(CultivoModels.validateRecipe(recipeData));const version=CultivoModels.assertValid(CultivoModels.validateRecipeVersion(versionData));const db=await init();const transaction=db.transaction(['recipes','recipeVersions'],'readwrite');const done=transactionDone(transaction);const recipes=transaction.objectStore('recipes');const versions=transaction.objectStore('recipeVersions');const now=Date.now();const recipeRecord=prepareRecord('recipes',{...recipe,currentVersionId:null},{creating:true});const versionRecord={...version,id:CultivoModels.createId('recipeVersion'),recipeId:recipeRecord.id,version:1,createdAt:now};recipeRecord.currentVersionId=versionRecord.id;recipeRecord.updatedAt=now;await requestResult(recipes.add(recipeRecord));await requestResult(versions.add(versionRecord));await done;return{recipe:publicRecord(recipeRecord),version:publicRecord(versionRecord)}}
  async function getCurrentRecipeVersion(recipeId){const recipe=await get('recipes',recipeId);return recipe?.currentVersionId?get('recipeVersions',recipe.currentVersionId):null}
  async function getRecipeVersions(recipeId){return(await query('recipeVersions','recipeId',recipeId)).sort((a,b)=>b.version-a.version)}
  async function getActiveCultivation(){const active=await query('cultivations','status','active',{limit:1});return active[0]||null}
  async function activateCultivation(id){const db=await init();const transaction=db.transaction('cultivations','readwrite');const done=transactionDone(transaction);const store=transaction.objectStore('cultivations');const all=await requestResult(store.getAll());const now=Date.now();let selected=null;for(const item of all){if(item.id===id){selected={...item,status:'active',endDate:null,updatedAt:now};await requestResult(store.put(selected))}else if(item.status==='active'){await requestResult(store.put({...item,status:'finished',updatedAt:now}))}}if(!selected)throw new Error(`No existe cultivations/${id}.`);await done;return publicRecord(selected)}
  async function createActivity(input){const validated=CultivoModels.assertValid(CultivoModels.validateActivity(input));return create('activities',{...validated,details:structuredClone(validated.details||{}),observations:CultivoModels.normalizeText(validated.observations)})}
  async function cacheSetAll(storeName,ownerId,records){const db=await init();const transaction=db.transaction('remoteCache','readwrite');const done=transactionDone(transaction);const store=transaction.objectStore('remoteCache');const index=store.index('storeOwner');const existing=await requestResult(index.getAllKeys(IDBKeyRange.only([storeName,ownerId])));for(const key of existing)await requestResult(store.delete(key));const cachedAt=Date.now();for(const record of records)await requestResult(store.put({key:`${ownerId}:${storeName}:${record.id}`,storeName,ownerId,record:structuredClone(record),cachedAt}));await done;return records}
  async function cacheGetAll(storeName,ownerId){const rows=await withStore('remoteCache','readonly',store=>requestResult(store.index('storeOwner').getAll(IDBKeyRange.only([storeName,ownerId]))));return rows.map(row=>row.record)}
  async function getMeta(key){return withStore('syncMeta','readonly',store=>requestResult(store.get(key)))}
  async function setMeta(key,value){const record={key,...value,updatedAt:Date.now()};await withStore('syncMeta','readwrite',store=>requestResult(store.put(record)));return record}
  function schema(){return{database:DB_NAME,version:DB_VERSION,stores:[...STORE_NAMES]}}

  globalThis.CultivoDB=Object.freeze({DB_NAME,DB_VERSION,STORE_NAMES,init,close,reopen,schema,create,get,getAll,update,setActive,query,createRecipeWithVersion,createRecipeVersion,getCurrentRecipeVersion,getRecipeVersions,getActiveCultivation,activateCultivation,createActivity,cacheSetAll,cacheGetAll,getMeta,setMeta});
})();

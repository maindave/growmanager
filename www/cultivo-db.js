(() => {
  'use strict';

  const DB_NAME='flora-cultivo-db';
  const DB_VERSION=1;
  const STORE_NAMES=Object.freeze(['cultivations','spaces','lots','plants','products','recipes','recipeVersions','activities']);
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
  async function createRecipeVersion(recipeId,versionData){const db=await init();const transaction=db.transaction(['recipes','recipeVersions'],'readwrite');const done=transactionDone(transaction);const recipes=transaction.objectStore('recipes');const versions=transaction.objectStore('recipeVersions');const recipe=await requestResult(recipes.get(recipeId));if(!recipe)throw new Error(`No existe recipes/${recipeId}.`);const existing=await requestResult(versions.index('recipeId').getAll(recipeId));const version=existing.reduce((max,item)=>Math.max(max,Number(item.version)||0),0)+1;const createdAt=Date.now();const record={...versionData,id:CultivoModels.createId('recipeVersion'),recipeId,version,items:(versionData.items||[]).map(item=>({...item,productSnapshot:{...item.productSnapshot}})),createdAt};await requestResult(versions.add(record));await requestResult(recipes.put({...recipe,currentVersionId:record.id,updatedAt:createdAt}));await done;return publicRecord(record)}
  async function getCurrentRecipeVersion(recipeId){const recipe=await get('recipes',recipeId);return recipe?.currentVersionId?get('recipeVersions',recipe.currentVersionId):null}
  async function createActivity(input){const validated=CultivoModels.assertValid(CultivoModels.validateActivity(input));return create('activities',{...validated,details:structuredClone(validated.details||{}),observations:CultivoModels.normalizeText(validated.observations)})}
  function schema(){return{database:DB_NAME,version:DB_VERSION,stores:[...STORE_NAMES]}}

  globalThis.CultivoDB=Object.freeze({DB_NAME,DB_VERSION,STORE_NAMES,init,close,reopen,schema,create,get,getAll,update,setActive,query,createRecipeVersion,getCurrentRecipeVersion,createActivity});
})();

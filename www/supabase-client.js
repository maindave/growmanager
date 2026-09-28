(()=>{'use strict';
  const config=globalThis.GrowConfig||{};let instance=null,failure=null;
  async function loadSdk(){
    if(globalThis.supabase?.createClient)return;
    const base=document.querySelector('meta[name="grow-public-base"]')?.content||new URL('./',document.baseURI).href;
    const sources=[
      new URL(`vendor/supabase.js?v=20260927-public5-${Date.now()}`,base).href,
      'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js'
    ];
    for(const src of sources){
      try{
        await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.async=false;script.onload=resolve;script.onerror=()=>reject(new Error(src));document.head.append(script)});
        if(globalThis.supabase?.createClient)return;
      }catch(error){console.warn('No se pudo cargar el SDK desde',src,error)}
    }
    throw new Error('No se pudo cargar el servicio de datos. Revisá la conexión y recargá la aplicación.');
  }
  const ready=(async()=>{try{if(!config.SUPABASE_URL||!config.SUPABASE_PUBLISHABLE_KEY)throw new Error('La configuración pública de Supabase está incompleta.');await loadSdk();instance=globalThis.supabase.createClient(config.SUPABASE_URL,config.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},global:{headers:{'x-application-name':'growmanager-v2.5'}}});const{error}=await instance.auth.getSession();if(error)throw error;dispatchEvent(new CustomEvent('grow-supabase-ready'));return instance}catch(error){failure=error;console.error('Supabase bootstrap:',error);dispatchEvent(new CustomEvent('grow-supabase-error',{detail:{message:error.message}}));return null}})();
  globalThis.GrowSupabase=Object.freeze({get client(){return instance},get configured(){return Boolean(instance)},get error(){return failure},ready,projectId:config.PROJECT_ID,url:config.SUPABASE_URL});
})();

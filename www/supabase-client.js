(() => {
  'use strict';
  const config=globalThis.GrowConfig||{};
  const configured=Boolean(config.SUPABASE_URL&&config.SUPABASE_PUBLISHABLE_KEY&&globalThis.supabase?.createClient);
  const client=configured?globalThis.supabase.createClient(config.SUPABASE_URL,config.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},global:{headers:{'x-application-name':'cultivo-flora-v2.5'}}}):null;
  globalThis.GrowSupabase=Object.freeze({client,configured,projectId:config.PROJECT_ID,url:config.SUPABASE_URL});
})();

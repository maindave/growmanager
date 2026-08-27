import { createClient } from 'npm:@supabase/supabase-js@2'

const allowedOrigins=new Set(['https://maindave.github.io','http://127.0.0.1:8081','http://localhost','capacitor://localhost'])
const headers=(origin:string)=>({'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'https://maindave.github.io','Vary':'Origin','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'})
const systemInstruction=`Sos el asistente de Growmanager para un cultivo indoor en sustrato. Respondé en español rioplatense, de forma clara y breve.
Reglas obligatorias:
- Diferenciá hechos, planificación y recomendaciones. Nunca inventes fechas, dosis, mediciones ni actividades.
- Los datos vivos incluidos en CONTEXTO tienen prioridad sobre conocimiento histórico.
- No controles ni propongas ejecutar automáticamente relays, bombas, calefacción o firmware.
- Toda escritura debe ser una propuesta explícita; el usuario la confirmará en Growmanager.
- Para madres 2026/2027, la referencia actual es Hakaphos Verde 0,7 g/L, Macro-Sorb Radicular 1 ml/L, pH 6,0 y EC orientativa 0,8-1,0. Los eventos pueden postergarse por humedad conservando la secuencia.
- No incluyas rutinariamente Hakaphos Rojo, MKP ni sulfato de magnesio en la agenda de madres. Macro-Sorb Foliar es condicional y separado.
- El control ambiental es local-first; Gemini necesita Internet y no sustituye al Wemos.
Si el usuario pide guardar algo, devolvé una propuesta. Tipos soportados: schedule_irrigation, postpone_irrigation, record_activity. Si solo consulta, type=none.
schedule_irrigation: cultivationId, lotId, scheduledAt ISO, waterLiters, ph, ec, notes, supplies[{name,amount,unit}].
postpone_irrigation: eventId y scheduledAt ISO.
record_activity: cultivationId, spaceId, lotId, plantId, type (irrigation|transplant|pruning|application|measurement|stage_change|observation), occurredAt ISO, observations y details.`

Deno.serve(async req=>{
  const origin=req.headers.get('Origin')||''
  const cors=headers(origin)
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}})
  if(req.method==='OPTIONS')return allowedOrigins.has(origin)?new Response('ok',{headers:cors}):json({error:'origin_not_allowed'},403)
  if(req.method!=='POST')return json({error:'method_not_allowed'},405)
  if(origin&&!allowedOrigins.has(origin))return json({error:'origin_not_allowed'},403)
  try{
    const authorization=req.headers.get('Authorization')||''
    if(!authorization.startsWith('Bearer '))return json({error:'authentication_required'},401)
    const url=Deno.env.get('SUPABASE_URL')!
    const keys=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}')
    const publishable=keys.default||Deno.env.get('SUPABASE_ANON_KEY')
    const supabase=createClient(url,publishable,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}})
    const{data:{user},error:userError}=await supabase.auth.getUser()
    if(userError||!user)return json({error:'authentication_required'},401)
    const body=await req.json(),message=String(body?.message||'').trim(),workspaceId=String(body?.workspaceId||'')
    if(!message||message.length>2000)return json({error:'invalid_message'},400)
    if(!/^[0-9a-f-]{36}$/i.test(workspaceId))return json({error:'invalid_workspace'},400)
    const{data:membership,error:membershipError}=await supabase.from('workspace_members').select('role').eq('workspace_id',workspaceId).eq('user_id',user.id).maybeSingle()
    if(membershipError||!membership)return json({error:'workspace_access_denied'},403)
    const query=async(table:string,select:string)=>{const{data,error}=await supabase.from(table).select(select).eq('workspace_id',workspaceId).limit(100);if(error)throw error;return data||[]}
    const[{data:workspace,error:workspaceError},cultivations,spaces,lots,products,recipes,recipeVersions,irrigations,activities]=await Promise.all([supabase.from('workspaces').select('id,name,description,grow_type,started_on').eq('id',workspaceId).single(),query('cultivations','id,name,start_date,end_date,status,notes'),query('spaces','id,cultivation_id,name,description,active'),query('lots','id,cultivation_id,space_id,name,description,stage,active'),query('products','id,name,brand,type,base_unit,description,notes,active'),query('recipes','id,name,type,description,notes,active,current_version_id'),query('recipe_versions','id,recipe_id,version,target_ph,target_ec,notes,recipe_items(product_id,product_name_snapshot,product_brand_snapshot,amount,unit)'),query('irrigation_events','id,cultivation_id,lot_id,scheduled_at,status,water_liters,ph,ec,notes,supplies'),query('activities','id,cultivation_id,space_id,lot_id,plant_id,type,occurred_at,observations,details')])
    if(workspaceError)throw workspaceError
    const context={now:new Date().toISOString(),workspace,role:membership.role,cultivations,spaces,lots,products,recipes,recipeVersions,irrigations:irrigations.sort((a:any,b:any)=>String(a.scheduled_at).localeCompare(String(b.scheduled_at))).slice(-30),activities:activities.sort((a:any,b:any)=>String(b.occurred_at).localeCompare(String(a.occurred_at))).slice(0,20)}
    const apiKey=Deno.env.get('GEMINI_API_KEY')
    if(!apiKey)return json({error:'gemini_not_configured'},503)
    const history=Array.isArray(body.history)?body.history.slice(-8):[]
    const contents=[...history.map((item:any)=>({role:item.role==='assistant'?'model':'user',parts:[{text:String(item.text||'').slice(0,3000)}]})),{role:'user',parts:[{text:`CONSULTA:\n${message}\n\nCONTEXTO VIVO DEL PROYECTO:\n${JSON.stringify(context).slice(0,60000)}`}]}]
    const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify({system_instruction:{parts:[{text:systemInstruction+' Devolvé el payload como JSON serializado en proposal.payloadJson.'}]},contents,generationConfig:{temperature:0.25,responseMimeType:'application/json',responseSchema:{type:'OBJECT',required:['reply','proposal'],properties:{reply:{type:'STRING'},proposal:{type:'OBJECT',required:['type','summary','payloadJson'],properties:{type:{type:'STRING',enum:['none','schedule_irrigation','postpone_irrigation','record_activity']},summary:{type:'STRING'},payloadJson:{type:'STRING'}}}}}}})})
    const result=await response.json()
    if(!response.ok)throw new Error(result?.error?.message||'Gemini API error')
    const text=result?.candidates?.[0]?.content?.parts?.map((part:any)=>part.text||'').join('')
    if(!text)throw new Error('Gemini returned no content')
    const parsed=JSON.parse(text)
    const proposal=parsed.proposal||{type:'none',summary:'',payloadJson:'{}'}
    let payload={};try{payload=JSON.parse(proposal.payloadJson||'{}')}catch{payload={}}
    return json({reply:String(parsed.reply||''),proposal:{type:proposal.type||'none',summary:String(proposal.summary||''),payload}})
  }catch(error){console.error(error);return json({error:'assistant_error',message:'No se pudo procesar la consulta.'},500)}
})

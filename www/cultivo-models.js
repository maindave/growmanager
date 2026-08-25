(() => {
  'use strict';

  const freeze = values => Object.freeze([...values]);
  const PRODUCT_TYPES = freeze(['fertilizer','biostimulant','amendment','ph_corrector','preventive','substrate','other']);
  const RECIPE_TYPES = freeze(['irrigation','substrate','foliar']);
  const ACTIVITY_TYPES = freeze(['irrigation','transplant','pruning','application','measurement','stage_change','observation']);
  const LOT_STAGES = freeze(['mother','clone','rooting','vegetative','flowering','harvest','finished']);
  const UNITS = freeze(['g','ml','l','percent','g_per_l','ml_per_l','other']);
  const CULTIVATION_STATUSES = freeze(['active','finished','archived']);

  const UNIT_LABELS = Object.freeze({g:'g',ml:'ml',l:'L',percent:'%',g_per_l:'g/L',ml_per_l:'ml/L',other:'Otra'});
  const PRODUCT_TYPE_LABELS = Object.freeze({fertilizer:'Fertilizante',biostimulant:'Bioestimulante',amendment:'Enmienda',ph_corrector:'Corrector de pH',preventive:'Preventivo',substrate:'Sustrato',other:'Otro'});
  const RECIPE_TYPE_LABELS = Object.freeze({irrigation:'Riego / Nutrientes',substrate:'Sustrato',foliar:'Foliar'});
  const LOT_STAGE_LABELS = Object.freeze({mother:'Madre',clone:'Esqueje',rooting:'Enraizado',vegetative:'Vegetativo',flowering:'Floración',harvest:'Cosecha',finished:'Finalizado'});
  const CULTIVATION_STATUS_LABELS = Object.freeze({active:'Activo',finished:'Finalizado',archived:'Archivado'});
  const UNIT_ALIASES = Object.freeze({'g':'g','gram':'g','grams':'g','ml':'ml','milliliter':'ml','l':'l','liter':'l','litre':'l','%':'percent','percent':'percent','g/l':'g_per_l','g_per_l':'g_per_l','ml/l':'ml_per_l','ml_per_l':'ml_per_l','other':'other'});

  function normalizeText(value){return String(value??'').trim().replace(/\s+/g,' ')}
  function normalizeUnit(value){const key=normalizeText(value).toLowerCase().replace(/\s/g,'');return UNIT_ALIASES[key]??null}
  function isEnumValue(value,allowed){return allowed.includes(value)}
  function roundQuantity(value){return Math.round((Number(value)+Number.EPSILON)*1e6)/1e6}
  function calculateDose(dose,unit,liters){const normalized=normalizeUnit(unit);const amount=Number(dose);const volume=Number(liters);if(!Number.isFinite(amount)||amount<0||!Number.isFinite(volume)||volume<0)return null;if(normalized==='g_per_l')return{amount:roundQuantity(amount*volume),unit:'g'};if(normalized==='ml_per_l')return{amount:roundQuantity(amount*volume),unit:'ml'};return null}
  function validateLiters(value){const liters=Number(value);return{valid:Number.isFinite(liters)&&liters>0,value:liters,error:'Los litros deben ser mayores que cero.'}}
  function createId(prefix='id'){const uuid=globalThis.crypto?.randomUUID?.()??`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;return`${prefix}_${uuid}`}

  function createProductSnapshot(product={}){return{name:normalizeText(product.name),brand:normalizeText(product.brand)}}
  function normalizeRecipeItems(items=[]){return items.map(item=>({productId:item.productId,productSnapshot:createProductSnapshot(item.productSnapshot),amount:Number(item.amount),unit:normalizeUnit(item.unit)}))}
  function comparableComposition(version={}){return JSON.stringify({targetPh:version.targetPh===''||version.targetPh==null?null:Number(version.targetPh),targetEc:version.targetEc===''||version.targetEc==null?null:Number(version.targetEc),notes:normalizeText(version.notes),items:normalizeRecipeItems(version.items).map(item=>({productId:item.productId,amount:item.amount,unit:item.unit}))})}
  function sameRecipeComposition(a,b){return comparableComposition(a)===comparableComposition(b)}
  function validateRecipeVersion(input={}){const errors=[];const items=normalizeRecipeItems(input.items||[]);if(!items.length)errors.push('La receta debe tener al menos un componente.');const ids=new Set();for(const item of items){if(!item.productId)errors.push('Seleccioná un producto en cada componente.');if(ids.has(item.productId))errors.push('No se puede repetir un producto en la misma versión.');ids.add(item.productId);if(!Number.isFinite(item.amount)||item.amount<=0)errors.push('Las cantidades deben ser mayores que cero.');if(!isEnumValue(item.unit,UNITS))errors.push('La unidad de dosis no es válida.');}const optionalNumber=value=>value===''||value==null?null:Number(value);const value={...input,targetPh:optionalNumber(input.targetPh),targetEc:optionalNumber(input.targetEc),notes:normalizeText(input.notes),items};if(value.targetPh!==null&&!Number.isFinite(value.targetPh))errors.push('El pH objetivo no es válido.');if(value.targetEc!==null&&!Number.isFinite(value.targetEc))errors.push('La EC objetivo no es válida.');return{valid:errors.length===0,errors:[...new Set(errors)],value}}

  function validateProduct(input={}){const errors=[];const value={...input,name:normalizeText(input.name),brand:normalizeText(input.brand),type:input.type,baseUnit:normalizeUnit(input.baseUnit),active:input.active!==false};if(!value.name)errors.push('El nombre del producto es obligatorio.');if(!isEnumValue(value.type,PRODUCT_TYPES))errors.push('El tipo de producto no es válido.');if(!isEnumValue(value.baseUnit,UNITS))errors.push('La unidad base no es válida.');return{valid:errors.length===0,errors,value}}
  function validateCultivation(input={}){const errors=[];const value={...input,name:normalizeText(input.name),status:input.status||'active'};if(!value.name)errors.push('El nombre del cultivo es obligatorio.');if(!isEnumValue(value.status,CULTIVATION_STATUSES))errors.push('El estado del cultivo no es válido.');return{valid:errors.length===0,errors,value}}
  function validateSpace(input={}){const errors=[];const value={...input,name:normalizeText(input.name)};if(!value.cultivationId)errors.push('El espacio debe pertenecer a un cultivo.');if(!value.name)errors.push('El nombre del espacio es obligatorio.');return{valid:errors.length===0,errors,value}}
  function validateLot(input={}){const errors=[];const value={...input,name:normalizeText(input.name),stage:input.stage};if(!value.cultivationId)errors.push('El lote debe pertenecer a un cultivo.');if(!value.spaceId)errors.push('El lote debe pertenecer a un espacio.');if(!value.name)errors.push('El nombre del lote es obligatorio.');if(!isEnumValue(value.stage,LOT_STAGES))errors.push('La etapa del lote no es válida.');return{valid:errors.length===0,errors,value}}
  function validateRecipe(input={}){const errors=[];const value={...input,name:normalizeText(input.name),type:input.type};if(!value.name)errors.push('El nombre de la receta es obligatorio.');if(!isEnumValue(value.type,RECIPE_TYPES))errors.push('El tipo de receta no es válido.');return{valid:errors.length===0,errors,value}}
  function validateActivity(input={}){const errors=[];const value={...input,occurredAt:Number(input.occurredAt),type:input.type,plantId:input.plantId??null};if(!isEnumValue(value.type,ACTIVITY_TYPES))errors.push('El tipo de actividad no es válido.');if(!Number.isFinite(value.occurredAt))errors.push('La fecha de la actividad es obligatoria.');if(!value.cultivationId)errors.push('La actividad debe pertenecer a un cultivo.');if(!value.lotId)errors.push('La actividad debe pertenecer a un lote.');return{valid:errors.length===0,errors,value}}
  function assertValid(result){if(result.valid)return result.value;const error=new Error(result.errors.join(' '));error.validationErrors=result.errors;throw error}

  globalThis.CultivoModels=Object.freeze({PRODUCT_TYPES,RECIPE_TYPES,ACTIVITY_TYPES,LOT_STAGES,UNITS,CULTIVATION_STATUSES,UNIT_LABELS,PRODUCT_TYPE_LABELS,RECIPE_TYPE_LABELS,LOT_STAGE_LABELS,CULTIVATION_STATUS_LABELS,normalizeText,normalizeUnit,isEnumValue,calculateDose,validateLiters,createId,createProductSnapshot,normalizeRecipeItems,sameRecipeComposition,validateProduct,validateCultivation,validateSpace,validateLot,validateRecipe,validateRecipeVersion,validateActivity,assertValid});
})();

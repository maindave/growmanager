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
  const UNIT_ALIASES = Object.freeze({'g':'g','gram':'g','grams':'g','ml':'ml','milliliter':'ml','l':'l','liter':'l','litre':'l','%':'percent','percent':'percent','g/l':'g_per_l','g_per_l':'g_per_l','ml/l':'ml_per_l','ml_per_l':'ml_per_l','other':'other'});

  function normalizeText(value){return String(value??'').trim().replace(/\s+/g,' ')}
  function normalizeUnit(value){const key=normalizeText(value).toLowerCase().replace(/\s/g,'');return UNIT_ALIASES[key]??null}
  function isEnumValue(value,allowed){return allowed.includes(value)}
  function roundQuantity(value){return Math.round((Number(value)+Number.EPSILON)*1e6)/1e6}
  function calculateDose(dose,unit,liters){const normalized=normalizeUnit(unit);const amount=Number(dose);const volume=Number(liters);if(!Number.isFinite(amount)||amount<0||!Number.isFinite(volume)||volume<0)return null;if(normalized==='g_per_l')return{amount:roundQuantity(amount*volume),unit:'g'};if(normalized==='ml_per_l')return{amount:roundQuantity(amount*volume),unit:'ml'};return null}
  function createId(prefix='id'){const uuid=globalThis.crypto?.randomUUID?.()??`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;return`${prefix}_${uuid}`}

  function validateProduct(input={}){const errors=[];const value={...input,name:normalizeText(input.name),brand:normalizeText(input.brand),type:input.type,baseUnit:normalizeUnit(input.baseUnit),active:input.active!==false};if(!value.name)errors.push('El nombre del producto es obligatorio.');if(!isEnumValue(value.type,PRODUCT_TYPES))errors.push('El tipo de producto no es válido.');if(!isEnumValue(value.baseUnit,UNITS))errors.push('La unidad base no es válida.');return{valid:errors.length===0,errors,value}}
  function validateCultivation(input={}){const errors=[];const value={...input,name:normalizeText(input.name),status:input.status||'active'};if(!value.name)errors.push('El nombre del cultivo es obligatorio.');if(!isEnumValue(value.status,CULTIVATION_STATUSES))errors.push('El estado del cultivo no es válido.');return{valid:errors.length===0,errors,value}}
  function validateSpace(input={}){const errors=[];const value={...input,name:normalizeText(input.name)};if(!value.cultivationId)errors.push('El espacio debe pertenecer a un cultivo.');if(!value.name)errors.push('El nombre del espacio es obligatorio.');return{valid:errors.length===0,errors,value}}
  function validateLot(input={}){const errors=[];const value={...input,name:normalizeText(input.name),stage:input.stage};if(!value.cultivationId)errors.push('El lote debe pertenecer a un cultivo.');if(!value.spaceId)errors.push('El lote debe pertenecer a un espacio.');if(!value.name)errors.push('El nombre del lote es obligatorio.');if(!isEnumValue(value.stage,LOT_STAGES))errors.push('La etapa del lote no es válida.');return{valid:errors.length===0,errors,value}}
  function validateRecipe(input={}){const errors=[];const value={...input,name:normalizeText(input.name),type:input.type};if(!value.name)errors.push('El nombre de la receta es obligatorio.');if(!isEnumValue(value.type,RECIPE_TYPES))errors.push('El tipo de receta no es válido.');return{valid:errors.length===0,errors,value}}
  function validateActivity(input={}){const errors=[];const value={...input,occurredAt:Number(input.occurredAt),type:input.type,plantId:input.plantId??null};if(!isEnumValue(value.type,ACTIVITY_TYPES))errors.push('El tipo de actividad no es válido.');if(!Number.isFinite(value.occurredAt))errors.push('La fecha de la actividad es obligatoria.');if(!value.cultivationId)errors.push('La actividad debe pertenecer a un cultivo.');if(!value.lotId)errors.push('La actividad debe pertenecer a un lote.');return{valid:errors.length===0,errors,value}}
  function assertValid(result){if(result.valid)return result.value;const error=new Error(result.errors.join(' '));error.validationErrors=result.errors;throw error}

  globalThis.CultivoModels=Object.freeze({PRODUCT_TYPES,RECIPE_TYPES,ACTIVITY_TYPES,LOT_STAGES,UNITS,CULTIVATION_STATUSES,UNIT_LABELS,normalizeText,normalizeUnit,isEnumValue,calculateDose,createId,validateProduct,validateCultivation,validateSpace,validateLot,validateRecipe,validateActivity,assertValid});
})();

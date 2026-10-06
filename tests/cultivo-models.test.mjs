import assert from 'node:assert/strict';
import '../cultivo-models.js';

const M=globalThis.CultivoModels;

assert.equal(M.isEnumValue('fertilizer',M.PRODUCT_TYPES),true);
assert.equal(M.isEnumValue('unknown',M.PRODUCT_TYPES),false);
assert.equal(M.isEnumValue('flowering',M.LOT_STAGES),true);
assert.deepEqual(M.LOT_STAGES,['germination','mother','clone','rooting','vegetative','flowering','harvest','finished']);
assert.equal(M.PRODUCT_TYPE_LABELS.ph_corrector,'Corrector de pH');
assert.equal(M.RECIPE_TYPE_LABELS.irrigation,'Riego / Nutrientes');
assert.equal(M.normalizeUnit('g/L'),'g_per_l');
assert.equal(M.normalizeUnit(' ml / L '),'ml_per_l');
assert.equal(M.normalizeUnit('%'),'percent');
assert.deepEqual(M.calculateDose(1,'g_per_l',8),{amount:8,unit:'g'});
assert.deepEqual(M.calculateDose(2,'ml/L',8),{amount:16,unit:'ml'});
assert.equal(M.calculateDose(1,'other',8),null);
assert.equal(M.calculateDose(-1,'g_per_l',8),null);
assert.equal(M.validateLiters(10).valid,true);
assert.equal(M.validateLiters(0).valid,false);
assert.equal(M.validateLiters('x').valid,false);
assert.deepEqual(M.createProductSnapshot({name:'  Hakaphos  Verde ',brand:' Compo '}),{name:'Hakaphos Verde',brand:'Compo'});
const composition={targetPh:6.2,targetEc:1.4,notes:'Base',items:[{productId:'p1',productSnapshot:{name:'Hakaphos',brand:'Compo'},amount:1,unit:'g_per_l'}]};
assert.equal(M.validateRecipeVersion(composition).valid,true);
assert.equal(M.sameRecipeComposition(composition,{...composition,items:[{...composition.items[0],productSnapshot:{name:'Nombre nuevo',brand:'Otra'}}]}),true);
assert.equal(M.sameRecipeComposition(composition,{...composition,items:[{...composition.items[0],amount:2}]}),false);
assert.equal(M.validateRecipeVersion({...composition,items:[composition.items[0],composition.items[0]]}).valid,false);
assert.equal(M.validateProduct({name:'',type:'other',baseUnit:'g'}).valid,false);
assert.equal(M.validateProduct({name:'Hakaphos',type:'fertilizer',baseUnit:'g'}).valid,true);
assert.equal(M.validateLot({cultivationId:'c1',spaceId:'s1',name:'Tanda 01',stage:'flowering'}).valid,true);
assert.equal(M.validateLot({cultivationId:'c1',spaceId:'s1',name:'Tanda 01',stage:'invalid'}).valid,false);
assert.equal(M.validateLot({cultivationId:'c1',spaceId:'s1',name:'SOG',stage:'vegetative',vegetativeWeeks:2,floweringWeeks:8}).valid,true);
assert.equal(M.validateLot({cultivationId:'c1',spaceId:'s1',name:'SOG',stage:'vegetative',vegetativeWeeks:-1,floweringWeeks:8}).valid,false);
assert.equal(M.validateCultivation({name:'Madres',startDate:'2026-01-01',cultivationMode:'continuous',currentStage:'mother'}).valid,true);
assert.equal(M.validateCultivation({name:'Flora',startDate:'2026-09-01',plannedEndDate:'2026-08-01',cultivationMode:'cycle',currentStage:'flowering'}).valid,false);

console.log('cultivo-models: pruebas correctas');

const model=globalThis.CultivoModels;
let flowering=model.floweringDates('2026-10-05',[{variety:'Orange Blossom',floweringWeeks:9},{variety:'White Gorilla',floweringWeeks:8}]);
assert.equal(flowering.end,'2026-12-07');assert.equal(flowering.dates[1].end,'2026-11-30');
assert.equal(model.floweringDates('2026-10-05',[{floweringWeeks:9},{floweringWeeks:null}]).end,null);
assert.equal(model.floweringDates('2026-12-28',[{floweringWeeks:1}]).end,'2027-01-04');
assert.equal(model.validateCultivation({name:'Plan',startDate:'2026-10-05'}).value.status,'planned');
const grouped=model.plantGroups([{id:'a',groupId:'g',variety:'OB',origin:'clone',floweringWeeks:9},{id:'b',groupId:'g',variety:'OB',origin:'clone',floweringWeeks:9},{id:'c',groupId:'g',variety:'OB',origin:'clone',floweringWeeks:8}]);
assert.equal(grouped.length,2);assert.equal(grouped[0].plants.length,2);
console.log('Planned default, strain flowering dates, unknown durations and group separation: passed');

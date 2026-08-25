import assert from 'node:assert/strict';
import '../cultivo-models.js';

const M=globalThis.CultivoModels;

assert.equal(M.isEnumValue('fertilizer',M.PRODUCT_TYPES),true);
assert.equal(M.isEnumValue('unknown',M.PRODUCT_TYPES),false);
assert.equal(M.isEnumValue('flowering',M.LOT_STAGES),true);
assert.equal(M.normalizeUnit('g/L'),'g_per_l');
assert.equal(M.normalizeUnit(' ml / L '),'ml_per_l');
assert.equal(M.normalizeUnit('%'),'percent');
assert.deepEqual(M.calculateDose(1,'g_per_l',8),{amount:8,unit:'g'});
assert.deepEqual(M.calculateDose(2,'ml/L',8),{amount:16,unit:'ml'});
assert.equal(M.calculateDose(1,'other',8),null);
assert.equal(M.calculateDose(-1,'g_per_l',8),null);
assert.equal(M.validateProduct({name:'',type:'other',baseUnit:'g'}).valid,false);
assert.equal(M.validateProduct({name:'Hakaphos',type:'fertilizer',baseUnit:'g'}).valid,true);
assert.equal(M.validateLot({cultivationId:'c1',spaceId:'s1',name:'Tanda 01',stage:'flowering'}).valid,true);
assert.equal(M.validateLot({cultivationId:'c1',spaceId:'s1',name:'Tanda 01',stage:'invalid'}).valid,false);

console.log('cultivo-models: pruebas correctas');

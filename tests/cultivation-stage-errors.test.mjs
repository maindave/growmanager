import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const ctx=vm.createContext({console:{error(){}},navigator:{onLine:true}});
const code=fs.readFileSync(new URL('../cultivo-repository.js',import.meta.url),'utf8').replace('globalThis.CultivoRepository=Object.freeze({','globalThis.testReadableError=readableError;globalThis.CultivoRepository=Object.freeze({');
vm.runInContext(code,ctx);
assert.match(ctx.testReadableError({message:'stage_date_before_previous_stage'}).message,/se superpone con una etapa anterior/);
assert.match(ctx.testReadableError({message:'stage_date_before_cultivation_start'}).message,/inicio del cultivo/);
console.log('Stage date errors: understandable Spanish messages passed');

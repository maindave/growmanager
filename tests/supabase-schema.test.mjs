import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const schema=await readFile(new URL('../supabase/migrations/202608260001_initial_schema.sql',import.meta.url),'utf8');
const rls=await readFile(new URL('../supabase/migrations/202608260002_rls.sql',import.meta.url),'utf8');
const functions=await readFile(new URL('../supabase/migrations/202608260003_recipe_functions.sql',import.meta.url),'utf8');
const tables=['profiles','cultivations','spaces','lots','plants','products','recipes','recipe_versions','recipe_items','activities'];
for(const table of tables){assert.match(schema,new RegExp(`create table public\\.${table} \\(`));assert.match(rls,new RegExp(`public\\.${table}`))}
assert.doesNotMatch(rls,/using\s*\(\s*true\s*\)/i);
assert.doesNotMatch(`${schema}\n${rls}\n${functions}`,/service_role|postgres(?:ql)?:\/\//i);
assert.match(rls,/revoke all on table/);
assert.match(rls,/to authenticated/);
assert.match(functions,/security invoker/);
assert.match(functions,/create_recipe_with_version/);
assert.match(functions,/create_recipe_version/);
console.log('supabase-schema: estructura y RLS correctos');

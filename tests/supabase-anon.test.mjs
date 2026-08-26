import assert from 'node:assert/strict';

const url='https://rzkocbaztxasbnchgwwy.supabase.co/rest/v1/products?select=id';
const key='sb_publishable_xnMIKJ72WwniGvsKuUJ0xQ_HKiX8M0K';
const response=await fetch(url,{headers:{apikey:key}});
const body=await response.json();
assert.equal(response.status,401);
assert.equal(body.code,'42501');
console.log('supabase-anon: acceso anónimo bloqueado correctamente');

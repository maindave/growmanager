import {execFileSync} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const dir=await mkdtemp(join(tmpdir(),'grow-native-tests-'));
try{
 for(const name of ['environment-control','environment-cloud']){
  const source=fileURLToPath(new URL(`./${name}.test.cpp`,import.meta.url)),binary=join(dir,name);
  execFileSync(process.env.CXX||'c++',['-std=c++11','-Wall','-Wextra','-Werror',source,'-o',binary]);
  process.stdout.write(execFileSync(binary));
 }
 const firmware=await readFile(new URL('../firmware/Sketch_API_V1/Sketch_API_V1.ino',import.meta.url),'utf8');
 const setup=firmware.slice(firmware.indexOf('void setup()'));
 assert.match(setup,/loadEnvironmentConfig\(\)/);assert.match(setup,/loadCloudPairing\(\)/);
 assert.match(firmware,/environmentBootId=ESP.random\(\)/);
 const tls=await readFile(new URL('../firmware/Sketch_API_V1/CooperativeCloudTls.h',import.meta.url),'utf8');
 assert.doesNotMatch(firmware,/setInsecure|sendToGoogleSheets|timeClient\.update|environment-gateway/);
 assert.match(tls,/BR_TLS12,BR_TLS12/);assert.match(tls,/br_x509_minimal_set_time/);
 assert.match(firmware,/server\.on\("\/api\/environment\/cloud", HTTP_POST/);
 const builder=firmware.slice(firmware.indexOf('String buildStatusJson'),firmware.indexOf('void handleApiStatus'));
 assert.doesNotMatch(builder,/cloudPairing\.token/);
 console.log('Direct cloud integration guards: passed');
}finally{await rm(dir,{recursive:true,force:true})}

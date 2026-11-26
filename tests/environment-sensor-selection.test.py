"""Exercise actual firmware selection, activation guard and controller wiring."""
from pathlib import Path
import subprocess,tempfile
s=(Path(__file__).resolve().parents[1]/'firmware/Sketch_API_V1/Sketch_API_V1.ino').read_text()
helpers=s.split('bool supervisedSensorFresh(int sensor) {',1)[1].split('uint32_t heaterSensorAgeMs()',1)[0]
controller=s.split('void runEnvironmentControl() {',1)[1].split('String environmentJsonWithEvents',1)[0]
# Test the exact activation guard expression used by the endpoint.
guard=s.split('if(next.enabled&&(!environmentConfig.enabled||nextSensor!=environmentSensor)&&',1)[1].split(') {',1)[0]
code='''#include <cassert>
#include <cmath>
unsigned long now=10000;unsigned long millis(){return now;}
bool dhtSala2Fresh=true,dhtSala2HasReading=true,firstFresh=false;
unsigned long dhtSala2LastSuccessAt=9000;
float temperature=99,humidity=0,temperatureSala2=24.5,humiditySala2=47.5;
bool environmentSensorFresh(){return firstFresh;}
bool supervisedSensorFresh(int sensor) {'''+helpers+'''
struct Config{bool enabled=false;};Config next,environmentConfig;int environmentSensor=1,nextSensor=1;
namespace GrowEnvironment {bool validReading(float t,float h){return std::isfinite(t)&&std::isfinite(h)&&t>=-20&&t<=80&&h>0&&h<=100;}}
bool activationRejected(){return next.enabled&&(!environmentConfig.enabled||nextSensor!=environmentSensor)&&'''+guard+''';}
int main(){
 assert(!supervisedSensorFresh(1));assert(supervisedSensorFresh(2));
 assert(supervisedTemperature(2)==24.5f&&supervisedHumidity(2)==47.5f);
 next.enabled=true;nextSensor=1;assert(activationRejected());
 nextSensor=2;assert(!activationRejected());
 now=25001;assert(!supervisedSensorFresh(2));assert(activationRejected());
 next.enabled=false;assert(!activationRejected());
 now=10000;dhtSala2HasReading=false;next.enabled=true;assert(activationRejected());
 dhtSala2HasReading=true;humiditySala2=NAN;assert(activationRejected());
 humiditySala2=47.5;environmentConfig.enabled=true;environmentSensor=2;nextSensor=1;assert(activationRejected());
 firstFresh=true;temperature=23;humidity=60;assert(!activationRejected());
}
'''
assert 'supervisedSensorFresh(environmentSensor),supervisedTemperature(environmentSensor),supervisedHumidity(environmentSensor)' in controller
assert 'EEPROM.put(EEPROM_ENV_SENSOR,environmentSensor)' in s
assert 'EEPROM.get(EEPROM_ENV_SENSOR,environmentSensor)' in s
with tempfile.TemporaryDirectory() as d:
 p=Path(d);(p/'test.cpp').write_text(code);subprocess.run(['clang++','-std=c++17',str(p/'test.cpp'),'-o',str(p/'test')],check=True);subprocess.run([str(p/'test')],check=True)
print('Actual firmware: selected sensor, stale/invalid data, switch guard and disabled save passed')

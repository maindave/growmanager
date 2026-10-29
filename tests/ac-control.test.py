"""Exercise the actual firmware AC controller on the host (requires clang++)."""
from pathlib import Path
import subprocess
import tempfile

source = (Path(__file__).resolve().parents[1] / 'firmware/Sketch_API_V1/Sketch_API_V1.ino').read_text()
controller = source.split('void automaticACControl() {', 1)[1].split('\nvoid automaticVentilationControl()', 1)[0]
program = '''#include <cassert>
const int FN_AC=8, MODE_AUTO=1;
int assigned=0, relayModes[4]={1,1,1,1};
struct RelayTest {bool active=false;};
RelayTest relayTests[4];
bool relayStates[4]={}, dhtReadingFresh=true;
float temperature=25, acOnTemperature=26, acOffTemperature=24;
int findRelayByFunction(int fn){assert(fn==FN_AC); return assigned;}
void setRelayState(int id,bool state){relayStates[id-1]=state;}
void automaticACControl() {''' + controller + '''
int main(){
  for(int i=0;i<4;i++) {
    assigned=i;
    temperature=25; automaticACControl(); assert(!relayStates[i]);
    temperature=26; automaticACControl(); assert(relayStates[i]);
    temperature=25; automaticACControl(); assert(relayStates[i]);
    temperature=24; automaticACControl(); assert(!relayStates[i]);
    acOnTemperature=29; acOffTemperature=27;
    temperature=28; automaticACControl(); assert(!relayStates[i]);
    temperature=29; automaticACControl(); assert(relayStates[i]);
    dhtReadingFresh=false; automaticACControl(); assert(!relayStates[i]);
    dhtReadingFresh=true; relayModes[i]=0;
    automaticACControl(); assert(!relayStates[i]);
    relayStates[i]=true; temperature=20;
    automaticACControl(); assert(relayStates[i]);
    relayStates[i]=false; relayModes[i]=1;
    acOnTemperature=26; acOffTemperature=24;
  }
  assigned=0;temperature=30;relayTests[0].active=true;
  automaticACControl();assert(!relayStates[0]);
  assigned=-1; automaticACControl();
}
'''
with tempfile.TemporaryDirectory() as folder:
    cpp = Path(folder) / 'ac.cpp'
    cpp.write_text(program)
    binary = Path(folder) / 'ac-test'
    subprocess.run(['clang++', str(cpp), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print('AC: thresholds, hysteresis, all outlets, manual mode and sensor failure passed.')

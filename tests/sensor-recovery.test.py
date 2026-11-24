"""Host tests of the shipped reader, scheduling, and JSON validation."""
from pathlib import Path
import subprocess,tempfile
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as folder:
 p=Path(folder)
 (p/'Arduino.h').write_text('''#pragma once
#include <stdint.h>
#include <cmath>
using word=uint16_t;
#define HIGH 1
#define LOW 0
#define INPUT_PULLUP 2
#define OUTPUT 1
#define microsecondsToClockCycles(x) ((x)*160)
extern uint32_t clockUs,releaseUs;extern int mode,scenario;extern bool locked,releasedLocked;
inline uint32_t micros(){return clockUs++;}
inline uint32_t millis(){return clockUs/1000;}
inline void delay(unsigned n){clockUs+=n*1000;}
inline void delayMicroseconds(unsigned n){clockUs+=n;}
inline void noInterrupts(){locked=true;}
inline void interrupts(){locked=false;}
inline void pinMode(int,int m){if(mode==OUTPUT&&m==INPUT_PULLUP){releaseUs=clockUs;releasedLocked=locked;}mode=m;}
inline void digitalWrite(int,int){}
inline int digitalRead(int){
 clockUs++;
 if(scenario==1)return LOW;
 if(!releaseUs||scenario==2)return HIGH;
 uint32_t t=clockUs-releaseUs;
 if(t<20)return HIGH;if(t<100)return LOW;if(t<180)return HIGH;t-=180;if(scenario==4)return LOW;
 uint8_t bytes[]={2,138,0,250,134};if(scenario==3)bytes[4]++; // 65.0% / 25.0C
 for(int i=0;i<40;i++){if(t<50)return LOW;t-=50;bool bit=bytes[i/8]&(128>>(i%8));uint32_t width=bit?70:27;if(t<width)return HIGH;t-=width;}
 return LOW;
}
''')
 (p/'test.cpp').write_text('''#include <cassert>
#include "GrowDHT.h"
#include "SensorReadScheduler.h"
#include "JsonValidity.h"
uint32_t clockUs=10000000,releaseUs=0;int mode=INPUT_PULLUP,scenario=0;bool locked=false,releasedLocked=false;
int main(){
 GrowSensors::Schedule s;s.begin(0);assert(s.take(4999)==-1);assert(s.take(5000)==0);assert(s.take(7499)==-1);assert(s.take(7500)==1);assert(s.take(10000)==0);assert(s.take(30000)==1);assert(s.take(30001)==-1);assert(s.take(30250)==0);
 s.begin(UINT32_MAX-1000);assert(s.take(3998)==-1);assert(s.take(3999)==0);assert(s.take(6499)==1);
 const char* good[]={"{}","{\\"a\\":[1,-2.1e3,true,false,null,\\"x\\\\n\\"]}"};for(auto v:good)assert(GrowJson::validObject(v,strlen(v)));
 const char* bad[]={"{\\"environment\\":]}","{\\"a\\":01}","{\\"a\\":NaN}","{\\"a\\":[1,]}","{}x","{\\"a\\":\\"x"};for(auto v:bad)assert(!GrowJson::validObject(v,strlen(v)));
 GrowDHT d(5,DHT21);d.begin();assert(std::abs(d.readTemperature()-25)<.01);assert(std::abs(d.readHumidity()-65)<.01);assert(releasedLocked&&!locked);assert(d.lastError()==GrowDHT::Ok);
 clockUs+=5000000;scenario=1;assert(std::isnan(d.readTemperature()));assert(d.lastError()==GrowDHT::LineHeldLow);assert(!locked&&mode==INPUT_PULLUP);
 clockUs+=5000000;scenario=2;assert(std::isnan(d.readTemperature()));assert(d.lastError()==GrowDHT::ResponseHighTimeout);assert(d.lastReadMicros()<5000);assert(!locked);
 clockUs+=5000000;scenario=4;releaseUs=0;assert(std::isnan(d.readTemperature()));assert(d.lastError()==GrowDHT::DataTimeout);assert(d.lastReadMicros()<5000);assert(!locked);
 clockUs+=5000000;scenario=3;releaseUs=0;assert(std::isnan(d.readTemperature()));assert(d.lastError()==GrowDHT::Checksum);assert(!locked);
 clockUs+=5000000;scenario=0;releaseUs=0;assert(std::abs(d.readTemperature()-25)<.01);assert(d.lastError()==GrowDHT::Ok);
}
''')
 subprocess.run(['clang++','-std=c++17','-I'+folder,'-I'+str(root/'firmware/Sketch_API_V1'),str(p/'test.cpp'),str(root/'firmware/Sketch_API_V1/GrowDHT.cpp'),'-o',str(p/'test')],check=True)
 subprocess.run([str(p/'test')],check=True)
print('Reader waveform, failure/recovery, scheduler and JSON tests passed')

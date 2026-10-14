#include <assert.h>
#include <stdio.h>
#include "../firmware/Sketch_API_V1/RelaySafetyPolicy.h"
int main(){
 using namespace GrowRelay;
 SensorProtectionConfig config;assert(validConfig(config)&&config.enabled&&config.timeoutSeconds==300);
 config.timeoutSeconds=59;assert(!validConfig(config));config.timeoutSeconds=3601;assert(!validConfig(config));
 Safety s;
 assert(s.request(true,true,true,0,300000));
 assert(s.request(true,true,true,299999,300000)); // No early cutoff.
 assert(!s.request(true,true,true,300000,300000));assert(s.reason==Safety::SensorFault);
 assert(!s.request(true,true,true,0,300000)); // Fresh data alone cannot silently rearm.
 assert(!s.acknowledge(false));assert(s.acknowledge(true));assert(s.request(true,true,true,0,300000));
 assert(!s.request(true,true,true,600000,300000));
 assert(s.request(true,false,true,600000,300000));assert(s.reason==Safety::Ready); // Reassigned to incubator etc.
 assert(!s.request(true,true,true,600000,300000)); // Reassigned back to heater.
 assert(s.request(true,true,false,600000,300000));assert(s.reason==Safety::Ready); // Disable protection.
 s.reset();assert(s.request(true,true,true,599999,600000));assert(!s.request(true,true,true,600000,600000));
 s.reset();assert(!s.request(false,true,true,300000,300000));assert(s.reason==Safety::SensorFault); // OFF also reports lock.
 // Relocation: only the channel currently assigned to heater can be latched.
 Safety channels[4];
 for(int heater=0;heater<4;heater++)for(int i=0;i<4;i++){
   channels[i].reset();bool on=channels[i].request(true,i==heater,true,3600000,300000);
   assert(on==(i!=heater));assert((channels[i].reason==Safety::SensorFault)==(i==heater));
 }
 // Light, fan, incubator and unassigned channels have no runtime cutoff.
 for(int i=0;i<4;i++)assert(channels[i].request(true,false,true,UINT32_MAX,300000));
 uint32_t last=UINT32_MAX-100000,now=199999;assert(uint32_t(now-last)==300000);
 s.reset();assert(!s.request(true,true,true,uint32_t(now-last),300000));
 puts("Heater-only sensor timeout, reassignment, recovery, disable and wraparound: passed");
}

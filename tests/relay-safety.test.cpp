#include <assert.h>
#include "../firmware/Sketch_API_V1/RelaySafetyPolicy.h"
int main(){
 using GrowRelay::Safety;
 Safety s;s.boot(true);assert(!s.request(0,true,true,true,900000));assert(!s.acknowledge(false));assert(s.acknowledge(true));
 assert(s.request(100,true,true,true,900000));assert(s.request(899999,true,true,true,900000));
 assert(!s.request(900100,true,true,true,900000));assert(s.reason==Safety::RuntimeLimit);
 assert(!s.request(900101,true,true,true,900000));assert(s.acknowledge(true));assert(s.request(900102,true,true,true,900000));
 assert(!s.request(900103,true,true,false,900000));assert(s.reason==Safety::SensorFault);
 assert(s.acknowledge(true));assert(s.request(0xfffffff0,true,true,true,32));assert(!s.request(16,true,true,true,32));
 s.boot(false);assert(s.request(0,true,false,false,0));assert(s.request(4000000000u,true,false,false,0));
 s.boot(false);assert(s.request(0,true,false,true,3600000));assert(!s.request(3600000,true,false,true,3600000));
 s.boot(true);assert(!s.request(0,true,true,true,900000));
 s.acknowledge(true);s.request(0,true,true,true,100);s.reason=Safety::Overtemperature;assert(!s.request(101,true,true,false,100));assert(s.reason==Safety::Overtemperature);
}

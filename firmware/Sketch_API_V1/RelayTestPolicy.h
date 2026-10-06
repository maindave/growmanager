#pragma once
#include <stdint.h>
namespace GrowRelay {
struct Test {
 bool active=false, state=false, previous=false;
 uint32_t started=0, duration=10000;
 void begin(uint32_t now,bool value,bool current,uint32_t seconds=10){if(!active)previous=current;active=true;state=value;started=now;duration=seconds*1000;}
 bool expired(uint32_t now)const{return active&&uint32_t(now-started)>=duration;}
 bool stop(){active=false;return previous;}
};
}

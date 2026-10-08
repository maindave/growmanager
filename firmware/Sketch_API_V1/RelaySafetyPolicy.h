#pragma once
#include <stdint.h>
namespace GrowRelay {
// All deadlines use elapsed monotonic time, independent of Internet and wall clock.
struct Safety {
 enum Reason : uint8_t { Ready=0, StartupReview=1, SensorFault=2, Overtemperature=3, RuntimeLimit=4 };
 bool on=false; uint32_t started=0; Reason reason=Ready;
 void boot(bool heater){on=false;reason=heater?StartupReview:Ready;}
 bool request(uint32_t now,bool requested,bool heater,bool safe,uint32_t limit){
  if(on && reason==Ready && heater && !safe) reason=SensorFault;
  if(on && reason==Ready && limit && uint32_t(now-started)>=limit) reason=RuntimeLimit;
  if(!requested || reason!=Ready || (heater&&!safe)){on=false;return false;}
  if(!on)started=now;
  on=true;return true;
 }
 bool acknowledge(bool safe){if(!safe||on)return false;reason=Ready;return true;}
};
}

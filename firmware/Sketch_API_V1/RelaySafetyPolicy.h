#pragma once
#include <stdint.h>
namespace GrowRelay {
// Separate EEPROM record preserves existing room and environment settings.
struct SensorProtectionConfig {
 uint32_t magic=0x47525331;
 uint32_t timeoutSeconds=300;
 bool enabled=true;
};
inline bool validConfig(const SensorProtectionConfig& c) {
 return c.magic==0x47525331 && c.timeoutSeconds>=60 && c.timeoutSeconds<=3600;
}
struct Safety {
 enum Reason : uint8_t { Ready=0, SensorFault=2 };
 bool on=false; Reason reason=Ready;
 void reset(){on=false;reason=Ready;}
 // Age is since the last valid reading, or boot if none. Only heater is latched.
 bool request(bool requested,bool heater,bool enabled,uint32_t ageMs,uint32_t timeoutMs){
  if(!heater||!enabled){reason=Ready;on=requested;return on;}
  if(ageMs>=timeoutMs)reason=SensorFault;
  on=requested&&reason==Ready;return on;
 }
 bool acknowledge(bool recovered){if(!recovered)return false;reason=Ready;return true;}
};
}

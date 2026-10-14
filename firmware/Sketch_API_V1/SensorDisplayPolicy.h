#pragma once
#include <stdint.h>
#include <math.h>
namespace GrowEnvironment {
// Display targets never participate in actuator decisions. Separate EEPROM record.
struct DisplayConfig {
 uint32_t magic=0x47524431;
 float humidityMin=55,humidityMax=70;
};
inline bool validDisplayConfig(const DisplayConfig& c) {
 return c.magic==0x47524431&&isfinite(c.humidityMin)&&isfinite(c.humidityMax)&&
  c.humidityMin>=1&&c.humidityMax<=100&&c.humidityMax>c.humidityMin;
}
}

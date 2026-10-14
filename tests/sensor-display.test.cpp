#include <assert.h>
#include <stdio.h>
#include "../firmware/Sketch_API_V1/SensorDisplayPolicy.h"
int main(){
 GrowEnvironment::DisplayConfig c;assert(GrowEnvironment::validDisplayConfig(c));assert(c.humidityMin==55&&c.humidityMax==70);
 c.humidityMin=70;assert(!GrowEnvironment::validDisplayConfig(c));c.humidityMin=71;assert(!GrowEnvironment::validDisplayConfig(c));
 c.humidityMin=NAN;assert(!GrowEnvironment::validDisplayConfig(c));c.humidityMin=0;assert(!GrowEnvironment::validDisplayConfig(c));
 c.humidityMin=1;c.humidityMax=100;assert(GrowEnvironment::validDisplayConfig(c));c.humidityMax=101;assert(!GrowEnvironment::validDisplayConfig(c));
 puts("Sensor display target validation: passed");
}

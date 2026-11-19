#include <assert.h>
#include <stdio.h>
#include "../firmware/Sketch_API_V1/HardwarePinPolicy.h"
int main(){
 assert(GrowPins::count==16);
 assert(GrowPins::parse("D9")==2&&GrowPins::allowed(2));
 assert(GrowPins::parse("D8")==0&&GrowPins::allowed(0));
 assert(!GrowPins::allowed(GrowPins::parse("D0")));
 assert(!GrowPins::allowed(GrowPins::parse("D10")));
 const char* aliases[][2]={{"D7","D11"},{"D6","D12"},{"D5","D13"},{"D4","D14"},{"D3","D15"}};
 for(const auto& pair:aliases)assert(GrowPins::parse(pair[0])==GrowPins::parse(pair[1]));
 assert(GrowPins::parse("D16")==-1&&!GrowPins::allowed(-1));
 for(unsigned i=0;i<GrowPins::count;i++)assert(GrowPins::parse(GrowPins::name(GrowPins::pins[i].gpio))==GrowPins::pins[i].gpio);
 puts("D1 R1 pins: D0-D15, D9, aliases, reserved pins and canonical names passed");
}

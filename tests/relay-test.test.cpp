#include <cassert>
#include <cstdio>
#include "../firmware/Sketch_API_V1/RelayTestPolicy.h"
#include "../firmware/Sketch_API_V1/EnvironmentalControl.h"
int main(){
 GrowRelay::Test t;t.begin(100,true,false,10);assert(t.active&&t.state);assert(!t.expired(10099));assert(t.expired(10100));assert(!t.stop()&&!t.active);
 t.begin(0,false,true,10);t.begin(2000,true,false,10);assert(t.stop()); // second click retains original state
 t.begin(0xfffffff0,true,false,1);assert(!t.expired(500));assert(t.expired(1000)); // millis rollover
 GrowEnvironment::Config c;GrowEnvironment::Controller controller;GrowEnvironment::Channel ch[4];
 ch[0]=GrowEnvironment::Channel(GrowEnvironment::None,true,true);
 controller.tick(0,c,true,22,60,18,28,ch);assert(controller.count==1);assert(ch[0].on);assert(controller.events[0].outputs==1);
 ch[0].on=false;controller.tick(1,c,true,22,60,18,28,ch);assert(controller.count==2&&controller.events[1].outputs==0);
 controller.tick(2,c,true,35,30,18,28,ch);assert(controller.events[2].state==2&&!controller.events[2].enabled);
 controller.tick(3,c,true,35,30,18,28,ch,1);assert(controller.events[3].testing==1);
 std::puts("Relay test restoration, rollover and monitoring history: passed");
}

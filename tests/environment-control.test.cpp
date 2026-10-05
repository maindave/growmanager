#include "../firmware/Sketch_API_V1/EnvironmentalControl.h"
#include <assert.h>
#include <stdio.h>
using namespace GrowEnvironment;
int main(){
  Config c; assert(validConfig(c)); assert(fabs(vpd(25,60)-1.267)<0.01); assert(isnan(vpd(NAN,50))); assert(isnan(vpd(25,0)));
  c.enabled=true; Controller ctl; Channel ch[4]; ch[0]={Heater,true,false}; ch[1]={Extraction,true,false};
  ctl.tick(0,c,true,20,60,23,27,ch); assert(ch[0].on&&!ch[1].on);
  ctl.tick(100,c,false,20,60,23,27,ch); assert(!ch[0].on&&(ctl.alarms&SensorInvalid));
  ch[0].automatic=false; ch[0].on=true; ctl.tick(200,c,true,36,60,23,27,ch); assert(!ch[0].on&&ch[1].on&&(ctl.alarms&TooHot));
  Controller response; Channel heater[4]; heater[0]={Heater,true,false};
  response.tick(0,c,true,20,60,23,27,heater); response.tick(300000,c,true,20,60,23,27,heater);
  assert((response.alarms&NoResponse)&&!heater[0].on); response.tick(330000,c,true,20,60,23,27,heater); assert(!heater[0].on);
  response.acknowledge(); response.tick(360000,c,true,20,60,23,27,heater); assert(heater[0].on);
  Controller wrap; Channel cold[4]; cold[0]={Heater,true,false};
  wrap.tick(UINT32_MAX-10000,c,true,20,60,23,27,cold); wrap.tick(100,c,true,24,60,23,27,cold); assert(cold[0].on);
  wrap.tick(30000,c,true,24,60,23,27,cold); assert(!cold[0].on);
  Controller interlock; Channel pair[4]; pair[0]={Heater,true,true}; pair[1]={Extraction,true,false};
  interlock.tick(1000,c,true,25,85,23,27,pair); assert(!pair[0].on&&pair[1].on);
  Controller drying; Channel humid[4]; humid[0]={Extraction,true,false};
  drying.tick(0,c,true,25,85,23,27,humid); assert(humid[0].on);
  drying.tick(300000,c,true,25,85,23,27,humid); assert(drying.alarms&NoResponse);
  Controller pulse; Channel fan[4]; fan[0]={Circulation,true,true};
  pulse.tick(0,c,true,30,60,23,27,fan); fan[0].on=false;
  pulse.tick(300000,c,true,30,60,23,27,fan); assert(pulse.alarms&NoResponse);
  Config bad=c; bad.criticalHot=NAN; assert(!validConfig(bad)); bad=c; bad.vpdMax=bad.vpdMin; assert(!validConfig(bad));
  Controller off; Channel manual[4]; manual[0]={Heater,false,true}; Config disabled;
  off.tick(0,disabled,false,0,0,23,27,manual); assert(manual[0].on); puts("Environmental control: passed");
}

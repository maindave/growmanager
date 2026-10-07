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
  pulse.tick(300000,c,true,30,60,23,27,fan); assert(!(pulse.alarms&NoResponse));
  Controller interrupted; Channel intermittent[4]; intermittent[0]={Heater,true,false};
  interrupted.tick(0,c,true,20,60,23,27,intermittent);
  intermittent[0].automatic=false;intermittent[0].on=false;
  interrupted.tick(300000,c,true,20,60,23,27,intermittent);assert(!(interrupted.alarms&NoResponse));
  intermittent[0].automatic=true;interrupted.tick(330000,c,true,20,60,23,27,intermittent);
  interrupted.tick(600000,c,true,20,60,23,27,intermittent);assert(!(interrupted.alarms&NoResponse));
  interrupted.tick(630000,c,true,20,60,23,27,intermittent);assert(interrupted.alarms&NoResponse);assert(interrupted.failedOutputs()==1);
  Controller testingCtl; Channel tested[4];tested[0]={Heater,true,true};
  testingCtl.tick(0,c,true,20,60,23,27,tested,1);testingCtl.tick(300000,c,true,20,60,23,27,tested,1);assert(!(testingCtl.alarms&NoResponse));
  Controller disabledCtl;Channel disabledHeater[4];disabledHeater[0]={Heater,true,false};
  disabledCtl.tick(0,c,true,20,60,23,27,disabledHeater);Config paused=c;paused.enabled=false;
  disabledCtl.tick(100000,paused,true,20,60,23,27,disabledHeater);disabledCtl.tick(300000,c,true,20,60,23,27,disabledHeater);assert(!(disabledCtl.alarms&NoResponse));
  Config bad=c; bad.criticalHot=NAN; assert(!validConfig(bad)); bad=c; bad.vpdMax=bad.vpdMin; assert(!validConfig(bad));
  Controller off; Channel manual[4]; manual[0]={Heater,false,true}; Config disabled;
  off.tick(0,disabled,false,0,0,23,27,manual); assert(manual[0].on); Controller locked;Channel stopped[4];locked.tick(0,disabled,true,25,60,23,27,stopped,0,1);assert(locked.alarms&SafetyLock);assert(locked.events[0].outputs==0);locked.tick(1000,disabled,true,25,60,23,27,stopped,0,1);assert(locked.sequence==1);locked.tick(2000,disabled,true,25,60,23,27,stopped);assert(!(locked.alarms&SafetyLock));assert(locked.sequence==2);puts("Environmental control: passed");
}

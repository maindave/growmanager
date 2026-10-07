#pragma once
#include <stdint.h>
#include <math.h>

namespace GrowEnvironment {
enum Role { None, Circulation, Extraction, Intake, Heater };
enum Alarm : uint16_t { SensorInvalid=1, TooHot=2, TooCold=4, HumidityCritical=8, NoResponse=16 };
struct Config {
  uint32_t magic=0x47524f31;
  bool enabled=false;
  uint8_t stage=1;
  float vpdMin=0.8f, vpdMax=1.2f;
  float criticalHot=35, criticalCold=10, criticalHumidity=90;
  uint32_t minimumSwitchMs=30000, responseWindowMs=300000;
  float responseDelta=0.3f, humidityResponseDelta=2.0f;
  bool exchangeOnSensorFailure=false;
};
inline bool validConfig(const Config& c) {
  return c.magic==0x47524f31 && c.stage<=3 && isfinite(c.vpdMin) && isfinite(c.vpdMax) &&
    c.vpdMin>=0.1f && c.vpdMax>c.vpdMin && c.vpdMax<=4 &&
    isfinite(c.criticalHot) && isfinite(c.criticalCold) && c.criticalCold>=-20 &&
    c.criticalHot<=60 && c.criticalHot>c.criticalCold+5 &&
    isfinite(c.criticalHumidity) && c.criticalHumidity>=70 && c.criticalHumidity<=100 &&
    c.minimumSwitchMs>=5000 && c.minimumSwitchMs<=300000 &&
    c.responseWindowMs>=60000 && c.responseWindowMs<=1800000 &&
    isfinite(c.responseDelta) && c.responseDelta>=0.1f && c.responseDelta<=3 && isfinite(c.humidityResponseDelta) && c.humidityResponseDelta>=0.5f && c.humidityResponseDelta<=10;
}
inline bool validReading(float t,float h) { return isfinite(t)&&isfinite(h)&&t>=-20&&t<=80&&h>0&&h<=100; }
inline float vpd(float t,float h) { return validReading(t,h)?0.6108f*expf(17.27f*t/(t+237.3f))*(1-h/100):NAN; }
struct Channel { Role role; bool automatic, on; Channel(Role r=None,bool a=false,bool o=false):role(r),automatic(a),on(o){} };
struct Event { uint32_t sequence, at; uint16_t alarms; uint8_t outputs, automatic=0, testing=0, state=3; float temperature=NAN, humidity=NAN, minimum=0, maximum=0; uint16_t roles=0; bool enabled=false; Event(uint32_t s=0,uint32_t t=0,uint16_t a=0,uint8_t o=0):sequence(s),at(t),alarms(a),outputs(o){} };
class Controller {
  uint32_t changed[4]={}, started[4]={};
  bool initialized[4]={}, watching[4]={};
  float baseline[4]={};
  bool humidityWatch[4]={};
  Role observedRole[4]={};
  float watchedTarget[4]={};
  uint8_t failed=0, lastOutputs=0;
  uint16_t lastRoles=0,lastAlarms=0; uint8_t lastState=255,lastAutomatic=255,lastTesting=255; float lastMin=0,lastMax=0; bool lastEnabled=false;
  bool recorded=false;
public:
  uint16_t alarms=0;
  static constexpr uint8_t EventCapacity=64;
  Event events[EventCapacity];
  uint32_t sequence=0;
  uint8_t count=0;
  uint8_t failedOutputs() const { return failed; }
  void acknowledge() { failed=0; for(int i=0;i<4;i++) watching[i]=false; }
  void record(uint32_t now,const Config& c,bool valid,float t,float h,Channel (&ch)[4],uint8_t outputs,uint8_t testing){
    float value=vpd(t,h); uint8_t state=!valid?3:value<c.vpdMin?0:value>c.vpdMax?2:1,automatic=0; uint16_t roles=0;
    for(int i=0;i<4;i++){if(ch[i].automatic)automatic|=1<<i;roles|=uint16_t(ch[i].role)<<(i*3);}
    if(!recorded||alarms!=lastAlarms||outputs!=lastOutputs||state!=lastState||automatic!=lastAutomatic||testing!=lastTesting||roles!=lastRoles||c.vpdMin!=lastMin||c.vpdMax!=lastMax||c.enabled!=lastEnabled){
      recorded=true;lastAlarms=alarms;lastOutputs=outputs;lastState=state;lastAutomatic=automatic;lastTesting=testing;lastRoles=roles;lastMin=c.vpdMin;lastMax=c.vpdMax;lastEnabled=c.enabled;
      Event& e=events[sequence%EventCapacity];e=Event(sequence+1,now,alarms,outputs);e.automatic=automatic;e.testing=testing;e.state=state;e.temperature=valid?t:NAN;e.humidity=valid?h:NAN;e.minimum=c.vpdMin;e.maximum=c.vpdMax;e.roles=roles;e.enabled=c.enabled;
      sequence++;if(count<EventCapacity)count++;
    }
  }
  void tick(uint32_t now, const Config& c, bool fresh, float t,float h,float low,float high,Channel (&ch)[4],uint8_t testing=0) {
    bool valid=fresh&&validReading(t,h);
    alarms=valid?0:SensorInvalid;
    if(valid) {
      if(t>=c.criticalHot) alarms|=TooHot;
      if(t<=c.criticalCold) alarms|=TooCold;
      if(h>=c.criticalHumidity) alarms|=HumidityCritical;
    }
    if(!c.enabled){for(int i=0;i<4;i++)watching[i]=false;uint8_t outputs=0;for(int i=0;i<4;i++)if(ch[i].on)outputs|=1<<i;record(now,c,valid,t,h,ch,outputs,testing);return;}
    const float deficit=vpd(t,h);
    // Heating is temperature driven. VPD alone cannot justify drying a hot room.
    bool exchange=valid&&(t>high||(t>=low&&deficit<c.vpdMin&&h>70));
    bool exchangeRunning=false;
    for(int i=0;i<4;i++) if((ch[i].role==Extraction||ch[i].role==Intake)&&ch[i].on) exchangeRunning=true;
    uint8_t outputs=0;
    for(int i=0;i<4;i++) {
      Channel& out=ch[i];
      if(observedRole[i]!=out.role){watching[i]=false;failed&=~(1<<i);observedRole[i]=out.role;}
      if(out.role==None) { if(out.on) outputs|=1<<i; continue; }
      bool wanted=out.on, force=false;
      if(out.automatic) {
        if(out.role==Heater) wanted=valid&&(out.on?t<low+1:t<low)&&!exchange&&!exchangeRunning;
        else if(out.role==Extraction||out.role==Intake) wanted=exchange||(valid&&out.on&&t>high-1);
        // Circulation retains its existing interval strategy, independent of air exchange.
      }
      if(out.role==Heater&&(exchange||exchangeRunning)) { wanted=false; force=true; }
      if(out.role==Heater&&(!valid||(alarms&TooHot)||(failed&(1<<i)))) { wanted=false; force=true; }
      if((out.role==Extraction||out.role==Intake)&&((alarms&TooHot)||(!valid&&c.exchangeOnSensorFailure))) { wanted=true; force=true; }
      if(wanted!=out.on&&(force||!initialized[i]||uint32_t(now-changed[i])>=c.minimumSwitchMs)) {
        out.on=wanted; changed[i]=now; initialized[i]=true;
      }
      const bool exchangeRole=out.role==Extraction||out.role==Intake;
      const bool supervise=valid&&out.on&&out.automatic&&!(testing&(1<<i))&&(out.role==Heater||(exchangeRole&&t>high)||(exchangeRole&&deficit<c.vpdMin&&h>70));
      const bool humidityGoal=exchangeRole&&t<=high;
      const float target=humidityGoal?c.vpdMin:out.role==Heater?low+1:high;
      if(watching[i]&&(humidityWatch[i]!=humidityGoal||watchedTarget[i]!=target))watching[i]=false;
      if(!supervise) watching[i]=false;
      else if(watching[i]&&uint32_t(now-started[i])>=c.responseWindowMs) {
        float effect=humidityWatch[i]?baseline[i]-h:out.role==Heater?t-baseline[i]:baseline[i]-t;
        bool resolved=humidityWatch[i]?vpd(t,h)>=c.vpdMin:out.role==Heater?t>=low+1:t<=high;
        if(!resolved&&effect<(humidityWatch[i]?c.humidityResponseDelta:c.responseDelta)) failed|=1<<i;
        watching[i]=false;
      } else if(supervise&&!watching[i]) {
        watching[i]=true; started[i]=now; humidityWatch[i]=humidityGoal;watchedTarget[i]=target;
        baseline[i]=humidityWatch[i]?h:t;
      }
      if(out.on) outputs|=1<<i;
    }
    if(failed) alarms|=NoResponse;
    // A heater with an ineffective response is stopped in this same tick.
    for(int i=0;i<4;i++) if(ch[i].role==Heater&&(failed&(1<<i))) { ch[i].on=false; outputs&=~(1<<i); }
    record(now,c,valid,t,h,ch,outputs,testing);
  }
};
}

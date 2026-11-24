#pragma once
#include <stdint.h>
namespace GrowSensors {
class Schedule {
 uint32_t due_[2]={0,0},last_=0;bool ready_=false,hadRead_=false;uint8_t next_=0;
public:
 void begin(uint32_t now){due_[0]=now+5000;due_[1]=now+7500;ready_=true;hadRead_=false;next_=0;}
 int take(uint32_t now){
  if(!ready_)begin(now);
  if(hadRead_&&uint32_t(now-last_)<250)return -1;
  for(uint8_t step=0;step<2;step++){
   uint8_t i=(next_+step)%2;
   if(int32_t(now-due_[i])>=0){due_[i]=now+5000;last_=now;hadRead_=true;next_=(i+1)%2;return i;}
  }
  return -1;
 }
};
}

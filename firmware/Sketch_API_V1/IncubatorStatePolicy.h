#pragma once
#include <stdint.h>
namespace GrowRelay {
struct IncubatorState {
 uint32_t magic=0x47524931;
 uint8_t states=0, inverse=255;
 bool valid()const{return magic==0x47524931 && states<16 && uint8_t(states^inverse)==255;}
 bool on(int index)const{return valid()&&index>=0&&index<4&&(states&(1U<<index));}
 bool set(int index,bool value){
  if(index<0||index>3)return false;
  if(!valid())*this=IncubatorState();
  uint8_t next=value?states|(1U<<index):states&~(1U<<index);
  if(next==states)return false;
  states=next;inverse=uint8_t(~states);return true;
 }
};
}

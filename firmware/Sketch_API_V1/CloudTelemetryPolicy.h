#pragma once
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <stdio.h>
namespace GrowCloud {
constexpr uint32_t PublishInterval=60000, TransactionDeadline=15000, SampleInterval=300000;
inline uint32_t retryDelay(unsigned failures){uint32_t delay=PublishInterval;while(failures>1&&delay<900000){delay*=2;failures--;}return delay>900000?900000:delay;}
inline bool expired(uint32_t now,uint32_t started,uint32_t deadline){return uint32_t(now-started)>=deadline;}
struct Reading { uint32_t sequence=0,epoch=0; float temperature=0,humidity=0; };
class Backlog {
public:
 static constexpr size_t Capacity=32;
 Reading readings[Capacity]; uint32_t sequence=0,dropped=0; uint8_t count=0;
 void clear(){count=0;sequence=0;dropped=0;}
 void add(uint32_t epoch,float temperature,float humidity){
  if(count==Capacity){memmove(readings,readings+1,(Capacity-1)*sizeof(Reading));count--;dropped++;}
  Reading& r=readings[count++];r.sequence=++sequence;r.epoch=epoch;r.temperature=temperature;r.humidity=humidity;
 }
 void acknowledge(uint32_t through){size_t n=0;while(n<count&&readings[n].sequence<=through)n++;if(n){memmove(readings,readings+n,(count-n)*sizeof(Reading));count-=n;}}
};
class ResponseHeaders {
 char line[160]={};size_t length=0,total=0;bool first=true,done=false,bad=false;unsigned status=0;uint8_t previous=0;
public:
 void reset(){length=total=status=previous=0;first=true;done=bad=false;}
 bool complete() const{return done;}
 bool invalid() const{return bad;}
 unsigned code() const{return status;}
 void feed(uint8_t value){
  if(done||bad)return;
  if(++total>4096){bad=true;return;}
  if(value=='\n'){
   if(!length||previous!='\r'){bad=true;return;}
   if(first){line[length-1]=0;int parsed=0;char minor=0;if(sscanf(line,"HTTP/1.%c %d",&minor,&parsed)!=2||(minor!='0'&&minor!='1')||parsed<100||parsed>599){bad=true;return;}status=parsed;first=false;}
   else if(length==1)done=true;
   length=0;
  }else{if(first){if(length+1>=sizeof(line)){bad=true;return;}line[length]=value;}length++;}
  previous=value;
 }
};
}

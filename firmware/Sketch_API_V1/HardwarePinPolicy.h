#pragma once
#include <string.h>
namespace GrowPins {
struct Pin { const char* name; int gpio; bool assignable; const char* note; };
// esp8266:esp8266:d1 (D1 R1). Several board labels are the same physical GPIO.
static const Pin pins[] = {
 {"D0",3,false,"Reservado RX USB"},
 {"D1",1,true,"TX: pulsos durante arranque"},
 {"D2",16,true,""}, {"D3",5,true,""}, {"D4",4,true,""},
 {"D5",14,true,""}, {"D6",12,true,""}, {"D7",13,true,""},
 {"D8",0,true,"Debe estar HIGH al arrancar"},
 {"D9",2,true,"Debe estar HIGH al arrancar"},
 {"D10",15,false,"Reservado: debe estar LOW al arrancar"},
 {"D11",13,true,"Equivale a D7"}, {"D12",12,true,"Equivale a D6"},
 {"D13",14,true,"Equivale a D5"}, {"D14",4,true,"Equivale a D4"},
 {"D15",5,true,"Equivale a D3"}
};
static const unsigned count=sizeof(pins)/sizeof(pins[0]);
inline int parse(const char* name){for(unsigned i=0;i<count;i++)if(strcmp(name,pins[i].name)==0)return pins[i].gpio;return -1;}
inline const char* name(int gpio){for(unsigned i=0;i<count;i++)if(pins[i].gpio==gpio)return pins[i].name;return "UNKNOWN";}
inline bool allowed(int gpio){for(unsigned i=0;i<count;i++)if(pins[i].gpio==gpio)return pins[i].assignable;return false;}
}

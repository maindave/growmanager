#include <cassert>
#include <cstring>
#include <cstdio>
#include "../firmware/Sketch_API_V1/PinSelection.h"
int main(){
 GrowPins::Selection selected;
 selected.set(0,"D15");selected.set(1,"D13");
 // Simulate persistence and a fresh instance after reboot.
 unsigned char stored[sizeof(selected)];memcpy(stored,&selected,sizeof(selected));
 GrowPins::Selection rebooted;memcpy(&rebooted,stored,sizeof(rebooted));
 assert(!strcmp(rebooted.label(0,5),"D15"));
 assert(!strcmp(rebooted.label(1,14),"D13"));
 assert(GrowPins::parse(rebooted.label(0,5))==5);
 assert(GrowPins::parse(rebooted.label(1,14))==14);
 // Labels must never override a different active GPIO or invalid legacy data.
 assert(!strcmp(rebooted.label(0,14),"D5"));
 rebooted.magic=0xffffffff;assert(!strcmp(rebooted.label(0,5),"D3"));
 rebooted=GrowPins::Selection();rebooted.labels[0]=250;assert(!strcmp(rebooted.label(0,5),"D3"));
 rebooted.set(0,"D3");assert(!strcmp(rebooted.label(0,5),"D3"));
 puts("Exact pin labels survive storage; GPIO, legacy fallback and mismatch guards passed");
}

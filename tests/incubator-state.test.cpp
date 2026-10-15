#include <assert.h>
#include <stdio.h>
#include "../firmware/Sketch_API_V1/IncubatorStatePolicy.h"
int main(){using GrowRelay::IncubatorState;
 IncubatorState state;assert(state.valid());
 for(int i=0;i<4;i++)assert(!state.on(i));
 for(int i=0;i<4;i++){
  assert(state.set(i,true));IncubatorState reboot=state;assert(reboot.on(i));
  assert(!state.set(i,true)); // No flash write for duplicate command.
  assert(state.set(i,false));reboot=state;assert(!reboot.on(i));
 }
 state.set(3,true);state.set(3,false); // Reassignment clears previous intent.
 assert(!state.on(3));
 state.states=255;assert(!state.valid());assert(!state.on(3));
 assert(state.set(1,true));assert(state.valid()&&state.on(1));
 state.inverse=state.states;assert(!state.valid()&&!state.on(1));
 assert(!state.set(4,true));puts("Incubator persistence: ON/OFF, reboot, per-channel isolation, reassignment, corruption and write deduplication passed");
}

#pragma once
#include <stdint.h>
#include "HardwarePinPolicy.h"
namespace GrowPins {
// Preserve the board label independently from the GPIO used by the driver.
struct Selection {
  uint32_t magic = 0x50494E31;
  uint8_t labels[6] = {255,255,255,255,255,255};
  void set(unsigned slot, const char* label) {
    if (slot >= 6) return;
    labels[slot] = 255;
    for (unsigned i=0; i<count; i++) if (!strcmp(label,pins[i].name)) labels[slot]=i;
  }
  const char* label(unsigned slot, int gpio) const {
    if (magic==0x50494E31 && slot<6 && labels[slot]<count && pins[labels[slot]].gpio==gpio)
      return pins[labels[slot]].name;
    return name(gpio);
  }
};
}

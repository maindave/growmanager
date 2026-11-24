/*!
 *  @file GrowDHT.h
 *
 *  This is a library for GrowDHT series of low cost temperature/humidity sensors.
 *
 *  You must have Adafruit Unified Sensor Library library installed to use this
 * class.
 *
 *  Adafruit invests time and resources providing this open source code,
 *  please support Adafruit andopen-source hardware by purchasing products
 *  from Adafruit!
 *
 *  Written by Adafruit Industries.
 *
 *  MIT license, all text above must be included in any redistribution
 */

#ifndef GROW_DHT_H
#define GROW_DHT_H

#include "Arduino.h"

/* Uncomment to enable printing out nice debug messages. */
//#define GROW_DHT_DEBUG

#define DEBUG_PRINTER                                                          \
  Serial /**< Define where debug output will be printed.                       \
          */

/* Setup debug printing macros. */
#ifdef GROW_DHT_DEBUG
#define DEBUG_PRINT(...)                                                       \
  { DEBUG_PRINTER.print(__VA_ARGS__); }
#define DEBUG_PRINTLN(...)                                                     \
  { DEBUG_PRINTER.println(__VA_ARGS__); }
#else
#define DEBUG_PRINT(...)                                                       \
  {} /**< Debug Print Placeholder if Debug is disabled */
#define DEBUG_PRINTLN(...)                                                     \
  {} /**< Debug Print Line Placeholder if Debug is disabled */
#endif

/* Define types of sensors. */
static const uint8_t DHT11{11};  /**< GrowDHT TYPE 11 */
static const uint8_t DHT12{12};  /**< DHY TYPE 12 */
static const uint8_t DHT21{21};  /**< GrowDHT TYPE 21 */
static const uint8_t DHT22{22};  /**< GrowDHT TYPE 22 */
static const uint8_t AM2301{21}; /**< AM2301 */

#if defined(TARGET_NAME) && (TARGET_NAME == ARDUINO_NANO33BLE)
#ifndef microsecondsToClockCycles
/*!
 * As of 7 Sep 2020 the Arduino Nano 33 BLE boards do not have
 * microsecondsToClockCycles defined.
 */
#define microsecondsToClockCycles(a) ((a) * (SystemCoreClock / 1000000L))
#endif
#endif

/*!
 *  @brief  Class that stores state and functions for GrowDHT
 */
class GrowDHT {
public:
  GrowDHT(uint8_t pin, uint8_t type, uint8_t count = 6);
  void begin(uint8_t usec = 55);
  float readTemperature(bool S = false, bool force = false);
  float convertCtoF(float);
  float convertFtoC(float);
  float computeHeatIndex(bool isFahrenheit = true);
  float computeHeatIndex(float temperature, float percentHumidity,
                         bool isFahrenheit = true);
  float readHumidity(bool force = false);
  bool read(bool force = false);
  enum Error { Ok, NotStarted, LineHeldLow, ResponseLowTimeout, ResponseHighTimeout, DataTimeout, Checksum };
  Error lastError() const { return error_; }
  const char* lastErrorName() const {
    static const char* names[]={"none","not_started","line_held_low","response_low_timeout","response_high_timeout","data_timeout","checksum"};
    return names[unsigned(error_)];
  }
  uint32_t lastReadMicros() const { return duration_; }
  bool idleHigh() const { return idleHigh_; }
  uint32_t errorCount(unsigned i) const { return i<7?errors_[i]:0; }
  uint8_t rawByte(unsigned i) const { return i<5?data[i]:0; }


private:
  Error error_=NotStarted;
  uint32_t duration_=0,errors_[7]={};
  bool idleHigh_=false;
  bool fail(Error error,uint32_t started){error_=error;errors_[unsigned(error)]++;duration_=micros()-started;_lastresult=false;return false;}
  uint8_t data[5]={};
  uint8_t _pin, _type;
#ifdef __AVR
  // Use direct GPIO access on an 8-bit AVR so keep track of the port and
  // bitmask for the digital pin connected to the GrowDHT.  Other platforms will use
  // digitalRead.
  uint8_t _bit, _port;
#endif
  uint32_t _lastreadtime, _maxcycles;
  bool _lastresult;
  uint8_t pullTime; // Time (in usec) to pull up data line before reading

  uint32_t expectPulse(bool level);
};

/*!
 *  @brief  Class that defines Interrupt Lock Avaiability
 */
class GrowDhtInterruptLock {
public:
  GrowDhtInterruptLock() {
#if !defined(ARDUINO_ARCH_NRF52)
    noInterrupts();
#endif
  }
  ~GrowDhtInterruptLock() {
#if !defined(ARDUINO_ARCH_NRF52)
    interrupts();
#endif
  }
};

#endif

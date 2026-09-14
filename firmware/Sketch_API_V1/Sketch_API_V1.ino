#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <WiFiClientSecure.h>
#include <ESP8266mDNS.h>
#include <WiFiUdp.h>
#include <ArduinoOTA.h>
#include <DHT.h>
#include <NTPClient.h>
#include <EEPROM.h>

// ======================================================
// ARDUINO CULTIVO V2.4
// Functions + Auto / Manual
// ======================================================

const char* firmwareVersion = "2.5-ventilation-modes";
const char* deviceName = "armario-cultivo";

// ======================================================
// WIFI
// ======================================================

const char* ssid = "Irupe";
const char* password = "10203040";

// ======================================================
// GOOGLE SHEETS
// ======================================================

const char* googleScriptPath =
  "/macros/s/AKfycbw1UZ6ZYhd1J3yHvl9Agxx2ZNXXPTMheEhp86yiE2EikOgadgoWA6gLie8bVMc5IrXQ/exec";

const char* googleHost = "script.google.com";

// ======================================================
// EEPROM
// ======================================================

#define EEPROM_SIZE 256

// Hardware
#define EEPROM_HW_MAGIC       40
#define EEPROM_PIN_DHT        44
#define EEPROM_PIN_RELAY1     48
#define EEPROM_PIN_RELAY2     52
#define EEPROM_PIN_RELAY3     56
#define EEPROM_PIN_RELAY4     60

// Funciones
#define EEPROM_FN_MAGIC       64
#define EEPROM_RELAY1_FN      68
#define EEPROM_RELAY2_FN      69
#define EEPROM_RELAY3_FN      70
#define EEPROM_RELAY4_FN      71

// Modos
#define EEPROM_RELAY1_MODE    72
#define EEPROM_RELAY2_MODE    73
#define EEPROM_RELAY3_MODE    74
#define EEPROM_RELAY4_MODE    75

// Configuración cultivo
#define EEPROM_LIGHT_HOUR     80
#define EEPROM_LIGHT_MIN      84
#define EEPROM_LIGHT_DURATION 88

#define EEPROM_TEMP_MIN       92
#define EEPROM_TEMP_MAX       96

#define EEPROM_CONFIG_MAGIC   100
#define EEPROM_VENT_MODE      104
#define EEPROM_VENT_INTERVAL  108
#define EEPROM_VENT_DURATION  112
#define EEPROM_VENT_EMERGENCY 116
#define EEPROM_VENT_MAGIC     120

#define HW_MAGIC_VALUE        2303
#define FN_MAGIC_VALUE        2404
#define CONFIG_MAGIC_VALUE    2405
#define VENT_MAGIC_VALUE      2501

// ======================================================
// HARDWARE
// ======================================================

int pinDHT = D5;

int relayPins[4] = {
  D1,
  D2,
  D6,
  D7
};

#define DHTTYPE DHT21
DHT* dht = nullptr;

#define SOIL_PIN A0

bool soilEnabled = false;

// ======================================================
// RELAY LOGIC
// ======================================================

#define RELAY_ON HIGH
#define RELAY_OFF LOW

bool relayStates[4] = {
  false,
  false,
  false,
  false
};

// ======================================================
// FUNCIONES
// ======================================================

enum RelayFunction : byte {

  FN_NONE = 0,
  FN_LIGHT = 1,
  FN_VENTILATION = 2,
  FN_HEATER = 3,
  FN_PUMP = 4
};

enum RelayMode : byte {

  MODE_MANUAL = 0,
  MODE_AUTO = 1
};

RelayFunction relayFunctions[4] = {

  FN_NONE,
  FN_NONE,
  FN_NONE,
  FN_NONE
};

RelayMode relayModes[4] = {

  MODE_MANUAL,
  MODE_MANUAL,
  MODE_MANUAL,
  MODE_MANUAL
};

// ======================================================
// CONFIGURACIÓN AUTOMÁTICA
// ======================================================

int lightStartHour = 18;
int lightStartMinute = 0;

int lightDurationHours = 12;

float tempMin = 23.0;
float tempMax = 27.0;

// Ventilación configurable: intervalos, temperatura o ambas.

enum VentilationMode : byte {
  VENT_INTERVAL,
  VENT_TEMPERATURE,
  VENT_COMBINED
};

VentilationMode ventilationMode = VENT_COMBINED;

unsigned long ventilationInterval =
  10UL * 60UL * 1000UL;

unsigned long ventilationDuration =
  2UL * 60UL * 1000UL;

unsigned long ventilationEmergencyDuration =
  3UL * 60UL * 1000UL;

const unsigned long ventilationEmergencyCooldown =
  2UL * 60UL * 1000UL;

unsigned long lastVentilationCycle = 0;
unsigned long ventilationCycleStart = 0;

bool periodicVentilationActive = false;
bool emergencyVentilationActive = false;
unsigned long emergencyVentilationStart = 0;
unsigned long lastEmergencyVentilationEnd = 0;

// ======================================================
// DHT
// ======================================================

float temperature = 0;
float humidity = 0;

bool dhtAvailable = false;

unsigned long lastDHTRead = 0;

const unsigned long DHT_INTERVAL =
  2500;

// ======================================================
// WEB SERVER
// ======================================================

ESP8266WebServer server(80);

// ======================================================
// NTP
// ======================================================

WiFiUDP ntpUDP;

NTPClient timeClient(
  ntpUDP,
  "pool.ntp.org",
  -3 * 3600,
  60000
);

bool timeSynced = false;

// ======================================================
// TIMERS
// ======================================================

unsigned long lastWiFiAttempt = 0;
unsigned long lastGoogleSend = 0;

const unsigned long GOOGLE_INTERVAL =
  10UL * 60UL * 1000UL;

// ======================================================
// PIN UTILITIES
// ======================================================

bool digitalPinAllowed(int pin) {

  return (
    pin == D1 ||
    pin == D2 ||
    pin == D5 ||
    pin == D6 ||
    pin == D7
  );
}

// ======================================================

String pinToString(int pin) {

  if (pin == D0) return "D0";
  if (pin == D1) return "D1";
  if (pin == D2) return "D2";
  if (pin == D3) return "D3";
  if (pin == D4) return "D4";
  if (pin == D5) return "D5";
  if (pin == D6) return "D6";
  if (pin == D7) return "D7";
  if (pin == D8) return "D8";

  return "UNKNOWN";
}

// ======================================================

int stringToPin(String value) {

  value.toUpperCase();

  if (value == "D0") return D0;
  if (value == "D1") return D1;
  if (value == "D2") return D2;
  if (value == "D3") return D3;
  if (value == "D4") return D4;
  if (value == "D5") return D5;
  if (value == "D6") return D6;
  if (value == "D7") return D7;
  if (value == "D8") return D8;

  return -1;
}

// ======================================================
// FUNCTION UTILITIES
// ======================================================

String functionToString(RelayFunction fn) {

  switch (fn) {

    case FN_LIGHT:
      return "light";

    case FN_VENTILATION:
      return "ventilation";

    case FN_HEATER:
      return "heater";

    case FN_PUMP:
      return "pump";

    default:
      return "none";
  }
}

// ======================================================

RelayFunction stringToFunction(String value) {

  value.toLowerCase();

  if (value == "light")
    return FN_LIGHT;

  if (value == "ventilation")
    return FN_VENTILATION;

  if (value == "heater")
    return FN_HEATER;

  if (value == "pump")
    return FN_PUMP;

  return FN_NONE;
}

// ======================================================

String modeToString(RelayMode mode) {

  if (mode == MODE_AUTO)
    return "auto";

  return "manual";
}

// ======================================================

RelayMode stringToMode(String value) {

  value.toLowerCase();

  if (value == "auto")
    return MODE_AUTO;

  return MODE_MANUAL;
}

// ======================================================
// HARDWARE VALIDATION
// ======================================================

bool pinConfigurationValid(
  int dhtPin,
  int r1,
  int r2,
  int r3,
  int r4
) {

  int pins[5] = {

    dhtPin,
    r1,
    r2,
    r3,
    r4
  };

  for (int i = 0; i < 5; i++) {

    if (!digitalPinAllowed(pins[i]))
      return false;
  }

  for (int i = 0; i < 5; i++) {

    for (int j = i + 1; j < 5; j++) {

      if (pins[i] == pins[j])
        return false;
    }
  }

  return true;
}

// ======================================================
// EEPROM HARDWARE
// ======================================================

void saveHardwareConfig() {

  EEPROM.put(
    EEPROM_PIN_DHT,
    pinDHT
  );

  EEPROM.put(
    EEPROM_PIN_RELAY1,
    relayPins[0]
  );

  EEPROM.put(
    EEPROM_PIN_RELAY2,
    relayPins[1]
  );

  EEPROM.put(
    EEPROM_PIN_RELAY3,
    relayPins[2]
  );

  EEPROM.put(
    EEPROM_PIN_RELAY4,
    relayPins[3]
  );

  int magic =
    HW_MAGIC_VALUE;

  EEPROM.put(
    EEPROM_HW_MAGIC,
    magic
  );

  EEPROM.commit();
}

// ======================================================

void loadHardwareConfig() {

  int magic = 0;

  EEPROM.get(
    EEPROM_HW_MAGIC,
    magic
  );

  if (magic != HW_MAGIC_VALUE) {

    pinDHT = D5;

    relayPins[0] = D1;
    relayPins[1] = D2;
    relayPins[2] = D6;
    relayPins[3] = D7;

    saveHardwareConfig();

    return;
  }

  EEPROM.get(
    EEPROM_PIN_DHT,
    pinDHT
  );

  EEPROM.get(
    EEPROM_PIN_RELAY1,
    relayPins[0]
  );

  EEPROM.get(
    EEPROM_PIN_RELAY2,
    relayPins[1]
  );

  EEPROM.get(
    EEPROM_PIN_RELAY3,
    relayPins[2]
  );

  EEPROM.get(
    EEPROM_PIN_RELAY4,
    relayPins[3]
  );

  if (
    !pinConfigurationValid(
      pinDHT,
      relayPins[0],
      relayPins[1],
      relayPins[2],
      relayPins[3]
    )
  ) {

    pinDHT = D5;

    relayPins[0] = D1;
    relayPins[1] = D2;
    relayPins[2] = D6;
    relayPins[3] = D7;

    saveHardwareConfig();
  }
}

// ======================================================
// EEPROM FUNCTIONS
// ======================================================

void saveFunctionConfig() {

  for (int i = 0; i < 4; i++) {

    EEPROM.write(
      EEPROM_RELAY1_FN + i,
      (byte) relayFunctions[i]
    );

    EEPROM.write(
      EEPROM_RELAY1_MODE + i,
      (byte) relayModes[i]
    );
  }

  int magic =
    FN_MAGIC_VALUE;

  EEPROM.put(
    EEPROM_FN_MAGIC,
    magic
  );

  EEPROM.commit();
}

// ======================================================

void loadFunctionConfig() {

  int magic = 0;

  EEPROM.get(
    EEPROM_FN_MAGIC,
    magic
  );

  if (magic != FN_MAGIC_VALUE) {

    for (int i = 0; i < 4; i++) {

      relayFunctions[i] =
        FN_NONE;

      relayModes[i] =
        MODE_MANUAL;
    }

    saveFunctionConfig();

    return;
  }

  for (int i = 0; i < 4; i++) {

    byte fn =
      EEPROM.read(
        EEPROM_RELAY1_FN + i
      );

    byte mode =
      EEPROM.read(
        EEPROM_RELAY1_MODE + i
      );

    if (fn > FN_PUMP)
      fn = FN_NONE;

    if (mode > MODE_AUTO)
      mode = MODE_MANUAL;

    relayFunctions[i] =
      (RelayFunction) fn;

    relayModes[i] =
      (RelayMode) mode;
  }
}

// ======================================================
// EEPROM CONFIG
// ======================================================

void saveControlConfig() {

  EEPROM.put(
    EEPROM_LIGHT_HOUR,
    lightStartHour
  );

  EEPROM.put(
    EEPROM_LIGHT_MIN,
    lightStartMinute
  );

  EEPROM.put(
    EEPROM_LIGHT_DURATION,
    lightDurationHours
  );

  EEPROM.put(
    EEPROM_TEMP_MIN,
    tempMin
  );

  EEPROM.put(
    EEPROM_TEMP_MAX,
    tempMax
  );

  byte savedVentilationMode = (byte) ventilationMode;
  unsigned int savedVentilationInterval = ventilationInterval / 60000UL;
  unsigned int savedVentilationDuration = ventilationDuration / 60000UL;
  unsigned int savedEmergencyDuration = ventilationEmergencyDuration / 60000UL;

  EEPROM.put(EEPROM_VENT_MODE, savedVentilationMode);
  EEPROM.put(EEPROM_VENT_INTERVAL, savedVentilationInterval);
  EEPROM.put(EEPROM_VENT_DURATION, savedVentilationDuration);
  EEPROM.put(EEPROM_VENT_EMERGENCY, savedEmergencyDuration);

  int ventMagic = VENT_MAGIC_VALUE;
  EEPROM.put(EEPROM_VENT_MAGIC, ventMagic);

  int magic =
    CONFIG_MAGIC_VALUE;

  EEPROM.put(
    EEPROM_CONFIG_MAGIC,
    magic
  );

  EEPROM.commit();
}

// ======================================================

void loadControlConfig() {

  int magic = 0;

  EEPROM.get(
    EEPROM_CONFIG_MAGIC,
    magic
  );

  if (magic != CONFIG_MAGIC_VALUE) {

    lightStartHour = 18;
    lightStartMinute = 0;
    lightDurationHours = 12;

    tempMin = 23;
    tempMax = 27;

    saveControlConfig();

    return;
  }

  EEPROM.get(
    EEPROM_LIGHT_HOUR,
    lightStartHour
  );

  EEPROM.get(
    EEPROM_LIGHT_MIN,
    lightStartMinute
  );

  EEPROM.get(
    EEPROM_LIGHT_DURATION,
    lightDurationHours
  );

  EEPROM.get(
    EEPROM_TEMP_MIN,
    tempMin
  );

  EEPROM.get(
    EEPROM_TEMP_MAX,
    tempMax
  );

  int ventMagic = 0;
  EEPROM.get(EEPROM_VENT_MAGIC, ventMagic);

  if (ventMagic == VENT_MAGIC_VALUE) {
    byte savedVentilationMode = VENT_COMBINED;
    unsigned int savedVentilationInterval = 10;
    unsigned int savedVentilationDuration = 2;
    unsigned int savedEmergencyDuration = 3;
    EEPROM.get(EEPROM_VENT_MODE, savedVentilationMode);
    EEPROM.get(EEPROM_VENT_INTERVAL, savedVentilationInterval);
    EEPROM.get(EEPROM_VENT_DURATION, savedVentilationDuration);
    EEPROM.get(EEPROM_VENT_EMERGENCY, savedEmergencyDuration);
    ventilationMode = savedVentilationMode <= VENT_COMBINED ? (VentilationMode) savedVentilationMode : VENT_COMBINED;
    if (savedVentilationInterval < 1 || savedVentilationInterval > 1440) savedVentilationInterval = 10;
    if (savedVentilationDuration < 1 || savedVentilationDuration > 60 || savedVentilationDuration >= savedVentilationInterval) savedVentilationDuration = 2;
    if (savedEmergencyDuration < 1 || savedEmergencyDuration > 10) savedEmergencyDuration = 3;
    ventilationInterval = (unsigned long) savedVentilationInterval * 60000UL;
    ventilationDuration = (unsigned long) savedVentilationDuration * 60000UL;
    ventilationEmergencyDuration = (unsigned long) savedEmergencyDuration * 60000UL;
  } else {
    ventilationMode = VENT_COMBINED;
    ventilationInterval = 10UL * 60000UL;
    ventilationDuration = 2UL * 60000UL;
    ventilationEmergencyDuration = 3UL * 60000UL;
    saveControlConfig();
  }

  if (
    lightStartHour < 0 ||
    lightStartHour > 23
  )
    lightStartHour = 18;

  if (
    lightStartMinute < 0 ||
    lightStartMinute > 59
  )
    lightStartMinute = 0;

  if (
    lightDurationHours < 1 ||
    lightDurationHours > 24
  )
    lightDurationHours = 12;

  if (
    tempMin < 0 ||
    tempMin > 50
  )
    tempMin = 23;

  if (
    tempMax < 0 ||
    tempMax > 50
  )
    tempMax = 27;

  if (tempMax <= tempMin)
    tempMax = tempMin + 2;
}

// ======================================================
// INITIALIZE HARDWARE
// ======================================================

void initializeHardware() {

  Serial.println();
  Serial.println("===== HARDWARE =====");

  Serial.print("DHT21: ");
  Serial.println(
    pinToString(pinDHT)
  );

  for (int i = 0; i < 4; i++) {

    pinMode(
      relayPins[i],
      OUTPUT
    );

    // Seguridad al iniciar

    digitalWrite(
      relayPins[i],
      RELAY_OFF
    );

    relayStates[i] = false;

    Serial.print("Relay ");
    Serial.print(i + 1);
    Serial.print(": ");

    Serial.print(
      pinToString(relayPins[i])
    );

    Serial.print(" / ");

    Serial.print(
      functionToString(
        relayFunctions[i]
      )
    );

    Serial.print(" / ");

    Serial.println(
      modeToString(
        relayModes[i]
      )
    );
  }

  Serial.println("====================");

  if (dht != nullptr) {

    delete dht;
    dht = nullptr;
  }

  dht =
    new DHT(
      pinDHT,
      DHTTYPE
    );

  dht->begin();
}

// ======================================================
// RELAY CONTROL
// ======================================================

bool setRelayState(
  int relayNumber,
  bool state
) {

  if (
    relayNumber < 1 ||
    relayNumber > 4
  )
    return false;

  int index =
    relayNumber - 1;

  digitalWrite(
    relayPins[index],
    state
      ? RELAY_ON
      : RELAY_OFF
  );

  relayStates[index] =
    state;

  return true;
}

// ======================================================
// FIND FUNCTION
// ======================================================

int findRelayByFunction(
  RelayFunction fn
) {

  for (int i = 0; i < 4; i++) {

    if (
      relayFunctions[i] == fn
    )
      return i;
  }

  return -1;
}

// ======================================================
// LIGHT SCHEDULE
// ======================================================

bool lightShouldBeOn() {

  if (!timeSynced)
    return false;

  int current =
    timeClient.getHours() * 60 +
    timeClient.getMinutes();

  int start =
    lightStartHour * 60 +
    lightStartMinute;

  int end =
    (
      start +
      lightDurationHours * 60
    ) % 1440;

  if (start == end)
    return false;

  if (start < end) {

    return (
      current >= start &&
      current < end
    );
  }

  return (
    current >= start ||
    current < end
  );
}

// ======================================================
// AUTOMATIC LIGHT
// ======================================================

void automaticLightControl() {

  int relay =
    findRelayByFunction(
      FN_LIGHT
    );

  if (relay < 0)
    return;

  if (
    relayModes[relay] !=
    MODE_AUTO
  )
    return;

  if (!timeSynced)
    return;

  setRelayState(
    relay + 1,
    lightShouldBeOn()
  );
}

// ======================================================
// AUTOMATIC HEATER
// ======================================================

void automaticHeaterControl() {

  int relay =
    findRelayByFunction(
      FN_HEATER
    );

  if (relay < 0)
    return;

  if (
    relayModes[relay] !=
    MODE_AUTO
  )
    return;

  if (!dhtAvailable)
    return;

  if (
    temperature < tempMin
  ) {

    setRelayState(
      relay + 1,
      true
    );
  }

  else if (
    temperature >= tempMin + 1
  ) {

    setRelayState(
      relay + 1,
      false
    );
  }
}

// ======================================================
// AUTOMATIC VENTILATION
// ======================================================

void automaticVentilationControl() {
  int relay = findRelayByFunction(FN_VENTILATION);
  if (relay < 0 || relayModes[relay] != MODE_AUTO) return;

  unsigned long now = millis();
  bool temperatureEnabled = ventilationMode == VENT_TEMPERATURE || ventilationMode == VENT_COMBINED;
  bool intervalEnabled = ventilationMode == VENT_INTERVAL || ventilationMode == VENT_COMBINED;

  // La emergencia es un pulso limitado; nunca deja el cooler encendido indefinidamente.
  if (emergencyVentilationActive) {
    if (now - emergencyVentilationStart < ventilationEmergencyDuration) {
      setRelayState(relay + 1, true);
      return;
    }
    emergencyVentilationActive = false;
    lastEmergencyVentilationEnd = now;
    setRelayState(relay + 1, false);
  }

  if (temperatureEnabled && dhtAvailable && temperature > tempMax &&
      (lastEmergencyVentilationEnd == 0 || now - lastEmergencyVentilationEnd >= ventilationEmergencyCooldown)) {
    periodicVentilationActive = false;
    emergencyVentilationActive = true;
    emergencyVentilationStart = now;
    setRelayState(relay + 1, true);
    return;
  }

  if (!intervalEnabled) {
    periodicVentilationActive = false;
    setRelayState(relay + 1, false);
    return;
  }

  if (!periodicVentilationActive && now - lastVentilationCycle >= ventilationInterval) {
    periodicVentilationActive = true;
    ventilationCycleStart = now;
    lastVentilationCycle = now;
    setRelayState(relay + 1, true);
  }

  if (periodicVentilationActive && now - ventilationCycleStart >= ventilationDuration) {
    periodicVentilationActive = false;
    setRelayState(relay + 1, false);
  }

  if (!periodicVentilationActive) setRelayState(relay + 1, false);
}

// ======================================================
// ALL AUTOMATIONS
// ======================================================

void runAutomations() {

  automaticLightControl();

  automaticHeaterControl();

  automaticVentilationControl();
}

// ======================================================
// DHT
// ======================================================

void readDHT() {

  if (
    millis() - lastDHTRead <
    DHT_INTERVAL
  )
    return;

  lastDHTRead =
    millis();

  if (dht == nullptr) {

    dhtAvailable =
      false;

    return;
  }

  float newTemp =
    dht->readTemperature();

  float newHumidity =
    dht->readHumidity();

  if (
    !isnan(newTemp) &&
    !isnan(newHumidity)
  ) {

    temperature =
      newTemp;

    humidity =
      newHumidity;

    dhtAvailable =
      true;
  }

  else {

    dhtAvailable =
      false;
  }
}

// ======================================================
// GOOGLE SHEETS
// ======================================================

void sendToGoogleSheets() {

  if (
    WiFi.status() !=
    WL_CONNECTED
  )
    return;

  if (!dhtAvailable)
    return;

  WiFiClientSecure client;

  client.setInsecure();

  if (
    !client.connect(
      googleHost,
      443
    )
  )
    return;

  String url =
    String(googleScriptPath) +
    "?temp=" +
    String(temperature, 1) +
    "&hum=" +
    String(humidity, 1);

  client.print(
    String("GET ") +
    url +
    " HTTP/1.1\r\n" +
    "Host: " +
    googleHost +
    "\r\n" +
    "Connection: close\r\n\r\n"
  );
}

// ======================================================
// CORS
// ======================================================

void addCORS() {

  server.sendHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  server.sendHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS"
  );

  server.sendHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );
}

// ======================================================
// API ROOT
// ======================================================

void handleRoot() {

  String json = "{";

  json += "\"device\":\"";
  json += deviceName;

  json += "\",\"version\":\"";
  json += firmwareVersion;

  json += "\",\"endpoints\":[";

  json += "\"/api/status\",";
  json += "\"/api/hardware\",";
  json += "\"/api/functions\",";
  json += "\"/api/config\",";
  json += "\"/api/relays\",";
  json += "\"/api/relay\"";

  json += "]}";

  addCORS();

  server.send(
    200,
    "application/json",
    json
  );
}

// ======================================================
// API STATUS
// ======================================================

void handleApiStatus() {

  String json = "{";

  json += "\"device\":\"";
  json += deviceName;

  json += "\",\"version\":\"";
  json += firmwareVersion;

  json += "\",\"online\":true,";

  // DHT

  json += "\"temperature\":";

  if (dhtAvailable)
    json += String(
      temperature,
      1
    );
  else
    json += "null";

  json += ",\"humidity\":";

  if (dhtAvailable)
    json += String(
      humidity,
      1
    );
  else
    json += "null";

  // Soil

  json += ",\"soil\":null";
  json += ",\"soilEnabled\":false";

  // Relays

  json += ",\"relays\":[";

  for (int i = 0; i < 4; i++) {

    json += "{";

    json += "\"id\":";
    json += String(i + 1);

    json += ",\"pin\":\"";
    json += pinToString(
      relayPins[i]
    );

    json += "\",\"function\":\"";
    json += functionToString(
      relayFunctions[i]
    );

    json += "\",\"mode\":\"";
    json += modeToString(
      relayModes[i]
    );

    json += "\",\"state\":";

    json +=
      relayStates[i]
        ? "true"
        : "false";

    json += "}";

    if (i < 3)
      json += ",";
  }

  json += "]";

  // Time

  json += ",\"timeSynced\":";

  json +=
    timeSynced
      ? "true"
      : "false";

  if (timeSynced) {

    json += ",\"hour\":";
    json += String(
      timeClient.getHours()
    );

    json += ",\"minute\":";
    json += String(
      timeClient.getMinutes()
    );
  }

  // Network

  json += ",\"ip\":\"";

  json +=
    WiFi.localIP().toString();

  json += "\"";

  json += ",\"rssi\":";
  json += String(
    WiFi.RSSI()
  );

  json += ",\"uptime\":";
  json += String(
    millis() / 1000
  );

  json += "}";

  addCORS();

  server.send(
    200,
    "application/json",
    json
  );
}

// ======================================================
// API RELAYS
// ======================================================

void handleApiRelays() {

  String json =
    "{\"relays\":[";

  for (int i = 0; i < 4; i++) {

    json += "{";

    json += "\"id\":";
    json += String(i + 1);

    json += ",\"pin\":\"";
    json += pinToString(
      relayPins[i]
    );

    json += "\",\"function\":\"";
    json += functionToString(
      relayFunctions[i]
    );

    json += "\",\"mode\":\"";
    json += modeToString(
      relayModes[i]
    );

    json += "\",\"state\":";

    json +=
      relayStates[i]
        ? "true"
        : "false";

    json += "}";

    if (i < 3)
      json += ",";
  }

  json += "]}";

  addCORS();

  server.send(
    200,
    "application/json",
    json
  );
}

// ======================================================
// MANUAL RELAY CONTROL
//
// POST:
// /api/relay?id=1&state=on
//
// Solo funciona si está en MANUAL.
// ======================================================

void handleApiSetRelay() {

  if (
    !server.hasArg("id") ||
    !server.hasArg("state")
  ) {

    addCORS();

    server.send(
      400,
      "application/json",
      "{\"ok\":false,\"error\":\"missing_parameters\"}"
    );

    return;
  }

  int relayId =
    server.arg("id").toInt();

  if (
    relayId < 1 ||
    relayId > 4
  ) {

    addCORS();

    server.send(
      400,
      "application/json",
      "{\"ok\":false,\"error\":\"invalid_relay\"}"
    );

    return;
  }

  int index =
    relayId - 1;

  if (
    relayModes[index] ==
    MODE_AUTO
  ) {

    addCORS();

    server.send(
      409,
      "application/json",
      "{\"ok\":false,\"error\":\"relay_in_auto_mode\"}"
    );

    return;
  }

  String state =
    server.arg("state");

  state.toLowerCase();

  bool newState;

  if (
    state == "on" ||
    state == "true" ||
    state == "1"
  ) {

    newState = true;
  }

  else if (
    state == "off" ||
    state == "false" ||
    state == "0"
  ) {

    newState = false;
  }

  else {

    addCORS();

    server.send(
      400,
      "application/json",
      "{\"ok\":false,\"error\":\"invalid_state\"}"
    );

    return;
  }

  setRelayState(
    relayId,
    newState
  );

  String json =
    "{\"ok\":true,\"relay\":" +
    String(relayId) +
    ",\"state\":" +
    String(
      newState
        ? "true"
        : "false"
    ) +
    "}";

  addCORS();

  server.send(
    200,
    "application/json",
    json
  );
}

// ======================================================
// FUNCTIONS GET
// ======================================================

void handleApiFunctions() {

  String json =
    "{\"relays\":[";

  for (int i = 0; i < 4; i++) {

    json += "{";

    json += "\"id\":";
    json += String(i + 1);

    json += ",\"function\":\"";
    json += functionToString(
      relayFunctions[i]
    );

    json += "\",\"mode\":\"";
    json += modeToString(
      relayModes[i]
    );

    json += "\"}";

    if (i < 3)
      json += ",";
  }

  json += "],";

  json += "\"allowedFunctions\":[";

  json += "\"none\",";
  json += "\"light\",";
  json += "\"ventilation\",";
  json += "\"heater\",";
  json += "\"pump\"";

  json += "],";

  json += "\"allowedModes\":[";
  json += "\"manual\",";
  json += "\"auto\"";
  json += "]";

  json += "}";

  addCORS();

  server.send(
    200,
    "application/json",
    json
  );
}

// ======================================================
// FUNCTIONS POST
//
// Ejemplo:
//
// /api/functions?
// relay=1&function=light&mode=auto
// ======================================================

void handleApiSetFunctions() {

  if (!server.hasArg("relay")) {

    addCORS();

    server.send(
      400,
      "application/json",
      "{\"ok\":false,\"error\":\"missing_relay\"}"
    );

    return;
  }

  int relayId =
    server.arg("relay").toInt();

  if (
    relayId < 1 ||
    relayId > 4
  ) {

    addCORS();

    server.send(
      400,
      "application/json",
      "{\"ok\":false,\"error\":\"invalid_relay\"}"
    );

    return;
  }

  int index =
    relayId - 1;

  RelayFunction newFunction =
    relayFunctions[index];

  RelayMode newMode =
    relayModes[index];

  if (
    server.hasArg("function")
  ) {

    String functionArg =
      server.arg("function");

    functionArg.toLowerCase();

    bool validFunction =
      functionArg == "none" ||
      functionArg == "light" ||
      functionArg == "ventilation" ||
      functionArg == "heater" ||
      functionArg == "pump";

    if (!validFunction) {

      addCORS();

      server.send(
        400,
        "application/json",
        "{\"ok\":false,\"error\":\"invalid_function\"}"
      );

      return;
    }

    newFunction =
      stringToFunction(
        functionArg
      );

    // No permitimos dos relays con la misma función
    // excepto NONE.

    if (
      newFunction != FN_NONE
    ) {

      for (int i = 0; i < 4; i++) {

        if (
          i != index &&
          relayFunctions[i] ==
            newFunction
        ) {

          addCORS();

          server.send(
            409,
            "application/json",
            "{\"ok\":false,\"error\":\"function_already_assigned\"}"
          );

          return;
        }
      }
    }
  }

  if (
    server.hasArg("mode")
  ) {

    String modeArg =
      server.arg("mode");

    modeArg.toLowerCase();

    if (
      modeArg != "auto" &&
      modeArg != "manual"
    ) {

      addCORS();

      server.send(
        400,
        "application/json",
        "{\"ok\":false,\"error\":\"invalid_mode\"}"
      );

      return;
    }

    newMode =
      stringToMode(
        modeArg
      );
  }

  relayFunctions[index] =
    newFunction;

  relayModes[index] =
    newMode;

  // Al cambiar configuración dejamos el relay
  // apagado antes de que la automatización decida.

  setRelayState(
    relayId,
    false
  );

  saveFunctionConfig();

  runAutomations();

  String json = "{";

  json += "\"ok\":true,";

  json += "\"relay\":";
  json += String(relayId);

  json += ",\"function\":\"";
  json += functionToString(
    newFunction
  );

  json += "\",\"mode\":\"";
  json += modeToString(
    newMode
  );

  json += "\"}";

  addCORS();

  server.send(
    200,
    "application/json",
    json
  );
}

// ======================================================
// CONFIG GET
// ======================================================

void handleApiConfig() {

  String json = "{";

  json += "\"lightStartHour\":";
  json += String(
    lightStartHour
  );

  json += ",\"lightStartMinute\":";
  json += String(
    lightStartMinute
  );

  json += ",\"lightDurationHours\":";
  json += String(
    lightDurationHours
  );

  json += ",\"tempMin\":";
  json += String(
    tempMin,
    1
  );

  json += ",\"tempMax\":";
  json += String(
    tempMax,
    1
  );

  json += ",\"ventilationIntervalMinutes\":";
  json += String(
    ventilationInterval /
    60000UL
  );

  json += ",\"ventilationDurationMinutes\":";
  json += String(
    ventilationDuration /
    60000UL
  );

  json += ",\"ventilationEmergencyDurationMinutes\":";
  json += String(ventilationEmergencyDuration / 60000UL);

  json += ",\"ventilationMode\":\"";
  if (ventilationMode == VENT_INTERVAL) json += "interval";
  else if (ventilationMode == VENT_TEMPERATURE) json += "temperature";
  else json += "combined";
  json += "\"";

  json += "}";

  addCORS();

  server.send(
    200,
    "application/json",
    json
  );
}

// ======================================================
// CONFIG POST
//
// hora=18
// min=0
// dur=12
// tmin=23
// tmax=27
// ======================================================

void handleApiSetConfig() {

  if (server.hasArg("hora")) {

    lightStartHour =
      constrain(
        server.arg("hora").toInt(),
        0,
        23
      );
  }

  if (server.hasArg("min")) {

    lightStartMinute =
      constrain(
        server.arg("min").toInt(),
        0,
        59
      );
  }

  if (server.hasArg("dur")) {

    lightDurationHours =
      constrain(
        server.arg("dur").toInt(),
        1,
        24
      );
  }

  if (server.hasArg("tmin")) {

    tempMin =
      server.arg("tmin").toFloat();
  }

  if (server.hasArg("tmax")) {

    tempMax =
      server.arg("tmax").toFloat();
  }

  if (server.hasArg("ventMode")) {
    String mode = server.arg("ventMode");
    if (mode == "interval") ventilationMode = VENT_INTERVAL;
    else if (mode == "temperature") ventilationMode = VENT_TEMPERATURE;
    else if (mode == "combined") ventilationMode = VENT_COMBINED;
    else {
      addCORS();
      server.send(400, "application/json", "{\"ok\":false,\"error\":\"invalid_ventilation_mode\"}");
      return;
    }
  }

  unsigned int intervalMinutes = ventilationInterval / 60000UL;
  unsigned int durationMinutes = ventilationDuration / 60000UL;
  unsigned int emergencyMinutes = ventilationEmergencyDuration / 60000UL;
  if (server.hasArg("ventInterval")) intervalMinutes = server.arg("ventInterval").toInt();
  if (server.hasArg("ventDuration")) durationMinutes = server.arg("ventDuration").toInt();
  if (server.hasArg("ventEmergencyDuration")) emergencyMinutes = server.arg("ventEmergencyDuration").toInt();
  if (intervalMinutes < 1 || intervalMinutes > 1440 || durationMinutes < 1 ||
      durationMinutes > 60 || durationMinutes >= intervalMinutes ||
      emergencyMinutes < 1 || emergencyMinutes > 10) {
    addCORS();
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"invalid_ventilation_config\"}");
    return;
  }
  ventilationInterval = (unsigned long) intervalMinutes * 60000UL;
  ventilationDuration = (unsigned long) durationMinutes * 60000UL;
  ventilationEmergencyDuration = (unsigned long) emergencyMinutes * 60000UL;

  if (
    tempMin < 0 ||
    tempMin > 50 ||
    tempMax < 0 ||
    tempMax > 50 ||
    tempMax <= tempMin
  ) {

    addCORS();

    server.send(
      400,
      "application/json",
      "{\"ok\":false,\"error\":\"invalid_temperature_range\"}"
    );

    return;
  }

  saveControlConfig();

  runAutomations();

  addCORS();

  server.send(
    200,
    "application/json",
    "{\"ok\":true}"
  );
}

// ======================================================
// HARDWARE GET
// ======================================================

void handleApiHardware() {

  String json = "{";

  json +=
    "\"board\":\"Wemos D1 R1 ESP8266\",";

  json += "\"dht\":{";

  json += "\"type\":\"DHT21\",";
  json += "\"pin\":\"";
  json += pinToString(pinDHT);
  json += "\",";
  json += "\"configurable\":true";

  json += "},";

  json += "\"soil\":{";

  json += "\"type\":\"analog\",";
  json += "\"pin\":\"A0\",";
  json += "\"enabled\":false,";
  json += "\"configurable\":false";

  json += "},";

  json += "\"relays\":[";

  for (int i = 0; i < 4; i++) {

    json += "{";

    json += "\"id\":";
    json += String(i + 1);

    json += ",\"pin\":\"";
    json += pinToString(
      relayPins[i]
    );

    json += "\"}";

    if (i < 3)
      json += ",";
  }

  json += "],";

  json += "\"allowedDigitalPins\":[";

  json += "\"D1\",";
  json += "\"D2\",";
  json += "\"D5\",";
  json += "\"D6\",";
  json += "\"D7\"";

  json += "]";

  json += "}";

  addCORS();

  server.send(
    200,
    "application/json",
    json
  );
}

// ======================================================
// HARDWARE POST
// ======================================================

void handleApiSetHardware() {

  int newDHT =
    pinDHT;

  int newRelays[4] = {

    relayPins[0],
    relayPins[1],
    relayPins[2],
    relayPins[3]
  };

  if (
    server.hasArg("dht")
  ) {

    newDHT =
      stringToPin(
        server.arg("dht")
      );
  }

  for (int i = 0; i < 4; i++) {

    String argName =
      "relay" +
      String(i + 1);

    if (
      server.hasArg(argName)
    ) {

      newRelays[i] =
        stringToPin(
          server.arg(argName)
        );
    }
  }

  if (
    !pinConfigurationValid(
      newDHT,
      newRelays[0],
      newRelays[1],
      newRelays[2],
      newRelays[3]
    )
  ) {

    addCORS();

    server.send(
      400,
      "application/json",
      "{\"ok\":false,\"error\":\"invalid_or_duplicated_pin\"}"
    );

    return;
  }

  pinDHT =
    newDHT;

  for (int i = 0; i < 4; i++) {

    relayPins[i] =
      newRelays[i];
  }

  saveHardwareConfig();

  addCORS();

  server.send(
    200,
    "application/json",
    "{\"ok\":true,\"restartRequired\":true}"
  );
}

// ======================================================
// OPTIONS
// ======================================================

void handleOptions() {

  addCORS();

  server.send(
    204,
    "text/plain",
    ""
  );
}

// ======================================================
// WIFI
// ======================================================

void connectWiFi() {

  Serial.println();

  Serial.print(
    "Conectando a "
  );

  Serial.println(ssid);

  WiFi.mode(
    WIFI_STA
  );

  WiFi.hostname(
    deviceName
  );

  WiFi.begin(
    ssid,
    password
  );

  unsigned long start =
    millis();

  while (
    WiFi.status() !=
      WL_CONNECTED &&
    millis() - start <
      15000
  ) {

    delay(500);
    Serial.print(".");
  }

  if (
    WiFi.status() ==
    WL_CONNECTED
  ) {

    Serial.println();

    Serial.println(
      "WiFi conectado"
    );

    Serial.print(
      "IP: "
    );

    Serial.println(
      WiFi.localIP()
    );

    Serial.print(
      "RSSI: "
    );

    Serial.println(
      WiFi.RSSI()
    );
  }

  else {

    Serial.println();

    Serial.println(
      "WiFi no disponible"
    );
  }
}

// ======================================================
// SETUP
// ======================================================

void setup() {

  Serial.begin(115200);

  delay(200);

  Serial.println();
  Serial.println(
    "=================================="
  );

  Serial.println(
    "Arduino Cultivo V2.4"
  );

  Serial.println(
    "Functions + Auto / Manual"
  );

  Serial.println(
    "=================================="
  );

  EEPROM.begin(
    EEPROM_SIZE
  );

  loadHardwareConfig();

  loadFunctionConfig();

  loadControlConfig();

  initializeHardware();

  connectWiFi();

  // ----------------------------------------------------
  // NTP
  // ----------------------------------------------------

  timeClient.begin();

  if (
    WiFi.status() ==
    WL_CONNECTED
  ) {

    timeSynced =
      timeClient.forceUpdate();

    if (timeSynced) {

      Serial.println(
        "Hora NTP sincronizada"
      );
    }

    else {

      Serial.println(
        "NTP no disponible"
      );
    }
  }

  // ----------------------------------------------------
  // API
  // ----------------------------------------------------

  server.on(
    "/",
    HTTP_GET,
    handleRoot
  );

  server.on(
    "/api/status",
    HTTP_GET,
    handleApiStatus
  );

  server.on(
    "/api/relays",
    HTTP_GET,
    handleApiRelays
  );

  server.on(
    "/api/relay",
    HTTP_POST,
    handleApiSetRelay
  );

  server.on(
    "/api/functions",
    HTTP_GET,
    handleApiFunctions
  );

  server.on(
    "/api/functions",
    HTTP_POST,
    handleApiSetFunctions
  );

  server.on(
    "/api/config",
    HTTP_GET,
    handleApiConfig
  );

  server.on(
    "/api/config",
    HTTP_POST,
    handleApiSetConfig
  );

  server.on(
    "/api/hardware",
    HTTP_GET,
    handleApiHardware
  );

  server.on(
    "/api/hardware",
    HTTP_POST,
    handleApiSetHardware
  );

  server.on(
    "/api/status",
    HTTP_OPTIONS,
    handleOptions
  );

  server.on(
    "/api/relays",
    HTTP_OPTIONS,
    handleOptions
  );

  server.on(
    "/api/relay",
    HTTP_OPTIONS,
    handleOptions
  );

  server.on(
    "/api/functions",
    HTTP_OPTIONS,
    handleOptions
  );

  server.on(
    "/api/config",
    HTTP_OPTIONS,
    handleOptions
  );

  server.on(
    "/api/hardware",
    HTTP_OPTIONS,
    handleOptions
  );

  server.begin();

  Serial.println(
    "API HTTP iniciada"
  );

  // ----------------------------------------------------
  // mDNS
  // ----------------------------------------------------

  if (
    WiFi.status() ==
    WL_CONNECTED
  ) {

    if (
      MDNS.begin(
        deviceName
      )
    ) {

      MDNS.addService(
        "http",
        "tcp",
        80
      );

      Serial.println(
        "mDNS iniciado"
      );

      Serial.println(
        "http://armario-cultivo.local"
      );
    }
  }

  // ----------------------------------------------------
  // OTA
  // ----------------------------------------------------

  ArduinoOTA.setHostname(
    deviceName
  );

  ArduinoOTA.begin();

  Serial.println(
    "OTA iniciado"
  );

  Serial.println(
    "Sistema listo"
  );
}

// ======================================================
// LOOP
// ======================================================

void loop() {

  server.handleClient();

  ArduinoOTA.handle();

  if (
    WiFi.status() ==
    WL_CONNECTED
  ) {

    MDNS.update();
  }

  // ----------------------------------------------------
  // WIFI RECONNECT
  // ----------------------------------------------------

  if (
    WiFi.status() !=
      WL_CONNECTED &&
    millis() -
      lastWiFiAttempt >
      30000
  ) {

    lastWiFiAttempt =
      millis();

    Serial.println(
      "Intentando reconectar WiFi..."
    );

    WiFi.disconnect();

    WiFi.begin(
      ssid,
      password
    );
  }

  // ----------------------------------------------------
  // NTP
  // ----------------------------------------------------

  if (
    WiFi.status() ==
    WL_CONNECTED
  ) {

    if (
      timeClient.update()
    ) {

      timeSynced =
        true;
    }
  }

  // ----------------------------------------------------
  // SENSOR
  // ----------------------------------------------------

  readDHT();

  // ----------------------------------------------------
  // AUTOMATION
  // ----------------------------------------------------

  runAutomations();

  // ----------------------------------------------------
  // GOOGLE
  // ----------------------------------------------------

  if (
    millis() -
      lastGoogleSend >=
      GOOGLE_INTERVAL
  ) {

    lastGoogleSend =
      millis();

    sendToGoogleSheets();
  }

  delay(20);
}

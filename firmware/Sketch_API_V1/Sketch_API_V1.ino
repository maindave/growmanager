#if !defined(ARDUINO_ESP8266_WEMOS_D1R1)
#error "This controller requires esp8266:esp8266:d1 (Wemos D1 R1)."
#endif
#include "RelayTestPolicy.h"
#include "RelaySafetyPolicy.h"
#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <WiFiClientSecure.h>
#include <ESP8266mDNS.h>
#include <WiFiUdp.h>
#include <ArduinoOTA.h>
#include <DHT.h>
#include <time.h>
#include <EEPROM.h>
#include <Schedule.h>
#include "EnvironmentalControl.h"
#include "CooperativeCloudTls.h"

// ======================================================
// ARDUINO CULTIVO V2.4
// Functions + Auto / Manual
// ======================================================

const char* firmwareVersion = "2.6.6-no-active-low";
const char* deviceName = "armario-cultivo";

// ======================================================
// WIFI
// ======================================================

const char* ssid = "Irupe";
const char* password = "10203040";

// ======================================================
// EEPROM
// ======================================================

#define EEPROM_SIZE 1024
#define EEPROM_CLOUD 384
#define EEPROM_ENVIRONMENT 256

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
#define EEPROM_LIGHT_TRANSITION_MODE   124
#define EEPROM_LIGHT_TRANSITION_UNTIL  128
#define EEPROM_LIGHT_TRANSITION_MAGIC  132

#define HW_MAGIC_VALUE        2303
#define FN_MAGIC_VALUE        2404
#define CONFIG_MAGIC_VALUE    2405
#define VENT_MAGIC_VALUE      2501
#define LIGHT_TRANSITION_MAGIC_VALUE 2502
#define EEPROM_LIGHT_CHANNEL_MAGIC 140
#define EEPROM_LIGHT_CHANNELS 144
#define LIGHT_CHANNEL_MAGIC_VALUE 2701

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

// Active-low module, loads connected to COM + NO. HIGH releases the coil.
#define RELAY_ON LOW
#define RELAY_OFF HIGH

GrowRelay::Test relayTests[4];
GrowRelay::Safety relaySafety[4];
const uint32_t heaterMaximumOnMs=15UL*60UL*1000UL;
const uint32_t manualLightMaximumOnMs=60UL*60UL*1000UL;

bool relayStates[4] = {
  false,
  false,
  false,
  false
};

bool restartRequested = false;
unsigned long restartRequestedAt = 0;

// ======================================================
// FUNCIONES
// ======================================================

enum RelayFunction : byte {

  FN_NONE = 0,
  FN_LIGHT = 1,
  FN_VENTILATION = 2,
  FN_HEATER = 3,
  FN_PUMP = 4,
  FN_EXTRACTION = 5,
  FN_INTAKE = 6
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
struct LightChannelConfig { int independent; int hour; int minute; int duration; };
LightChannelConfig lightChannels[4] = {{0,18,0,12},{0,18,0,12},{0,18,0,12},{0,18,0,12}};

enum LightTransitionMode : byte {
  LIGHT_TRANSITION_NONE,
  LIGHT_TRANSITION_HOLD_ON,
  LIGHT_TRANSITION_WAIT_START
};

LightTransitionMode lightTransitionMode = LIGHT_TRANSITION_NONE;
unsigned long lightTransitionUntil = 0;

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
bool dhtReadingFresh = false;
bool dhtHasValidReading = false;

unsigned long lastDHTRead = 0;
unsigned long lastDHTSuccessAt = 0;
unsigned long dhtReadCount = 0;
unsigned long dhtSuccessCount = 0;
unsigned long dhtFailureCount = 0;
unsigned int dhtConsecutiveFailures = 0;
unsigned int dhtReinitializations = 0;

const unsigned long DHT_INTERVAL =
  5000;

const unsigned int DHT_FAILURE_THRESHOLD = 3;
const unsigned int DHT_REINITIALIZE_EVERY = 5;

// ======================================================
// WEB SERVER
// ======================================================

ESP8266WebServer server(80);

// ======================================================
// NTP
// ======================================================

bool timeSynced = false;

// ======================================================
// TIMERS
// ======================================================

unsigned long lastWiFiAttempt = 0;




extern char environmentRoomId[37];
const char* cloudHost = "rzkocbaztxasbnchgwwy.supabase.co";
const char* cloudPublishableKey = "sb_publishable_xnMIKJ72WwniGvsKuUJ0xQ_HKiX8M0K";
struct CloudPairing { uint32_t magic; char room[37]; char token[65]; };
CloudPairing cloudPairing={};
CooperativeCloudTls cloudTransport;
GrowCloud::Backlog cloudBacklog;
uint32_t cloudLastAttempt=0,cloudLastSuccess=0,cloudLastSample=0,cloudCapturedThrough=0,cloudEventAck=0,cloudEventCaptured=0;
unsigned cloudFailures=0;
struct CloudFault { uint32_t magic,reason,epc,step; } cloudFault={};
extern "C" void custom_crash_callback(struct rst_info* info,uint32_t,uint32_t){
 CloudFault record={0x47524631,info->reason,info->epc1,cloudTransport.lastStep};
 ESP.rtcUserMemoryWrite(0,reinterpret_cast<uint32_t*>(&record),sizeof(record));
}
bool cloudWorking=false,cloudSchedulerReady=false;
uint32_t environmentLastControlAt=0,environmentMaximumCloudGapMs=0;
bool cloudAttempted=false,cloudHadSuccess=false,cloudBlocked=false,cloudWasActive=false;
int cloudLastResult=0;
static_assert(EEPROM_CLOUD+sizeof(CloudPairing)<=EEPROM_SIZE,"Cloud EEPROM overflow");
uint32_t cloudUtcEpoch() { time_t now=time(nullptr); return now>0?uint32_t(now):0; }
uint32_t roomEpoch() { uint32_t utc=cloudUtcEpoch();return utc>=1700000000?utc-10800UL:0; }
int roomHours() { return (roomEpoch()%86400UL)/3600; }
int roomMinutes() { return (roomEpoch()%3600UL)/60; }
void loadCloudPairing() {
  EEPROM.get(EEPROM_CLOUD,cloudPairing);cloudPairing.room[36]=0;cloudPairing.token[64]=0;
  if(cloudPairing.magic!=0x47524331||strlen(cloudPairing.room)!=36||strlen(cloudPairing.token)!=64){memset(&cloudPairing,0,sizeof(cloudPairing));return;}
  for(unsigned i=0;i<64;i++)if(!isxdigit(cloudPairing.token[i])){memset(&cloudPairing,0,sizeof(cloudPairing));return;}
}
void clearCloudPairing() {
  cloudTransport.cancel();cloudBacklog.clear();memset(&cloudFault,0,sizeof(cloudFault));ESP.rtcUserMemoryWrite(0,reinterpret_cast<uint32_t*>(&cloudFault),sizeof(cloudFault));memset(&cloudPairing,0,sizeof(cloudPairing));
  EEPROM.put(EEPROM_CLOUD,cloudPairing);EEPROM.commit();cloudAttempted=cloudHadSuccess=cloudWasActive=false;cloudBlocked=!cloudSchedulerReady;cloudFailures=0;cloudLastResult=cloudSchedulerReady?0:-10;cloudLastSample=0;cloudEventAck=cloudEventCaptured=0;
}
String cloudStatusJson() {
  bool paired=cloudPairing.magic==0x47524331;
  String state=!paired?"unconfigured":cloudBlocked?"blocked":WiFi.status()!=WL_CONNECTED?"offline":cloudUtcEpoch()<1700000000?"waiting_clock":cloudTransport.active()?"publishing":cloudLastResult>=200&&cloudLastResult<300?"connected":cloudFailures?"retrying":"ready";
  String json=F("{\"configured\":")+String(paired?"true":"false")+",\"state\":\""+state+"\",\"lastResult\":"+String(cloudLastResult)+",\"failures\":"+String(cloudFailures);
  json+=F(",\"lastSuccessAgeSeconds\":")+(cloudHadSuccess?String((millis()-cloudLastSuccess)/1000):String("null"));
  json+=F(",\"pendingReadings\":")+String(cloudBacklog.count)+",\"droppedReadings\":"+String(cloudBacklog.dropped)+",\"maximumStepMs\":"+String(cloudTransport.maximumStepMs)+",\"maximumControlGapMs\":"+String(environmentMaximumCloudGapMs)+",\"resetReason\":\""+ESP.getResetReason()+"\"}";
  json.remove(json.length()-1);
  json+=F(",\"tlsError\":")+String(cloudTransport.lastError)+",\"tlsStep\":"+String(cloudTransport.lastStep)+",\"crashReason\":"+String(cloudFault.magic==0x47524631?cloudFault.reason:0)+",\"crashStep\":"+String(cloudFault.magic==0x47524631?cloudFault.step:0)+",\"heap\":"+String(ESP.getFreeHeap())+"}";
  return json;
}
void handleCloudStatus() { addCORS();server.send(200,"application/json",cloudStatusJson()); }
void handleCloudPairing() {
  if(server.hasArg("enabled")&&server.arg("enabled")=="0"){clearCloudPairing();handleCloudStatus();return;}
  String room=server.arg("roomId"),token=server.arg("token");
  bool valid=room.length()==36&&room==String(environmentRoomId)&&token.length()==64;
  for(unsigned i=0;i<token.length();i++)if(!isxdigit(token[i]))valid=false;
  if(!valid){addCORS();server.send(400,"application/json","{\"error\":\"invalid_cloud_pairing\"}");return;}
  clearCloudPairing();cloudPairing.magic=0x47524331;room.toCharArray(cloudPairing.room,sizeof(cloudPairing.room));token.toCharArray(cloudPairing.token,sizeof(cloudPairing.token));
  EEPROM.put(EEPROM_CLOUD,cloudPairing);EEPROM.commit();handleCloudStatus();
}
String cloudReadingsJson() {
  String json=F("[");
  for(unsigned i=0;i<cloudBacklog.count&&i<8;i++){const auto& r=cloudBacklog.readings[i];if(i)json+=F(",");json+=F("{\"epoch\":")+String(r.epoch)+",\"temperature\":"+String(r.temperature,2)+",\"humidity\":"+String(r.humidity,2)+"}";}
  return json+"]";
}
void runCloudTelemetry() {
  uint32_t now=millis();
  if(!cloudSchedulerReady||cloudPairing.magic!=0x47524331||String(cloudPairing.room)!=String(environmentRoomId))return;
  bool validClock=cloudUtcEpoch()>=1700000000;
  if(validClock&&environmentSensorFresh()&&GrowEnvironment::validReading(temperature,humidity)&&
    (cloudLastSample==0||GrowCloud::expired(now,cloudLastSample,GrowCloud::SampleInterval))){
    cloudLastSample=now;cloudBacklog.add(cloudUtcEpoch(),temperature,humidity);
  }
  if(cloudTransport.active()) { cloudWasActive=true;cloudWorking=true;cloudTransport.poll();cloudWorking=false; }
  if(cloudWasActive&&!cloudTransport.active()){
    cloudWasActive=false;cloudLastResult=cloudTransport.result;
    if(cloudLastResult>=200&&cloudLastResult<300){cloudHadSuccess=true;cloudLastSuccess=now;cloudFailures=0;cloudBacklog.acknowledge(cloudCapturedThrough);cloudEventAck=cloudEventCaptured;}
    else {cloudFailures++;if((cloudLastResult>=400&&cloudLastResult<500&&cloudLastResult!=408&&cloudLastResult!=429)||cloudLastResult==-9)cloudBlocked=true;}
  }
  if(cloudTransport.active()||cloudBlocked||!validClock||WiFi.status()!=WL_CONNECTED)return;
  if(cloudAttempted&&!GrowCloud::expired(now,cloudLastAttempt,GrowCloud::retryDelay(cloudFailures)))return;
  cloudAttempted=true;cloudLastAttempt=now;
  String payload=buildStatusJson(8,true);
  payload.remove(payload.length()-1);payload+=",\"pendingReadings\":"+cloudReadingsJson()+"}";
  String body="{\"p_room_id\":\""+String(cloudPairing.room)+"\",\"p_token\":\""+String(cloudPairing.token)+"\",\"p_sampled_at\":"+String(cloudUtcEpoch())+",\"p_payload\":"+payload+"}";
  // Epoch seconds are accepted by a dedicated wrapper; no clock-formatting buffer needed.
  String request="POST /rest/v1/rpc/ingest_environment_device HTTP/1.1\r\nHost: "+String(cloudHost)+"\r\napikey: "+String(cloudPublishableKey)+"\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: "+String(body.length())+"\r\n\r\n"+body;
  cloudCapturedThrough=cloudBacklog.count?cloudBacklog.readings[(cloudBacklog.count<8?cloudBacklog.count:8)-1].sequence:0;
  if(cloudTransport.start(cloudHost,std::move(request),cloudUtcEpoch()))cloudWasActive=true;
}

GrowEnvironment::Config environmentConfig;
GrowEnvironment::Controller environmentController;
char environmentRoomId[37] = "";
uint32_t environmentBootId = 0;
static_assert(EEPROM_ENVIRONMENT + sizeof(GrowEnvironment::Config) + 37 <= EEPROM_CLOUD, "EEPROM environment overflow");

bool environmentSensorFresh() {
  return dhtReadingFresh && dhtHasValidReading && millis()-lastDHTSuccessAt <= 15000UL;
}
void saveEnvironmentConfig() {
  EEPROM.put(EEPROM_ENVIRONMENT, environmentConfig);
  for (unsigned int i=0;i<sizeof(environmentRoomId);i++) EEPROM.write(EEPROM_ENVIRONMENT+sizeof(environmentConfig)+i, environmentRoomId[i]);
  EEPROM.commit();
}
void loadEnvironmentConfig() {
  EEPROM.get(EEPROM_ENVIRONMENT, environmentConfig);
  if (!GrowEnvironment::validConfig(environmentConfig)) { environmentConfig=GrowEnvironment::Config(); saveEnvironmentConfig(); }
  for (unsigned int i=0;i<sizeof(environmentRoomId);i++) environmentRoomId[i]=EEPROM.read(EEPROM_ENVIRONMENT+sizeof(environmentConfig)+i);
  environmentRoomId[36]=0;
  for(unsigned int i=0;i<strlen(environmentRoomId);i++) if(!isxdigit(environmentRoomId[i])&&environmentRoomId[i]!='-') {environmentRoomId[0]=0;environmentConfig.enabled=false;break;}
}
void runEnvironmentControl() {
  uint32_t now=millis();
  if(cloudWorking&&environmentLastControlAt&&now-environmentLastControlAt>environmentMaximumCloudGapMs)environmentMaximumCloudGapMs=now-environmentLastControlAt;
  environmentLastControlAt=now;
  GrowEnvironment::Channel channels[4];
  for(int i=0;i<4;i++) {
    GrowEnvironment::Role role=GrowEnvironment::None;
    if(relayFunctions[i]==FN_HEATER) role=GrowEnvironment::Heater;
    if(relayFunctions[i]==FN_VENTILATION) role=GrowEnvironment::Circulation;
    if(relayFunctions[i]==FN_EXTRACTION) role=GrowEnvironment::Extraction;
    if(relayFunctions[i]==FN_INTAKE) role=GrowEnvironment::Intake;
    channels[i]=GrowEnvironment::Channel(role,relayModes[i]==MODE_AUTO&&!relayTests[i].active,relayStates[i]);
  }
  uint8_t testing=0;for(int i=0;i<4;i++)if(relayTests[i].active)testing|=1<<i;
  uint8_t safetyMask=0;for(int i=0;i<4;i++)if(relaySafety[i].reason!=GrowRelay::Safety::Ready)safetyMask|=1<<i;
  for(int i=0;i<4;i++)if(safetyMask&(1<<i)){channels[i].automatic=false;channels[i].on=false;}
  environmentController.tick(millis(),environmentConfig,environmentSensorFresh(),temperature,humidity,tempMin,tempMax,channels,testing,safetyMask);
  for(int i=0;i<4;i++)if(safetyMask&(1<<i))channels[i].on=false;
  for(int i=0;i<4;i++) if(channels[i].on!=relayStates[i]) setRelayState(i+1,channels[i].on);
}
String environmentJsonWithEvents(uint8_t eventLimit,bool recovering) {
  float value=GrowEnvironment::vpd(temperature,humidity);
  bool fresh=environmentSensorFresh()&&GrowEnvironment::validReading(temperature,humidity);
  String json=F("{\"enabled\":");
  json+=environmentConfig.enabled?"true":"false";
  json+=F(",\"roomId\":\"")+String(environmentRoomId)+"\",\"bootId\":"+String(environmentBootId)+",\"uptimeMs\":"+String(millis());
  json+=F(",\"stage\":")+String(environmentConfig.stage)+",\"vpdMin\":"+String(environmentConfig.vpdMin,2)+",\"vpdMax\":"+String(environmentConfig.vpdMax,2);
  json+=F(",\"vpd\":")+(fresh?String(value,3):String("null"));
  json+=F(",\"state\":\"")+String(!fresh?"unknown":value<environmentConfig.vpdMin?"low":value>environmentConfig.vpdMax?"high":"optimal")+"\"";
  json+=F(",\"criticalHot\":")+String(environmentConfig.criticalHot,1)+",\"criticalCold\":"+String(environmentConfig.criticalCold,1)+",\"criticalHumidity\":"+String(environmentConfig.criticalHumidity,1);
  json+=F(",\"minimumSwitchSeconds\":")+String(environmentConfig.minimumSwitchMs/1000)+",\"responseSeconds\":"+String(environmentConfig.responseWindowMs/1000)+",\"responseDelta\":"+String(environmentConfig.responseDelta,1);
  json+=F(",\"humidityResponseDelta\":")+String(environmentConfig.humidityResponseDelta,1);
  json+=F(",\"exchangeOnSensorFailure\":")+String(environmentConfig.exchangeOnSensorFailure?"true":"false");
  json+=F(",\"safety\":[");for(int i=0;i<4;i++){if(i)json+=",";json+=String((int)relaySafety[i].reason);}json+="]";
  json+=F(",\"heaterMaximumOnSeconds\":")+String(heaterMaximumOnMs/1000);
  json+=F(",\"manualLightMaximumOnSeconds\":")+String(manualLightMaximumOnMs/1000);
  json+=F(",\"cloud\":")+cloudStatusJson();
  json+=F(",\"alarms\":")+String(environmentController.alarms)+F(",\"failedOutputs\":")+String(environmentController.failedOutputs())+",\"sequence\":"+String(environmentController.sequence)+",\"events\":[";
  uint8_t count=environmentController.count<eventLimit?environmentController.count:eventLimit;
  uint32_t first=environmentController.sequence-count+1;
  if(recovering){
    uint32_t oldest=environmentController.sequence-environmentController.count+1;
    first=cloudEventAck+1>oldest?cloudEventAck+1:oldest;
    uint32_t pending=environmentController.sequence>=first?environmentController.sequence-first+1:0;
    count=pending<eventLimit?pending:eventLimit;cloudEventCaptured=count?first+count-1:cloudEventAck;
  }
  for(unsigned int i=0;i<count;i++) {
    const auto& event=environmentController.events[(first+i-1)%GrowEnvironment::Controller::EventCapacity];
    if(i) json+=F(",");
    json+=F("{\"sequence\":")+String(event.sequence)+",\"uptimeMs\":"+String(event.at)+",\"alarms\":"+String(event.alarms)+",\"outputs\":"+String(event.outputs);
    json+=F(",\"temperature\":")+(isfinite(event.temperature)?String(event.temperature,2):String("null"));
    json+=F(",\"humidity\":")+(isfinite(event.humidity)?String(event.humidity,2):String("null"));
    json+=F(",\"vpdMin\":")+String(event.minimum,2)+F(",\"vpdMax\":")+String(event.maximum,2);
    json+=F(",\"automatic\":")+String(event.automatic)+F(",\"testing\":")+String(event.testing)+F(",\"state\":")+String(event.state)+F(",\"roles\":")+String(event.roles)+F(",\"enabled\":")+String(event.enabled?"true":"false")+"}";
  }
  return json+"]}";
}
String environmentJson() { return environmentJsonWithEvents(16,false); }
void handleEnvironment() { addCORS(); server.send(200,"application/json",environmentJson()); }
void handleSetEnvironment() {
  GrowEnvironment::Config next=environmentConfig;
  const char* numericFields[]={"stage","vpdMin","vpdMax","criticalHot","criticalCold","criticalHumidity","minimumSwitchSeconds","responseSeconds","responseDelta","humidityResponseDelta"};
  for(unsigned int i=0;i<sizeof(numericFields)/sizeof(numericFields[0]);i++) if(server.hasArg(numericFields[i])) {
    String raw=server.arg(numericFields[i]); char* end=nullptr; float number=strtof(raw.c_str(),&end);
    bool integerField=i==0||i==6||i==7;
    if(raw.length()==0||end==raw.c_str()||*end!=0||!isfinite(number)||(integerField&&floorf(number)!=number)||(i==0&&(number<0||number>3))||(i==6&&(number<5||number>300))||(i==7&&(number<60||number>1800))) {
      addCORS(); server.send(400,"application/json","{\"error\":\"invalid_environment_config\"}"); return;
    }
  }
  if(server.hasArg("exchangeOnSensorFailure")&&server.arg("exchangeOnSensorFailure")!="0"&&server.arg("exchangeOnSensorFailure")!="1") {
    addCORS(); server.send(400,"application/json","{\"error\":\"invalid_environment_config\"}"); return;
  }

  if(server.hasArg("enabled")) { if(server.arg("enabled")!="0"&&server.arg("enabled")!="1") { addCORS(); server.send(400,"application/json","{\"error\":\"invalid_environment_config\"}"); return; } next.enabled=server.arg("enabled")=="1"; }
  if(server.hasArg("stage")) next.stage=server.arg("stage").toInt();
  if(server.hasArg("vpdMin")) next.vpdMin=server.arg("vpdMin").toFloat();
  if(server.hasArg("vpdMax")) next.vpdMax=server.arg("vpdMax").toFloat();
  if(server.hasArg("criticalHot")) next.criticalHot=server.arg("criticalHot").toFloat();
  if(server.hasArg("criticalCold")) next.criticalCold=server.arg("criticalCold").toFloat();
  if(server.hasArg("criticalHumidity")) next.criticalHumidity=server.arg("criticalHumidity").toFloat();
  if(server.hasArg("minimumSwitchSeconds")) next.minimumSwitchMs=server.arg("minimumSwitchSeconds").toInt()*1000UL;
  if(server.hasArg("responseSeconds")) next.responseWindowMs=server.arg("responseSeconds").toInt()*1000UL;
  if(server.hasArg("responseDelta")) next.responseDelta=server.arg("responseDelta").toFloat();
  if(server.hasArg("exchangeOnSensorFailure")) next.exchangeOnSensorFailure=server.arg("exchangeOnSensorFailure")=="1";
  if(server.hasArg("humidityResponseDelta")) next.humidityResponseDelta=server.arg("humidityResponseDelta").toFloat();
  String room=server.hasArg("roomId")?server.arg("roomId"):String(environmentRoomId);
  room.toLowerCase();
  bool roomValid=room.length()==36;
  for(unsigned int i=0;i<room.length();i++) if((i==8||i==13||i==18||i==23)?room[i]!='-':!isxdigit(room[i])) roomValid=false;
  if(!GrowEnvironment::validConfig(next)||(next.enabled&&!roomValid)||next.criticalCold>=tempMin||next.criticalHot<=tempMax) {
    addCORS(); server.send(400,"application/json","{\"error\":\"invalid_environment_config\"}"); return;
  }
  if(next.enabled&&!environmentConfig.enabled&&(!environmentSensorFresh()||!GrowEnvironment::validReading(temperature,humidity))) {
    addCORS(); server.send(409,"application/json","{\"error\":\"environment_sensor_unavailable\"}"); return;
  }
  if(room!=String(environmentRoomId)) clearCloudPairing();
  environmentConfig=next; room.toCharArray(environmentRoomId,sizeof(environmentRoomId)); saveEnvironmentConfig();
  runEnvironmentControl(); handleEnvironment();
}
void handleRelayTest() {
  int id=server.arg("id").toInt();String state=server.arg("state");
  if(id<1||id>4||(state!="on"&&state!="off"&&state!="cancel")){addCORS();server.send(400,"application/json","{\"error\":\"invalid_test\"}");return;}
  int i=id-1;int seconds=server.hasArg("seconds")?server.arg("seconds").toInt():10;
  if(seconds<1||seconds>30){addCORS();server.send(400,"application/json","{\"error\":\"invalid_test_duration\"}");return;}
  if(state=="cancel"){if(relayTests[i].active)setRelayState(id,relayTests[i].stop());runAutomations();addCORS();server.send(200,"application/json","{\"ok\":true}");return;}
  bool on=state=="on";
  if(on&&relayFunctions[i]==FN_HEATER&&(!environmentSensorFresh()||temperature>=environmentConfig.criticalHot||(environmentController.alarms&GrowEnvironment::NoResponse))){addCORS();server.send(409,"application/json","{\"error\":\"environment_protection_active\"}");return;}
  if(!on&&environmentConfig.enabled&&(relayFunctions[i]==FN_EXTRACTION||relayFunctions[i]==FN_INTAKE)&&(temperature>=environmentConfig.criticalHot||(!environmentSensorFresh()&&environmentConfig.exchangeOnSensorFailure))){addCORS();server.send(409,"application/json","{\"error\":\"environment_protection_active\"}");return;}
  bool previous=relayStates[i];if(!setRelayState(id,on)){addCORS();server.send(409,"application/json","{\"error\":\"safety_lock_requires_review\"}");return;}relayTests[i].begin(millis(),on,previous,seconds);runEnvironmentControl();
  addCORS();server.send(200,"application/json","{\"ok\":true,\"seconds\":"+String(seconds)+"}");
}
void handleAcknowledgeEnvironment() {
  if(!environmentSensorFresh()||!GrowEnvironment::validReading(temperature,humidity)||temperature>=environmentConfig.criticalHot){addCORS();server.send(409,"application/json","{\"error\":\"unsafe_to_rearm\"}");return;}
  environmentController.acknowledge();
  for(int i=0;i<4;i++)relaySafety[i].acknowledge(true);
  runEnvironmentControl();handleEnvironment();
}

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
    case FN_EXTRACTION: return "extraction";
    case FN_INTAKE: return "intake";

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

  if (value == "extraction") return FN_EXTRACTION;
  if (value == "intake") return FN_INTAKE;

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

    if (fn > FN_INTAKE)
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

  byte savedLightTransitionMode = (byte) lightTransitionMode;
  EEPROM.put(EEPROM_LIGHT_TRANSITION_MODE, savedLightTransitionMode);
  EEPROM.put(EEPROM_LIGHT_TRANSITION_UNTIL, lightTransitionUntil);
  int lightTransitionMagic = LIGHT_TRANSITION_MAGIC_VALUE;
  EEPROM.put(EEPROM_LIGHT_TRANSITION_MAGIC, lightTransitionMagic);

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

  int lightTransitionMagic = 0;
  EEPROM.get(EEPROM_LIGHT_TRANSITION_MAGIC, lightTransitionMagic);
  if (lightTransitionMagic == LIGHT_TRANSITION_MAGIC_VALUE) {
    byte savedLightTransitionMode = LIGHT_TRANSITION_NONE;
    EEPROM.get(EEPROM_LIGHT_TRANSITION_MODE, savedLightTransitionMode);
    EEPROM.get(EEPROM_LIGHT_TRANSITION_UNTIL, lightTransitionUntil);
    lightTransitionMode = savedLightTransitionMode <= LIGHT_TRANSITION_WAIT_START
      ? (LightTransitionMode) savedLightTransitionMode
      : LIGHT_TRANSITION_NONE;
  } else {
    lightTransitionMode = LIGHT_TRANSITION_NONE;
    lightTransitionUntil = 0;
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

    // Seguridad al iniciar

    digitalWrite(
      relayPins[i],
      RELAY_OFF
    );

    pinMode(relayPins[i], OUTPUT);
    relayStates[i] = false;
    relaySafety[i].boot(relayFunctions[i]==FN_HEATER);

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

  bool heater=relayFunctions[index]==FN_HEATER;
  bool safe=environmentSensorFresh()&&GrowEnvironment::validReading(temperature,humidity)&&temperature<environmentConfig.criticalHot&&!(environmentController.failedOutputs()&(1<<index));
  if(heater&&relaySafety[index].on&&temperature>=environmentConfig.criticalHot)relaySafety[index].reason=GrowRelay::Safety::Overtemperature;
  uint32_t limit=heater?heaterMaximumOnMs:(relayFunctions[index]==FN_LIGHT&&relayModes[index]!=MODE_AUTO?manualLightMaximumOnMs:0);
  bool accepted=relaySafety[index].request(millis(),state,heater,safe,limit);
  bool requested=state;
  state=accepted;
  digitalWrite(
    relayPins[index],
    state
      ? RELAY_ON
      : RELAY_OFF
  );

  relayStates[index] =
    state;

  return state==requested;
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
    roomHours() * 60 +
    roomMinutes();

  int start =
    lightStartHour * 60 +
    lightStartMinute;

  int end =
    (
      start +
      lightDurationHours * 60
    ) % 1440;

  if (lightDurationHours == 24) return true;
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

void loadLightChannels() {
  int magic=0; EEPROM.get(EEPROM_LIGHT_CHANNEL_MAGIC,magic);
  if(magic!=LIGHT_CHANNEL_MAGIC_VALUE) return;
  for(int i=0;i<4;i++) {
    LightChannelConfig value; EEPROM.get(EEPROM_LIGHT_CHANNELS+i*16,value);
    if((value.independent==0||value.independent==1)&&value.hour>=0&&value.hour<24&&value.minute>=0&&value.minute<60&&value.duration>=1&&value.duration<=24) lightChannels[i]=value;
  }
}
void saveLightChannels() {
  int magic=LIGHT_CHANNEL_MAGIC_VALUE; EEPROM.put(EEPROM_LIGHT_CHANNEL_MAGIC,magic);
  for(int i=0;i<4;i++) EEPROM.put(EEPROM_LIGHT_CHANNELS+i*16,lightChannels[i]);
  EEPROM.commit();
}
bool channelLightShouldBeOn(int i) {
  if(!lightChannels[i].independent) return lightShouldBeOn();
  if(!timeSynced) return false;
  if(lightChannels[i].duration==24) return true;
  int now=roomHours()*60+roomMinutes();
  int start=lightChannels[i].hour*60+lightChannels[i].minute;
  int end=(start+lightChannels[i].duration*60)%1440;
  return start<end ? now>=start&&now<end : now>=start||now<end;
}
void automaticLightControl() {
  if(!timeSynced){for(int i=0;i<4;i++)if(relayFunctions[i]==FN_LIGHT&&relayModes[i]==MODE_AUTO&&!relayTests[i].active)setRelayState(i+1,false);return;}
  if(lightTransitionMode!=LIGHT_TRANSITION_NONE&&lightTransitionUntil<=roomEpoch()) {
    lightTransitionMode=LIGHT_TRANSITION_NONE;lightTransitionUntil=0;saveControlConfig();
  }
  for(int i=0;i<4;i++) {
    if(relayFunctions[i]!=FN_LIGHT||relayModes[i]!=MODE_AUTO||relayTests[i].active) continue;
    bool on=channelLightShouldBeOn(i);
    if(!lightChannels[i].independent&&lightTransitionMode!=LIGHT_TRANSITION_NONE) on=lightTransitionMode==LIGHT_TRANSITION_HOLD_ON;
    setRelayState(i+1,on);
  }
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

  if(relayTests[relay].active)return;
  if (!dhtReadingFresh) {
    setRelayState(relay + 1, false);
    return;
  }

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
  if (relay < 0 || relayModes[relay] != MODE_AUTO || relayTests[relay].active) return;

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

  if (temperatureEnabled && dhtReadingFresh && temperature > tempMax &&
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
  // Enforce protection before every control cycle, including manual operation.
  for(int i=0;i<4;i++)if(relayStates[i])setRelayState(i+1,true);
  for(int i=0;i<4;i++){
    if(relayTests[i].active&&relayFunctions[i]==FN_HEATER&&(!environmentSensorFresh()||temperature>=environmentConfig.criticalHot)){relayTests[i].state=false;setRelayState(i+1,false);}
    if(relayTests[i].expired(millis())){bool previous=relayTests[i].stop();if(relayFunctions[i]==FN_HEATER&&(!environmentSensorFresh()||temperature>=environmentConfig.criticalHot))previous=false;setRelayState(i+1,previous);}
  }

  automaticLightControl();

  if (!environmentConfig.enabled) automaticHeaterControl();

  automaticVentilationControl();
  runEnvironmentControl();
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

  dhtReadCount++;
  dhtReadingFresh = false;

  if (dht == nullptr) {

    dhtFailureCount++;
    dhtConsecutiveFailures++;
    dhtAvailable = false;

    return;
  }

  float newTemp =
    dht->readTemperature();

  float newHumidity =
    dht->readHumidity();

  if (
    !isnan(newTemp) &&
    !isnan(newHumidity) && GrowEnvironment::validReading(newTemp, newHumidity)
  ) {

    temperature =
      newTemp;

    humidity =
      newHumidity;

    dhtReadingFresh = true;
    dhtHasValidReading = true;
    dhtAvailable = true;
    lastDHTSuccessAt = millis();
    dhtSuccessCount++;
    dhtConsecutiveFailures = 0;
  }

  else {
    dhtFailureCount++;
    dhtConsecutiveFailures++;
    dhtAvailable = dhtHasValidReading && dhtConsecutiveFailures < DHT_FAILURE_THRESHOLD;

    if (dht != nullptr && dhtConsecutiveFailures % DHT_REINITIALIZE_EVERY == 0) {
      dht->begin();
      dhtReinitializations++;
    }
  }
}

// ======================================================
// GOOGLE SHEETS
// ======================================================

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

const char* dhtStateName() {
  if (dhtReadingFresh) return "ok";
  if (!dhtHasValidReading) return dhtReadCount == 0 ? "starting" : "offline";
  if (dhtConsecutiveFailures < DHT_FAILURE_THRESHOLD) return "intermittent";
  return "offline";
}

unsigned long dhtLastSuccessAgeSeconds() {
  if (!dhtHasValidReading) return 0;
  return (millis() - lastDHTSuccessAt) / 1000UL;
}

void handleRoot() {

  String json = F("{");

  json += F("\"device\":\"");
  json += deviceName;

  json += F("\",\"version\":\"");
  json += firmwareVersion;

  json += F("\",\"endpoints\":[");

  json += F("\"/api/status\",");
  json += F("\"/api/hardware\",");
  json += F("\"/api/functions\",");
  json += F("\"/api/config\",");
  json += F("\"/api/relays\",");
  json += F("\"/api/relay\",");
  json += F("\"/api/diagnostics\",");
  json += F("\"/api/restart\"");

  json += F("]}");

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

String buildStatusJson(uint8_t eventLimit,bool recovering) {

  String json = F("{");

  json += F("\"device\":\"");
  json += deviceName;

  json += F("\",\"version\":\"");
  json += firmwareVersion;

  json += F("\",\"online\":true,");

  // DHT

  json += F("\"temperature\":");

  if (dhtAvailable && dhtHasValidReading)
    json += String(
      temperature,
      1
    );
  else
    json += F("null");

  json += F(",\"humidity\":");

  if (dhtAvailable && dhtHasValidReading)
    json += String(
      humidity,
      1
    );
  else
    json += F("null");

  json += F(",\"dht\":{");
  json += F("\"state\":\"");
  json += dhtStateName();
  json += F("\",\"fresh\":");
  json += environmentSensorFresh() ? "true" : "false";
  json += F(",\"lastSuccessAgeSeconds\":");
  json += String(dhtLastSuccessAgeSeconds());
  json += F(",\"consecutiveFailures\":");
  json += String(dhtConsecutiveFailures);
  json += F(",\"readCount\":");
  json += String(dhtReadCount);
  json += F(",\"successCount\":");
  json += String(dhtSuccessCount);
  json += F(",\"failureCount\":");
  json += String(dhtFailureCount);
  json += F(",\"reinitializations\":");
  json += String(dhtReinitializations);
  json += F("}");

  // Soil

  json += F(",\"environment\":") + environmentJsonWithEvents(eventLimit,recovering);
  json += F(",\"soil\":null");
  json += F(",\"soilEnabled\":false");

  // Relays

  json += F(",\"relays\":[");

  for (int i = 0; i < 4; i++) {

    json += F("{");

    json += F("\"id\":");
    json += String(i + 1);

    json += F(",\"pin\":\"");
    json += pinToString(
      relayPins[i]
    );

    json += F("\",\"function\":\"");
    json += functionToString(
      relayFunctions[i]
    );

    json += F("\",\"mode\":\"");
    json += modeToString(
      relayModes[i]
    );

    json += F("\",\"state\":");

    json +=
      relayStates[i]
        ? "true"
        : "false";

    json += F(",\"testing\":")+String(relayTests[i].active?"true":"false");
    json += F("}");

    if (i < 3)
      json += F(",");
  }

  json += F("]");

  // Time

  json += F(",\"timeSynced\":");

  json +=
    timeSynced
      ? "true"
      : "false";

  if (timeSynced) {

    json += F(",\"hour\":");
    json += String(
      roomHours()
    );

    json += F(",\"minute\":");
    json += String(
      roomMinutes()
    );
  }

  // Network

  json += F(",\"ip\":\"");

  json +=
    WiFi.localIP().toString();

  json += F("\"");

  json += F(",\"rssi\":");
  json += String(
    WiFi.RSSI()
  );

  json += F(",\"uptime\":");
  json += String(
    millis() / 1000
  );

  json += F("}");

  return json;
}
void handleApiStatus() { addCORS(); server.send(200,"application/json",buildStatusJson(16,false)); }

// ======================================================
// API RELAYS
// ======================================================

void handleApiRelays() {

  String json =
    F("{\"relays\":[");

  for (int i = 0; i < 4; i++) {

    json += F("{");

    json += F("\"id\":");
    json += String(i + 1);

    json += F(",\"pin\":\"");
    json += pinToString(
      relayPins[i]
    );

    json += F("\",\"function\":\"");
    json += functionToString(
      relayFunctions[i]
    );

    json += F("\",\"mode\":\"");
    json += modeToString(
      relayModes[i]
    );

    json += F("\",\"state\":");

    json +=
      relayStates[i]
        ? "true"
        : "false";

    json += F(",\"testing\":")+String(relayTests[i].active?"true":"false");
    json += F("}");

    if (i < 3)
      json += F(",");
  }

  json += F("]}");

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

  if(newState && relayFunctions[index]==FN_HEATER &&
    (!environmentSensorFresh() || temperature>=environmentConfig.criticalHot || (environmentController.alarms&GrowEnvironment::NoResponse))) {
    addCORS(); server.send(409,"application/json","{\"error\":\"environment_protection_active\"}"); return;
  }
  relayTests[index].active=false;
  if(!setRelayState(relayId,newState)){addCORS();server.send(409,"application/json","{\"error\":\"safety_lock_requires_review\"}");return;}
  runEnvironmentControl();

  String json =
    F("{\"ok\":true,\"relay\":") +
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
// SAFE DEVICE RESTART
// Respondemos antes de reiniciar para que la app pueda
// iniciar el seguimiento de reconexión.
// ======================================================

void handleApiRestart() {
  addCORS();
  server.send(
    200,
    "application/json",
    "{\"ok\":true,\"restarting\":true}"
  );
  restartRequested = true;
  restartRequestedAt = millis();
}

// ======================================================
// SENSOR DIAGNOSTICS
// ======================================================

void handleApiDiagnostics() {
  String json = F("{\"dht\":{");
  json += F("\"type\":\"DHT21\",\"pin\":\"");
  json += pinToString(pinDHT);
  json += F("\",\"state\":\"");
  json += dhtStateName();
  json += F("\",\"fresh\":");
  json += dhtReadingFresh ? "true" : "false";
  json += F(",\"available\":");
  json += dhtAvailable ? "true" : "false";
  json += F(",\"lastSuccessAgeSeconds\":");
  json += String(dhtLastSuccessAgeSeconds());
  json += F(",\"readCount\":");
  json += String(dhtReadCount);
  json += F(",\"successCount\":");
  json += String(dhtSuccessCount);
  json += F(",\"failureCount\":");
  json += String(dhtFailureCount);
  json += F(",\"consecutiveFailures\":");
  json += String(dhtConsecutiveFailures);
  json += F(",\"reinitializations\":");
  json += String(dhtReinitializations);
  json += F("}}");
  addCORS();
  server.send(200, "application/json", json);
}

// ======================================================
// FUNCTIONS GET
// ======================================================

void handleApiFunctions() {

  String json =
    F("{\"relays\":[");

  for (int i = 0; i < 4; i++) {

    json += F("{");

    json += F("\"id\":");
    json += String(i + 1);

    json += F(",\"function\":\"");
    json += functionToString(
      relayFunctions[i]
    );

    json += F("\",\"mode\":\"");
    json += modeToString(
      relayModes[i]
    );

    json += F("\"}");

    if (i < 3)
      json += F(",");
  }

  json += F("],");

  json += F("\"allowedFunctions\":[");

  json += F("\"none\",");
  json += F("\"light\",");
  json += F("\"ventilation\",");
  json += F("\"heater\",");
  json += F("\"pump\"");

  json += F("],");

  json += F("\"allowedModes\":[");
  json += F("\"manual\",");
  json += F("\"auto\"");
  json += F("]");

  json += F("}");

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
      functionArg == "pump" || functionArg == "extraction" || functionArg == "intake";

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

    // Light supports multiple independently controlled channels.

    if (
      newFunction != FN_NONE && newFunction != FN_LIGHT
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

  relayTests[index].active=false;
  bool roleChanged=relayFunctions[index]!=newFunction;
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

  if(roleChanged)relaySafety[index].boot(newFunction==FN_HEATER);
  saveFunctionConfig();

  runAutomations();

  String json = F("{");

  json += F("\"ok\":true,");

  json += F("\"relay\":");
  json += String(relayId);

  json += F(",\"function\":\"");
  json += functionToString(
    newFunction
  );

  json += F("\",\"mode\":\"");
  json += modeToString(
    newMode
  );

  json += F("\"}");

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

  String json = F("{");

  json += F("\"lightChannels\":[");
  for(int i=0;i<4;i++) {
    if(i) json+=F(",");
    json+=F("{\"relay\":")+String(i+1)+",\"independent\":"+(lightChannels[i].independent?String("true"):String("false"))+",\"hour\":"+String(lightChannels[i].hour)+",\"minute\":"+String(lightChannels[i].minute)+",\"duration\":"+String(lightChannels[i].duration)+"}";
  }
  json+=F("],");
  json += F("\"lightStartHour\":");
  json += String(
    lightStartHour
  );

  json += F(",\"lightStartMinute\":");
  json += String(
    lightStartMinute
  );

  json += F(",\"lightDurationHours\":");
  json += String(
    lightDurationHours
  );

  json += F(",\"lightTransitionActive\":");
  json += lightTransitionMode == LIGHT_TRANSITION_NONE ? "false" : "true";

  json += F(",\"lightTransitionMode\":\"");
  if (lightTransitionMode == LIGHT_TRANSITION_HOLD_ON) json += F("hold_on");
  else if (lightTransitionMode == LIGHT_TRANSITION_WAIT_START) json += F("wait_start");
  else json += F("none");
  json += F("\"");

  json += F(",\"lightTransitionUntil\":");
  json += String(lightTransitionUntil);

  json += F(",\"tempMin\":");
  json += String(
    tempMin,
    1
  );

  json += F(",\"tempMax\":");
  json += String(
    tempMax,
    1
  );

  json += F(",\"ventilationIntervalMinutes\":");
  json += String(
    ventilationInterval /
    60000UL
  );

  json += F(",\"ventilationDurationMinutes\":");
  json += String(
    ventilationDuration /
    60000UL
  );

  json += F(",\"ventilationEmergencyDurationMinutes\":");
  json += String(ventilationEmergencyDuration / 60000UL);

  json += F(",\"ventilationMode\":\"");
  if (ventilationMode == VENT_INTERVAL) json += F("interval");
  else if (ventilationMode == VENT_TEMPERATURE) json += F("temperature");
  else json += F("combined");
  json += F("\"");

  json += F("}");

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
  float proposedMin=server.hasArg("tmin")?server.arg("tmin").toFloat():tempMin;
  float proposedMax=server.hasArg("tmax")?server.arg("tmax").toFloat():tempMax;
  if(!isfinite(proposedMin)||!isfinite(proposedMax)||proposedMin<0||proposedMax>50||proposedMax<=proposedMin||
     (environmentConfig.enabled&&(proposedMin<=environmentConfig.criticalCold||proposedMax>=environmentConfig.criticalHot))) {
    addCORS(); server.send(400,"application/json","{\"error\":\"invalid_temperature_range\"}"); return;
  }


  if(server.hasArg("relay")) {
    int index=server.arg("relay").toInt()-1;
    if(index<0||index>=4||relayFunctions[index]!=FN_LIGHT) {addCORS();server.send(400,"application/json","{\"ok\":false,\"error\":\"invalid_light_channel\"}");return;}
    LightChannelConfig value=lightChannels[index];
    value.independent=server.hasArg("independent")&&server.arg("independent")=="1";
    if(value.independent) {
      if(!server.hasArg("hora")||!server.hasArg("min")||!server.hasArg("dur")) {addCORS();server.send(400,"application/json","{\"ok\":false,\"error\":\"invalid_light_schedule\"}");return;}
      value.hour=server.arg("hora").toInt();value.minute=server.arg("min").toInt();value.duration=server.arg("dur").toInt();
      if(value.hour<0||value.hour>23||value.minute<0||value.minute>59||value.duration<1||value.duration>24) {addCORS();server.send(400,"application/json","{\"ok\":false,\"error\":\"invalid_light_schedule\"}");return;}
    }
    lightChannels[index]=value;saveLightChannels();runAutomations();addCORS();server.send(200,"application/json","{\"ok\":true}");return;
  }
  int lightRelay = -1;
  for(int i=0;i<4;i++) if(relayFunctions[i]==FN_LIGHT&&relayModes[i]==MODE_AUTO&&!lightChannels[i].independent) {lightRelay=i;break;}
  bool lightWasOn = lightRelay >= 0 && relayStates[lightRelay];

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

  bool extendedTransition = server.hasArg("extendedTransition") &&
    (server.arg("extendedTransition") == "1" || server.arg("extendedTransition") == "true");

  lightTransitionMode = LIGHT_TRANSITION_NONE;
  lightTransitionUntil = 0;

  if (extendedTransition && timeSynced && lightRelay >= 0 && relayModes[lightRelay] == MODE_AUTO) {
    int currentMinute = roomHours() * 60 + roomMinutes();
    int newStartMinute = lightStartHour * 60 + lightStartMinute;
    int newEndMinute = (newStartMinute + lightDurationHours * 60) % 1440;
    int targetMinute = lightWasOn ? newEndMinute : newStartMinute;
    int minutesUntilTarget = (targetMinute - currentMinute + 1440) % 1440;
    if (minutesUntilTarget == 0) minutesUntilTarget = 1440;
    lightTransitionMode = lightWasOn
      ? LIGHT_TRANSITION_HOLD_ON
      : LIGHT_TRANSITION_WAIT_START;
    lightTransitionUntil = roomEpoch() + (unsigned long) minutesUntilTarget * 60UL;
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
    lightTransitionMode == LIGHT_TRANSITION_NONE
      ? "{\"ok\":true,\"lightTransitionActive\":false}"
      : "{\"ok\":true,\"lightTransitionActive\":true}"
  );
}

// ======================================================
// HARDWARE GET
// ======================================================

void handleApiHardware() {

  String json = F("{");

  json +=
    F("\"board\":\"Wemos D1 R1 ESP8266\",");

  json += F("\"dht\":{");

  json += F("\"type\":\"DHT21\",");
  json += F("\"pin\":\"");
  json += pinToString(pinDHT);
  json += F("\",");
  json += F("\"configurable\":true");

  json += F("},");

  json += F("\"soil\":{");

  json += F("\"type\":\"analog\",");
  json += F("\"pin\":\"A0\",");
  json += F("\"enabled\":false,");
  json += F("\"configurable\":false");

  json += F("},");

  json += F("\"relays\":[");

  for (int i = 0; i < 4; i++) {

    json += F("{");

    json += F("\"id\":");
    json += String(i + 1);

    json += F(",\"pin\":\"");
    json += pinToString(
      relayPins[i]
    );

    json += F("\",\"gpio\":")+String(relayPins[i])+F(",\"outputHigh\":")+String(digitalRead(relayPins[i])==HIGH?"true":"false");
    json += F("}");

    if (i < 3)
      json += F(",");
  }

  json += F("],");

  json += F("\"allowedDigitalPins\":[");

  json += F("\"D1\",");
  json += F("\"D2\",");
  json += F("\"D5\",");
  json += F("\"D6\",");
  json += F("\"D7\"");

  json += F("]");

  json += F("}");

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

  if (!environmentBootId) { environmentBootId=ESP.random(); if(!environmentBootId) environmentBootId=1; }

  unsigned long start =
    millis();

  while (
    WiFi.status() !=
      WL_CONNECTED &&
    millis() - start <
      15000
  ) {

    readDHT();
    runAutomations();
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
  loadLightChannels();
  loadEnvironmentConfig();
  loadCloudPairing();
  // BearSSL yields during certificate work. Keep existing output control serviced
  // from CONT context; DHT reads remain outside this short callback.
  cloudSchedulerReady=schedule_recurrent_function_us([](){if(cloudWorking)runAutomations();return true;},200000);
  if(!cloudSchedulerReady){cloudBlocked=true;cloudLastResult=-10;}
  ESP.rtcUserMemoryRead(0,reinterpret_cast<uint32_t*>(&cloudFault),sizeof(cloudFault));
  String resetReason=ESP.getResetReason();
  if(cloudPairing.magic==0x47524331&&(resetReason.indexOf("Watchdog")>=0||resetReason.indexOf("Exception")>=0||cloudFault.magic==0x47524631)){cloudBlocked=true;cloudLastResult=-11;}

  initializeHardware();

  connectWiFi();

  // ----------------------------------------------------
  // NTP
  // ----------------------------------------------------

  configTime(0,0,"pool.ntp.org");

  // ----------------------------------------------------
  // API
  // ----------------------------------------------------

  server.on("/api/relay/test", HTTP_POST, handleRelayTest);
  server.on("/api/relay/test", HTTP_OPTIONS, handleOptions);
  server.on("/api/environment/cloud", HTTP_GET, handleCloudStatus);
  server.on("/api/environment/cloud", HTTP_POST, handleCloudPairing);
  server.on("/api/environment/cloud", HTTP_OPTIONS, handleOptions);
  server.on("/api/environment", HTTP_GET, handleEnvironment);
  server.on("/api/environment", HTTP_POST, handleSetEnvironment);
  server.on("/api/environment", HTTP_OPTIONS, handleOptions);
  server.on("/api/environment/acknowledge", HTTP_POST, handleAcknowledgeEnvironment);
  server.on("/api/environment/acknowledge", HTTP_OPTIONS, handleOptions);

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
    "/api/restart",
    HTTP_POST,
    handleApiRestart
  );

  server.on(
    "/api/diagnostics",
    HTTP_GET,
    handleApiDiagnostics
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

  server.on(
    "/api/restart",
    HTTP_OPTIONS,
    handleOptions
  );

  server.on(
    "/api/diagnostics",
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

  if (restartRequested && millis() - restartRequestedAt >= 750UL) {
    ESP.restart();
  }

  readDHT();
  runAutomations();
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

  timeSynced = cloudUtcEpoch() >= 1700000000;

  // ----------------------------------------------------
  // SENSOR
  // ----------------------------------------------------

  readDHT();

  // ----------------------------------------------------
  // AUTOMATION
  // ----------------------------------------------------

  runAutomations();

  runCloudTelemetry();

  delay(20);
}

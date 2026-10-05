#pragma once
#include <ESP8266WiFi.h>
#include <BearSSLHelpers.h>
#include <StackThunk.h>
#include <memory>
extern "C" {
#include <lwip/dns.h>
#include <lwip/inet.h>
}
#include "CloudTrustAnchor.h"
#include "CloudTelemetryPolicy.h"

// Core 3.1.2: DNS is asynchronous; only TCP establishment has a 250 ms limit.
// TLS is advanced one bounded fragment at a time, using the core's secondary-stack thunks.
// No HTTP client, readString(), insecure TLS or wait-for-handshake loop is used.
class CooperativeCloudTls {
 // Dedicated telemetry endpoint uses small records; oversized records fail closed.
 static constexpr size_t TlsBufferSize=8192+325;
 enum Phase { Idle,Resolving,Connecting,Exchanging } phase=Idle;
 WiFiClient socket;
 IPAddress address;
 std::unique_ptr<BearSSL::X509List> trust;
 std::unique_ptr<br_ssl_client_context> ssl;
 std::unique_ptr<br_x509_minimal_context> x509;
 std::unique_ptr<uint8_t[]> buffer;
 String host,request;
 size_t sent=0;
 uint32_t started=0,epoch=0;
 bool thunkHeld=false;
 GrowCloud::ResponseHeaders response;
 static void onDns(const char*,const ip_addr_t* ip,void* arg){
  auto* self=static_cast<CooperativeCloudTls*>(arg);
  if(self->phase!=Resolving)return;
  if(!ip||!self->address.fromString(ipaddr_ntoa(ip))){self->finish(-2);return;}
  self->phase=Connecting;
 }
 bool startTls(){
  // Check before allocating; telemetry must yield to the local server and controller.
  const size_t need=TlsBufferSize+sizeof(br_ssl_client_context)+sizeof(br_x509_minimal_context)+12500;
  if(ESP.getFreeHeap()<need||ESP.getMaxFreeBlockSize()<TlsBufferSize){finish(-5);return false;}
  stack_thunk_add_ref();thunkHeld=true;
  if(!stack_thunk_ptr){finish(-5);return false;}
  trust.reset(new(std::nothrow) BearSSL::X509List(GROW_CLOUD_ROOT));
  ssl.reset(new(std::nothrow) br_ssl_client_context);
  x509.reset(new(std::nothrow) br_x509_minimal_context);
  buffer.reset(new(std::nothrow) uint8_t[TlsBufferSize]);
  if(!trust||!ssl||!x509||!buffer||trust->getCount()==0){finish(-5);return false;}
  br_ssl_client_init_full(ssl.get(),x509.get(),trust->getTrustAnchors(),trust->getCount());
  br_ssl_engine_set_versions(&ssl->eng,BR_TLS12,BR_TLS12);
  br_ssl_engine_add_flags(&ssl->eng,BR_OPT_NO_RENEGOTIATION);
  br_ssl_engine_set_buffer(&ssl->eng,buffer.get(),TlsBufferSize,0);
  br_x509_minimal_set_time(x509.get(),epoch/86400+719528,epoch%86400);
  uint32_t entropy[8];for(auto& word:entropy)word=ESP.random();
  br_ssl_engine_inject_entropy(&ssl->eng,entropy,sizeof(entropy));
  if(!br_ssl_client_reset(ssl.get(),host.c_str(),0)){finish(-6);return false;}
  phase=Exchanging;return true;
 }
 void finish(int code){
  if(code==-6&&ssl)lastError=br_ssl_engine_last_error(&ssl->eng);
  result=code;socket.stop(1);phase=Idle;
  buffer.reset();ssl.reset();x509.reset();trust.reset();
  if(thunkHeld){stack_thunk_del_ref();thunkHeld=false;}
  // Request contains a scoped device token. Release its allocation after every attempt.
  for(size_t i=0;i<request.length();i++)request.setCharAt(i,0);
  request=String();host=String();
 }
public:
 int result=0,lastError=0;
 uint32_t lastStep=0;
 uint32_t maximumStepMs=0;
 bool active()const{return phase!=Idle;}
 void cancel(){if(active())finish(-7);}
 bool start(const char* hostname,String&& wireRequest,uint32_t utc){
  if(active()||utc<1700000000)return false;
  host=hostname;request=std::move(wireRequest);epoch=utc;sent=0;result=lastError=0;lastStep=0;response.reset();started=millis();phase=Resolving;
  ip_addr_t ip;err_t code=dns_gethostbyname(host.c_str(),&ip,onDns,this);
  if(code==ERR_OK)onDns(host.c_str(),&ip,this);
  else if(code!=ERR_INPROGRESS)finish(-2);
  return true;
 }
 void poll(){
  if(!active())return;
  if(WiFi.status()!=WL_CONNECTED){finish(-1);return;}
  if(GrowCloud::expired(millis(),started,GrowCloud::TransactionDeadline)){finish(-3);return;}
  if(phase==Resolving)return;
  uint32_t stepStart=millis();
  if(phase==Connecting){lastStep=10;socket.setTimeout(250);socket.setSync(false);if(!socket.connect(address,443)){finish(-4);return;}socket.setNoDelay(true);startTls();}
  else if(phase==Exchanging){
   size_t length=0;unsigned state=br_ssl_engine_current_state(&ssl->eng);
   if(state&BR_SSL_CLOSED){finish(-6);return;}
   if(state&BR_SSL_SENDREC){lastStep=20;
    auto* bytes=BearSSL::thunk_br_ssl_engine_sendrec_buf(&ssl->eng,&length);
    int available=socket.availableForWrite();if(available>0){size_t n=length;if(n>256)n=256;if(n>size_t(available))n=available;n=socket.write(bytes,n);if(n)BearSSL::thunk_br_ssl_engine_sendrec_ack(&ssl->eng,n);}
   }else if(state&BR_SSL_RECVAPP){lastStep=30;
    auto* bytes=BearSSL::thunk_br_ssl_engine_recvapp_buf(&ssl->eng,&length);
    size_t n=length>256?256:length;for(size_t i=0;i<n;i++)response.feed(bytes[i]);
    BearSSL::thunk_br_ssl_engine_recvapp_ack(&ssl->eng,n);
    if(response.invalid()){finish(-8);return;}
    if(response.complete()){finish(response.code());return;}
   }else if((state&BR_SSL_SENDAPP)&&sent<request.length()){lastStep=40;
    auto* bytes=BearSSL::thunk_br_ssl_engine_sendapp_buf(&ssl->eng,&length);
    size_t n=request.length()-sent;if(n>length)n=length;if(n>256)n=256;
    memcpy(bytes,request.c_str()+sent,n);sent+=n;BearSSL::thunk_br_ssl_engine_sendapp_ack(&ssl->eng,n);
    if(sent==request.length())br_ssl_engine_flush(&ssl->eng,0);
   }else if((state&BR_SSL_RECVREC)&&socket.available()>0){lastStep=50;
    auto* bytes=BearSSL::thunk_br_ssl_engine_recvrec_buf(&ssl->eng,&length);size_t n=length>256?256:length;int read=socket.read(bytes,n);if(read>0)BearSSL::thunk_br_ssl_engine_recvrec_ack(&ssl->eng,read);
   }else if(!socket.connected()){finish(-4);return;}
  }
  uint32_t stepMs=millis()-stepStart;if(stepMs>maximumStepMs)maximumStepMs=stepMs;
  if(stepMs>5000){finish(-9);} // Stop further cloud attempts until provision/review; protect local cadence.
 }
};

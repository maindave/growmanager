#include "../firmware/Sketch_API_V1/CloudTelemetryPolicy.h"
#include <assert.h>
#include <stdio.h>
#include <string>
using namespace GrowCloud;
void feed(ResponseHeaders& parser,const std::string& text){for(auto c:text)parser.feed(c);}
int main(){
 assert(retryDelay(0)==60000&&retryDelay(1)==60000&&retryDelay(2)==120000&&retryDelay(20)==900000);
 assert(expired(100,UINT32_MAX-100,200));assert(!expired(100,UINT32_MAX-100,300));
 Backlog queue;queue.add(1700000000,25,60);uint32_t captured=queue.sequence;queue.add(1700000300,26,61);queue.acknowledge(captured);assert(queue.count==1&&queue.readings[0].temperature==26);
 for(size_t i=0;i<Backlog::Capacity+5;i++)queue.add(1700000600+i*300,24,50);
 assert(queue.count==Backlog::Capacity&&queue.dropped==6);queue.acknowledge(queue.sequence);assert(queue.count==0);
 ResponseHeaders response;feed(response,"HTTP/1.1 204 No Content\r\nServer: cloud\r\n");assert(!response.complete());feed(response,"\r\n");assert(response.complete()&&response.code()==204&&!response.invalid());
 response.reset();feed(response,"HTTP/1.1 403 Forbidden\r\n\r\n");assert(response.complete()&&response.code()==403);
 response.reset();feed(response,"HTTP/1.1 200 OK\r\nX-Long: "+std::string(500,'a')+"\r\n\r\n");assert(response.complete()&&!response.invalid());
 response.reset();feed(response,"HTTP/1.1 200 OK\n\n");assert(response.invalid());
 response.reset();feed(response,"bad status\r\n\r\n");assert(response.invalid());
 response.reset();feed(response,"HTTP/1.1 200 OK\r\nX: "+std::string(5000,'a'));assert(response.invalid());
 puts("Direct cloud timing, queue and response parsing: passed");
}

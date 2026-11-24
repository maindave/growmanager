#pragma once
#include <stddef.h>
#include <string.h>
namespace GrowJson {
// Heap-free syntax validation. Reject partial output instead of sending broken JSON.
class Parser {
 const char* p;const char* end;
 void space(){while(p<end&&(*p==' '||*p=='\n'||*p=='\r'||*p=='\t'))p++;}
 bool literal(const char* text){size_t n=strlen(text);if(size_t(end-p)<n||memcmp(p,text,n))return false;p+=n;return true;}
 bool string(){
  if(p==end||*p++!='"')return false;
  while(p<end){unsigned char c=*p++;if(c=='"')return true;if(c<32)return false;
   if(c=='\\'){if(p==end)return false;char e=*p++;if(e=='u'){for(int i=0;i<4;i++){if(p==end)return false;char h=*p++;if(!((h>='0'&&h<='9')||(h>='a'&&h<='f')||(h>='A'&&h<='F')))return false;}}
    else if(!strchr("\"\\/bfnrt",e))return false;}
  }return false;
 }
 bool number(){
  if(p<end&&*p=='-')p++;if(p==end)return false;
  if(*p=='0')p++;else{if(*p<'1'||*p>'9')return false;while(p<end&&*p>='0'&&*p<='9')p++;}
  if(p<end&&*p=='.'){p++;const char* first=p;while(p<end&&*p>='0'&&*p<='9')p++;if(p==first)return false;}
  if(p<end&&(*p=='e'||*p=='E')){p++;if(p<end&&(*p=='+'||*p=='-'))p++;const char* first=p;while(p<end&&*p>='0'&&*p<='9')p++;if(p==first)return false;}
  return true;
 }
 bool value(unsigned depth){
  if(depth>24)return false;space();if(p==end)return false;
  if(*p=='{'){p++;space();if(p<end&&*p=='}'){p++;return true;}
   while(p<end){if(!string())return false;space();if(p==end||*p++!=':')return false;if(!value(depth+1))return false;space();if(p==end)return false;char c=*p++;if(c=='}')return true;if(c!=',')return false;space();}return false;}
  if(*p=='['){p++;space();if(p<end&&*p==']'){p++;return true;}while(p<end){if(!value(depth+1))return false;space();if(p==end)return false;char c=*p++;if(c==']')return true;if(c!=',')return false;}return false;}
  if(*p=='"')return string();if(*p=='t')return literal("true");if(*p=='f')return literal("false");if(*p=='n')return literal("null");return number();
 }
public:
 Parser(const char* text,size_t length):p(text),end(text+length){}
 bool object(){space();if(p==end||*p!='{')return false;if(!value(0))return false;space();return p==end;}
};
inline bool validObject(const char* text,size_t length){if(!text||!length)return false;return Parser(text,length).object();}
}

//+------------------------------------------------------------------+
//|                                                      ProjectName |
//|                                      Copyright 2012, CompanyName |
//|                                       http://www.companyname.net |
//+------------------------------------------------------------------+
/*
For help and support, please visit http://penguintraders.com

https://github.com/PenguinTraders/MT4-Node.js
http://www.forexfactory.com/saver0
*/

#property copyright "PenguinTraders"
#property link      "http://penguintraders.com"
#property version   "1.00"
#property strict

#define DELIM ";" 

#property indicator_chart_window
#property indicator_buffers 2

#property indicator_color1 Red 
#property indicator_color2 Lime


#include <mq4-http.mqh>
#include <hash.mqh>
#include <json.mqh>


extern string record_start_time="2011.01.01 00:00";
extern string record_end_time="2012.12.31 00:00";
extern bool load_data_first=false;
extern bool show_debug=true;

int _PORT=8040;

double TopFractal[];
double BottomFractal[];
string table="";
bool calculating=false;
string IndicatorName="FractalP_";
int calcBar=0;
int debugLine=0;
int expectBullish=0;
int lastRequestBar=0;
int lastArrowBarPos=-1;
int lastArrowType=-1;
int lastPos=-1;
int lastType=-1;
MqlNet INet;

int msgCount=0;
// When the indicator is removed, we delete all of the neurnal networks 
// from the memory of the computer.
int deinit()
  {

   for(int index=0; index<ObjectsTotal(); index++)
     {
      if(StringFind(ObjectName(index),IndicatorName)==0)
        {
         ObjectDelete(ObjectName(index));
         index--;
        }
     }

   return(0);
  }
//+------------------------------------------------------------------+
//|                                                                  |
//+------------------------------------------------------------------+
int init()
  {

   SetIndexBuffer(0,TopFractal);
   SetIndexBuffer(1,BottomFractal);
   SetIndexStyle(0,DRAW_ARROW);
   SetIndexArrow(0,226);
   SetIndexStyle(1,DRAW_ARROW);
   SetIndexArrow(1,225);

   int starTime=StrToTime(record_start_time);
   int endTime = StrToTime(record_end_time);

   if(!IsDllsAllowed())
     {
      printDebug("DLLs not allowed. Please fix this setting");
      Print("DLLs not allowed. Please fix this setting");
     }

   if(load_data_first && starTime<Time[Bars-1])
     {
      printDebug("ERROR! Start time "+record_start_time+" is less than "+TimeToString(Time[Bars-1],TIME_DATE|TIME_MINUTES));
      Print("ERROR! Start time "+record_start_time+" is less than "+TimeToString(Time[Bars-1],TIME_DATE|TIME_MINUTES));
/* Make sure your chart has enough bars OR if you are running this EA in strategy tester, make sure your start date is less than the record_start_time */
     }

   if(load_data_first && endTime>Time[0])
     {
      printDebug("ERROR! End time "+record_end_time+" is greater than "+TimeToString(Time[0],TIME_DATE|TIME_MINUTES));
      Print("ERROR! End time "+record_end_time+" is greater than "+TimeToString(Time[0],TIME_DATE|TIME_MINUTES));
/* Make sure your chart has enough bars OR if you are running this EA in strategy tester, make sure your start date is less than the record_start_time */
     }

//Test the connection to Node server
   string req="TEST";
   string incoming_msg="";

   if(!INet.Open("localhost",_PORT)) return(0);

   if(!INet.Request("POST","/",incoming_msg,false,true,req,false))
     {
      printDebug("-Err download ");
      return(0);
     }

   if(incoming_msg!="OK")
     {
      printDebug("Connection to Node server failed. Check to see if server is running at _PORT");
      Print("Connection to Node server failed. Check to see if server is running at _PORT");
     }

   return(0);

  }

//+------------------------------------------------------------------+
//|                                                                  |
//+------------------------------------------------------------------+

bool dataLoaded=false;
double lastZigZag=0;
//+------------------------------------------------------------------+
//|                                                                  |
//+------------------------------------------------------------------+
int start()
  {

   int a,b,c,d,e,i,j,k,z;
   int bar;
   string row;

   int starTime= StrToTime(record_start_time);
   int endTime = StrToTime(record_end_time);

   int time,fractal,zigzag;
   double fractal_down,fractal_up;
   string record,symbol1,symbol2,table,req,data;

//Let's see if we should load the data first if the data isn't loaded already
//We start recording after we have had 20 bars in the chart to make sure ZigZag leg is complete.
   if(load_data_first && Time[20]>endTime && !dataLoaded)
     {
      //Let's first tell server to clear the table
      req="CLEAR";
      data="";
      sendMessage(req,data);

      int startBarPos=iBarShift(NULL,0,starTime);

      for(i=startBarPos; i>20; i--)
        {
         //Figure out the bar pattern
         if(Open[i]<Close[i])
            bar=1;
         else if(Open[i]>Close[i])
            bar=0;
         else if(Open[i+1]<Close[i+1])
            bar=1;
         else if(Open[i+1]>Close[i+1])
            bar=0;
         else
           {
            if(Open[i+2]<Close[i+2])
               bar=1;
            else
               bar=0;
           }

         //Figure out the ZigZag legs
         double zigZag_val=EMPTY_VALUE;
         if(lastZigZag==0)
           {
            a=1;
            while(zigZag_val==EMPTY_VALUE)
              {
               zigZag_val=iCustom(NULL,0,"ZigZag",13,8,5,0,i+a);
               a++;
              }
            lastZigZag=zigZag_val;
           }

         time=Time[i];
         fractal_down=iFractals(NULL,0,MODE_UPPER,i);
         fractal_up=iFractals(NULL,0,MODE_LOWER,i);
         zigZag_val=iCustom(NULL,0,"ZigZag",13,8,5,0,i);

         fractal= -1;
         zigzag = -1;
         //Figure out the ZigZag leg and the Fractal pattern
         if((fractal_down!=0 && fractal_down!=EMPTY_VALUE) && (fractal_up!=0 && fractal_up!=EMPTY_VALUE))
           {
            fractal=2;
           }
         else if((fractal_down!=0 && fractal_down!=EMPTY_VALUE))
           {
            fractal=0;
           }
         else if((fractal_up!=0 && fractal_up!=EMPTY_VALUE))
           {
            fractal=1;
           }

         if(zigZag_val!=0 && zigZag_val!=EMPTY_VALUE && zigZag_val<lastZigZag)
           {
            zigzag=1;
            lastZigZag=zigZag_val;
           }
         else if(zigZag_val!=0 && zigZag_val!=EMPTY_VALUE && zigZag_val>lastZigZag)
           {
            zigzag=0;
            lastZigZag=zigZag_val;
           }

         //Construct the message string
         record="\"datetime\":\""+time+"\",\"bar\":\""+bar+"\",\"fractal\":\""+fractal+"\", \"zigzag\":\""+zigzag+"\"}";

         symbol1 = StringSubstr(Symbol(), 0, 2);
         symbol2 = StringSubstr(Symbol(), 3, 2);
         // Publish current tick value.
         table=symbol1+symbol2+"_fractal_"+getPeriod();
         req="REC:{\"table\":\""+table+"\", \"record\":{"+record+"}";
         data="";

         //Send the data string to the server to be recorded in the DB
         sendMessage(req,data);

        }

      //Tell the server to rebuild the Sets with new data
      req="REBUILD";
      data="";
      sendMessage(req,data);

      dataLoaded=true;
     }
   else if(load_data_first && Time[20]<endTime)
     {
      printDebug("You need to fast forward strategy tester to a time after endTime setting");
     }

//If all data is loaded then begin caculations
   else if(!load_data_first || dataLoaded)
     {

      int countedBars=IndicatorCounted();

      if(Bars>calcBar)
        {
         msgCount++;
         if(!calculating);
         calcBar=Bars;

         fractal_down=iFractals(NULL,0,MODE_UPPER,2);
         fractal_up=iFractals(NULL,0,MODE_LOWER,2);

         //if(!calculating && ((fractal_down != 0 && fractal_down != EMPTY_VALUE) || (fractal_up != 0 && fractal_up != EMPTY_VALUE)))
           {

            symbol1 = StringSubstr(Symbol(), 0, 2);
            symbol2 = StringSubstr(Symbol(), 3, 2);
            table=symbol1+symbol2+"_fractal_"+getPeriod();

            bool getData=true;
            string CandleBitString= "[";
            string FractalPattern = "[";

            //Get current ZigZag leg pattern
            int pos=1;
            int startPos=0;
            int BarLength=0;

            double zigZag_val1 = 0;
            double zigZag_val2 = 0;
            double fractal_val = 0;
            int zigZag_pos=0;
            bool ready=false;
            if(lastArrowBarPos==-1)
              {
               a=0;
               while(zigZag_val1==0 && a<200)
                 {
                  zigZag_val1=iCustom(NULL,0,"ZigZag",13,8,5,0,a);
                  a++;
                 }
               zigZag_pos=a-1;

               while(zigZag_val2==0 && a<250)
                 {
                  zigZag_val2=iCustom(NULL,0,"ZigZag",13,8,5,0,a);
                  a++;
                 }
               int secondPos=a-1;

               a=zigZag_pos;
               if(zigZag_val1<zigZag_val2) // If its a down leg, look for down fractal after this pos
                 {
                  fractal_val=0;

                  while(fractal_val==0 && a>=0)
                    {
                     fractal_val=iFractals(NULL,0,MODE_UPPER,a);
                     if(fractal_val!=0)
                       {
                        lastArrowBarPos=Bars-zigZag_pos;
                        lastArrowType=1;
                        ready=true;
                       }
                     a--;
                    }
                 }
               if(zigZag_val1>zigZag_val2) // If its a up leg, look for up fractal after this pos
                 {
                  fractal_val=0;

                  while(fractal_val==0 && a>=0)
                    {
                     fractal_val=iFractals(NULL,0,MODE_LOWER,a);
                     if(fractal_val!=0)
                       {
                        lastArrowBarPos=Bars-zigZag_pos;
                        lastArrowType=0;
                        ready=true;
                       }
                     a--;
                    }
                 }

               if(!ready)
                 {
                  if(zigZag_val1>zigZag_val2)
                    {
                     lastArrowBarPos=Bars-secondPos;
                     lastArrowType=1;
                     ready=true;
                    }
                  else
                    {
                     lastArrowBarPos=Bars-secondPos;
                     lastArrowType=0;
                     ready=true;
                    }
                 }
              }
            else
              {
               ready=true;

               int lastArrowPos=Bars-lastArrowBarPos;
               int lookFor=MODE_UPPER;
               if(lastArrowType==1)
                  lookFor=MODE_LOWER;

               fractal_val=0;
               a=lastArrowPos;
               while(fractal_val==0)
                 {
                  fractal_val=iFractals(NULL,0,lookFor,a);
                  if(fractal_val!=0)
                    {
                     lastArrowBarPos=Bars-a;
                    }
                  a++;
                 }
              }

            if(ready)
              {

               int foundFractals=0;
               for(a=Bars-lastArrowBarPos-1; a>0; a--)
                 {
                  string fractals="";
                  fractal_down=iFractals(NULL,0,MODE_UPPER,a);
                  fractal_up=iFractals(NULL,0,MODE_LOWER,a);
                  BarLength++;
                  if((fractal_down!=0 && fractal_down!=EMPTY_VALUE) && (fractal_up!=0 && fractal_up!=EMPTY_VALUE) && pos!=startPos)
                    {
                     foundFractals++;
                     if(Close[pos]>Open[pos])
                       {
                        fractals="0,1";
                       }
                     else
                       {
                        fractals="1,0";
                       }
                    }
                  else if((fractal_down!=0 && fractal_down!=EMPTY_VALUE) && pos!=startPos)
                    {
                     fractals="0";
                     foundFractals++;
                    }
                  else if((fractal_up!=0 && fractal_up!=EMPTY_VALUE) && pos!=startPos)
                    {
                     fractals="1";
                     foundFractals++;
                    }

                  if(fractals!="")
                    {
                     if(FractalPattern == "[")
                        FractalPattern = FractalPattern + fractals;
                     else
                        FractalPattern=FractalPattern+","+fractals;
                    }
                 }
               FractalPattern=FractalPattern+"]";

               //if(foundFractals > 0)
                 {

                  if(lastArrowType == 0)
                     expectBullish = 1;
                  else
                     expectBullish=0;

                  for(a=(BarLength>13 ? 13: BarLength); a>0; a--)
                    {
                     bar;
                     if(Open[a]<Close[a])
                        bar=1;
                     else if(Open[a]>Close[a])
                        bar=0;
                     else if(Open[a+1]<Close[a+1])
                        bar=1;
                     else if(Open[a+1]>Close[a+1])
                        bar=0;
                     else
                       {
                        if(Open[a+2]<Close[a+2])
                           bar=1;
                        else
                           bar=0;
                       }

                     if(CandleBitString == "[")
                        CandleBitString = CandleBitString+bar;
                     else
                        CandleBitString=CandleBitString+","+bar;

                    }

                  CandleBitString=CandleBitString+"]";

                  printDebug(msgCount+"]"+CandleBitString);
                  printDebug(msgCount+"]"+FractalPattern);
                  printDebug(msgCount+"]"+"BarLength:"+BarLength);

                  // Publish current pattern.
                  req="RUN:{\"table\":\""+table+"\", \"start_time\":\""+Time[0]+"\", \"CandleBitString\":"+CandleBitString+", \"FractalPattern\":"+FractalPattern+", \"expectBullish\":"+expectBullish+", \"BarLength\":"+BarLength+"}";
                  data="";

                  if(!INet.Open("localhost",_PORT)) return(0);

                  if(!INet.Request("POST","/",data,false,false,req,false))
                    {
                     printDebug("-Err download ");
                     return(0);
                    }

                  lastRequestBar=Bars;
                  calculating=true;
                 }
              }
           }
        }

      if(calculating)
        {

         symbol1 = StringSubstr(Symbol(), 0, 2);
         symbol2 = StringSubstr(Symbol(), 3, 2);
         table=symbol1+symbol2+"_fractal_"+getPeriod();

         req="REQ:{\"table\":\""+table+"\", \"start_time\":\""+Time[Bars-lastRequestBar]+"\"}";
         string incoming_msg="";

         if(!INet.Open("localhost",_PORT)) return(0);

         if(!INet.Request("POST","/",incoming_msg,false,true,req,false))
           {
            printDebug("-Err download ");
            return(0);
           }

         if(incoming_msg!="") // Will return NULL if no message was received.
           {

            JSONParser *parser=new JSONParser();

            JSONValue *jv=parser.parse(incoming_msg);

            if(jv==NULL)
              {
               printDebug("error:"+(string)parser.getErrorCode()+parser.getErrorMessage());
                 } else {

               if(jv.isObject())
                 { // check root value is an object. (it can be an array)

                  JSONObject *jo=jv;

                  // Direct access - will throw null pointer if wrong getter used.
                  printDebug(msgCount+"]"+"       @direction:"+jo.getString("direction")+" Exp:"+expectBullish+" lastPos:"+(Bars-lastArrowBarPos));
                  int direction=StrToInteger(jo.getString("direction"));

                  double atrVal=iATR(NULL,0,14,Bars-lastRequestBar);

                  if(expectBullish==1 && direction==1)
                    {
                     BottomFractal[Bars-lastRequestBar]=Low[Bars-lastRequestBar]-atrVal;
                     lastArrowType=1;
                     lastArrowBarPos=lastRequestBar;
                    }
                  else if(expectBullish==0 && direction==1)
                    {
                     TopFractal[Bars-lastRequestBar]=High[Bars-lastRequestBar]+atrVal;
                     lastArrowType=0;
                     lastArrowBarPos=lastRequestBar;
                    }

                  calculating=false;

                  DrawLabel("-Deubug-1","",20,40,Yellow,"Arial",10);

                  printDebug("------------------------------------------------");

                 }
               delete jv;
              }
            delete parser;
           }

         else
            DrawLabel("-Deubug-1","N",20,10,Yellow,"Arial",10);

        }

      if(calculating)
         DrawLabel("-Deubug-calc","Calculating",20,50,Red,"Arial",10);

     }

   return(0);
  }
//+------------------------------------------------------------------+
//|                                                                  |
//+------------------------------------------------------------------+
int sendMessage(string req,string &data)
  {
   if(!INet.Open("localhost",8040)) return(0);

   if(!INet.Request("POST","/",data,false,false,req,false))
     {
      Print("-Err download ");
      return(0);
     }

   return(0);
  }
//<---------------------------- HELPER FUNCTIONS ARE BELOW

//+------------------------------------------------------------------+
//|                                                                  |
//+------------------------------------------------------------------+
void DrawLabel(string label,string text,int x,int y,color clr,string fontName,int fontSize)
  {

   label=IndicatorName+label;
   int typeCorner=0;

   string labelIndicator=label;
   if(ObjectFind(labelIndicator)==-1)
     {
      ObjectCreate(labelIndicator,OBJ_LABEL,0,0,0);
     }

   ObjectSet(labelIndicator,OBJPROP_CORNER,typeCorner);
   ObjectSet(labelIndicator,OBJPROP_XDISTANCE,x);
   ObjectSet(labelIndicator,OBJPROP_YDISTANCE,y);
   ObjectSetText(labelIndicator,text,fontSize,fontName,clr);
  }
//+------------------------------------------------------------------+
//|                                                                  |
//+------------------------------------------------------------------+


int Stamp(string objName,string text,int x,int y,double num=0)
  {
   string Obj="Stamp_"+objName;
   int objs=ObjectsTotal();
   string name;

   if(ObjectFind(Obj)>-1)
     {
      ObjectSet(Obj,OBJPROP_XDISTANCE,x);
      ObjectSet(Obj,OBJPROP_YDISTANCE,y);
      WindowRedraw();
     }
   else
     {
      ObjectCreate(Obj,OBJ_LABEL,0,0,0);
      if(num<0)
         ObjectSetText(Obj,text,12,"arial",Red);
      else if(num>0)
         ObjectSetText(Obj,text,12,"arial",Lime);
      else
         ObjectSetText(Obj,text,12,"arial",DarkGray);
      ObjectSet(Obj,OBJPROP_XDISTANCE,x);
      ObjectSet(Obj,OBJPROP_YDISTANCE,y);
      WindowRedraw();
     }

   return(0);
  }
//+------------------------------------------------------------------+
//|                                                                  |
//+------------------------------------------------------------------+
void printDebug(string msg)
  {
   if(show_debug)
     {
      DrawLabel("Trend-Deubug-"+debugLine,msg,250,20+15*debugLine,DodgerBlue,"Arial",9);
      debugLine++;
     }

   if(debugLine>47)
      debugLine=0;
  }
//+------------------------------------------------------------------+
//|                                                                  |
//+------------------------------------------------------------------+
string dToS(int date_time)
  {
   return(TimeToString(date_time, TIME_DATE|TIME_MINUTES));
  }
//+------------------------------------------------------------------+
//|                                                                  |
//+------------------------------------------------------------------+
string getPeriod()
  {
   switch(Period())
     {
      case 1:
        {
         return ("m1");
         break;
        }
      case 5:
        {
         return ("m5");
         break;
        }
      case 15:
        {
         return ("m15");
         break;
        }
      case 30:
        {
         return ("m30");
         break;
        }
      case 60:
        {
         return ("h1");
         break;
        }
      case 240:
        {
         return ("h4");
         break;
        }
      case 1440:
        {
         return ("d1");
         break;
        }
     }

   return(0);
  }
//+------------------------------------------------------------------+

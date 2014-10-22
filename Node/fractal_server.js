/*
For help and support, please visit http://penguintraders.com

https://github.com/PenguinTraders/MT4-Node.js
http://www.forexfactory.com/saver0
*/


var cluster = require('cluster');
var _ = require("underscore");
var async = require("async");
var moment = require("moment");
var prettyjson = require("prettyjson");
var http = require("http");

var _HTTP_PORT = 8040;

var mysql      = require('mysql');

//MySQL connections pool
var pool = mysql.createPool({
	host     : 'localhost',
	user     : 'root',
	password : '',
	database : 'fractals'
});



var start_time;
var readyCount = 0;
var allData = {};
var workers_ready = true;
var start;
var pattern_count = 0;
var foundAlts = 0;
var workingTable = 'euus_fractal_m5';

var processed_data = {};
var request_num = 0;
var set_pos = 0;

var queue_cb = null;


var settings = {
	debug: {
		show: true,
		db: true,
		http: true,
		worker: true,
		parent: true,
		loading: true,
		run: true,
		queue: true,
		res: true,
	}
	
};


if (cluster.isMaster) {
	
	//Load all data
	loadBarData(workingTable, null);	
	
	//Main worker queue so that the work is done in order that it came in
	var q = async.queue(function (msg, callback) {
		queue_cb = callback;
		debug("queue",msg);
		workingTable = msg.table;
		start_time = msg.start_time;
		
		run_app(msg.FractalPattern, msg.BarLength, msg.CandleBitString, msg.expectBullish); // Call to execute the application's main prediction algorithm
		
	}, 1);
	
	
	/*
	 * This is the HTTP server that will handle the messages from th MT4 client. 
	 * Messages that will either save the fractal/bar data into the DB or messages requesting to calculate patterns or messages requesting the calculated results, etc.
	 */
	http.createServer(function onRequest(request, response) {
		request.setEncoding("utf8");
		var content = [];
		
		//Getting data from the http request that was made by the client
		request.addListener("data", function(data) {
			content.push(data);
		});
		
		//At the end of the data stream
		request.addListener("end", function() {
			request_num++;
			response.writeHead( 200, {"Content-Type": "text/plain"} );
			
			ms = content[0];
			
			if(ms.toString() != "")
			{
				var msg = ms.toString();
				
				if(msg.substring(0, 3) == "REQ") //Client requesting the calculated prediction results
				{
					var running_count = q.running();
					var idling = "Not Idling";
					if(q.idle())
						idling = "Idling";
						
					debug("res",request_num+"] Qued: "+running_count+" Idling?:"+idling+ " MSG:"+ms.toString());	
					var reqObj = JSON.parse(msg.substring(4));	
					if(processed_data[reqObj.table+reqObj.start_time])
					{
						response.write(processed_data[reqObj.table+reqObj.start_time]);
						//delete processed_data[reqObj.table+start_time];
					}
				}				
				else if(msg == "TEST") //Client testing connection
				{
					console.log(msg);
					response.write("OK");					
				}
				
				else if(msg.substring(0, 3) == "REC") //Client sending a message to be stored in the database
				{
					//debug("http","Inserting to DB:"+msg.substring(4));			
					pool.getConnection(function(err, connection)
					{				
						connection.query('INSERT INTO '+JSON.parse(msg.substring(4)).table+' SET ?', JSON.parse(msg.substring(4)).record , function(err, result)
						{
							if(err)
							{
								if(err.code == "ER_DUP_ENTRY")
								{
									pool.getConnection(function(err, connection2)
									{
										var inMsg = JSON.parse(msg.substring(4));
										connection2.query("UPDATE "+inMsg.table+" SET ? WHERE datetime = ?", [inMsg.record, inMsg.record.datetime]  , function(err2, result2)
										{
											
											if(err2)
												debug("http",err2);
											
											connection2.release();
											
										});
									});
								}
							}
							connection.release();
						});
						
					});
				}
				else if(msg.substring(0, 3) == "RUN") //Client requesting for a new pattern to be matched and predicted
				{
					q.push(JSON.parse(msg.substring(4)), function (err) {
						debug("run", "Completed the Run command");
					});
					
					debug("run","^^^^^^^^^^^^^^^^^^ message queued to run ^^^^^^^^^^^^^^^^^^")
				}				
				else if(msg == "CLEAR") //Client requested to reload and rebuild the sets
				{
					debug("http", "Clear command received");
					pool.getConnection(function(err, connection)
					{				
						connection.query('TRUNCATE '+workingTable, function(err, result)
						{
							if(err)
							{
								debug("loading",err);
								
							}
							//connection.release();
						});
						
					});
				}
				else if(msg == "REBUILD") //Client requested to reload and rebuild the sets
				{
					allData = {};
					debug("http", "Rebuild command received");
					loadBarData(workingTable, null);	
				}
		
			}
			
			if(msg.substring(0, 3) != "INF") // Final closing of the response so that the client can begin processing data
			{
				/* no need to show response close message 
				if(msg.substring(0, 3) != "REC")
					debug("res", request_num+"] Response closed "+Math.floor(new Date().getTime()/1000));
				*/	
				response.end();
			}
		});
	
		
		
	}).listen(_HTTP_PORT);
	
	//<------------------------------------------ BELOW IS THE CORE LOGIC ----------------------------------------------------------
	
	var Set1 = {}; //bar patterns
	var Set2 = {}; //fractal patterns
	var Set3 = {}; //filtered set
	
	
	function data_loaded() // This gets executed as soon as the data is loaded from the database
	{
		Set1 = {};
		Set2 = {};
		Set3 = {};
		
		//First clear out the existing patterns so we can calculate again (For a fresh start, in case we changed the set creation logic. Won't have to do this once all the logic is finalized)
		pool.getConnection(function(err, connection)
		{				
			connection.query('TRUNCATE barpattern', function(err, result)
			{
				if(err)
				{
					debug("loading",err);
					
				}
				//connection.release();
			});
			
		});
		
		pool.getConnection(function(err, connection)
		{				
			connection.query('TRUNCATE barpattern2', function(err, result)
			{ 
				if(err)
				{
					debug("loading",err);
					
				}
				//connection.release();
			});
			
		});
		
		pool.getConnection(function(err, connection)
		{				
			connection.query('TRUNCATE fractals', function(err, result)
			{
				if(err)
				{
					debug("loading",err);
					
				}
				//connection.release();
			});
			
		});
		

		//console.log("Data table length:"+allData[workingTable].length);
		
		if(allData[workingTable])
		{
			//Looping through all the bars in the DB
			for(var i=0; i < allData[workingTable].length - 4; i++)
			{
				//Loop to make strings of length 4 to 13
				for(var length = 4; length <= 13; length++)
				{
					//If we have arrived at the end of bars and won't have enough bars to make the specified length barString then break from the loop
					if(i+length - 1 >= allData[workingTable].length)
						break;
					
					var subBitString = [];
					
					//Creation of the strings of the specified length
					for(var j=0; j < length; j++)
						subBitString.push(allData[workingTable][i+j].bar);
					
					//Increment the count if the string already exists in the Set1 objects
					if(Set1[subBitString.join()])
						Set1[subBitString.join()].count++;
					else //If not, add the bit string
						Set1[subBitString.join()] = {count: 1, pattern: subBitString};

				}
				
			}
			
			pool.getConnection(function(err, connection)
			{	
				_.each(Set1, function(val, key){
								
					connection.query('INSERT INTO barpattern SET ?', {pattern: key, count:val.count} , function(err, result)
					{
						if(err)
						{
							debug("loading",err);
							
						}
						//connection.release();
					});
					
				});
				
			});
			
			console.log("Set 1 length:"+_.keys(Set1).length);
			
			var lastLegEndIdx = 0;
			//Loop to find zigzag endpoints
			for(var i=0; i < allData[workingTable].length; i++)
			{
				if(allData[workingTable][i].zigzag == -1) //If the current bar isn't a zigzag endpoint then skip
					continue;
					
				var fractalpattern = [];
				if(lastLegEndIdx != 0)
				{
					var barSequence = [];
					for(var j=lastLegEndIdx+1; j <= i; j++) // Loop to get the fractals within the ZigZag leg
					{
						barSequence.push(allData[workingTable][j].bar);
						
						if(allData[workingTable][j].fractal == -1) //If it's not a fractal, then skip
							continue;
							
						if(allData[workingTable][j].fractal == 2) // Twin fractal
						{
							if(allData[workingTable][j].bar == 0)
								fractalpattern.push(1, 0)
							else
								fractalpattern.push(0, 1)
						}
						else // Regular fractal
							fractalpattern.push(allData[workingTable][j].fractal);
					}

					var barCount = i - lastLegEndIdx;
					var upOrDown = allData[workingTable][i].zigzag;
	
					if(fractalpattern.length <= 1) // If the fractal count is less than or equal to 1
					{
						fractalpattern = [];
						for(var x=0; x<barCount; x++)
						{
							fractalpattern.push(-1); // Adding -1 (null fractals) to the fractals array
						}
						
						fractalpattern.push(upOrDown); // Adding the direction of the ZigZag leg
					}
					
					//Add to Set2
					if(Set2[fractalpattern.join()])
						Set2[fractalpattern.join()].push({barCount: barCount, upOrDown: upOrDown, bars:barSequence, pattern: fractalpattern, pos: allData[workingTable][i].datetime});
					else
					{
						Set2[fractalpattern.join()] = [];
						Set2[fractalpattern.join()].push({barCount: barCount, upOrDown: upOrDown, bars:barSequence, pattern: fractalpattern, pos: allData[workingTable][i].datetime});
						
					}
				}
				
				lastLegEndIdx = i;
				
			}
			
			pool.getConnection(function(err, connection)
			{	
				_.each(Set2, function(val, key){
					_.each(val, function(val2){	
						connection.query('INSERT INTO fractals SET ?', {count: val.length, pattern: key, barCount: val2.barCount, upOrDown: val2.upOrDown, pos: val2.pos, bars: val2.bars.join()} , function(err, result)
						{
							if(err)
							{
								debug("loading",err);
								
							}
							//connection.release();
						});
					});
					
				});
				
			});
		
			
			console.log("Set 2 length:"+_.keys(Set2).length);
			
			
			var auxFilteringSet = {}; //Creating a filtering set where only the matched strings are added to Set3
			_.each(Set2, function(val){ //Loop through each fractal string in Set2
				_.each(val, function(val2){
					var rightMostBars = [];

					for(var j=val2.bars.length-1; j>val2.bars.length-13; j--) // Get the right most fractals from the fractal string
					{
						if(j < 0)
							break;
							
						rightMostBars.unshift(val2.bars[j]); //Add to the beginning of the array so that the last element would be the last element from the original fractal string
					}
					
					var barSubstring = createSubStrings(rightMostBars, 4, 13); //Calling the function to create all the substrings, function returns an object with all the substrings
					//console.log(val2.bars, rightMostBars, barSubstring);
					
					//Loop through each fractal substring and add it to the aux filtering set
					_.each(barSubstring, function(val2, key){
						if(!auxFilteringSet[key]) //Add the pattern to the filtering set if it doesn't exist already
							auxFilteringSet[key] = {};
					});
				});
				
			});
			
			console.log("auxFilteringSet length:"+_.keys(auxFilteringSet).length);
			
			Set3 = JSON.parse( JSON.stringify( Set1 ) ); //Creating a copy of Set1
			
			_.each(Set1, function(val, key){ //Loop through each barString in Set1
				if(!auxFilteringSet[key])  //If the barString doesn't exist in the filtering set, then delete it
					delete Set3[key];
			});
			
			pool.getConnection(function(err, connection)
			{	
				_.each(Set3, function(val, key){
								
					connection.query('INSERT INTO barpattern2 SET ?', {pattern: key, count:val.count} , function(err, result)
					{
						if(err)
						{
							debug("loading",err);
							
						}
						//connection.release();
					});
					
				});
				
			});
			
			
			console.log("Set 3 length:"+_.keys(Set3).length);

		}
	
	}
	
	//The main function doing the pattern matching on each new bar
	function run_app(FractalPattern, BarPatternLength, CandleBitString, expectBullish)
	{
		
		if(FractalPattern.length <= 1)
		{
			var current_fractal = 0;
			
			if(FractalPattern.length == 1)
				current_fractal = FractalPattern[0];
			else
			{
				if(expectBullish)
					current_fractal = 1;
			}
			
			FractalPattern = [];
			
			for(var x=0; x<BarPatternLength; x++)
			{
				FractalPattern.push(-1); // Adding -1 (null fractals) to the fractals array
			}
			
			FractalPattern.push(current_fractal); // Adding the direction of expecting fractal
			
			console.log("Added null fractals:", FractalPattern);
		}
		
		FractalPattern = takeLastAdd(FractalPattern, 13, -1); //Take the last 13 fractals 
		
		var FractalPattern0 = FractalPattern.slice(0); //Make a copy
			FractalPattern0.push(0); //Add a 0
			
		var FractalPattern1 = FractalPattern.slice(0);  //Make a copy
			FractalPattern1.push(1);  //Add a 1
			
		var countFractalPattern0 = Set2P(FractalPattern0, expectBullish); //Get the number of times longer fractal with a 0 at the end shows up
		var countFractalPattern1 = Set2P(FractalPattern1, expectBullish); //Get the number of times longer fractal with a 1 at the end shows up
		var countFractalPattern = Set2P(FractalPattern, expectBullish); //Get the number of times the current fractal pattern shows up
		//var candleLengthFractalPattern0 = ProjectCandleLen(FractalPattern0, expectBullish); //Get the ideal number of bars in the zigzags with fractal pattern ending in 0
		//var candleLengthFractalPattern1 = ProjectCandleLen(FractalPattern1, expectBullish); //Get the ideal number of bars in the zigzags with fractal pattern ending in 1
		
		//Expect longer if count of fractals ending with a 0 is greater AND bar length should be greater than the current pattern
		var expLonger0 = countFractalPattern0 > countFractalPattern;
						//candleLengthFractalPattern0 > BarPatternLength; 
		
		//Expect longer if count of fractals ending with a 1 is greater AND bar length should be greater than the current pattern		
		var expLonger1 = countFractalPattern1 > countFractalPattern;
						//candleLengthFractalPattern1 > BarPatternLength;
						
		var c1 = countFractalPattern > 0 && !(expLonger0 || expLonger1); //If current fractal pattern count is greater than 0 and not expecting longer, c1 is true
		
		console.log("c1:", c1, "expLonger0:", expLonger0, "expLonger1:", expLonger1, "countFractalPattern:", countFractalPattern);
		
		var c2;
		
		if(c1)
		{
			//Get number of times current fractal pattern is found in the DB within +/- 3 bars
			var pCurrFracLen = 0; 
			for(var k = -3; k <=3; k++)
			{
				if(BarPatternLength + k > 0)
				{
					var kFracLen = Set2BarLengthMatchCount(FractalPattern, BarPatternLength + k, expectBullish);
					
					if(kFracLen > pCurrFracLen)
						pCurrFracLen = kFracLen;
				}
			}
			
			//Get number of times a longer/shorter fractal pattern is found in the DB within +/- 4 bars
			var pLongerFracLen = Set2BarLengthMatchCount(FractalPattern, BarPatternLength + 4, expectBullish);
			
			console.log("pCurrFracLen:", pCurrFracLen, "pLongerFracLen:", pLongerFracLen);
			
			c2 = pCurrFracLen >= pLongerFracLen; //If current bar length is about right, set C2 to true
			
			console.log("c2:", c2);
			
		}

		
		var c3 = false;
		
		if(c2)
		{
			var signal = "";
			var currentBarConsensus = true;
			var expectBearish = !expectBullish;

			var maxLim = CandleBitString.length > 13 ? 13 : CandleBitString.length-1; //Set the max limit so we only look at the last 13 bars
			
			var probNext = [];
			var probCurrent = [];
			
			var inFavorSumNext = 0;
			var inFavorSumCurrent = 0;
			var inFavorTotalNext = 0;
			var inFavorTotalCurrent = 0;

			//if we are expecting a bearish
			if(expectBearish)
			{
				signal = "Bearish";				
				console.log("Expecting ", signal, "Max Lim:"+maxLim);
				
				for(var k=4; k <= maxLim; k++) //loop through the last k bars in the curent candle bit string
				{
					var Set3P0 = Set3P(takeLastAdd(CandleBitString, k-1, 0)); //Get the number of times pattern of last k-1 of the current pattern and 0 added to the end appears
					var Set3P1 = Set3P(takeLastAdd(CandleBitString, k-1, 1)); //Get the number of times pattern of last k-1 of the current pattern and 1 added to the end appears
						
					if(Set3P0 > 0)
					{
						if(Set3P0 >	Set3P1) // If the bearish count is greater than bullish
							inFavorSumNext++;
							
						inFavorTotalNext++; //Total patterns						
						probNext.push([Set3P0, Set3P1, Set3P0 - Set3P1]); //For debuging
					}
				}
			}
			
			//if we are expecting a bullish
			if(expectBullish)
			{
				signal = "Bullish";
				
				console.log("Expecting ", signal);
				
				for(var k=4; k <= maxLim; k++)
				{
					var Set3P0 = Set3P(takeLastAdd(CandleBitString, k-1, 0)); //Get the number of times pattern of last k-1 of the current pattern and 0 added to the end appears
					var Set3P1 = Set3P(takeLastAdd(CandleBitString, k-1, 1)); //Get the number of times pattern of last k-1 of the current pattern and 1 added to the end appears
						
					if(Set3P1 > 0)
					{
						
						if(Set3P0 <	Set3P1) // If the bullish count is greater than bearish
							inFavorSumNext++;
							
						inFavorTotalNext++; //Total patterns						
						probNext.push([Set3P1, Set3P0, Set3P1 - Set3P0]); //For debuging
					}
				}
			}
			
			for(var k=4; k <= maxLim; k++)
			{
				var Set3PAsIs = Set3P(takeLastAdd(CandleBitString, k-1, -1)); //Get the number of times pattern of last k-1 of the current patterns as is
				var Set3PFlip = Set3P(takeLastAdd(CandleBitString, k-1, -2)); //Get the number of times pattern of last k-1 of the current patterns and flip the last bar
					
				if(Set3PAsIs > 0 && Set3PFlip > 0)
				{								
					probCurrent.push([Set3PAsIs, Set3PFlip, Set3PAsIs-Set3PFlip]);
					
					if(Set3PAsIs > Set3PFlip)  // If as is count is greater than flipped
						inFavorSumCurrent++
					
					inFavorTotalCurrent++;
				}
			}
			
			console.log("probNext \n", probNext);
			console.log("probCurrent \n", probCurrent);
			//If all the pattern counts are good
			
			//c3 = ((((inFavorSumNext / inFavorTotalNext) >= 0.10) && ((inFavorSumCurrent / inFavorTotalCurrent) >= 0.10)))   && probNext.length > 0 && probCurrent.length > 0;
			c3 = ((((inFavorSumNext / inFavorTotalNext) >= 0.61) && ((inFavorSumCurrent / inFavorTotalCurrent) >= 0.33)))   && probNext.length > 0 && probCurrent.length > 0;
		}
	
		//Set the result for the client to grab
		if(c3)
			processed_data[workingTable+start_time] = JSON.stringify({table: workingTable, direction: "1"});
		else
			processed_data[workingTable+start_time] = JSON.stringify({table: workingTable, direction: "0"});
		
		console.log("c3:",c3);
		
		queue_cb();
	}
	
	function takeLastAdd(bitString, last, addVal)
	{
		var newString = [];
		for(var a=bitString.length-1; a >= bitString.length-last; a--)
		{
			if(a >= 0)
				newString.unshift(bitString[a]);
		}
		
		if(addVal == -2) //Flip the last value
			newString[newString.length-1] = newString[newString.length-1] == 0 ? 1: 0;
		else if(addVal != -1) //No adding
			newString.push(addVal);
			
		/*console.log("bitString:", bitString);
		console.log("last:",last, "addVal:",addVal);
		console.log("newString:",newString);*/
		return newString;
		
	}
	
	//Return a substrings of starting size to max size
	function createSubStrings(string, start, max)
	{
		var strings = {};
		
		if(start >= string.count) //If the input string is less than or equal to minimum string count
		{
			strings[string.join()] = {count: 1, pattern: string};
			return strings;
		}

			
		for(var i=0; i < string.length - start; i++)
		{
			for(var length = start; length <= 13; length++)
			{
				if(i+length - 1 >= string.length) //If the length is greater than string total length
					break;
				
				var subBitString = [];
				
				for(var j=0; j < length; j++) //Create the new string
					subBitString.push(string[i+j]); 
					
				if(strings[subBitString.join()])
					strings[subBitString.join()].count++;
				else
					strings[subBitString.join()] = {count: 1, pattern: subBitString};
			}
			
		}		
		//console.log("In String", string, strings);
		
		return strings;		
	}
	
	function Set2P(pattern, expecting)
	{
		pattern = pattern.join();		
		console.log("Set2P Checking pattern:", pattern);
		
		if(pattern == "")
		{
			return 0;
		}
		
		if(!Set2[pattern])
		{
			return 0;
		}
		
		pattern = Set2[pattern];
		
		var count = 0;
		_.each(pattern, function(obj){ //Loop through the patterns in Set2 that matched the pattern String to figure out the amount that matches the length
			if(obj.upOrDown == expecting)
				count++;
		});
			
		return count; //Return number of times the pattern shows up
	}
	
	function Set3P(pattern)
	{

		pattern = pattern.join();
		
		var count = 0;

		if(pattern == "")
			count = 0;
		else if(!Set3[pattern])
			count =  0;
		else
			count = Set3[pattern].count;  //Return number of times the pattern shows up
			
		console.log("Set3P Checking pattern:", pattern, " count:", count);
		
		return(count);
		
	}
	
	//Get the number of patterns with the specified bar length in SET3
	function Set2BarLengthMatchCount(pattern, lengthFilter, expecting)
	{

		patternS = pattern.join();
		
		if(patternS == "") //If the pattern is blank, return 0 length
			return 0;
		
		if(!Set2[patternS]) 
			return 0;
					
		var pattern = Set2[patternS];
		var count = 0;
		//console.log("Set2 pattern", pattern);
		_.each(pattern, function(obj){ //Loop through the patterns in Set2 that matched the pattern String to figure out the amount that matches the length
			if(obj.barCount == lengthFilter && obj.upOrDown == expecting)
				count++;
		});
		
		console.log("Set2BarLengthMatchCount pattern:", patternS, " lengthFilter:", lengthFilter, " count:", count);
		
		return count;
		
	}
	
	
	//----------------------------------------------------------- CHECK THIS LOGIC AGAIN, TRY A DIFFERENT WAY
	function ProjectCandleLen(fractalPattern, expecting)
	{
		console.log("ProjectCandleLen pattern:", fractalPattern.join());
		
		var threshold = 0.50;
		
		var maxCandleLength = 0;
		var minCandleLength = 1000;
		
		//Get the minimum and the maximum length of bars with the fractal pattern in history
		_.each(Set2[fractalPattern.join()], function(obj){
			if(maxCandleLength < obj.barCount)
				maxCandleLength = obj.barCount;
			if(minCandleLength > obj.barCount)
				minCandleLength = obj.barCount;
		});
		
		if(minCandleLength == maxCandleLength) //If minimum and maximum equals, then return the value
			return maxCandleLength;
		
		for(var i=minCandleLength; i <= maxCandleLength; i++) //Loop through the minimum and maximum lengths
		{
			var inLengthCount = 0;
			var outLengthCount = 0;
			
			//Trying to find the length where majority of the patterns are in
			for(var tolerance = -3; tolerance <= 0; tolerance++)
				inLengthCount += Set2BarLengthMatchCount(fractalPattern, i+tolerance, expecting);
			
			for(var tolerance = 0; tolerance <= 3; tolerance++)
				outLengthCount += Set2BarLengthMatchCount(fractalPattern, i+tolerance, expecting);
				
			if(inLengthCount / (inLengthCount + outLengthCount) > threshold)
			{
				console.log("ProjectCandleLen Length:", i);
				return i;
			}
		}
		
		return 0;
	}
	/* FOR ABOVE
	 Side Note: The reason for the above limited-set quasi-Gaussian distribution method can accommodate large sets of lengths.  
	 For example, if you have a set of lengths as follows: (10,11,11,12,12,12,12,12,13,13,14,15,16,17,18,19,20,20,20,20,20,21,21,21,21)
	 You can visually see that lengths 12 and 20 will probably produce a high probability hit-rate.  
	 Fractal patterns will cluster certain lengths at different cycles as history repeats itself.  
	 So, our method will give you a high probability at these differing lengths, commensurate with history.
	 Andre: We need to take both 12 and 20 as possible values, not a mid point.
	*/
	
	
	
	function debug(type, msg)
	{
		if(settings.debug.show)
		{
			if(settings.debug[type])
			{
				console.log(msg);
			}
			else if(settings.debug[type] === undefined)
			{
				console.log("!!!!DEBUG TYPE NOT CONFIGURED!!!! "+type+"  Msg:"+msg);
			}
		}
	}

	
	


}
else if (cluster.isWorker)
{
	//For multi-threaded tasks
  
}



//Load all the data from the DB first, the main process and for the workers
function loadBarData(table, starttime)
{
	var selectString = 'SELECT * FROM '+table+' ORDER BY datetime ASC';
	
	if(starttime != null)
		selectString = 'SELECT * FROM '+table+' WHERE datetime > '+allData[table][0].datetime+' ORDER BY datetime ASC';
		
	debug("db","Loading data starttime "+starttime+" "+table+" "+selectString);
		
	pool.getConnection(function(err, connection)
	{
		connection.query(selectString, function(err, rows)
		{
			connection.release();
			if(!allData[table])
			{
				allData[table] = rows;				
			}
			else if(allData[table].length && allData[table].length > 0)
			{
				_.each(rows, function(ele){
					allData[table] = allData[table].unshift(ele);
				})
				
			}
			
			
			workers_ready = true;
			debug("db","All workers ready! - DB");
			data_loaded();						
	
			
		});
	});
}


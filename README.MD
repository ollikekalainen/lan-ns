# lan-ns

LanNS is a web service that allows redirecting the public URL to the private IP address on a local area network.
For example if you have a web service/site running on the computer at local are network, you can...

## Installation

npm install lan-ns


## Usage

### Starting LanNS Service

#### Start syntax

      	  
	lanns.start( onError, onSuccess, options );
        
    	onError        function(error)
    	onSuccess      function()
    	options        object
                       
        
#### Options
        
    port                number, mandatory, default: 3002
    sslPort             number, default: 0
    httpsOptions        object, 
        {
        	pfx: string,           // default: "%LANNS_PFX%"
        	passphrase: string     // default "%LANNS_PHRASE%"
        }
           --or-- 
        {
             key: string,
             cert: string
        }
    siteRoot            string, default: "<node_modules>/lan-ns/site"
    dataFolder          string, default: "/LanNS-data"
    defaultDocument     string, default: "index.htm"
    init                boolean, if set, start method will just write the skeleton of options file 
                            unless it already exist, and does not start the service
    logFolder           string, if assigned the output of the console.log() calls are redirected 
                            into log files on the folder indicated by logFolder
    pulseFolder         string, default: __dirname
    optionsFile         string, a JSON file where options are read from; options passed as
                            start method parameter are overwriting options in this file
     
     
    Any of the option values can be set as environment variable name surrounded by % character.
    Variable name are automatically replaced by the corresponding environment variable value.




#### Example

    require("lan-ns").start(
	    (error)=>{ console.log(error);},
	    ()=>{ console.log("LanNS started");},
	    {
            logFolder: __dirname + "/log",
            pulseFolder: __dirname,
            optionsFile: __dirname + "/options.json"
        }
    );


### Local Service notifications

Web service on your local network is supposed to notify LanNS service in a proper interval that 
it is up and running and available for the client on the same local network. Notification is made
with LanNS pulse request. It can be done either with the lan-ns-ticker or with following code
which uses request module.


#### With lan-ns-ticker

Application [lan-ns-ticker](https://github.com/ollikekalainen/lan-ns-ticker/) can be used to 
simplify the service running on local network notifying it's state to the Lan-NS service

	const Ticker = require("lan-ns-ticker");
	new Ticker({
		url: "https://www.mysite.com:3003",
		appName: "Musa",
		appDescription: "Musa Music Player",
		appPort: 3001,
		appProtocol: "http",
		appUrlPath: "",
		refreshIntervalInSeconds: 60,
		expireTimeInSeconds: 180
	}).start( 
		( error ) => { console.log( error ); },
		() => { console.log("LanNS Ticker started"); }
	);


#### With request

	pulse( (error) => { console.log(error);}, () => ( console.log("One hit!");), {
		url: "https://www.mysite.com:3003",
		appName: "Musa",
		appDescription: "Musa Music Player",
		appPort: 3001,
		appProtocol: "http",
		appUrlPath: "",
		refreshIntervalInSeconds: 60,
		expireTimeInSeconds: 180
	});
     
	function pulse( onError, onSuccess, params ) {
		const request = require("request");
		const os = require("os");
		let body = {
			name: "pulse",
			parameters: {
				appname: params.appName,
				description: params.appDescription,
				expiretimeinseconds: params.expireTimeInSeconds,
				hostname: os.hostname(),
				port: params.appPort,
				urlpath: params.appUrlPath,
				protocol: params.appProtocol,
				port: params.appPort,
				privateip: getPrivateIp() 
			}
		};
		try {
			body = JSON.stringify(body);
			request.post( 
				{
					url: params.url + "/api",
					body: body,
					headers: {
						"User-Agent": "LanNS Client",
					 	"Content-Type": "text/plain",
						"Content-Length": body.length
					},
					timeout: 20000,
					jar: true,
					followAllRedirects: true,
					followOriginalHttpMethod: true
				}, 
				( error, response, body ) => {
					if (!error) {
			        	try {
			            	const json = JSON.parse(body);
			            	if (json.succeed === false) {
			            		onError(json.error);
			            	}
			            	else {
			            		onSuccess();
			                }
			            }
			            catch (error) {
			            	onError(error);
			            }
					}
					else {
						onError( "Problem with pulse: " + error.message );
					}
				}
			);
		}
		catch (error) {
			onError(error);
		}
          
		function getPrivateIp() {
		    for (let addresses of Object.values( os.networkInterfaces())) {
		        for (let add of addresses) {
		            if(add.address.startsWith("192.168.")) {
		                return add.address;
		            }
		        }
		    }
		}
	}
           


### LanNS Site

LanNS default site uses LanNS API, especially _getAppNames_ and _retrieve_ requests 
for showing all services running on the same local network where the site is visited from. By
default services are grouped by application names and the links to services are displayed as
worksation hostname.


#### Parameters

LanNS site url accepts two query string parameters:

	appfilter 		app name or comma separated list of app names
	autoredirect  	valid only if appfilter contains only one application, values are
						first: client is redirected automatically to a service on the first
						        of the worksations up and running
						loner: client is redirected automatically to a service when only 
								one worksation is up and running


#### Site Considerations

	
LanNS site url can be simplified by creating a simple web site with index.htm containing
following html code. According the example the url address easier to write like _www.mysite.net/music_ is
redirected to _http://www.mylannsservice.net:3001?appfilter=musa&autoredirect=loner_.


	<!DOCTYPE html>
	<html>
		<head>
			<meta http-equiv='Content-Type' content='text/html; charset=utf-8'/>
		</head>
       
		<script>
			window.location.href = "http://www.mylannsservice.net:3001?appfilter=musa&autoredirect=loner";
		</script>
		
		<body>
		</body>
	</html>


## API

### Api Http Request

	Request Method: POST
	Content-Type: text/plain
	Request Payload: '{ "name": <requestMessageName>, "parameters":{ <parameters..> }}'

### Response Format

	All outputs follow the same general JSON structure.
        
	    In case of success:
		    {
			    "succeed": true,
			    "content": <string|number|boolean|object>,
                "requestName": <string>,
                "elapsed": <number>
		    }
            
	    In case of error:
		    {
			    "succeed": false,
                "requestName": <string>,
			    "error": { "code": <string>, "message": <string> },
                "elapsed": <number>
		    }

### Request Messages

#### getAppNames

	Parameters
	   none
	 
	Response content
	   Array of Application names as strings


#### getConfig

	Parameters
	    none
        
	Response content
	    {} 
	       --or--
	    { apiUrl: string } when LanNS service also SSL port is present 


#### pulse

	Parameters
        appname: string
        description: string,          // default: ""
        expiretimeinseconds: number,  // default: 300
        hostname: string,
        port: number,
        privateip: string,
        protocol: string,             // default: "http"
        urlpath: string               // default: ""
        
	Response content
		empty string


#### retrieve

	Parameters
        appname   string
      
	Response content
		{
		    appname: string,
            description: string,
            hostname: string,
            port: number,
            privateip: string,
            protocol: string,
            urlpath: string
		}


# lan-ns

LanNS is a web service that allows redirecting the public URL to the private IP address on a local area network.


## Installation

npm install lan-ns


## Usage

### Starting LanNS Service

#### Syntax

      	  
    lanns.start( onError, onSuccess, options );
        onError       function(error)
        onSuccess     function()
        options       object
                       
        
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
    optionsFile         string, a JSON file where options are read from; options in this file are 
                            overwritten by the options passed as start method options parameter
     
     

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
with LanNS pulse request. It can be done either with the 
[lan-ns-ticker](https://github.com/ollikekalainen/lan-ns-ticker/) or with following code
which uses [request](https://github.com/request/request) module.


#### With lan-ns-ticker

Module [lan-ns-ticker](https://github.com/ollikekalainen/lan-ns-ticker/) can be used to 
simplify the service running on local network notifying it's state to the Lan-NS service.
The module sends a pulse request to the LanNS service at desired intervals.

    const Ticker = require("lan-ns-ticker");
    new Ticker({
        url: "https://www.mylannsservice.net:3003",
        appName: "Musa",
        appDescription: "Musa Music Player",
        appPort: 3001,
        appProtocol: "http",
        appUrlPath: "",
        refreshIntervalInSeconds: 60,
        expireTimeInSeconds: 180
    }).start(( error ) => { console.log( error ); });


#### With request

Following code example demonstrates how to send pulse request to LanNS service. It requires
installation of [request](https://github.com/request/request) module.

    pulse( (error) => { console.log(error);}, () => ( console.log("One hit!");), {
        url: "https://www.mylannsservice.net:3003",
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

    appfilter       app name or comma separated list of app names
    autoredirect    valid only if appfilter contains only one application, values are
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

An alternate way to simplify LanNS site url is to write the following index.htm for the site.

    <!DOCTYPE html>
    <html>
        <head>
            <script src="https://code.jquery.com/jquery-3.3.1.min.js"></script>
            <script src="http://www.mylannsservice.net:3001/code/LanNS.js?appfilter=musa&autoredirect=loner"></script>
        </head>
         
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

Retrieves the application names of the services that are notified to be running with the *pulse* 
request from the same public IP address. The LanNS site used to redirection uses this request.

    Parameters
       none
     
    Response content
       Array of Application names as strings


#### getConfig

Get the LanNS service's configuration information. The LanNS site used to redirection uses 
this request to determine if the site supports the https protocol. If it supports, the site 
uses the https protocol for further requests.

    Parameters
        none
        
    Response content
        {} 
           --or--
        { apiUrl: <string> } when LanNS service  SSL port is present 


#### pulse

Local services are supposed to use this request to declare that they are up and running.

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

Retrieves the information of the local services reported by the pulse requests. 
The LanNS site uses this request to obtain the information needed for redirection.

    Parameters
        appname   string
      
    Response content
        [
            {
                appname: string,
                description: string,
                hostname: string,
                port: number,
                privateip: string,
                protocol: string,
                urlpath: string
            },
            ...,
            {
                appname: string,
                description: string,
                hostname: string,
                port: number,
                privateip: string,
                protocol: string,
                urlpath: string
            }
        ]


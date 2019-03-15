/*
-----------------------------------------------------------------------------------------
 LanNS.js
-----------------------------------------------------------------------------------------
 (c) Olli Kekäläinen

 

	


 20190315
-----------------------------------------------------------------------------------------
*/

"use strict";

const path = require("path");
const helper = require( "./helper.js" );
const lanns = {};

const OPTIONS_FILE = path.basename( __filename, path.extname( __filename )) + ".json";

let SERVER;
let PULSE;
let CMDS;
const COMMANDS = { stop: (params) => { stopServer(params);}};

module.exports = lanns;

function solveRoot() {
	let root = __dirname.split(path.sep);
	return root.splice(0,root.length-1).join(path.sep);
}

const DEFAULT_OPTIONS = {
	port: 3002,
	sslPort: 0,	// 0: no https support
    httpsOptions: {
        "pfx": "%LANNS_PFX%",
        "passphrase": "%LANNS_PHRASE%"
    },
	siteRoot: helper.platformize(solveRoot() + "/site"),
    dataFolder: helper.platformize("/LanNS-data"),
    defaultDocument: "index.htm",
    virtualFolders: {
	},
    accessFiltering: [
     //    {
     //        path: "server",
     //        status: "forbidden"
     //    },
    	// {
    	// 	path: helper.platformize("server/log"),
    	// 	status: "permitted"
    	// }
    ],
    mimeTypes: { // additional mimetypes (extension: mimetype)
    },
	api: [
		helper.platformize(__dirname + "/api-lanns")
	]
};

lanns.stop = function () {
	stopServer();
};

lanns.start = function ( onError, onSuccess, options = {}) {
	const q = helper.queue();
	q.add(
		() => {
			if (options.optionsFile) {
				readOptions( handleError, q.next(), options.optionsFile, DEFAULT_OPTIONS );
			}
			else {
				q.proceed();
			}
		},
		(optionsInFile = {}) => {	
			options = solveEnvVars( Object.assign( DEFAULT_OPTIONS, optionsInFile, options ));
			if (options.init) {
				process.exit(0);
				return;
			}
			options.logFolder && helper.logToFile({ folder: helper.platformize(options.logFolder)});
			const filename = "pulse-" + (options.port||options.sslPort) + ".json";
			PULSE = helper.newPulse({ 
				interval: 1000, 
				filename: helper.platformize((options.pulseFolder||__dirname) + "/" + filename )
			});
			PULSE.isBeating( handleError, q.next());	
		},
		(beating) => { 
			if (beating) {
				process.exit(0);
			}
			else {
				PULSE.start( handleError, q.next() );
			}
		},
		() => {
			CMDS = helper.newCmds({ interval: 1000, commands: COMMANDS });
			CMDS.start( handleError, q.next());
		},
		() => {
			const Server = require("./server");
			SERVER = new Server(options).start( 
				handleError, 
				() => { console.log("Server started");} 
			);
			SERVER.onGetConfig = ( onError, onSuccess, context ) => {
				onSuccess({ apiUrl: solveApiUrl( context, options )});					
			};
		}
	).proceed();
}


// ---------------------------------------------------------------------------------------------

function solveApiUrl( context, options) {
	if (options.sslPort) {
		let host = context.httpRequest.headers.host.split(":")[0];
		return "https://" + host + ":" + options.sslPort + "/api";
	}
	return;
}

function handleError( error ) {
	console.log(error);
	PULSE && PULSE.stop();
	CMDS && CMDS.stop();
	stopServer();
}

function readOptions( onError, onSuccess, filename, defaultOptions ) {
	helper.jsonReadEx( onError, onSuccess, filename, defaultOptions );
}

function stopServer(timeout=1700) {
	SERVER && SERVER.stop(() => { setTimeout( () => { process.exit(0); }, timeout ); });
}

function solveEnvVars(source) {
	const target = Object.assign( Array.isArray(source) ? []: {}, source);
	for (let property in target) {
		if (typeof target[property] == "object") {
			target[property] = solveEnvVars(target[property]);
		}
		else if(typeof target[property] == "string") {
			target[property] = helper.renderEnvVars(target[property]);
		}
	}
	return target;
}

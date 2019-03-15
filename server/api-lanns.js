/*
-----------------------------------------------------------------------------------------
 api-lanns.js
-----------------------------------------------------------------------------------------
 (c) Olli Kekäläinen

 

 20190315
-----------------------------------------------------------------------------------------
*/

"use strict";

const helper = require( "./helper.js" );
const api = require( "./api" );
const FILENAME_PREFIX = "LanNS-";

api.add([ 
	{ name: "getAppNames", worker: __getAppNames },
	{ name: "pulse", worker: __pulse, parameters: {
		hostname: { type: "string", mandatory: true },
		appname: { type: "string", mandatory: true },
		privateip: { type: "string", mandatory: true },
		port: { type: "number", mandatory: true },
		protocol: { type: "string", default: "http" },
		urlpath: { type: "string", default: "" },
		description: { type: "string", default: "" },
		expiretimeinseconds: { type: "number", default: 300 }
	}},
	{ name: "retrieve", worker: __retrieve, parameters: {
		appname: { type: "string", mandatory: true }
	}}
]);

// -------------------------------------------------------------------------------------------------
// Workers
// -------------------------------------------------------------------------------------------------

function __getAppNames() {
	const ip = this.server.getRemoteIp( this.httpRequest );
	const dataFolder = this.server.options.dataFolder;
	const path = solveEntryPath( dataFolder, ip );
	const names = [];
	helper.folderEvalEx( 
		(error) => {
			if (error.message && error.message.indexOf("ENOENT") > 0) {
				// LanNS data folder for this public IP does not exist. No applications registered.
				this.onSuccess(names);
			}
			else {
				this.onError(error);
			}
		},
		() => { this.onSuccess(names); },
		(file) => { file.directory && names.push( file.name );},
		path
	);
}

function __pulse() {
	const ip = this.server.getRemoteIp( this.httpRequest );
	const dataFolder = this.server.options.dataFolder;
	const path = solveEntryPath( dataFolder, ip, this.request.parameters.appname );
	new LanNSEntry( path, this.request.parameters ).write( this.onError, this.onSuccess );
}

function __retrieve() {

	const ip = this.server.getRemoteIp( this.httpRequest );
	const dataFolder = this.server.options.dataFolder;
	const path = solveEntryPath( dataFolder, ip, this.request.parameters.appname );
	const filenames = [];
	const entries = [];

	helper.folderEvalEx( 
		(error) => {
			if (error.message && error.message.indexOf("ENOENT") > 0) {
				// LanNS data folder for this public IP does not exist. No services registered.
				this.onSuccess(entries);
			}
			else {
				this.onError(error);
			}
		},
		() => {
			const q = helper.queue();
			filenames.forEach((filename) => {
				((filename) => { q.add(
					() => {
						const entry = new LanNSEntry(path);
						entry.read( 
							this.onError, 
							() => { 
								entry.isExpired()||entries.push( entry.asPublic()); 
								q.proceed();
							}, 
							{ filename: filename }
						);
					}
				)})(filename);

			});
			q.add(() => { this.onSuccess(entries); }).proceed();
		},
		(file) => {
			if (!file.directory && file.name.startsWith( FILENAME_PREFIX )) {
				filenames.push( file.fullname );
			}
		},
		path
	);
}

// -------------------------------------------------------------------------------------------------

class LanNSEntry {
	constructor ( path, params = {}) {
		this.path = path;
		this.hostname = params.hostname;
		this.appname = params.appname;
		this.description = params.description;
		this.privateip = params.privateip;
		this.port = params.port;
		this.urlpath = params.urlpath;
		this.protocol = params.protocol;
		this.expiretimeinseconds = params.expiretimeinseconds;
		this.updated = new Date().getTime();
	}

	solveFilename( hostname, port ) {
		return solveFilename( this.path, (hostname||this.hostname), (port||this.port) );
	}

	write( onError, onSuccess ) {
		const q = helper.queue();
		const filename = this.solveFilename();
		q.add(
			() => { helper.folderEnsure( onError, q.next(), this.path );},
			() => { helper.exists( filename, q.next());},
			(exist) => { 
				if (exist) {
					helper.jsonRead( onError, q.next(), filename );
				}
				else {
					q.proceed({});
				}
			},
			(json) => { 
				this.description = json.description||this.description;
				this.expiretimeinseconds = json.expiretimeinseconds||this.expiretimeinseconds;
				this.updated = new Date().getTime();
				helper.jsonWrite( onError, q.next(), filename, this.json );
			},
			() => { onSuccess(""); }
		).proceed();
	}

	read( onError, onSuccess, params ) {
		const q = helper.queue();
		const filename = params.filename || this.solveFilename( params.hostname, params.port );
		q.add(
			() => { helper.exists( filename, q.next() );},
			(exist) => { 
				if (exist) {
					helper.jsonRead( onError, q.next(), filename );
				}
				else {
					onError(
						helper.newError(
							).Message( "File '" + filename + "' does not exist." 
							).Code( "E_EXIST"
						)
					);
				}
			},
			(json) => {
				this.hostname = json.hostname;
				this.appname = json.appname;
				this.description = json.description;
				this.privateip = json.privateip;
				this.port = json.port;
				this.urlpath = json.urlpath;
				this.protocol = json.protocol;
				this.expiretimeinseconds = json.expiretimeinseconds;
				this.updated = json.updated;
				onSuccess(this);
			}
		).proceed();
	}

	isExpired() {
		return new Date().getTime() - this.updated > (1000 * this.expiretimeinseconds);
	}

	asPublic() {
		return {
			hostname: this.hostname,
			appname: this.appname,
			description: this.description,
			privateip: this.privateip,
			protocol: this.protocol,
			urlpath: this.urlpath,
			port: this.port
		};
	}

	get json() {
		return {
			hostname: this.hostname,
			appname: this.appname,
			description: this.description,
			privateip: this.privateip,
			port: this.port,
			urlpath: this.urlpath,
			protocol: this.protocol,
			expiretimeinseconds: this.expiretimeinseconds,
			updated: this.updated
		};
	}
}

// -------------------------------------------------------------------------------------------------

function solveFilename( path, hostname, port ) {
	return path + "\\" + FILENAME_PREFIX + hostname + "-" + port + ".json";
}

function parseFilename( filename ) {
	filename = filename.split("\\");
	filename = filename[filename.length-1].split("-");
	return {
		hostname: filename[1],
		port: filename[2]
	}
}

function solveEntryPath( dataFolder, ip, appname = "" ) {
	let a = ip.split(".");
	return dataFolder + "\\" + (a[0]||"unknown") + "\\" + (a[1]||"unknown") 
		+ "\\" + (a[2]||"unknown") + "\\" + (a[3]||"unknown") + (appname ? "\\": "") + appname; 
}


/*
-----------------------------------------------------------------------------------------
 server.js
-----------------------------------------------------------------------------------------
 (c) Olli Kekäläinen

 
	
		Basic Server


 

 20190315
-----------------------------------------------------------------------------------------
*/

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require('url');
const requesthandler = require("./apirequesthandler.js");
const LOG_FILEREQUEST = false;

class Server {
	constructor(options) {
		this.virtualFolders = {};
		this.forbiddenPaths = [];
		this.permittedPaths = [];
		this.httpServer = undefined;
		this.httpsServer = undefined;
		this.requesthandler = undefined;
		this.options = options;
		this.apiFolder = "api";
		this.mimeTypes = {
			".css": "text/css",
			".htm": "text/html",
			".html": "text/html",
			".js": "application/javascript; charset=utf-8",
			".json": "application/json; charset=utf-8",
			".txt": "text/plain"
		};
	}

	get siteRoot() {
		return this.options.siteRoot;
	}

	get port() {
		return this.options.port||0;
	}

	get sslPort() {
		return this.options.sslPort||0;
	}

	get defaultDocument() {
		return this.options.defaultDocument||"index.htm";
	}

	get logFileRequests() {
		return !!this.options.logFileRequests
	}

	get logApiRequests() {
		return !!this.options.logApiRequests
	}

	_handleError( onError, error, ssl ) {
		if (error.code == "EADDRINUSE") {
			const e = new Error("Port " + (ssl?this.sslPort:this.port) + " is already in use.");
			e.code = "E_PORTINUSE";
			onError(e);
		}
		else {
			onError(error);
		}
	}

	start( onError, onSuccess ) {
		for (let name in this.options.virtualFolders) {
			this.addVirtualFolder( name, this.options.virtualFolders[name].path );
		}
		this.addForbiddenPath( __dirname );
		this.addMimeType( this.options.mimeTypes );
		this._createAccessFilteringRules();

		requesthandler.init( onError, (handler) => {
			this.requesthandler = handler;
			if (this.port || this.sslPort) {
				if (this.port) {
					try {
						this.httpServer = http.createServer(( request, response ) => { 
							this.onRequest( request, response );
						}).on( "error", (error) => { this._handleError( onError, error );});
						this.httpServer.listen( this.port );
					}
					catch (error) {
						onError(error);
					}
				}
				if (this.sslPort) {
					const https = require('https');
					const options = {};
				    if (this.options.httpsOptions.pfx) {
				    	options.pfx = fs.readFileSync(this.options.httpsOptions.pfx);
						options.passphrase = __exists(this.options.httpsOptions.passphrase) 
							? fs.readFileSync(this.options.httpsOptions.passphrase)
							: this.options.httpsOptions.passphrase;
				    }
				    else {
				    	options.key = fs.readFileSync(this.options.httpsOptions.key);
				    	options.cert = fs.readFileSync(this.options.httpsOptions.cert);
				    }
					try {
						this.httpsServer = https.createServer( options, (request, response) => {
							this.onRequest( request, response );
						}).on( "error", (error) => { this._handleError( onError, error, true );});
						this.httpsServer.listen( this.sslPort );
					}
					catch (error) {
						onError(error);
					}
				}
			}
			else {
				onError( new Error("E_NOSERVERPORT"));
			}
		}, { server: this, api: this.options.api });
		return this;
	}

	stop( onClose ) {
		let serverCount = Number(!!this.httpServer) + Number(!!this.httpsServer);
		this.httpServer && this.httpServer.close(() => { --serverCount || onClose();});
		this.httpsServer && this.httpsServer.close(() => { --serverCount || onClose();});
		return this;
	}

	addMimeType( ext, type ) {
		const _solve = x=>x[0]=="."?x:"."+x;
		if (typeof ext == "object") {
			for (let _ext in ext) {
				this.mimeTypes[_solve(_ext)] = ext[_ext];
			}
		}
		else {
			this.mimeTypes[_solve(ext)] = type;
		}
		return this;
	}

	addVirtualFolder( name, path ) {
		this.virtualFolders[name] = path;
		return this;
	}

	addForbiddenPath( path ) {
		this.forbiddenPaths.indexOf(path.toLowerCase()) < 0 
			|| this.forbiddenPaths.push(path.toLowerCase());
		return this;
	}

	addPermittedPath( path ) {
		this.permittedPaths.indexOf(path.toLowerCase()) < 0 
			|| this.permittedPaths.push(path.toLowerCase());
		return this;
	}

	getConfig( onError, onSuccess, context ) {
		this.onGetConfig ? this.onGetConfig( onError, onSuccess, context ) : onSuccess({});
	}

	getVirtualFolderPath( name ) {
		return this.virtualFolders[name];
	}

	onRequest( request, response ) {
		let sanitizedPath = this._sanitizePath( this._solveDefaultDocument(request));
		if (this.isForbidden( sanitizedPath )) {
			console.log( this.getRemoteIp(request) + " FORBIDDEN: " + sanitizedPath );
			this._sendResponse( response, 403, null, null );
		}
		else if (this._beginsWithFolder( this.apiFolder, sanitizedPath )) {
			if (request.method != 'POST') {
				this._sendResponse(response, 405, { 'Allow': 'POST' }, null);
				return null;
			}
			this._handleApiRequest( request, response );
		}
		else {
			let virtualFolder = this._solveVirtualFolder(sanitizedPath);
			if (virtualFolder) {
				this._supplyFile( 
					request,
					response,
					__decodeURI( path.join( virtualFolder.path, sanitizedPath.substr( virtualFolder.name.length+2 )))
				);
			}
			else {
				this._supplyFile( 
					request,
					response,
					decodeURI( path.join( this.siteRoot, sanitizedPath ))
				);
			}
		}
	}

	getRemoteIp( request ) {
	    let ip = request.headers["x-forwarded-for"] ||
	        (request.connection && request.connection.remoteAddress) ||
	        (request.socket && request.socket.remoteAddress) ||
	        (request.connection && request.connection.socket && request.connection.socket.remoteAddress) ||
	        "";
	    ip = ip.split(",")[0];
	    ip = ip.split(":").slice(-1)[0];
	    return ip == "1" ? "127.0.0.1" : ip;
	}

	isForbidden(url) {
		if (!this.isPermitted(url)) {
			let path = require("path").resolve( this.siteRoot + url ).toLowerCase();
			return !!this.forbiddenPaths.find((forbiddenpath) => { 
				return path.substr( 0, forbiddenpath.length ) == forbiddenpath;
			});
		}
		return false;
	}

	isPermitted(url) {
		let path = require("path").resolve( this.siteRoot + url ).toLowerCase();
		return !!this.permittedPaths.find((permittedpath) => { 
			return path.substr( 0, permittedpath.length ) == permittedpath;
		});
	}

	_supplyFile( request, response, filename ) {

		this.logFileRequests 
			&& console.log( this.getRemoteIp(request) + " " + request.url + " -> " + filename );

		if (request.method != 'GET') {
			this._sendResponse(response, 405, { 'Allow': 'GET' }, null);
			return;
		}
		if (!fs.existsSync(filename)) {
			this._sendResponse(response, 404, null, null);
			return;
		}

		const responseHeaders = {};
		const stat = fs.statSync(filename);
		if (stat.isDirectory()) {
			this._sendResponse( response, 403, null, null );
			return;
		}

		const rangeRequest = this._readRangeHeader( request.headers['range'], stat.size );

		if (!rangeRequest) {
			responseHeaders['Content-Type'] = this._solveMimeName(path.extname(filename));
			responseHeaders['Content-Length'] = stat.size;  // File size.
			responseHeaders['Accept-Ranges'] = 'bytes';
			responseHeaders["Access-Control-Allow-Origin"] = "*";
			this._sendResponse(response, 200, responseHeaders, fs.createReadStream(filename));
			return;
		}

		const start = rangeRequest.Start;
		const end = rangeRequest.End;

		// If the range can't be fulfilled. 
		if (start >= stat.size || end >= stat.size) {
			// Indicate the acceptable range.
			responseHeaders['Content-Range'] = 'bytes */' + stat.size; // File size.
			this._sendResponse(response, 416, responseHeaders, null); // Return the 416 'Requested Range Not Satisfiable'.
			return;
		}

		// Indicate the current range. 
		responseHeaders['Content-Range'] = 'bytes ' + start + '-' + end + '/' + stat.size;
		responseHeaders['Content-Length'] = start == end ? 0 : (end - start + 1);
		responseHeaders['Content-Type'] = this._solveMimeName(path.extname(filename));
		responseHeaders['Accept-Ranges'] = 'bytes';
		responseHeaders['Cache-Control'] = 'no-cache';
		responseHeaders["Access-Control-Allow-Origin"] = "*";

		// Return the 206 'Partial Content'.
		this._sendResponse(response, 206, 
			responseHeaders, fs.createReadStream(filename, { start: start, end: end })
		);
	}

	_beginsWithFolder( folder, _path ) {
		folder = folder[0]== path.sep  ? folder : path.sep+folder;
		if (_path.substr( 0, folder.length ) == folder) {
			return _path.length == folder.length || _path[folder.length] == path.sep;
		}
		return false;
	}

	_createAccessFilteringRules() {
		let rules = this.options.accessFiltering||[];
		rules.forEach((rule) => {
			if (rule.path) {
				let path = rule.path;
				let permitted = rule.status && rule.status[0] == "p";
				if (!(path.substr(0,1) ==  path.sep || path.substr(1,1) == ":")) {
					path = this.siteRoot +  path.sep + path;
				}
				permitted ? this.addPermittedPath(path) : this.addForbiddenPath(path);
			}
		});
	}

	_solveDefaultDocument(request) {
		if (request.url == "/") {
			return "/" + this.defaultDocument;
		}
		else if (request.url.substr(0,2) == "/?") {
			return "/" + this.defaultDocument + request.url.substr(1);
		}	
		return request.url
	}

	_solveVirtualFolder(path) {
		let name;
		for (name in this.virtualFolders) {
			if (this._beginsWithFolder( name, path )) {
				return { name: name, path: this.virtualFolders[name]};
			}
		}
		return;
	}

	_sendResponse( response, responseStatus, responseHeaders, readable ) {
		response.writeHead( responseStatus, responseHeaders );
		if (readable == null) {
			response.end();
		}
		else {
			readable.on('open', function () { readable.pipe(response); });
		}
		return null;
	}

	_sanitizePath(_url) {
		return path.normalize( decodeURI( url.parse(_url).pathname)).replace(/^(\.\.[\/\\])+/, '');
	}

	_handleApiRequest( request, response ) {
		let json;
		let content = "";

		request.on( "data", (chunk) => { content += chunk.toString(); });
		request.on( "end", () => {
			try {
				json = JSON.parse( content );
			}
			catch( error )  {
				this._sendResponse( response, 400, null, null );
				json = undefined;
			}
			if (json) {
				this.requesthandler.handle(
					(error) => {
						this._sendApiResponse( response, error);
					},
					(result) => {
						this._sendApiResponse( response, result );
					},
					{
						httpRequest: request,
						httpResponse: response,
						request: json
					}
				);
			}
		});
	}

	_sendApiResponse( response, result ) {
		const responseHeaders = {};
		if (typeof result !== "string") {
			result = JSON.stringify( result );
		}
		responseHeaders["Pragma"] = "no-cache";
		responseHeaders["Cache-Control"] = "no-cache, no-store, must-revalidate";
		responseHeaders["Expires"] = 0;
		responseHeaders["Access-Control-Allow-Origin"] = "*";
		responseHeaders['Content-Type'] = "application/json; charset=utf-8";
		responseHeaders['Content-Length'] = Buffer.from(result).length; // result.length;
		response.writeHead( 200, responseHeaders );
		response.end( result );
	}

	_readRangeHeader( range, totalLength ) {
		let result;
		if (typeof range == "string" && range.length > 0) {

			const a = range.split(/bytes=([0-9]*)-([0-9]*)/);
			const start = parseInt(a[1]);
			const end = parseInt(a[2]);

			result = {
				Start: isNaN(start) ? 0 : start,
				End: isNaN(end) ? (totalLength - 1) : end
			};

			if (!isNaN(start) && isNaN(end)) {
				result.Start = start;
				result.End = totalLength - 1;
			}

			if (isNaN(start) && !isNaN(end)) {
				result.Start = totalLength - end;
				result.End = totalLength - 1;
			}
		}
		return result;
	}

	_solveMimeName( ext ) {
		return this.mimeTypes[ext.toLowerCase()] || "application/octet-stream";
	}

}

module.exports = Server;

// ---------------------------------------------------------------------------------------------

function __decodeURI(uri) {
	return decodeURI(uri.replace( /%23/g, "#" ));
}

function __exists(folder) {
	let exists = true;
	try {
		fs.statSync(folder);
	} catch(error) {
		exists = false;
	}
	return exists;
}

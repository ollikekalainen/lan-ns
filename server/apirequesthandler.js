/*
-----------------------------------------------------------------------------------------
 apirequesthandler.js
-----------------------------------------------------------------------------------------
 (c) Olli Kekäläinen

 

 

 20190315
-----------------------------------------------------------------------------------------
*/

"use strict";

const api = require( "./api.js" );
const requesthandler = {};
let INTERFACE;
let ORIGINAL_NAMES = {};

module.exports = requesthandler;

requesthandler.init = function( onError, onSuccess, params ) {
	onSuccess( new ApiRequestHanler( params ));
};

class ApiRequestHanler {

	constructor(params) {
		this.server = params.server;
		setTimeout(() => { api.extend(params.api||[]);}, 100 );
	}

	get logRequests() {
		return this.server.logApiRequests;
	}

	_ensureSpecs() {
		if (!INTERFACE) {
			INTERFACE = api.iface;
			for (let name in INTERFACE) {
				ORIGINAL_NAMES[name.toLowerCase()] = name;
			}
		}
	}

	handle( onError, onSuccess, params ) {
		this._ensureSpecs();
		let requestName = params.request.name;
		this.logRequests
			&& console.log( 
				(params.httpRequest ? this.server.getRemoteIp( params.httpRequest ) : "") 
				+ " Request: " + requestName 
			);
		let started = new Date().getTime();
		this.validateRequest(
			onError,
			() => {
				requestName = ORIGINAL_NAMES[requestName.toLowerCase()];
				try {	
					INTERFACE[requestName].worker.call( new Context( 
						this,
						requestName,
						(error) => { console.log(error); onError( this.newErrorResponse({
							requestName: requestName,
							code: !error ? "E_UNKNOWN" : (error.code||error.message),
							message: (!error ? "" : error.message)||"Unknown error",
							started: started
						})); }, 
						(content) => { onSuccess( this.newResponse({
							requestName: requestName,
							content: content,
							started: started
						})); }, 
						params
					));
				}
				catch (error) {
					console.log(error);
					onError( this.newErrorResponse({
						requestName: requestName,
						code: "E_SYSTEM",
						message: "Internal server error. Details written in the server's log file.",
						started: started
					}));
				}
			}, 
			requestName, 
			params.request.parameters, 
			started 
		);
	}

	validateRequest( onError, onSuccess, requestName, parameters, started ) {
		if (requestName) {
			const _requestName = requestName.toLowerCase();
			if (ORIGINAL_NAMES[_requestName]) {
				requestName = ORIGINAL_NAMES[_requestName];
				let p, name, missing = [], invalid = [];
				for (name in INTERFACE[requestName].parameters) {
					p = INTERFACE[requestName].parameters[name];
					if (p.mandatory && parameters[name] == undefined) {
						missing.push(name);
					}
					else if (!p.mandatory && parameters[name] == undefined) {
						parameters[name] = p.default;
					}
					else if (typeof parameters[name] !== p.type) {
						invalid.push[name];
					}
				}
				if (missing.length || invalid.length) {
					let info = "";
					if (missing.length) {
						info += "missing parameter(s): ";
						missing.forEach((name,index)=>{info += (index?",":"")+" '"+name+"'" });
					}
					if (invalid.length) {
						info += (missing.length?" " :"") + "invalid parameter value(s): ";
						invalid.forEach((name,index)=>{info += (index?",":"")+" '"+name+"'" });
					}
					onError( this.newErrorResponse({
						code: "E_INVALIDREQUESTPARAMETERS", 
						message: "Invalid request '" + requestName + "' (" + info + ")",
						started: started					
					}));
				}
				else {
					onSuccess();
				}
			}
			else {
				onError( this.newErrorResponse({
					code: "E_INVALIDREQUESTNAME", 
					message: "Invalid request name '" + requestName + "'",
					started: started					
				}));
			}
		}
		else {
			onError( this.newErrorResponse({
				code: "E_NOREQUESTNAME", 
				message: "No requestname",
				started: started					
			}));
		}
	}

	newResponse( params ) {
		return {
			succeed: true,
			requestName: params.requestName,
			content: params.content == undefined ? "" : params.content,
			elapsed: params.started ? new Date().getTime() - params.started : undefined
		};
	}

	newErrorResponse( params ) {
		return {
			succeed: false,
			requestName: params.requestName,
			error: {
				code: params.code,
				message: params.message,
			},
			elapsed: params.started ? new Date().getTime() - params.started : undefined
		};
	}
}

class Context {
	constructor( requestHandler, requestName, onError, onSuccess, params ) {
		this.started = new Date().getTime();
		this.requestHandler = requestHandler;
		this.server = requestHandler.server;
		this.onError = onError;
		this.onSuccess = onSuccess;
		this.requestName = requestName;
		this.request = params.request;
		this.httpRequest = params.httpRequest;
		this.httpResponse = params.httpResponse;
	}
}

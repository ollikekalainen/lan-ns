/*
-----------------------------------------------------------------------------------------
 api.js
-----------------------------------------------------------------------------------------
 (c) Olli Kekäläinen

 
	{
		api: {
		},
		getConfig: {
		},
		pulse: {
			parameters: {
				hostname: { type: "string", mandatory: true },
				appname: { type: "string", mandatory: true },
				port: { type: "number", mandatory: true },
				privateip: { type: "string", mandatory: true },
				description: { type: "string", default: "" },
				expiretimeinseconds: { type: "number", default: 300 }
			}
		},
		retrieve: {
			parameters: {
				appname: { type: "string", mandatory: true }
			}
		},
		getAppNames: {
		}
	}
	


 20190317
-----------------------------------------------------------------------------------------
*/
(() => {

	"use strict";

	const api  = namespace("api");

	let API;

	api.get = function( onError, onSuccess, params ) {
		API ? onSuccess(API) : (API = new Api( onError, onSuccess, params ));
	};

	class Api {

		constructor( onError, onSuccess, params = {}) {
			API = this;
			params.root && (this.root = params.root);
			this.__initInterfase( onError, onSuccess );
		}

		__initInterfase( onError, onSuccess ) {
			this.__request( 
				onError, 
				(api) => {
					for (let name in api) {
						((name) => {
							Api.prototype[name] = function (onError, onSuccess, parameters) {
								this.__request( onError, onSuccess, name, parameters );
							};
						})(name);
					}
					onSuccess(this);
				}, 
				"api" 
			);

		}

		get url() {
			// return this.__url ? this.__url :  location.protocol + "//" + location.host + "/api";
			return this.__url ? this.__url :  this.root + "api";
		}

		set url(url) {
			this.__url = url;
			return this.url;
		}

		__request( onError, onSuccess, name, parameters ) {
			let request = { name: name, parameters: parameters||{}};
			$.ajax({
				type: "POST",
			  	url: this.url, 
			  	error: (a,b,c) => { onError(c);},
			  	data: JSON.stringify(request),
				success: (response) => { 
					name == "getConfig" && (this.url = response.content.apiUrl);
					response.succeed ? onSuccess(response.content) : onError(response.error);
				},
				cache: false,
				headers: {},
				contentType: "text/plain"
			});
		}
	}

})();
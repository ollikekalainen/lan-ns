/*
-----------------------------------------------------------------------------------------
 api.js
-----------------------------------------------------------------------------------------
 (c) Olli Kekäläinen

 



 20190315
-----------------------------------------------------------------------------------------
*/

"use strict";

class Api {
	constructor () {
		this.iface = {};
		const api = this;
		this.add([
			{ name: "api", worker: function () { 
				this.onSuccess( api.iface );}
			},
			{ name: "getConfig", worker: function () { 
				this.server.getConfig( this.onError, this.onSuccess, this );}
			}
		]);
	}
	
	add(entry) {
		(Array.isArray(entry)?entry:[entry]).forEach((ent) => {
			this.iface[ent.name] = {
				parameters: ent.parameters || {},
				worker: ent.worker || function () {
					this.onError(
						helper.newError(
							).Message( "Request '" + this.requestName 
								+ "' does not have worker function assigned." 
							).Code( "E_NOWORKER"
						)
					);
				}
			};
		});
	}

	extend(module) {
		(Array.isArray(module) ? module : [module]).forEach((mod) => { require(mod); });
	}

}

global.__lannsApi = global.__lannsApi||new Api();
module.exports = global.__lannsApi;

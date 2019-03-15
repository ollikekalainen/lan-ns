/*
-----------------------------------------------------------------------------------------
 app.js
-----------------------------------------------------------------------------------------
 (c) Olli Kekäläinen

 
	Query string parameters:
		appfilter 		string (app name or comma separated list of app names)
		autoredirect  	first|loner
	


 20190315
-----------------------------------------------------------------------------------------
*/
(() => {

	"use strict";
	const helper = namespace("helper");
	const app = namespace("app");

	let APP;
	let API;

	app.get = ( onError, onSuccess, params ) => {
		APP ? onSuccess(APP) : (APP = new App( params ).start( onError, onSuccess ));
	}

	class App {

		constructor( params ) {
			this.config = params.config||{};
			this.serverConfig = params.serverConfig||{};
			this.qs = helper.parseQuery(location.search);
			this.id = "lanns-app";
			this.appCount = 0;
			this.serviceCount = 0;
			// in effect when there is available only one service (loner)
			// or one application and several services (first)
			this.autoRedirect = this.solveAutoRedirect();
			this.appfilter = this.qs.appfilter ? this.qs.appfilter.split(",") : [];
		}

		solveAutoRedirect() {
			let ar = (this.qs.autoredirect||"none").toLowerCase();
			return ["loner","first"].indexOf(ar)<0 ? "none" : ar;

		}

		start( onError, onSuccess ) {
			const q = helper.queue();
			q.add( 
				() => {
					namespace("api").get( onError, q.next());
				},
				(api) => { 
					API = api;
					$("body").append( helper.getTemplate("lanns").render({}));
					q.proceed();
				},
				() => { this.constructPage( onError, q.next()); },
				() => { onSuccess(this); }
			).proceed();
			return this;
		}

		constructPage( onError, onSuccess ) {
			const q = helper.queue();
			q.add( 
				() => { API.getAppNames( onError, q.next())},
				(appnames) => {
					const q2 = helper.queue();
					appnames.filter((appname) => { return this.appFiltering(appname);}).forEach((appname) => {
						((appname) => {
							this.appCount++;
							q2.add(() => { this.addApplication( onError, q2.next(), appname );});
						})(appname);
					});
					q2.add( q.next()).proceed();
				},
				() => {
					$(".lanns-application-services").on({ click: (event) => {
						const target = $(event.target);
						this.redirect( target.hasClass("lanns-service") ? target : target.parent());
					}});
					if (this.serviceCount == 0) {
						this.hideApplications();
						this.writeToCaption( this.appfilter.length == 1
							? "There are currently no " + capitalize(this.appfilter[0]) 
								+ " services available on your local network"
							: "There are currently no services available on your local network"
						);
					}
					else if (this.appfilter.length == 1) {
						if ((this.autoRedirect == "loner" && this.serviceCount == 1) 
							|| this.autoRedirect == "first") {
							setTimeout(() => { this.redirect( $("#service1"));}, 200 );
						}
						else {
							const caption = capitalize(this.appfilter[0]) 
								+ " service is running on following workstations on your local network";
							this.writeToCaption(caption);
							$(".lanns-application-name").css("display","none");
						}
					}
					onSuccess();
				}				
			).proceed()
		}

		writeToCaption( text ) {
			$("#lanns-app-caption").attr( "data-content", text );
		}

		appFiltering(appname) {
			return this.appfilter.length 
			  ?	this.appfilter.findIndex((name) => { 
						return name.toLowerCase() == appname.toLowerCase();
					}) >= 0 
			  :	true;
		}

		addApplication( onError, onSuccess, appname ) {
			const q = helper.queue();
			const appid = helper.uniqueID();
			q.add( 
				() => {
					$("#lanns-app-applications").append( 
						helper.getTemplate("lanns-application").render({ 
							id: appid,
							appname: appname
						}
					));
					q.proceed();
				},
				() => { API.retrieve( onError, q.next(), { appname: appname })},
				(services) => {
					const q2 = helper.queue();
					services.forEach((service) => {
						((service) => {
							q2.add(() => { this.addService( appid, service ); q2.proceed();});
						})(service);
					});
					q2.add( q.next()).proceed();
				},
				() => { onSuccess(); }
			).proceed()
		}

		addService( appid, service ) {
			this.serviceCount++;
			$( ".lanns-application-services", $("#"+appid )).append( 
				helper.getTemplate("lanns-service").render({ 
					id: "service"+ this.serviceCount,
					hostname: service.hostname,
					appname: service.appname,
					description: service.description,
					privateip: service.privateip,
					port: service.port,
					protocol: service.protocol,
					urlpath: service.urlpath
				})
			);
		}

		hideApplications() {
			$("#lanns-app-applications").css({display:"none"});
		}

		redirect( $element, waittime = 2000 ) {
			const service = this.parseService($element);
			this.hideApplications();
			setTimeout( () => {
				this.writeToCaption( "Connecting to " + service.appname 
					+ " on " + service.hostname + "..." );
				setTimeout( () => {
					location.href = service.protocol + "://" + service.privateip
						+ ":" + service.port + (service.urlpath ? "/" + service.urlpath : "");
				}, waittime );
			}, 100 );
		}

		parseService($element) {
			return {
				appname: $element.attr("data-appname"),
				hostname: $element.attr("data-hostname"),
				protocol: $element.attr("data-protocol"),
				privateip: $element.attr("data-privateip"),
				port: $element.attr("data-port"),
				urlpath: $element.attr("data-urlpath")
			};
		}
	}

	// ---------------------------------------------------------------------------------------------

	function capitalize(s) {
		return s.substr(0,1).toUpperCase() + s.substr(1);
	}

})();

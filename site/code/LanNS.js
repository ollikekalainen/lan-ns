/*
-----------------------------------------------------------------------------------------
 LanNS.js
-----------------------------------------------------------------------------------------
 (c) Olli Kekäläinen

 
	


 20190317
-----------------------------------------------------------------------------------------
*/
((global) => {

	"use strict";

	const SPACE = {};
	const QUERYPARAMS = {};
	const NOCACHE = false;
	const ROOT = getCurrentScriptPath() + "/";
	const CONFIG_FILE = ROOT + "config.json";

	let helper;
	let CONFIG = undefined;
	let API, APP;

	global.namespace = name=>{ SPACE[name]||(SPACE[name]={}); return SPACE[name]; };

	function start() {
		const q = helper.queue();
		q.add(
			() => {	namespace("api").get( handleError, q.next(), { root: getApiRoot() });},
			(api) => { 
				API = api;
				API.getConfig( handleError, q.next());
			},
			(serverConfig) => {
				const params = { 
					config: CONFIG,
					serverConfig: serverConfig,
					root: ROOT,
					autoredirect: QUERYPARAMS.autoredirect,
					appfilter: QUERYPARAMS.appfilter
				};
				namespace("app").get( handleError, q.next(), params );
			},
			(app) => { APP = app; }
		).proceed();
	}

	function load() {
		scriptToPageHeader(
			(error) => { console.log(error)}, 
			() => {
				helper = namespace("helper");
				helper.scriptToPageHeader = scriptToPageHeader;
				configRead( handleError, (config) => {
					CONFIG = config;
					solveQueryString();
					let source = CONFIG.source[QUERYPARAMS.mode] || CONFIG.source.basic;
					helper.loadSource( start, source, { nocache: NOCACHE, root: ROOT });
				});
			},
			ROOT + "helper.js"
		);
	}

	function solveQueryString() {
		let qs = helper.parseQuery( helper.getScriptQueryString("LanNS.js"));
		QUERYPARAMS.mode = (qs.mode||"complete").toLowerCase();
		QUERYPARAMS.autoredirect = qs.autoredirect||undefined;
		QUERYPARAMS.appfilter = qs.appfilter||undefined;
	}

	function scriptToPageHeader( onError, onSuccess, source ) {

        var script 	= document.createElement('script');
		var head	= document.getElementsByTagName('head')[0];

        if (script.readyState) {
            script.onreadystatechange = function() {
                if (script.readyState === "loaded" || script.readyState === "complete")	{
                    script.onreadystatechange = null;
		            try	{
		                onSuccess();
		            }
					catch (error) {
						onError(error);
					}
	            }
            };
        }
		else {
            script.onload = function () {
	            try	{
	                onSuccess();
	            }
				catch (error) {
					onError(error);
				}
	        };
        }
        script.setAttribute( "src", source );
		head.appendChild( script );			
	}

	function handleError(error) {
		console.log(error);
	}

	function getCurrentScriptPath() {
		let source = document.currentScript.src;
		source = source.substr( 0, source.lastIndexOf('/'));
		//source = source.split("/").slice(3).join("/");
		return source;
	}

	function getApiRoot() {
		let apiroot = ROOT.split("/");
		return apiroot.slice(0,apiroot.length-2).join("/") + "/";
	}

	function configRead( onError, onSuccess ) {
		helper.loadFile( 
			onError, 
			(config) => {
				try {
					onSuccess( JSON.parse(config));
				}
				catch (error) {
					onError(error);
				}
			}, 
			CONFIG_FILE 
		);
	}

	load();

})(this);
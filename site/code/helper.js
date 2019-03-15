/*
-----------------------------------------------------------------------------------------
 helper.js
-----------------------------------------------------------------------------------------
 (c) Olli Kekäläinen

 
	


 20190315
-----------------------------------------------------------------------------------------
*/
(() => {

	const helper = namespace("helper");
	const CACHEOFF = false;
	const TEMPLATES = {};

	helper.uniqueID = function (length) {
		length = length||12;
		length = length < 12 ? 12 : length;

		const prefix = "abcdefghijklmnopqrstuvwxyz0123456789";
		let time = (new Date()).getTime();
		let id = prefix[ Math.floor( Math.random() * 26 )] + time.toString(36);
		let total = id.length;

		while (total++ < length) {
			id += prefix[ Math.floor( Math.random() * 36 )];
		}
		return id;
	};

	helper.fileExt = function ( filename ) {
		filename = filename.split( /\\|\// ).pop().split(".");
		return filename.length == 1 ? "" : filename.pop();
	};

	helper.loadSource = (onSuccess, a, p ) => {
		const onError = (error) => { console.log(error);};
		const q = helper.queue();
		a.forEach((filename) => {
			if (filename[0] == "#") {
				filename = filename.substr(1);
			}
			else {
				p.root && (filename = p.root + filename);
			}
			let ext = helper.fileExt(filename).toLowerCase();
			switch (ext) {
				case "css":
					q.add(() => {helper.cssToPageHeader( q.next(), filename );});
					break;
				case "htm":
					q.add(() => {helper.loadTemplates( q.next(), filename );});
					break;
				case "js":
					p.nocache && (filename+=("?"+Math.random()));
					q.add(() => {helper.scriptToPageHeader( onError, q.next(), filename );});
					break;
			}
		});
		q.add( onSuccess ).proceed();
	};

	helper.getTemplate = function ( name ) {
		var source = "";
		if (TEMPLATES[name] !== undefined) {
			source = TEMPLATES[name];
		}
		else {
			console.log( "ERROR: Template '" + name + "' does not exist." );
		}
		return new Template(source);
	};

	helper.parseTemplates = function( source, returnOnly ) {

		const TEMPLATE_BEGIN = "[#";
		const TEMPLATE_END = "]";
		const templates = {};

		source.replace( /(\/\*([\s\S]*?)\*\/)/gm, "" ).split(TEMPLATE_BEGIN).forEach( (template)=>{
			var pos = template.indexOf(TEMPLATE_END);
			if (pos>=0) {
				var name = template.substr(0,pos);
				template = template.substr(pos+TEMPLATE_END.length);
				template.substr(0,2) == "\r\n" && (template = template.substr(2));
				if (returnOnly) {
					templates[name] = template;
				}
				else {
					TEMPLATES[name] = template;
				}
			}
		});

		return templates;
	};

	helper.loadTemplates = function ( onSuccess, filename ) {
		let name = filename.toLowerCase();
		let ext = name.substr(-4);
		if (ext == ".txt" || ext == ".htm" || ext == ".tpl") {
			helper.loadFile( 
				(error) => { console.log(error);},
				(source) => { onSuccess( helper.parseTemplates( source, false ));}, // true ));},
				filename, 
				"text/" + (ext == ".txt" ? "plain" : "html")
			);
		}
		else {
			console.log( "ERROR: Invalid template file extension '" + filename + "'" );
		}
	};

	helper.loadFile = function( onError, onSuccess, filename, mimetype ) {

	    var xobj = new XMLHttpRequest();
		var qs = CACHEOFF ? "?"+Math.random() : "";

        xobj.overrideMimeType( mimetype|| "application/json" );
	    xobj.open('GET', filename+qs, true );
	    xobj.onreadystatechange = function () {
			if (xobj.readyState == 4) {
			 	if (xobj.status == "200") {
					onSuccess(xobj.responseText);
				}
				else {
					onError( new Error(xobj.status + ": " + xobj.statusText) );
				}
			}
	    };
		xobj.send();
		//xobj.send(null);
	};

	helper.cssToPageHeader = function ( onload, href ) {
	    var head = document.getElementsByTagName('head')[0];
	    var link = document.createElement('link');
		var qs = CACHEOFF ? "?"+Math.random() : "";
	    // link.id		= id;
	    link.rel	= 'stylesheet';
	    link.type	= 'text/css';
	    link.href	= href+qs;
	    link.media	= 'all';
	    link.onload = (event) => { onload(); };
	    head.appendChild(link);
	};

	helper.getScriptQueryString = function ( scriptFilename ) {
		var scripts = document.getElementsByTagName("script");
		for (var i = 0; i < scripts.length; i++) {
			if (scripts[i].src.indexOf( "/" + scriptFilename + "?" ) >= 0) {
				return scripts[i].src.split("?")[1];
			}
		}
		return "";
	};

	helper.parseQuery = function (queryString) {
        if( typeof queryString !== "string" || queryString.length == 0) {
		 	return {};
		}
		if (queryString.charAt(0) == "?") {
			queryString = queryString.substr(1);
		}
        var items = queryString.split("&");
        var itemCount = items.length;
        var item, query = {}, name, value;

        for (var i = 0; i < itemCount; i++) {
            item = items[i].split("=");
            name = decodeURIComponent(item[0]);
            if (name.length == 0) {
				continue;
			}
            value = decodeURIComponent(item[1]);
            if (typeof query[name] == "undefined") {
				query[name] = value;
			}
            else if( Array.isArray( query[name] )) {
				// else if( query[name] instanceof Array)
				query[name].push(value);
			}
            else {
				query[name] = [query[name], value]; 
			}
        }
        return query;
	};

	helper.queue = function () {
		var q = new Queue();
		return q.add.apply( q, arguments );
   	};

	helper.isMobile = function () {
        return !!navigator.userAgent.match(/Android/i)
        	|| !!navigator.userAgent.match(/BlackBerry/i)
        	|| !!navigator.userAgent.match(/iPhone|iPad|iPod/i)
        	|| !!navigator.userAgent.match(/Opera Mini/i)
        	|| !!navigator.userAgent.match(/IEMobile/i);
	};

	// ---------------------------------------------------------------------------------------------
	class Queue {
		constructor() {
			this.index = 0;
			this.items = [];
	   	}

		add() { 
			if (arguments.length) {
				for (var i = 0; i < arguments.length; i++) {
					if (Array.isArray( arguments[i] )) {
						for (var j = 0; j < arguments[i].length; j++) {
							arguments[i][j].__qindex = this.items.length;
							this.items.push( arguments[i][j] );
						}
					}
					else {
						arguments[i].__qindex = this.items.length;
						this.items.push( arguments[i] );
					}
				}
			}
			return this;
		}

		end() { 
			var item = this.last();
			if (item) {
				item.apply( this, arguments );
			}
			else {
				console.log( "ERROR: No entries in queue. " + (new Error().stack) );
			}
			return this;
		}

		last() { 
			this.index = this.items.length - 1; 
			return this.items[this.index++]; 
		}

		next() { 
			return this.items[this.index++]; 
		}

		proceed() { 
			var item = this.next();
			if (item) {
				item.apply( this, arguments );
			}
			else {
				console.log( "ERROR: EOF Queue. " + (new Error().stack));
			}
			return this;
		}

		reset() { 
			this.index = 0; 
			return this; 
		}
	}	

	// ---------------------------------------------------------------------------------------------

	class Template {

		constructor(source) {
			this.source = source||"";
		}

		add(source) {
			this.source += source;
			return this;
		}

		set(source) {
			this.source = source||"";
			return this;
		}

		render(values) {

			let value, tag;
			let source = this.source;
			values = values||{};
			if (values.mobile == undefined) {
				values.mobile = helper.isMobile();
			}
			for (tag in values) {
				if (typeof values[tag] == "string") {
					value = values[tag];
				}
				else if (typeof values[tag] == "number") {
					value = values[tag]+"";
				}
				else if (typeof values[tag] == "boolean") {
					value = values[tag]+"";
				}
				else if (typeof values[tag] == "object" && values[tag] == null) {
					value = "";
				}
				else if (typeof values[tag] == "object" && values[tag].render) {
					value = values[tag].source;
				}
				else {
					value = undefined;
				}
				if (typeof value == "string") {
					var exp = new RegExp( "\\<\\[" + tag.toUpperCase() + "\\]\\>", "g" );
					source = source.replace( exp, value );
				}
			}
			return source;
		};

		stringify(values) {
			this.source = this.render(values);
			return this;
		}
	}

})();
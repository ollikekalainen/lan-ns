/*
-----------------------------------------------------------------------------------------
 helper.js
-----------------------------------------------------------------------------------------
 (c) Olli Kekäläinen

 


 20190315
-----------------------------------------------------------------------------------------
*/

"use strict";

const helper = {};
const path = require("path");
const fs = require( "fs" );

const CMDS_FOLDER = __dirname + "\\cmds";
const DEBUG_QUEUE = false;
const DEFAULT_ERRORNAME = "CoreError";

let LOG = undefined;
let BROADCASTER = undefined;

console._log = console.log;

helper.logToFile = ( options ) => {
	// ---------------------------------
	// options:
	// ---------------------------------
	// folder
	// maxsize        default: 512*1024;
	// prefix         default: "LOG-"
	// maxfilecount   default: 128
	// ---------------------------------

	if (options && options.folder) {
		helper.logToFile.__options = options;
		console.log = (content) => {
			if (LOG) {
				LOG.write( content );
			}
			else {
				LOG = new Log( helper.logToFile.__options );
				LOG.start(() => { LOG.write( content );});
			}
		};
	}
	else {
		console.log( "ERROR: helper.logToFile() options.folder is not set.");
	}
};


helper.platformize = function(path) {
	const pth = require("path");
	return path.replace( pth.sep == "\\" ? /\//g : /\\/g, pth.sep );
}

helper.renderEnvVars = function (source) {
	let proceed = true;
	while (proceed) {
		let result = new RegExp("(\%([^%]+)\%)", "").exec(source);
		if (result) {
			let envVar = result[0].replace(/\%/g, "" );
			let value = process.env[envVar];
			source = source.replace( 
				new RegExp("\%" + envVar + "\%", "g" ), 
				value||("[*** No env var "+ envVar + " ***]") 
			);
		}
		else {
			proceed = false;
		}
	}
	return source;
};

helper.queue = function () {
	let q = new Queue();
	return q.add.apply( q, arguments );
};

helper.folderEnsure = function ( onError, onSuccess, folder ) {
	// Have to ensure that helper module is ready to go here
	if (Array.isArray( folder )) {
		let i;
		const q = helper.queue();
		for (i = 0; i < folder.length-1; i++) {
			q.add( ((folder) => { return () => { ensure( onError, q.next(), folder );}; })(folder[i]));
		}
		q.add(()=>{ ensure( onError, onSuccess, folder[folder.length-1] );}).proceed();
	}
	else {
		ensure( onError, onSuccess, folder );
	}

	function ensure( onError, onSuccess, folder ) {
		let folders = folder.split( "\\" );

		if (folder.substr(0,2) == "\\\\") {
			folders[0] += "\\" + folders[1] + "\\" + folders[2];
			folders.splice( 1, 2 );
		}
		else if ((folders[0] == "" || folders[0].indexOf(":")) >= 0 && folders[1] ) {
			folders[0] += "\\" + folders[1];
			folders.splice( 1, 1 );
		}

		const q = helper.queue();
		folder = folders[0];
		let i;
		for (i = 1; i < folders.length; i++) {
			q.add( ((folder) => {
					return () => { helper.folderMake( onError, q.next(), folder );};
				})(folder)
			);
			folder += "\\" + folders[i];
		}
		q.add(() => { helper.folderMake( onError, onSuccess, folder ); }).proceed();
	}
};

helper.folderEvalEx = function ( onError, onSuccess, onEach, path, options ) {
	options = options||{};
	options.exclude = options.exclude||{};
	var exclude = options.exclude;
	fs.readdir( 
		path, 
		function onReadDir( error, files ) {
			if (error) {
				onError(
					helper.newError(
						).Aux( error
						).Message( "Failed to read directory content '" + 
							path + "' (<message>)"
						).Stack( new Error().stack
						).Code( "E_READDIR"
					)
				);
			}
			else {
				evalFiles( path, files, onEach );
				onSuccess();
			}
		}
	);

	function evalFiles( path, files, onEach ) {
		var stat, i,fullname;
		for (i = 0; i < files.length; i++) {
			fullname = path + "\\" + files[i];
			try {
				stat = fs.statSync( fullname );
			}
			catch(error) {
				if (!(error.code == "EPERM" && options.ignorePermissionError)) {
					onError(
						helper.newError(
							).Aux( error
							).Message( "Failed to read properties of file '" + 
								fullname + "' (<message>)"
							).Stack( new Error().stack
							).Code( "E_FILESTATS"
						)
					);
				}
			}

			if (stat) {
				var entry = {};

				!exclude.name && (entry.name = files[i]);
				!exclude.fullname && (entry.fullname = fullname);
				!exclude.directory && (entry.directory = stat.isDirectory());
				!exclude.size && (entry.size = stat.size);
				if (options.timesasmilliseconds) {
					!exclude.changed && (entry.changed = new Date(stat.mtime).getTime());
					!exclude.created && (entry.created = new Date(stat.birthtime).getTime());
					!exclude.accessed && (entry.accessed = new Date(stat.atime).getTime());
				}
				else {
					!exclude.changed && (entry.changed = stat.mtime);
					!exclude.created && (entry.created = stat.birthtime);
					!exclude.accessed && (entry.accessed = stat.atime);
				}
				onEach(entry);
			}
		}			
	}
};

helper.folderMake = function( onError, onReady, path ) {
	fs.mkdir( 
		path, 
		parseInt( "0777", 8 ), 
	  	function (error) {
			if (error==null || error.code == "EEXIST") {
				onReady();
			}
			else {
				onError( new Error( "Failed to create folder '" + path + "'" ));
			}
		}
	);
};

helper.setExt = function ( filename, ext ) {
	if (ext) {
		if (ext.charAt(0) !== ".") {
			ext = "." + ext;
		}
		var name = path.basename( filename, path.extname( filename )) + ext;
		if (filename.indexOf( "\\" ) >= 0) {
			name = path.dirname(filename) + "\\" + name;
		}
		return name;
	}
	else {
		throw new Error( "Syntax error: helper.setExt()" );
	}
};

helper.fileExt = function ( filename ) {
	filename = filename.split( /\\|\// ).pop().split(".");
	return filename.length == 1 ? "" : filename.pop();
};

helper.newPulse = function (params) {
	return new Pulse(params);
};

helper.newCmds = function (params) {
	return new Cmds(params);
};

helper.exists = function ( path, callback ) {
	fs.access( path, (error) => {
		if (!error) {
			callback(true);
		}
		else if (error.code == "ENOENT") {
			callback(false);
		}
		else {
			throw error;
		}
	});
};

helper.jsonReadEx = function ( onError, onSuccess, filename, defaultContent ) {
	helper.exists( filename, (exists) => {
		if (exists) {
			helper.jsonRead( onError, onSuccess, filename );
		}
		else {
			helper.jsonWrite(	
				onError,
				() => { onSuccess( defaultContent ); },
				filename, 
				defaultContent
		    );
		}
	});										 
};

helper.jsonRead = function ( onError, onSuccess, filename, noUncommenting ) {
	helper.exists( 
		filename, 
		(exists) => {
		if (exists) { fs.readFile( filename, null, ( error, data ) => {
				if (error) {
					onError(
						helper.newError(
							).Aux( error
							).Message( "Failed to read file '" + 
								filename + "' (<message>)"
							).Code( "E_READFILE"
							).Stack( new Error().stack
						)
					);
				}
				else {
					data = data.toString();
					if (!noUncommenting) {
						data = helper.unComment( 
							data, 
							(error) => {
								onError( 
									helper.newError(
										).Aux( error
										).Message( "Failed to remove comments from file '" + 
											filename + "' (<message>)"
										).Code( "E_UNCOMMENT"
										).Stack( new Error().stack
									)
								);
							}
						);
					}
					helper.jsonParse( onError, onSuccess, data, filename );
				}
			});
		}
		else {
			onError( 
				helper.newError(
					).Message( "File '" + filename + "' does not found."
					).Code( "E_NOTFOUND"
					).Stack( new Error().stack
				)
			);
		}
	});
};

helper.jsonWrite = function ( onError, onSuccess, filename, json ) {
	if (!json) {
		onError(
			helper.newError(
				).Name ("Syntax"
				).Message( "helper.jsonWrite(), JSON object not passed"
				).Stack( new Error().stack
				).Code( "E_NOJSONPAR"
			)
		);
	}
	else {
		fs.writeFile( 
			filename, 
			JSON.stringify( json, null, 4 ).replace( /\n/g, "\r\n" ),
			( error ) => {
				if (error) {
					onError( 
						helper.newError(
							).Name ("Syntax"
							).Aux( error
							).Message( "Failed to write file '" + filename + 
								"' (<message>)"
							).Stack( new Error().stack
							).Code( "E_JSONWRITE"
						)
					);
				}
				else {
					onSuccess();
				}
		 	}
		);
	}
};

helper.jsonParse = function ( onError, onSuccess, source, filename ) {
	try {
		if (onSuccess) {
	 		onSuccess( JSON.parse( source ));
	 	}
	 	else {
	 		return JSON.parse( source );
	 	}
	}
	catch(error) {
		let msg = "Failed to parse json. Error message: <message>.";
		if (filename) {
			msg += " (source: " + filename + ")";
		}
		onError( 
			helper.newError(
				).Name ("Parse"
				).Aux( error
				).Message( msg
				).Stack( new Error().stack
				).Code( "E_PARSE"
			)
		);
	}
};

helper.unComment = function ( s, onError, onSuccess ) {
	var length = s.length;
	var double = false;
	var single = false;
	var stackindex  = 0;
	var i		= 0;
	var target = "";
	var error;		

	if (length  > 0) {
		while (i < length) {
			if (!(double || single)) {
				if (length - (i) >= 2 && s[i] == "/" && s[i+1] == "*") {
					++stackindex;
					i += 2;
					continue;
				}
				if (length - (i) >= 2 && s[i] == "*" && s[i+1] == "/") {
					if (stackindex > 0) {
						--stackindex;
					}
					i += 2;
					continue;
				}
			}
			if (stackindex == 0) {
				if (s[i] == '"' && !single) {
					double = !double;
				}
				if (s[i] == "'" && !double) {
					single = !single;
				}
				target += s[i];
			}
			++i;
		}

		if (stackindex > 0)	{
			error = helper.newError(
				).Message( "Failed to remove comments from source string" +
					" (unclosed comment)"
				).Code( "E_UNCLOSEDCOMMENT"
				).Stack( new Error().stack
			);
		}
		else if (single) {
			error = helper.newError(
				).Message( "Failed to remove comments from source string" +
					" (unclosed unclosed singlequote)"
				).Code( "E_UNCLOSEDSINGLEQUOTE"
				).Stack( new Error().stack
			);
		}
		else if (double) {
			error = helper.newError(
				).Message( "Failed to remove comments from source string" +
					" (unclosed unclosed doublequote)"
				).Code( "E_UNCLOSEDDOUBLEQUOTE"
				).Stack( new Error().stack
			);
		}

		if (error) {
			if (onError) {
				onError( error );
			}
			else {
				throw error;
			}
		}
		else {
			if (onSuccess) {
				onSuccess(target);
			}
			else {
				return target;
			}
		}
	}
};

helper.execChildProcess = function ( onError, onSuccess, cmd, options, events ) {
		var childProcess 	= require('child_process');
	try {
		var child = childProcess.exec( cmd, options||{}, ( error, stdout, stderr ) => {
			if (error) {
				onError(
					helper.newError(
						).Aux( error
						).Message( "helper.execChildProcess() error" + "\r\n" + 
							"Error message: <message>\r\n" +
							stdout
						).Stack( new Error().stack
						).Code( "E_EXECCHILDPROCESS"
					)
				);
			}
			else {
				onSuccess(stdout);
			}
		});
		for (var event in events) {
		 	child.on( event, events[event] );
		}
	}
	catch (error) {
		onError( 
			helper.newError(
				).Aux( error
				).Message( "helper.execChildProcess() error" + "\r\n" + 
					"Error message: <message>\r\n"
				).Stack( new Error().stack
				).Code( "E_EXECCHILDPROCESS"
			)
		);
	}
};

helper.cmdCount = function () {
	var i = 2;
	var count = 0;
	while (i < process.argv.length)  {
		if (!process.argv[i].startsWith("/") || process.argv[i].substr(0,2) == "//") {
			++count;
		}
		i++;
	}
	return count;
};

helper.cmdGet = function (index) {
	var i = 2;
	var count = 0;
	var cmd;
	while (i < process.argv.length) {
		if (process.argv[i].startsWith("//") || process.argv[i].substr(0,1) !== "/") {
			if (++count == index) {
				cmd = process.argv[i]
			}
		}
		++i;
	}
	return cmd;
};

helper.cmdSwitch = function (name) {
	var i = 2;
	var exist = false;
	if (name.substr(0,1) !== "/") {
		name = "/" + name;
	}
	name = name.toLowerCase();

	while (!exist && i < process.argv.length) {
		exist = (process.argv[i++].toLowerCase() == name)
	}

	return exist;
};

helper.cmdSwitchValue = function (name) {

	var i = 2;
	var value;
	var length;

	if (name.substr(0,1) !== "/") {
		name = "/" + name;
	}
	name 	= name.toLowerCase() + ":";
	length 	= name.length;

	while (i < process.argv.length) {
		if (process.argv[i].toLowerCase().substr( 0, length ) == name) {
			value = process.argv[i].substr( length );
			i = process.argv.length;
		}
		++i;
	}

	return value;
};

helper.newError = function ( message, code ) {
	return new CoreError( message, code );
};

helper.capitalize = function ( value, allwords ) {
	value += "";
	if (allwords) {
		var a = value.split(" ");
		value = "";
		for (var i = 0; i < a.length; i++) {
			value += helper.capitalize(a[i]);
			if (i < a.length-1) {
				value += " ";
			};
		};
		return value;
	}
	return value.substr(0,1).toUpperCase() + value.substr(1);
};

module.exports	= helper;

// ---------------------------------------------------------------------------------------------
class CoreError {
	constructor( message, code ) {

		this.name = DEFAULT_ERRORNAME;

		if (typeof message == "object") {
			if (message instanceof Error) { 
				this.name = message.name;
				this.__stack = message.stack;
				this.code = message.code||code||this.__solveErrorCode(message);
				this.message = message.message;
			}
			else {
				this.code = "E_SYNTAX";
				this.name = "SyntaxError";
				this.message = "Syntax error: helper.newError(). " +
								"First argument is not string or Error object.";
			}
		}

	    if (!this.__stack) {
        	this.__stack = (new Error()).stack.replace(/\n[^\n]*/,''); // remove one stack level:
	    }
	    this.__stack = this.__stack.replace( /\r?\n/g, "\r\n" );
		if (!this.message) {
	    	this.message = ""+(message||"");
		}
	    if (!this.code) {
	    	this.code = ""+(code||"");
	    }
	}

	__solveErrorCode(error) {
		if (!error.code && error.message && error.message.split(" ").length == 1) {
			return error.message;
		}
		else {
			return "E_SYSTEM";
		}
	}

	get stack()	{ 
		return this.__stack; 
	}

	Code(value) {
		this.code = ""+(value||"");
		return this;
	};

	Aux(error) {
		this.__aux = typeof error == "object" ? error : new Error( error + "" );
		this.__modify();
		return this;
	}
	
	__modify() {
		if (this.__aux && this.message) {
			this.message = this.message.replace( /\<message\>/g, this.__aux.message 
			  	).replace( /\<code\>/g, this.__aux.code 
			  	).replace( /\<stack\>/g, this.__aux.stack 
			);
			delete this.__aux;
		}
	}

	Message(value) {
		this.message = ""+(value||"");
		this.__modify();
		return this;
	}

	Stack(value) {
		this.__stack = ""+(value||"");
		return this;
	}

	Name(name) {
		if (name) {
			if (name.indexOf("Error") >= 0) {
				this.name = name;
			}
			else {
				this.name = helper.capitalize( name.toLowerCase()) + "Error";
			}
		}
		return this;
	}
}

// ---------------------------------------------------------------------------------------------
class Log {
	constructor(params = {}) {
		this.maxsize = params.maxsize||512*1024;
		this.folder = params.folder||__dirname+"/log";
		this.prefix = params.prefix||"LOG-";
		this.maxfilecount = params.maxfilecount||128;
		this.byteswritten = 0;
		this.filename = undefined;
		this.queue = [];
		this.queueHandlerInterval = 1000;
		this.handlingQueue = false;
	}

	start(onSuccess) {
		const q = helper.queue();
		q.add(
			() => {
				helper.folderEnsure(
					(error) => { this.handleError(error);}, 
					q.next(),
					this.folder 
				);
			},
			() => { this.solveLast( q.next()); },
			(filename) => {
				filename ? q.proceed(filename) : q.proceed(this.newFile());
			},
			(filename) => {
				this.filename = filename;
				this.queueHandler = setInterval(() => { this.peekQueue();}, this.queueHandlerInterval );
				onSuccess();
			}
		).proceed();
	}

	write( content ) {
		if (typeof content == "object") {
			content = require("util").inspect( content, { depth: 20 });
		}
		else {
			content = ""+content;
		}
		this.queue.push( this.timeStamp() + " " + content+"\r\n");
	}

	timeStamp() {
		let date = new Date();
		return date.getFullYear() + "-" 
			+ ("0"+(date.getMonth()+1)).substr(-2) + "-" 
			+ ("0"+date.getDate()).substr(-2) + " " + 
			+ ("0" + date.getHours()).substr(-2) + ":"
			+ ("0" + date.getMinutes()).substr(-2) + ":"
			+ ("0" + date.getSeconds()).substr(-2) + "."
			+ ("00" + date.getMilliseconds()).substr(-3);

	}

	peekQueue() {
		if (!this.handlingQueue) {
			const q = helper.queue();
			this.handlingQueue = true;
			while (this.queue.length) {
				((content) => {
					q.add(() => { this.writeToFile( q.next(), content); })
				})(this.queue.shift());
			}
			q.add(() => {this.handlingQueue = false;}).proceed();
		}
	}

	writeToFile( onSuccess, content ) {
		if (this.byteswritten + content.length > this.maxsize) {
			this.filename = this.newFile();
			this.byteswritten = 0;
		}
		fs.appendFile( this.filename, content, 
			(error) => {
				if (error) {
					this.handleError(error);
				}
				else {
					this.byteswritten += content.length;
				}
				onSuccess();
			}
		);
	}

	handleError(error) {
		console.log(error);
	}

	newPostFix() {
		return new Date().getTime().toString(36);
	}

	newFile() {
		this.validateFileCount();
		return this.folder + "\\" + this.prefix + this.newPostFix() + ".log";
	}

	isLogFile( file ) {
		const prefixLength = this.prefix.length;
		let ext = helper.fileExt(file.fullname).toLowerCase();
		return !file.directory && file.name.substr( 0, prefixLength ) == this.prefix && ext == "log";
	}

	validateFileCount() {
		const files = [];
		helper.folderEvalEx( 
			(error) => { this.handleError(error);}, 
			() =>  { 
				const q = helper.queue();
				while (files.length > this.maxfilecount) {
					((file) => {
						q.add(() => { 
							fs.unlink( file.fullname, (error) => { q.proceed(); });
						});
					})(files.shift());
				}
				q.add(()=>{}).proceed();
			},
			(file) => { this.isLogFile(file) && files.push(file); },
			this.folder
		);
	}

	solveLast( onSuccess ) {
		const prefixLength = this.prefix.length;
		let last, previousPostfix = "", size = 0;
		helper.folderEvalEx( 
			(error) => { this.handleError(error);}, 
			() =>  { this.byteswritten = size; onSuccess(last);},
			(file) => {
				if (this.isLogFile(file)) {
					let postfix = file.name.substr( prefixLength );
					if (previousPostfix) {
						if (postfix > previousPostfix) {
							last = file.fullname;
						}
					}
					else {
						last = file.fullname;
					}
					previousPostfix = postfix;
					size = file.size;
				}
			},
			this.folder
		);
	}
}

// ---------------------------------------------------------------------------------------------
class Pulse {
	constructor(p) {
		this.interval = p.interval||1000;
		this.filename = p.filename;
	}

	start( onError, onSuccess ) {
		if (!this.timer) {
			this.timer = setInterval( () => { this.write( onError ); }, this.interval );
		}
		onSuccess && onSuccess();
	}

	stop() {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = false;
		}
	}

	isBeating( onError, onSuccess ) {
		this.read( 
			(error) => {
				if (error.code == "E_NOCONTENT") {
					onSuccess(false);
				}
				else {
					onError(error);
				}
			}, 
			(hit) => { 
				onSuccess( hit.pid !== process.pid && (new Date().getTime()) - hit.updated < 3 * this.interval );
			}
		);
	}

	read( onError, onSuccess ) {
		helper.jsonReadEx( onError, onSuccess, this.filename, this.hit() );
	}

	write( onError, onSuccess ) {
		helper.jsonWrite( onError, onSuccess||(()=>{}), this.filename, this.hit() );
	}

	hit() {
		return { pid: process.pid, updated: (new Date().getTime()) };
	}
}

// ---------------------------------------------------------------------------------------------
class Cmds {
	constructor(p) {
		this.interval = p.interval||1000;
		this.commands = p.commands||{};
	}

	start( onError, onSuccess ) {
		if (!this.timer) {
			helper.folderEnsure( 
				onError, 
				() => {
					this.timer = setInterval( () => { this.exec( onError ); }, this.interval );
				},
				CMDS_FOLDER 
			);
		}
		onSuccess && onSuccess();
	}

	stop() {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = false;
		}
	}

	exec( onError ) {
		let files = [];
		helper.folderEvalEx( 
			this.onError,
			() =>  { 
				let q = helper.queue();
				files.forEach((file) => { 
					((file) => {
						q.add(() => { this.interpret( onError, q.next(), file.fullname ); });
					})( file );
				});
				q.add(()=>{}).proceed();
			},
			(file) => {
				let ext = helper.fileExt(file.fullname).toLowerCase();
				if (!file.directory && ext == "cmds") {
					files.push(file);
				}
			},
			CMDS_FOLDER
		);
	}

	interpret( onError, onSuccess, filename ) {
		const q = helper.queue();
		q.add(
			() => {	helper.jsonReadEx( onError, q.next(), filename, [] );},
			(json) => {
				fs.rename( filename, helper.setExt( filename, "bak" ),
					(error) => { error ? onError(error) : q.proceed(json); }
				);
			},
			(json) => {
				if (Array.isArray(json)) {
					const q2 = helper.queue();
					json.forEach((cmd) => {
						((cmd)=> {q2.add(() => { this.execCommand(onError, q2.next(),cmd);})})(cmd);
					});
					q2.add(q.next()).proceed();
				}
				else if (typeof json == "object") {
					this.execCommand( onError, q.next(), json );
				}
				
			},
			() => { onSuccess(); }
		).proceed();
	}

	execCommand( onError, onSuccess, cmd ) {
		// 	{ 
		// 		command: string[,
		// 		parameters: array]
		// 	}
		if (this.commands[cmd.command]) {
			this.commands[cmd.command]( cmd.parameters );
		}
	}
}

// ---------------------------------------------------------------------------------------------
class Queue {
	constructor() {
		this.index = 0;
		this.items = [];
		if (DEBUG_QUEUE) {
			this.__createdAt = new Error().stack.substr(5);
			this.__instance = parseInt((""+Math.random()).substr(2)).toString(36).substr(0,8);
		}
   	}

	__current() { 
		return this.items[this.index]; 
	}

	__currentindex() { 
		return this.items[this.index] ? this.items[this.index].__qindex : undefined; 
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
		if (this.__trace) {
			var message = "Queue";
			message += this.__instance ? " [" + this.__instance + "]" : "";
			message += " index before next(): " + this.index + " -> " + new Error().stack.substr(5);
			console.log( message );
		}
		return this.items[this.index++]; 
	}

	proceed() { 
		//var item = this.items[this.index++];
		var item = this.next();
		if (item) {
			item.apply( this, arguments );
		}
		else {
			console.log( "ERROR: EOF Queue. " + (this.__name ? " (" + this.__name + ")" : "") + (new Error().stack) );
			if (this.__createdAt) {
				console.log( "  Queue object [" + this.__instance + "] created " + this.__createdAt );
			}
		}
		return this;
	}

	reset() { 
		this.index = 0; 
		return this; 
	}
}	



import * as vscode from 'vscode';

const DECORATION_WORKSPACE: vscode.FileDecoration = new vscode.FileDecoration(
	'', 'Intent Manager Plugin', new vscode.ThemeColor('list.focusForeground')
);

const DECORATION_SIGNED: vscode.FileDecoration = new vscode.FileDecoration(
	'🔒', 'IntentType: Signed', new vscode.ThemeColor('list.deemphasizedForeground')
);

const DECORATION_UNSIGNED: vscode.FileDecoration =    new vscode.FileDecoration(
	'',	'IntentType: Unsigned',	new vscode.ThemeColor('list.warningForeground')
);

const DECORATION_MODULES: vscode.FileDecoration =    new vscode.FileDecoration(
	'☯', 'YANG Modules', new vscode.ThemeColor('list.warningForeground')
);

const DECORATION_RESOURCES: vscode.FileDecoration =    new vscode.FileDecoration(
	'📚', 'Resources', new vscode.ThemeColor('list.warningForeground')
);


const DECORATION_ALIGNED: vscode.FileDecoration =    new vscode.FileDecoration(
	'✅', 'Intent: Aligned', new vscode.ThemeColor('list.warningForeground')
);

const DECORATION_MISALIGNED: vscode.FileDecoration =    new vscode.FileDecoration(
	'💔', 'Intent: Misaligned', new vscode.ThemeColor('list.errorForeground')
);

const DECORATION_INTENTS: vscode.FileDecoration =    new vscode.FileDecoration(
	'', 'Instances', new vscode.ThemeColor('list.highlightForeground')
);

const DECORATION_VIEWS: vscode.FileDecoration =    new vscode.FileDecoration(
	'', 'UI Customization', new vscode.ThemeColor('list.highlightForeground')
);

let myStatusBarItem: vscode.StatusBarItem;
myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
myStatusBarItem.command = 'nokia-intent-manager.intentStatus';

/*
	Class implementing FileSystemProvider for Intent Manager
*/

export class IntentManagerProvider implements vscode.FileSystemProvider, vscode.FileDecorationProvider {
	static scheme = 'im';

	extensionPath: string;
	extensionUri: vscode.Uri;

	nspAddr: string;
	username: string;
	password: string|undefined;
	port: string;
	authToken: any|undefined;

	timeout: number;
	fileIgnore: Array<string>;

	nspVersion: string | undefined;
	secretStorage: vscode.SecretStorage;

	serverLogs: vscode.OutputChannel;
	pluginLogs: vscode.LogOutputChannel;

	matchIntentType: RegExp;

	intentTypes: {
		[key: string]: {
			signed: boolean;
			timestamp: number;
			data:    {[key: string]: any};
			intents: {[target: string]: Object};
			desired: {[target: string]: string};  // intent desired state: active, suspend, delete, saved, planned, deployed
			aligned: {[target: string]: boolean}; // intent aligned or misaligned
			views:   {[filename: string]: string};	
		}
	}

	public onDidChangeFileDecorations: vscode.Event<vscode.Uri | vscode.Uri[] | undefined>;
    private _eventEmiter: vscode.EventEmitter<vscode.Uri | vscode.Uri[]>;

	/**
	 * Create IntentManagerProvider
	 * 
	 * @param {string} nspAddr IP address or hostname of NSP (from extension settings)
	 * @param {string} username NSP user
	 * @param {vscode.SecretStorage} secretStorage used to retrieve NSP password
	 * @param {string} port NSP port number
	 * @param {number} timeout in seconds
	 * @param {fileIgnore} fileIgnore hide intent-types with provided labels to keep filesystem clean
	 * 
	 */	
	
	constructor (
		nspAddr: string,
		username: string,
		secretStorage: vscode.SecretStorage,
		port: string,
		timeout: number,
		fileIgnore: Array<string>,
		extensionPath: string,
		extensionUri: vscode.Uri
	) {
		console.debug("IntentManagerProvider("+nspAddr+")");

		this.nspAddr = nspAddr;
		this.username = username;
		this.secretStorage = secretStorage;
		this.port = port;
		this.timeout = timeout;
		this.fileIgnore = fileIgnore;
		this.extensionPath = extensionPath;
		this.extensionUri = extensionUri;

		this.nspVersion = undefined;

		this.serverLogs = vscode.window.createOutputChannel('nsp-server-logs/intents', 'log');
		this.pluginLogs = vscode.window.createOutputChannel('nsp-intent-manager-plugin', {log: true});

		this.authToken = undefined;

		this.matchIntentType = /^([a-z][A-Za-z_\-]+[_\-]v\d+)$/;
		this.intentTypes = {};

		this._eventEmiter = new vscode.EventEmitter();
        this.onDidChangeFileDecorations = this._eventEmiter.event;
	}

	/**
	 * Graceful disposal of IntentManagerProvider.
	 * 
	 * Method disconnects from NSP (revokes auth-token) and cleans-up variables.
	 */	

	dispose() {
		console.log('disposing IntentManagerProvider()');

		this._revokeAuthToken();
		this.serverLogs.dispose();
		this.pluginLogs.dispose();
	}

	// --- SECTION: PRIVATE METHODS -----------------------------------------

	/**
	 * Retrieves auth-token from NSP. Implementation uses promises to ensure that only
	 * one token is used at any given moment of time. The token will automatically be
	 * revoked after 10min.
	 */	

	private async _getAuthToken(): Promise<void> {
        if (this.authToken) {
            if (!(await this.authToken)) {
                this.authToken = undefined;
            }
        }

		this.password = await this.secretStorage.get("nsp_im_password");

        if (this.password && !this.authToken) {
            this.authToken = new Promise((resolve, reject) => {
                this.pluginLogs.warn("No valid auth-token; Getting a new one...");
                process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

                const fetch = require('node-fetch');
                const base64 = require('base-64');

                const timeout = new AbortController();
                setTimeout(() => timeout.abort(), this.timeout);

                const url = "https://"+this.nspAddr+"/rest-gateway/rest/api/v1/auth/token";
                fetch(url, {
                    method: "POST",
                    headers: {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-cache',
                        'Authorization': 'Basic ' + base64.encode(this.username+ ":" +this.password)
                    },
                    body: '{"grant_type": "client_credentials"}',
                    signal: timeout.signal
                }).then((response:any) => {
                    this.pluginLogs.info("POST", url, response.status);
                    if (!response.ok) {
						vscode.window.showErrorMessage("IM: NSP Auth Error");
                        reject("Authentication Error!");
                        throw new Error("Authentication Error!");
                    }
                    return response.json();
                }).then((json:any) => {
                    this.pluginLogs.info("new authToken:", json.access_token);
                    resolve(json.access_token);
                    // automatically revoke token after 10min
                    setTimeout(() => this._revokeAuthToken(), 600000);
                }).catch((error:any) => {
                    this.pluginLogs.error(error.message);
					vscode.window.showWarningMessage("NSP is not reachable");
                    resolve(undefined);
                });
            });
        }
    }

	/**
	 * Gracefully revoke NSP auth-token.
	 */	

	private async _revokeAuthToken(): Promise<void> {
		if (this.authToken) {
			const token = await this.authToken;
			this.pluginLogs.debug("_revokeAuthToken("+token+")");
			this.authToken = undefined;

			const fetch = require('node-fetch');
			const base64 = require('base-64');
		
			const url = "https://"+this.nspAddr+"/rest-gateway/rest/api/v1/auth/revocation";
			fetch(url, {
				method: "POST",
				headers: {
					"Content-Type":  "application/x-www-form-urlencoded",
					"Authorization": "Basic " + base64.encode(this.username+ ":" +this.password)
				},
				body: "token="+token+"&token_type_hint=token"
			})
			.then((response:any) => {
				this.pluginLogs.info("POST", url, response.status);
			});
		}
	}

	/**
	 * Private wrapper method to call NSP APIs. Method sets http request timeout.
	 * Common error handling and logging is centralized here.
	 * 
	 * @param {string} url API endpoint for http request
	 * @param {any} options HTTP method, header, body
	 */	

	private async _callNSP(url:string, options:any): Promise<void> {
		const fetch = require('node-fetch');

		const timeout = new AbortController();
        setTimeout(() => timeout.abort(), this.timeout);
		options['signal'] = timeout.signal;

		if (!options.hasOwnProperty("headers")) {
			await this._getAuthToken();
			const token = await this.authToken;
			if (!token)
				throw vscode.FileSystemError.Unavailable('NSP is not reachable');

			if (url.startsWith('/restconf'))
				options.headers = {
					"Content-Type": "application/yang-data+json",
					"Accept": "application/yang-data+json",
					"Authorization": "Bearer " + token
				}
			else
				options.headers = {
					'Content-Type': "application/json",
					'Accept': "application/json",	
					"Authorization": "Bearer " + token
				}
		}

		if (!url.startsWith('https://')) {
			if (["443",""].includes(this.port))
				url = "https://"+this.nspAddr+url;
			else if (url.startsWith('/logviewer'))
				url = "https://"+this.nspAddr+url;
			else if (this.port != "8545")
				url = "https://"+this.nspAddr+":"+this.port+url;
			else if (url.startsWith('/restconf'))
				url = "https://"+this.nspAddr+":8545"+url;
			else
				// in case of /mdt/rest/...
				url = "https://"+this.nspAddr+":8547"+url;
		}

		const startTS = Date.now();
		let response: any = new Promise((resolve, reject) => {
		 	fetch(url, options).then((response:any) => {
				response.clone().text().then((body:string) => {
					const duration = Date.now()-startTS;

					if ("body" in options)
						this.pluginLogs.info(options.method, url, options.body, "finished within", duration, "ms");
					else
						this.pluginLogs.info(options.method, url, "finished within", duration, "ms");

					if (response.status >= 400)
						this.pluginLogs.warn("NSP response:", response.status, body);
					else if ((body.length < 1000) || (this.pluginLogs.logLevel == vscode.LogLevel.Trace))
						this.pluginLogs.info("NSP response:", response.status, body);
					else
						this.pluginLogs.info("NSP response:", response.status, body.substring(0,1000)+'...');
				});
				return response;
			})
			.then((response:any) => {
				resolve(response);
			})
			.catch((error:any) => {
				this.pluginLogs.error(options.method, url, "failed with", error.message);
				vscode.window.showWarningMessage("NSP is not reachable");
				resolve(undefined)
			});
		});
		return response;
	}

	/**
	 * Cross launch NSP WebUI.
	 * Works with NSP New Navigation (since 23.11)
	 * 
	 * @param {string} url WebUI endpoint to open
	 */

	private async _openWebUI(url:string): Promise<void> {
		vscode.env.openExternal(vscode.Uri.parse("https://"+this.nspAddr+url));
	}

	/**
	 * Retrieve and store NSP release in this.nspVersion.
	 * Release information will be shown to vsCode user.
	 * 
	 * Note: currently used to select OpenSearch API version
	 */	

	private async _getNSPversion(): Promise<void> {
		this.pluginLogs.info("Requesting NSP version");
		const url = "https://"+this.nspAddr+"/internal/shared-app-banner-utils/rest/api/v1/appBannerUtils/release-version";

		let response: any = await this._callNSP(url, {method: "GET"});
		if (!response)
			throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
		if (!response.ok)
			throw vscode.FileSystemError.Unavailable('Getting NSP release failed');
		
		let json = await response.json();

		const version = json["response"]["data"]["nspOSVersion"];		
		this.nspVersion = version.match(/\d+\.\d+\.\d+/)[0];
		vscode.window.showInformationMessage("NSP version: "+version);
	}

	/**
	 * Get one or more URIs, dependend on how extension command was triggered.
	 * If triggered from virtual file-system, multi-select is supported.
	 * If launched via icon or command pallete, active editor is used.
	 * 
	 * @param {any[]} args context used when command was issued
	 */	

	private _getUriList(args:any[]): vscode.Uri[] {
		if (args.length === 2 && Array.isArray(args[1]))
			return args[1];

		if (args.length>0 && args[0] instanceof vscode.Uri)
			return [args[0]];

		if (vscode.window.activeTextEditor)
			return [vscode.window.activeTextEditor.document.uri];

		return [];
	}

	/**
	 * Convert RESTCONF model-path into human-friendly format, while using HTML tag (em).
	 * 
	 * Example:
	 *   input:  /nokia-conf:/configure/port=1%2F1%2Fc3%2F1/description
	 *   output: /nokia-conf:/configure/port=<em>1/1/c3/1</em>/description
	 *  
	 * @param {string} modelpath RESTCONF compliant model-path
	 * @returns {string} model-path in HTML format
	 */	

	private _modelPathHTML(modelpath: string): string {
		const parts = modelpath.split('/');
		const cparts = [];
		for (const part of parts) {
			const kvp = part.split('=');
			if (kvp.length===2)
				cparts.push(kvp[0]+"=<em>"+decodeURIComponent(kvp[1])+"</em>");
			else
				cparts.push(part);
		}
		return cparts.join('/');
	}

	/**
	 * Create webview to display audit report. Webview is rendered from nunjucks
	 * template (Jinja2) and contains HTML, CSS and JavaScript, therefore
	 * webview panel has scripting enabled.
	 *  
	 * @param {string} intent_type Intent-type name
	 * @param {string} target Intent target
	 * @param {{[key: string]: any}} report Audit report returned from Intent Manager
	 */	

	private async _auditReport(intent_type: string, target: string, report: {[key: string]: any}): Promise<void>  {
		const nunjucks = require("nunjucks");
		const templatePath = vscode.Uri.joinPath(this.extensionUri, 'media', 'report.html.njk');

		if (report.hasOwnProperty("misaligned-attribute"))
				for (let object of report["misaligned-attribute"])
					object["attribute-name"] = this._modelPathHTML(object["attribute-name"]);

		if (report.hasOwnProperty("misaligned-object"))
			for (let object of report["misaligned-object"])
				object["object-id"] = this._modelPathHTML(object["object-id"]);

		if (report.hasOwnProperty("undesired-object"))
			for (let object of report["undesired-object"])
				object["object-id"] = this._modelPathHTML(object["object-id"]);

		const panel = vscode.window.createWebviewPanel('auditReport', 'Audit '+intent_type+'/'+target, vscode.ViewColumn.Active, {enableScripts: true});
		panel.webview.html = nunjucks.render(templatePath.fsPath, {report: report});
		this.pluginLogs.info(panel.webview.html);
	}

	/**
	 * Extract error message from RESTCONF response and raise exception.
	 *  
	 * @param {string} errmsg Provide information about what failed
	 * @param {{[key: string]: any}} response HTTP response to extract error message
	 */		

	private _raiseRestconfError(errmsg: string, response: {[key: string]: any}) {
		if (Object.keys(response).includes("ietf-restconf:errors")) {
			while (response && (Object.keys(response)[0]!="error"))
				response = response[Object.keys(response)[0]];

			throw vscode.FileSystemError.Unavailable(errmsg+"\n"+response["error"][0]["error-message"]);
		}
		throw vscode.FileSystemError.Unavailable(errmsg);
	}

	/**
	 * Extract error message from RESTCONF response and show as warning popup.
	 *  
	 * @param {string} errmsg Provide information about what failed
	 * @param {{[key: string]: any}} response HTTP response to extract error message
	 */		

	private _printRestconfError(errmsg: string, response: {[key: string]: any}) {
		if (Object.keys(response).includes("ietf-restconf:errors")) {
			while (response && (Object.keys(response)[0]!="error"))
				response = response[Object.keys(response)[0]];

			vscode.window.showWarningMessage(errmsg+"\n"+response["error"][0]["error-message"]);
		} else
			vscode.window.showWarningMessage(errmsg);
	}

	// --- SECTION: vscode.FileSystemProvider implementation ----------------

	/**
	 * vsCode.FileSystemProvider method to read directory entries.
	 * 
	 * IntentManagerProvider uses this as main method to pull data from IM
	 * while storing it in memory (as cache).
	 * 
	 * @param {vscode.Uri} uri URI of the folder to retrieve from NSP
	 * 
	 */	

	async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		const path = uri.toString();
		this.pluginLogs.debug("readDirectory("+path+")");

		let result:[string, vscode.FileType][] = [];

		if (!this.nspVersion)
			this._getNSPversion();

		if (path === "im:/") {
			// readDirectory() was executed with IM root folder
			//
			// Function will get and return the list of all intent-types
			// while labels to ignore are applied as blacklist.

			const url = "/restconf/operations/ibn-administration:search-intent-types";
			const body = {"ibn-administration:input": {"page-number": 0, "page-size": 1000}};
			let response: any = await this._callNSP(url, {method: "POST", body: JSON.stringify(body)});

			if (!response)
				throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
			if (!response.ok)
				throw vscode.FileSystemError.Unavailable('Get list of intent-types failed');

			let json = await response.json();
			if (json["ibn-administration:output"]["total-count"]>1000) {
				vscode.window.showWarningMessage("NSP has more than 1000 intent-types. Only showing the first 1000.");
			}

			let intentTypes = json["ibn-administration:output"]["intent-type"];
			for (const label of this.fileIgnore) {
				// apply blacklist for label(s) provided in extension settings
				intentTypes = intentTypes.filter((entry:any) => !entry.label.includes(label));
			}
			result = intentTypes.map((entry: { name: string; version: string; }) => [entry.name+"_v"+entry.version, vscode.FileType.Directory]);

			// Create missing intentType entries in cache
			for (const entry of intentTypes) {
				const filename = entry.name+"_v"+entry.version;
				if (!this.intentTypes.hasOwnProperty(filename))
					this.intentTypes[filename] = {
						signed:  entry.label.includes('ArtifactAdmin'),
						timestamp: Date.now(), // We don't have the real timestamp yet!
						data:    {},
						intents: {},
						aligned: {},
						desired: {},
						views:   {}
					}
			}
		} else {
			const parts = path.split('/').map(decodeURIComponent);
			const intent_type = parts[1].split('_v')[0];
			const intent_type_version = parts[1].split('_v')[1];

			if (parts.length===2) {
				// readDirectory() was executed on folder "im:/{intent-type}_v{version}".
				// Get intent-type defintion using IM API to create/update cache entry.

				const url = "/restconf/data/ibn-administration:ibn-administration/intent-type-catalog/intent-type="+encodeURIComponent(intent_type)+","+intent_type_version;

				let response: any = await this._callNSP(url, {method: "GET"});
				if (!response)
					throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
				if (!response.ok)
					throw vscode.FileSystemError.Unavailable('Get intent-type details failed');

				let json = await response.json();
				let data = json["ibn-administration:intent-type"];

				if (this.intentTypes.hasOwnProperty(parts[1])) {
					// update intent-type cache entry with data and timestamp
					this.intentTypes[parts[1]].data = data;
					this.intentTypes[parts[1]].timestamp = Date.parse(data.date);
				} else
					throw vscode.FileSystemError.Unavailable("internal issue, cache not initialized");

				// intent-type folder content

				result.push(['yang-modules', vscode.FileType.Directory]);
				result.push(['intent-type-resources', vscode.FileType.Directory]);
				result.push(['views', vscode.FileType.Directory]);
				result.push(['intents', vscode.FileType.Directory]);
				result.push(["meta-info.json", vscode.FileType.File]);
				if (data["mapping-engine"]==="js-scripted")
					result.push(["script-content.js", vscode.FileType.File]);
				else
					result.push(["script-content.mjs", vscode.FileType.File]);
			}

			else if (parts[2]==='intents') {
				// readDirectory() was executed with 3rd level folder for intents:
				// "im:/{intent-type}_v{version}/intents/"
				//
				// Function will get and return the list of all intents for
				// the selected intent-type/version

				const url = "/restconf/operations/ibn:search-intents";
				const body = {
					"ibn:input": {
						"filter": {
							"config-required": false,
							"intent-type-list": [
								{
									"intent-type": intent_type,
									"intent-type-version": intent_type_version
								}
							]
						},							
						"page-number": 0,
						"page-size": 1000
					}
				};

				let response: any = await this._callNSP(url, {method: "POST", body: JSON.stringify(body)});
				if (!response)
					throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
				if (!response.ok)
					throw vscode.FileSystemError.Unavailable('Get list of intents failed');

				let json = await response.json();
				const output = json["ibn:output"];

				if (output["total-count"]>1000)
					vscode.window.showWarningMessage("More than 1000 intents found. Only showing the first 1000.");

				if (output.intents.hasOwnProperty('intent')) {
					this.intentTypes[parts[1]].intents = output.intents.intent.reduce((intents: any, item: { [key: string]: any; target: string; }) => {
						return {...intents, [item.target]: item["intent-specific-data"]};
					}, {});
					this.intentTypes[parts[1]].aligned = output.intents.intent.reduce((intents: any, item: { [key: string]: any; target: string; }) => {
						return {...intents, [item.target]: item["aligned"]==="true"};
					}, {});
					this.intentTypes[parts[1]].desired = output.intents.intent.reduce((intents: any, item: { [key: string]: any; target: string; }) => {
						if (item["required-network-state"] === "custom")
							return {...intents, [item.target]: item["custom-required-network-state"]};
						else
							return {...intents, [item.target]: item["required-network-state"]};
					}, {});					
					result = output.intents.intent.map((entry: { target: string; }) => [entry.target, vscode.FileType.File]);
				} else {
					this.intentTypes[parts[1]].intents = {};
				}
			}

			else if (parts[2]==='yang-modules') {
				result = this.intentTypes[parts[1]].data.module.map((entry: { name: string; }) => [entry.name, vscode.FileType.File]);
			}

			else if (parts[2]==='views') {
				// readDirectory() was executed with 3rd level folder for views:
				// "im:/{intent-type}_v{version}/views/"
				//
				// Function will get and return the list of all views for
				// the selected intent-type/version

				const url = "/restconf/data/nsp-intent-type-config-store:intent-type-config/intent-type-configs="+encodeURIComponent(intent_type)+","+intent_type_version;
				let response: any = await this._callNSP(url, {method: "GET"});
				if (!response)
					throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
				if (!response.ok)
					throw vscode.FileSystemError.Unavailable('Get list of views failed');
	
				let json = await response.json();

				this.intentTypes[parts[1]].views={};
				for (const view of json["nsp-intent-type-config-store:intent-type-configs"][0]["views"]) {
					result.push([view.name+".viewConfig", vscode.FileType.File]);
					this.intentTypes[parts[1]].views[view.name+".viewConfig"] = JSON.parse(view.viewconfig);

					result.push([view.name+".schemaForm", vscode.FileType.File]);
					this.intentTypes[parts[1]].views[view.name+".schemaForm"] = JSON.parse(view.schemaform);
				}
			}

			else if (parts[2]==='intent-type-resources') {
				const intentTypeData = this.intentTypes[parts[1]].data;

				if (intentTypeData.hasOwnProperty('resource')) {
					let folders = new Set<string>();
					const prefix = parts.slice(3).join("/")+'/';

					for (const resource of intentTypeData.resource)
						if (parts.length===3 || resource.name.startsWith(prefix)) {
							const relparts = resource.name.split('/').slice(parts.length - 3);
							
							if (relparts.length===1)
								result.push([relparts[0], vscode.FileType.File]);
							else
								folders.add(relparts[0])
						}

					for (const folder of folders)
						result.push([folder, vscode.FileType.Directory]);
				}
			}

			else {
				// unknown folder, return nothing
			}
		}

		this.pluginLogs.info("readDirectory("+path+") returns", JSON.stringify(result));
		return result;
	}

	/**
	 * vsCode.FileSystemProvider method to read file content into
	 * an editor window.
	 * 
	 * IntentManagerProvider will not reach out to NSP to read files,
	 * instead is uses the copy stored in memory.
	 * 
	 * @param {vscode.Uri} uri URI of the folder to retrieve from NSP
	 * 
	 */

	async readFile(uri: vscode.Uri): Promise<Uint8Array> {
		const path = uri.toString();
		this.pluginLogs.debug("readFile("+path+")");

		const parts = path.split('/').map(decodeURIComponent);
		const intent_type = parts[1].split('_v')[0];
		const intent_type_version = parts[1].split('_v')[1];

		if (parts[2]==="meta-info.json") {
			// meta is deep-copy of cache-entry
			let meta = JSON.parse(JSON.stringify(this.intentTypes[parts[1]].data));

			meta["intent-type"] = intent_type;
			meta["version"] = intent_type_version;
			let forCleanup = [
				"default-version",
				"supports-health",
				"skip-device-connectivity-check",
				"support-aggregated-request",
				"resource",
				"name",
				"date",
				"module",
				"script-content"
			]
			for (const parameter of forCleanup) delete meta[parameter];
			
			return Buffer.from(JSON.stringify(meta, null, "  "));
		}

		if (parts[2].startsWith('script-content'))
			return Buffer.from(this.intentTypes[parts[1]].data["script-content"]);

		if (parts[2]==="yang-modules") {
			for (const module of this.intentTypes[parts[1]].data.module)
				if (module.name === parts[3])
					return Buffer.from(module["yang-content"]);
		}

		if (parts[2]==="intent-type-resources") {
			for (const resource of this.intentTypes[parts[1]].data.resource)
				if (resource.name === parts.slice(3).join("/"))
					return Buffer.from(resource.value);
		}

		if (parts[2]==="intents") {
			if (this.intentTypes[parts[1]].intents.hasOwnProperty(parts[3]))
				return Buffer.from(JSON.stringify(this.intentTypes[parts[1]].intents[parts[3]], null, "  "));
		}

		if (parts[2]==="views")
			return Buffer.from(JSON.stringify(this.intentTypes[parts[1]].views[parts[3]], null, "  "));

		throw vscode.FileSystemError.FileNotFound('Unknown file!');
	}

	/**
	 * vsCode.FileSystemProvider method to get details about files and folders.
	 * Returns type (file/directory), timestamps (create/modify), file size,
	 * and access permissions (read/write).
	 * 
	 * @param {vscode.Uri} uri URI of the folder to retrieve from NSP
	 * 
	 */	

	async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
		const path = uri.toString();
		this.pluginLogs.debug("stat("+path+")");
		const parts = path.split('/').map(decodeURIComponent);

		if (path==="im:/")
			return {type: vscode.FileType.Directory, ctime: 0, mtime: Date.now(), size: 0, permissions: vscode.FilePermission.Readonly};

		if (this.intentTypes.hasOwnProperty(parts[1])) {
			const timestamp = this.intentTypes[parts[1]].timestamp;
			const access = this.intentTypes[parts[1]].signed? vscode.FilePermission.Readonly : undefined;

			if (parts.length===2)
				return { type: vscode.FileType.Directory, ctime: 0, mtime: timestamp, size: 0 }
			
			if (parts[2]==="yang-modules") {
				if (parts.length===3)
					return {type: vscode.FileType.Directory, ctime: 0, mtime: timestamp, size: 0, permissions: vscode.FilePermission.Readonly};

				for (const module of this.intentTypes[parts[1]].data.module)
					if (module.name === parts[3])
						return {type: vscode.FileType.File, ctime: 0, mtime: timestamp, size: 0, permissions: access};

				this.pluginLogs.warn("Module "+parts[3]+" not found!")				
			}
	
			if (parts[2]==="intent-type-resources") {
				const resourcename = parts.slice(3).join("/");
				if (parts.length===3) {
					return {type: vscode.FileType.Directory, ctime: 0, mtime: timestamp, size: 0, permissions: vscode.FilePermission.Readonly};
				}
				for (const resource of this.intentTypes[parts[1]].data.resource) {
					if (resource.name === resourcename)
						return {type: vscode.FileType.File, ctime: 0, mtime: timestamp, size: 0, permissions: access};
					if (resource.name.startsWith(resourcename))
						return {type: vscode.FileType.Directory, ctime: 0, mtime: timestamp, size: 0, permissions: vscode.FilePermission.Readonly};
				}
				this.pluginLogs.warn("Resource "+resourcename+" not found!")
			}
	
			if (parts[2]==="views") {
				if (parts.length===3)
					return {type: vscode.FileType.Directory, ctime: 0, mtime: timestamp, size: 0, permissions: vscode.FilePermission.Readonly};

				if (this.intentTypes[parts[1]].views.hasOwnProperty(parts[3]))
					if (parts[3].endsWith(".viewConfig"))
						return {type: vscode.FileType.File, ctime: 0, mtime: timestamp, size: 0};
					else
						return {type: vscode.FileType.File, ctime: 0, mtime: timestamp, size: 0, permissions: vscode.FilePermission.Readonly};

				this.pluginLogs.warn("View "+parts[3]+" not found!");
			}

			else if (parts[2]==="intents") {
				if (parts.length===3)
					return {type: vscode.FileType.Directory, ctime: 0, mtime: Date.now(), size: 0, permissions: vscode.FilePermission.Readonly};
				else if (this.intentTypes[parts[1]].intents.hasOwnProperty(parts[3]))
					return {type: vscode.FileType.File, ctime: 0, mtime: Date.now(), size: 0};
				else
					throw vscode.FileSystemError.FileNotFound('Unknown resouce!');
			}
	
			if (parts[2]==="meta-info.json" || parts[2].startsWith('script-content.'))
				return {type: vscode.FileType.File, ctime: 0, mtime: timestamp, size: 0, permissions: access};
		}
	
		// this.pluginLogs.warn('Unknown resource', uri.toString());
		throw vscode.FileSystemError.FileNotFound('Unknown resouce!');
	}

	/**
	 * vsCode.FileSystemProvider method to create or update files in  NSP virtual filesystem
	 * for Intent Manager. Support intent-types, intents and views.
	 * 
	 * @param {vscode.Uri} uri URI of the file to create/update
	 * @param {Uint8Array} content content of the file
	 * @param {Object} options allow/enforce to create/overwrite
	 */	

	async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }): Promise<void> {
		const path = uri.toString();
		this.pluginLogs.debug("writeFile("+path+")");

		const parts = path.split('/').map(decodeURIComponent);
		const intent_type = parts[1].split('_v')[0];
		const intent_type_version = parts[1].split('_v')[1];

		if (this.intentTypes.hasOwnProperty(parts[1])) {
			// Note: We can only write files if the intent-type exists and is loaded.
			if (parts[2]==="intents") {
				const intent_target = parts[3];

				if (this.intentTypes[parts[1]].intents.hasOwnProperty(intent_target)) {
					this.pluginLogs.info("update intent", intent_type, intent_target);
					const url = "/restconf/data/ibn:ibn/intent="+encodeURIComponent(intent_target)+","+encodeURIComponent(intent_type)+"/intent-specific-data";
					const body = {"ibn:intent-specific-data": JSON.parse(content.toString())};
					let response: any = await this._callNSP(url, {method: "PUT", body: JSON.stringify(body)});
					if (!response)
						throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
					if (!response.ok)
						this._raiseRestconfError("Update intent failed!", await response.json());
				} else {
					this.pluginLogs.info("create new intent", intent_type, intent_target);

					let intent : string | undefined = content.toString();
					if (!intent) {
						const value = 
						intent = await vscode.window.showInputBox({
							prompt: "Enter intent-specific data",
							title: "Create new intent",
							value: '{"'+intent_type+':'+intent_type+'": { [INTENT SPECIFIC DATA] }}',
							valueSelection: [intent_type.length*2+8, intent_type.length*2+30]
						});
					}
					if (!intent)
						throw vscode.FileSystemError.Unavailable('Create intent failed');

					const url = "/restconf/data/ibn:ibn";
					const body = {
						"ibn:intent": {
							"ibn:intent-specific-data": JSON.parse(intent),
							"target": intent_target,
							"intent-type": intent_type,
							"intent-type-version": intent_type_version,
							"required-network-state": "active"
						}
					};
					let response: any = await this._callNSP(url, {method: "POST", body: JSON.stringify(body)});
					if (!response)
						throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
					if (!response.ok)
						this._raiseRestconfError("Create intent failed!", await response.json());
				}

				this.intentTypes[parts[1]].intents[intent_target] = content.toString();
		
				await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
				vscode.window.showInformationMessage("Succesfully uploaded");
				this._eventEmiter.fire(uri);
			}

			else if (parts[2]==="views") {
				let viewname = parts[3];
				let viewjson = content.toString();

				if (viewname.endsWith(".schemaForm")) {
					throw vscode.FileSystemError.Unavailable('You can only upload viewConfig file! SchemaForm is auto-generated.');
				}
				if (viewname.endsWith(".viewConfig")) {
					viewname = viewname.slice(0,-11);
				} else {
					// file-ext ".viewConfig" will automatically be added
				}

				if (!viewjson) {
					// vsCode user has execute "New File..."
					// initialize with empty JSON to pass NSP validation
					viewjson = "{}";
				}

				const url = "/restconf/data/nsp-intent-type-config-store:intent-type-config/intent-type-configs="+encodeURIComponent(intent_type)+","+intent_type_version;
				const body = {
					"nsp-intent-type-config-store:intent-type-configs":[{
						"views": [{
							"name": viewname,
							"viewconfig": viewjson
						}]
					}]
				};
				let response: any = await this._callNSP(url, {method: "PATCH", body: JSON.stringify(body)});
				if (!response)
					throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
				if (!response.ok)
					this._raiseRestconfError("Save viewConfig failed!", await response.json());
			}

			else {
				let data : {[key: string]: any} = {};

				if (parts[2]==="meta-info.json") {
					data = JSON.parse(content.toString());

					// adding back module, resource, script-content
					data.module = this.intentTypes[parts[1]].data.module;
					data.resource = this.intentTypes[parts[1]].data.resource;
					data['script-content'] = this.intentTypes[parts[1]].data['script-content'];

					data.name = intent_type;
					data.version = intent_type_version;

					delete data["intent-type"];
				} else {
					// deep-copy of what we've got in the cache
					data = JSON.parse(JSON.stringify(this.intentTypes[parts[1]].data));

					// update data based on file provided
					if (parts[2].startsWith("script-content")) {
						data['script-content']=content.toString();
					}
					else if (parts[2]==="intent-type-resources") {
						let updated = false;
						const resourcename = parts.slice(3).join("/");
						for (var resource of data.resource) {
							if (resource.name === resourcename) {
								resource.value=content.toString();
								updated = true;
							}
						}
						if (!updated) {
							data.resource.push({name: resourcename, value: content.toString()});
						}
					}
					else if (parts[2]==="yang-modules") {
						let updated = false;
						for (var module of data.module) {
							if (module.name === parts[3]) {
								module['yang-content']=content.toString();
								updated = true;
							}
						}
						if (!updated) {
							data.module.push({name: parts[3], "yang-content": content.toString()});
						}
					}

					let forCleanup = ["default-version"];
					for (const parameter of forCleanup) delete data[parameter];		
				}

				let url = "/restconf/data/ibn-administration:ibn-administration/intent-type-catalog/intent-type="+decodeURIComponent(intent_type)+","+decodeURIComponent(intent_type_version);
				let response: any = await this._callNSP(url, {method: "PUT", body: JSON.stringify({"ibn-administration:intent-type": data})});
				if (!response)
					throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
				if (!response.ok)
					this._raiseRestconfError("Save intent-type failed!", await response.json());

				this.intentTypes[parts[1]] = JSON.parse(JSON.stringify(data));
			}
		
			await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
			vscode.window.showInformationMessage("Succesfully saved file");
		} else {
			throw vscode.FileSystemError.Unavailable("Save file failed! Unknown intent-type!");
		}
	}

	/**
	 * vsCode.FileSystemProvider method to delete files in  NSP virtual filesystem
	 * for Intent Manager. Support intent-types, intents and views.
	 * 
	 * @param {vscode.Uri} uri URI of the file to delete
	 */	

	async delete(uri: vscode.Uri): Promise<void> {
		const path = uri.toString();
		this.pluginLogs.debug("delete("+path+")");

		const parts = path.split('/').map(decodeURIComponent);
		const intent_type = parts[1].split('_v')[0];
		const intent_type_version = parts[1].split('_v')[1];

		if (this.intentTypes.hasOwnProperty(parts[1])) {
			if (parts.length===3) {
				throw vscode.FileSystemError.NoPermissions("Deletion of "+path+" is prohibited");
			}

			let url = "/restconf/data/ibn-administration:ibn-administration/intent-type-catalog/intent-type="+encodeURIComponent(intent_type)+","+intent_type_version;

			if (parts.length>3) {
				if (parts[2]==="intents") {
					const intent_target = parts[3];
					url = "/restconf/data/ibn:ibn/intent="+encodeURIComponent(intent_target)+","+encodeURIComponent(intent_type);
					this.pluginLogs.info("delete intent", intent_type, intent_target);
				} else if (parts[2]==="intent-type-resources") {
					const resourcename = parts.slice(3).join("/");
					url = url+"/resource="+encodeURIComponent(resourcename);
					this.pluginLogs.info("delete resource", intent_type, resourcename);
				} else if (parts[2].includes("yang-modules")) {
					const modulename = parts[3];
					url = url+"/module="+encodeURIComponent(modulename);
					this.pluginLogs.info("delete module", intent_type, modulename);
				} else if (parts[2].includes("views")) {
					const viewname = parts[3].slice(0,-11); // remove .viewConfig extension
					url = "/restconf/data/nsp-intent-type-config-store:intent-type-config/intent-type-configs="+encodeURIComponent(intent_type)+","+intent_type_version+"/views="+encodeURIComponent(viewname);
					this.pluginLogs.info("delete view", intent_type, viewname);
				}
			} else this.pluginLogs.info("delete intent-type", intent_type);

			let response: any = await this._callNSP(url, {method: "DELETE"});
			if (!response)
				throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
			if (!response.ok)
				throw vscode.FileSystemError.Unavailable('Delete failed');

			// Deletion was successful, let's update the cache
			if (parts.length>3) {
				if (parts[2]==="intents") {
					const intent_target = parts[3];
					delete this.intentTypes[parts[1]].aligned[intent_target];
					delete this.intentTypes[parts[1]].desired[intent_target];
					delete this.intentTypes[parts[1]].intents[intent_target];					
				} else if (parts[2]==="intent-type-resources") {
					const resourcename = parts.slice(3).join("/");
					this.intentTypes[parts[1]].data.resource = this.intentTypes[parts[1]].data.resource.filter((resource:{name:string, value:string}) => resource.name!=resourcename);
				} else if (parts[2].includes("yang-modules")) {
					const modulename = parts[3];
					this.intentTypes[parts[1]].data.module = this.intentTypes[parts[1]].data.module.filter((module:{name:string, value:string}) => module.name!=modulename);
				} else if (parts[2].includes("views")) {
					delete this.intentTypes[parts[1]].views[parts[3]];
				}
			} else {
				delete this.intentTypes[parts[1]];
			}
		
			await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
			vscode.window.showInformationMessage("Succesfully deleted");
			this._eventEmiter.fire(uri);
		} else {
			throw vscode.FileSystemError.Unavailable("Save file failed! Unknown intent-type!");
		}
	}

	/**
	 * vsCode.FileSystemProvider method to rename folders and files.
	 * 
	 * @param {vscode.Uri} oldUri URI of the file or folder to rename
	 * @param {vscode.Uri} newUri new file/folder name to be used
	 * @param {{overwrite: boolean}} options additional options
	*/	

	async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): Promise<void> {
		this.pluginLogs.debug("createDirectory(", oldUri, newUri, ")");
		throw vscode.FileSystemError.NoPermissions('Unsupported operation!');	
	}

	/**
	 * vsCode.FileSystemProvider method to create folders.
	 * 
	 * @param {vscode.Uri} uri URI of the folder to be created
	*/	

	createDirectory(uri: vscode.Uri): void {
		this.pluginLogs.debug("createDirectory(", uri, ")");
		throw vscode.FileSystemError.NoPermissions('Unsupported operation!');
	}	

	// --- SECTION: vscode.FileDecorationProvider implementation ------------

	/**
	 * vscode.FileDecorationProvider method to get decorations for files and folders.
	 * Used by IntentManagerProvider to indicate signature, alignment state, ...
	 * 
	 * @param {vscode.Uri} uri URI of the folder to retrieve from NSP
	 * 
	 */		

	public provideFileDecoration( uri: vscode.Uri): vscode.ProviderResult<vscode.FileDecoration> {
		const path = uri.toString();
		const parts = path.split('/').map(decodeURIComponent);

		if (parts[0]==="im:") {
			this.pluginLogs.debug("provideFileDecoration("+path+")");

			if (path==='im:/')
				return DECORATION_WORKSPACE;

			if (parts.length===2)
				if (this.intentTypes[parts[1]].signed)
					return DECORATION_SIGNED;
				else
					return DECORATION_UNSIGNED;

			if (parts[2]==="views") return DECORATION_VIEWS;

			if (parts[2]==="intents") {
				if (parts.length==4) {
					if (this.intentTypes[parts[1]].aligned[parts[3]])
						return DECORATION_ALIGNED;
					else
						return DECORATION_MISALIGNED;
				} else return DECORATION_INTENTS;
			}

			if (!this.intentTypes[parts[1]].signed) {
				if (parts.length===3) {
					if (parts[2]==="intent-type-resources") return DECORATION_RESOURCES;
					if (parts[2]==="yang-modules") 			return DECORATION_MODULES;
				}
			} else return DECORATION_SIGNED;
		}
	}	

	// --- SECTION: IntentManagerProvider specific methods implementation ---

	/**
	 * Provide user-friendly representation of desired state for an intent.
	 * 
	 * @param {vscode.Uri} uri URI of an intent instance
	 * 
	 */		

	getState(uri: vscode.Uri): string {
		const path = uri.toString();
		this.pluginLogs.debug("getState("+path+")");

		const localize: {[value: string]: string} = {
			"active":	"Active",
			"suspend":	"Suspended",
			"delete":	"Not Present",
			"saved":	"Saved",
			"planned":	"Planned",
			"deployed":	"Deployed"
		}

		const parts = path.split('/').map(decodeURIComponent);
		const state = this.intentTypes[parts[1]].desired[parts[3]];
		return localize[state];
	}

	/**
	 * Update the network status for a intent instance(s) provided.
	 * If no intent instance is provided use the intent opened in the editor.
	 * 
	 * @param {any[]} args context used to issue command
	 * 
	 */		

	async setState(args:any[]): Promise<void> {
		let uriList:vscode.Uri[] = this._getUriList(args);

		const states: {[value: string]: string} = {
			"Active":      "active",
			"Suspended":   "suspend",
			"Not Present": "delete",
			"Saved":       "saved",
			"Planned":     "planned",
			"Deployed":    "deployed"	
		}		

		var actual = new Set();
		for (const entry of uriList) {
			actual.add(this.getState(entry));
		}

		let items = [];
		for (const state of Object.keys(states))
			if (actual.has(state))
				items.push({label:state, description:"✔"});
			else
				items.push({label:state, description:""});

		await vscode.window.showQuickPick(items).then( async selection => {
			if (selection) {
				const state = states[selection.label];
				let body={};
				if (["active", "suspend", "delete"].includes(state))
					body = {"ibn:intent": {"required-network-state": state}};
				else
					body = {"ibn:intent": {"required-network-state": "custom", "custom-required-network-state": state}};

				for (const entry of uriList) {
					this.pluginLogs.debug("setState(", entry.toString(), ")");

					const parts = entry.toString().split('/').map(decodeURIComponent);
					const intent = parts[3];
					const intent_type = parts[1].split('_v')[0];

					const url = "/restconf/data/ibn:ibn/intent="+encodeURIComponent(intent)+","+encodeURIComponent(intent_type);
					let response: any = await this._callNSP(url, {method: "PATCH", body: JSON.stringify(body)});
					if (!response)
						throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
					if (response.ok)
						this.intentTypes[parts[1]].desired[intent] = state;
				}
				this._eventEmiter.fire(uriList);
				await vscode.commands.executeCommand("nokia-intent-manager.updateStatusBar");
				await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");		
			}
		})
	}

	/**
	 * Upload an intent-type from a local workspace folder to NSP Intent Manager.
	 * This is only allowed from the meta-info or script-content at this stage.
	 * 
	 * If meta-info does not contain intent-type name/version, user is prompted
	 * to provide name and version manually.
	 * 
	 * Intent-type resources can be contained in subfolder structures, as per
	 * IBN engine support. Intent-script can be called `script-content.js`
	 * (NashornJS, default) or `script-content.mjs` (GraalJS), based on the
	 * javascript engine being used.
	 * 
	 * Remind, files must be saved to disk before uploading. Unsaved changes
	 * will not be considered for uploading the intent-type.
	 * 
	 * Parameter will be URI of meta-info or script-content.
	 * 
	 * @param {any[]} args context used to issue command
	 * 
	 */	

	async uploadLocal(args:any[]): Promise<void> {
		var fs = require('fs');

		const matchIntentType = /^([a-z][A-Za-z_\-]+_v\d+)$/;
		const matchImportedIntentType = /^intent\-([a-z][A-Za-z_\-]+\-v\d+)$/;

		const uri:vscode.Uri = this._getUriList(args)[0];
		const allparts = uri.fsPath.split('/');
		let parts:string[] = []
		for (const part of allparts) {
			parts.push(part);
			if (matchIntentType.test(part) || matchImportedIntentType.test(part))
				break;
		}
		const path = parts.join("/")+"/";
		let intent_type_folder = parts.pop() ?? "";

		if (matchImportedIntentType.test(intent_type_folder))
			intent_type_folder = intent_type_folder.slice(7).replace(/-v(?=\d+)/, "_v"); 

		if (this.matchIntentType.test(intent_type_folder))
			this.pluginLogs.debug("uploadLocalIntentType("+path+")");
		else
			throw vscode.FileSystemError.FileNotFound("Intent-type must be stored in directory {intent_type}_v{version} or intent-{intent_type}-v{version}");

		// load meta, script, resource-files, yang modules and views

		let meta:{[key:string]: any};
		if (fs.existsSync(path+"meta-info.json"))
			meta = JSON.parse(fs.readFileSync(path+"meta-info.json", {encoding:'utf8', flag:'r'}));
		else
			throw vscode.FileSystemError.FileNotFound("meta-info.json not found");

		if (fs.existsSync(path+"script-content.js"))
			meta["script-content"] = fs.readFileSync(path+"script-content.js", {encoding:'utf8', flag:'r'});
		else if (fs.existsSync(path+"script-content.mjs"))
			meta["script-content"] = fs.readFileSync(path+"script-content.mjs", {encoding:'utf8', flag:'r'});
		else
			throw vscode.FileSystemError.FileNotFound("script-content not found");

		let modules:string[] = [];
		if (fs.existsSync(path+"yang-modules")) {
			fs.readdirSync(path+"yang-modules").forEach((file: string) => {
				if (fs.lstatSync(path+"yang-modules/"+file).isFile() && !file.startsWith('.')) modules.push(file);
			});
			this.pluginLogs.info("modules: " + JSON.stringify(modules));
		} else
			throw vscode.FileSystemError.FileNotFound("YANG modules not found");

		let resources:string[] = [];
		if (fs.existsSync(path+"intent-type-resources")) {
			fs.readdirSync(path+"intent-type-resources", {recursive: true}).forEach((file: string) => {
				if (fs.lstatSync(path+"intent-type-resources"+'/'+file).isFile() && !file.startsWith('.') && !file.includes('/.'))
					resources.push(file);
			});
			this.pluginLogs.info("resources: " + JSON.stringify(resources));
		} else
			vscode.window.showWarningMessage("Intent-type has no resources");

		let views:string[] = [];
		if (fs.existsSync(path+"views")) {
			fs.readdirSync(path+"views").forEach((file: string) => views.push(file));
			this.pluginLogs.info("views: " + JSON.stringify(views));
		} else
			vscode.window.showWarningMessage("Views not found.");

		// Intent-type "meta" may contain the parameter "intent-type"
		// RESTCONF API required parameter "name" instead

		if (meta.hasOwnProperty("intent-type")) {
			meta.name = meta["intent-type"];
			delete meta["intent-type"];
			if (meta.name!=intent_type_folder.split('_v')[0])
				vscode.window.showWarningMessage("Intent-type name mismatch between foldername "+intent_type_folder+" and meta-info "+meta.name+"_v"+meta.version);
		} else
			// intent-type name from folder, if not in meta		
			meta.name = intent_type_folder.split('_v')[0];

		if (meta.hasOwnProperty("version"))
			if (meta.version!=intent_type_folder.split('_v')[1])
				vscode.window.showWarningMessage("Intent-type version mismatch between foldername "+intent_type_folder+" and meta-info "+meta.name+"_v"+meta.version);
		else
			// intent-type version from folder, if not in meta		
			meta.version = intent_type_folder.split('_v')[1];

		// NSP IBN Wrapper expects meta.version to be number, but is string
		meta.version=parseInt(meta.version);

		// IBN expects targetted-device to contain an index as key, which is not contained in exported intent-types (ZIP)
		if (meta.hasOwnProperty("targetted-device")) {
			let index=0;
			for (const entry of meta["targetted-device"]) {
				if (!entry.hasOwnProperty("index"))
					entry.index = index;
				index+=1;
			}
		}

		meta["module"]=[];
		for (const module of modules) {
			meta["module"].push({"name": module, "yang-content": fs.readFileSync(path+"yang-modules/"+module, {encoding: 'utf8', flag: 'r'})});
		}

		meta["resource"]=[];
		for (const resource of resources) {
			meta["resource"].push({"name": resource, "value": fs.readFileSync(path+"intent-type-resources/"+resource, {encoding: 'utf8', flag: 'r'})});
		}

		// Parameters "resourceDirectory" and "supported-hardware-types" are not supported in the
		// RESTCONF API payload, and must be removed.

		const undesiredAttributes = ['resourceDirectory', 'supported-hardware-types'];
		for (const key of undesiredAttributes) delete meta[key];

		// Parameter "custom-field" is provided as native JSON in "meta", but must be converted
		// to JSON string to comply to the RESTCONF API.

		if ('custom-field' in meta)
			meta["custom-field"] = JSON.stringify(meta["custom-field"]);

		if (this.intentTypes.hasOwnProperty(intent_type_folder)) {
			vscode.window.showInformationMessage("Upload existing Intent-Type");
			const body = {"ibn-administration:intent-type": meta};
			const url = "/restconf/data/ibn-administration:ibn-administration/intent-type-catalog/intent-type="+encodeURIComponent(meta.name)+","+meta.version;
			let response: any = await this._callNSP(url, {method: "PUT", body: JSON.stringify(body)});
			if (!response)
				throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
			if (!response.ok)
				this._raiseRestconfError("Update intent-type failed!", await response.json());
		} else {
			vscode.window.showInformationMessage("Upload new Intent-Type");
			const body = {"ibn-administration:intent-type": meta};
			const url = "/restconf/data/ibn-administration:ibn-administration/intent-type-catalog";
			let response: any = await this._callNSP(url, {method: "POST", body: JSON.stringify(body)});
			if (!response)
				throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
			if (!response.ok)
				this._raiseRestconfError("Create intent-type failed!", await response.json());
		}
		vscode.window.showInformationMessage("Intent-Type "+intent_type_folder+" successfully uploaded");

		this._eventEmiter.fire(vscode.Uri.parse("file:/"+path));
		await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");		

		if (views) {
			vscode.window.showInformationMessage("Upload views for "+intent_type_folder);
			for (const view of views) {
				if (view.endsWith(".viewConfig")) {
					let viewname = view.slice(0,-11);			
					let viewcontent = fs.readFileSync(path+"views/"+view, {encoding:'utf8', flag:'r'});

					const url = "/restconf/data/nsp-intent-type-config-store:intent-type-config/intent-type-configs="+encodeURIComponent(meta.name)+","+meta.version;
					const body = {
						"nsp-intent-type-config-store:intent-type-configs": [{
							"views": [{
								"name": viewname,
								"viewconfig": viewcontent
							}]
						}]
					};

					let response: any = await this._callNSP(url, {method: "PATCH", body: JSON.stringify(body)});
					if (!response)
						throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
					if (!response.ok)
						this._raiseRestconfError("Upload view(s) failed!", await response.json());
				}
			}
			vscode.window.showInformationMessage("Intent-Type "+intent_type_folder+" views successfully uploaded");
		}
	}

	/**
	 * Get server logs for the intent script execution from OpenSearch. Filtering is applied
	 * based on intent-type(s) or intent instances being selected.
	 * 
	 * Collection will be limited to cover the last 10min only respectively 1000 log entries.
	 * 
	 * Whenever there is a pause between two adjacent log entries for 30sec or more, an empty
	 * line will be added. This is to provide better separation between disjoint intent
	 * operations.
	 * 
	 * Logs are reordered (sorted) by the timestamp generated by the IBN engine. In some cases
	 * adjacent log entries contain the same timestamp, while displaying logs in the correct
	 * order can not be granted.
	 * 
	 * If no intent-type/intent URI is provided, all execution logs from last 10 minutes
	 * are queried.
	 * 
	 * @param {any[]} args context used to issue command
	 */	

	async logs(args:any[]): Promise<void> {
		this.pluginLogs.debug("logs()");
		
		let query : {[key: string]: any} = {"bool": {"must": [
			{"range": {"@datetime": {"gte": "now-10m"}}},
			{"match_phrase": {"log": "\"category\":\"com.nokia.fnms.controller.ibn.impl.ScriptedEngine\""}},
			{"bool": {"should": []}}
		]}};

		let uriList:vscode.Uri[] = this._getUriList(args);
		for (const entry of uriList) {
			const parts = entry.toString().split('/').map(decodeURIComponent);

			if (parts[0]==='im:') {
				this.pluginLogs.info("get logs for "+entry.toString());
				const intent_type = parts[1].split('_v')[0];
				const intent_type_version = parts[1].split('_v')[1];

				let qentry = {"bool": {"must": [
					{"match_phrase": {"log": "\"intent_type\":\""+intent_type+"\""}},
					{"match_phrase": {"log": "\"intent_type_version\":\""+intent_type_version+"\""}}
				]}};

				if (parts.length===4 && parts[2]==="intents")
					qentry.bool.must.push({"match_phrase": {"log": "\"target\":\""+parts[3]+"\""}});

				query.bool.must.at(2).bool.should.push(qentry);
			}
		}

		// get auth-token
		await this._getAuthToken();
		const token = await this.authToken;
		if (!token) {
			throw vscode.FileSystemError.Unavailable('NSP is not reachable');
		}

		const url = "/logviewer/api/console/proxy?path=nsp-mdt-logs-*/_search&method=GET";
		const body = {"query": query, "sort": {"@datetime": "desc"}, "size": 1000};

		let response: any = await this._callNSP(url, {
			method: "POST",
			headers: {
				"Content-Type":  "application/json",
				"Cache-Control": "no-cache",
				"Osd-Version":   "2.10.0",
				"Authorization": "Bearer " + token
			},
			body: JSON.stringify(body)
		});

		if (!response)
			throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
		if (!response.ok) {
			vscode.window.showErrorMessage('Error while getting logs');
			throw vscode.FileSystemError.Unavailable('Error while getting logs');
		}
		let json: any = await response.json();

		// let data: Array<Object> = json["hits"]["hits"];
		let data : {[key: string]: any}[] = json["hits"]["hits"];

		if (data.length === 0 ) {
			vscode.window.showWarningMessage("No intent operation logs for the last 10 minutes");
		} else {
			let logs : Array<any> = [];
			for (const entry of data) {
				logs.push(JSON.parse(entry['_source'].log));
			}
			logs.sort((a,b) => a['date']-b['date']);

			this.serverLogs.clear()
			this.serverLogs.show(true);

			let pdate = logs[0]['date'];
			for (const logentry of logs) {
				const timestamp = new Date(logentry['date']);
				const level = logentry['level'];
				const target = logentry['target'];
				const intent_type = logentry['intent_type'];
				const intent_type_version = logentry['intent_type_version'];
				const message = logentry['message'].slice(logentry['message'].indexOf("]")+1).trim();
				
				// insert empty line, if more than 30sec between two log entries
				if (logentry['date'] > pdate+30000) {
					this.serverLogs.appendLine("");
				}

				this.serverLogs.appendLine(timestamp.toISOString().slice(-13) + " " + level+ "\t[" + intent_type + '_v' + intent_type_version + ' ' + target + "] " + message);
				pdate = logentry['date'];
			}
		}
	}

	/**
	 * Execute an audit of the selected intent instance(s).
	 * Pulls the result(s) to update the intent decoration.
	 * Show details, if intent is misaligned.
	 * 
	 * @param {any[]} args context used to issue command
	 */		

	async audit(args:any[]): Promise<void> {
		const nunjucks = require("nunjucks");

		let uriList:vscode.Uri[] = this._getUriList(args);
		for (const entry of uriList) {
			this.pluginLogs.debug("audit(", entry.toString(), ")");
			const parts = entry.toString().split('/').map(decodeURIComponent);

			if (parts.length===4 && parts[2]==="intents") {
				const intent = parts[3];
				const intent_type = parts[1].split('_v')[0];
				const url = "/restconf/data/ibn:ibn/intent="+encodeURIComponent(intent)+","+encodeURIComponent(intent_type)+"/audit";

				let response: any = await this._callNSP(url, {method: "POST", body: ""});
				if (!response)
					throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
				if (response.ok) {
					const json : any = await response.json();
					const report = json["ibn:output"]["audit-report"];
	
					if (Object.keys(report).includes("misaligned-attribute") || Object.keys(report).includes("misaligned-object") || Object.keys(report).includes("undesired-object")) {
						this.intentTypes[parts[1]].aligned[parts[3]]=false;
						if (uriList.length===1)
							vscode.window.showWarningMessage("Intent "+intent_type+"/"+intent+" is misaligned!","Details","Cancel").then(
								async (selectedItem) => {if ('Details' === selectedItem) this._auditReport(intent_type, intent, report);}
							);
						else
							vscode.window.showWarningMessage("Intent "+intent_type+"/"+intent+" is misaligned!");
					} else {
						this.intentTypes[parts[1]].aligned[parts[3]]=true;
						vscode.window.showInformationMessage("Intent "+intent_type+"/"+intent+" is aligned!");
					}					
				} else this._printRestconfError("Audit intent failed!", await response.json());
			}
		};

		this._eventEmiter.fire(uriList);
		await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
	}

	/**
	 * Pulls the result(s) of last audit to display.
	 * 
	 * @param {any[]} args context used to issue command
	 */		

	async lastAuditReport(args:any[]): Promise<void> {
		const nunjucks = require("nunjucks");

		let uriList:vscode.Uri[] = this._getUriList(args);
		for (const entry of uriList) {
			this.pluginLogs.debug("lastAuditReport(", entry.toString(), ")");
			const parts = entry.toString().split('/').map(decodeURIComponent);

			if (parts.length===4 && parts[2]==="intents") {
				const intent = parts[3];
				const intent_type = parts[1].split('_v')[0];
				const url = "/restconf/data/ibn:ibn/intent="+encodeURIComponent(intent)+","+encodeURIComponent(intent_type);

				let response: any = await this._callNSP(url, {method: "GET"});
				if (!response)
					throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
				if (!response.ok)
					throw vscode.FileSystemError.Unavailable('Error while getting intent details');

				const json : any = await response.json();
				const report = json["ibn:intent"]["last-audit-report"];

				if (Object.keys(report).includes("misaligned-attribute") || Object.keys(report).includes("misaligned-object") || Object.keys(report).includes("undesired-object")) {
					this._auditReport(intent_type, intent, report);
				} else {
					vscode.window.showInformationMessage("Intent "+intent_type+"/"+intent+" is aligned!");
				}
			}
		};

		this._eventEmiter.fire(uriList);
		await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
	}


	/**
	 * Execute a synchronize of the selected intent instance(s).
	 * 
	 * @param {any[]} args context used to issue command
	 */		

	async sync(args:any[]): Promise<void> {
		let uriList:vscode.Uri[] = this._getUriList(args);
		for (const entry of uriList) {
			this.pluginLogs.debug("sync(", entry.toString(), ")");			
			const parts = entry.toString().split('/').map(decodeURIComponent);

			if (parts.length===4 && parts[2]==="intents") {
				const intent = parts[3];
				const intent_type = parts[1].split('_v')[0];
				const url = "/restconf/data/ibn:ibn/intent="+decodeURIComponent(intent)+","+decodeURIComponent(intent_type)+"/synchronize";

				let response: any = await this._callNSP(url, {method: "POST", body: ""});
				if (!response)
					throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
				if (!response.ok) {
					this.intentTypes[parts[1]].aligned[parts[3]]=false;
					this._printRestconfError("Synchronize intent failed!", await response.json());
				} else {
					this.intentTypes[parts[1]].aligned[parts[3]]=true;
					vscode.window.showInformationMessage("Intent "+intent_type+"/"+intent+" synchronized!");
				}
			}
		}
		this._eventEmiter.fire(uriList);
		await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
	}

	/**
	 * Open NSP WebUI Intent Manager for an intent or intent-type
	 * 
	 * @param {any[]} args context used to issue command
	 */		

	async openInBrowser(args:any[]): Promise<void> {
		let uriList:vscode.Uri[] = this._getUriList(args);

		if (uriList.length>0) {
			const path = uriList[0].toString();
			const parts = path.split('/').map(decodeURIComponent);
			const intent_type = parts[1].split('_v')[0];
			const intent_type_version = parts[1].split('_v')[1];

			this.pluginLogs.debug("openInBrowser(", path, ")");
			
			if (parts.length>3 && parts[2]==='intents') {
				// URL for new navigation since nsp23.11
				this._openWebUI("/web/intent-manager/intent-types/intents-list/intent-details?intentTypeId="+encodeURIComponent(intent_type)+"&version="+intent_type_version+"&intentTargetId="+encodeURIComponent(parts[3]));
			} else {
				// URL for new navigation since nsp23.11
				this._openWebUI("/web/intent-manager/intent-types/intents-list?intentTypeId="+encodeURIComponent(intent_type)+"&version="+intent_type_version);
			}
		}
	}

	/**
	 * Open NSP WebUI Intent Manager to allow user to create new intents.
	 * 
	 * @param {any[]} args context used to issue command
	 */

	async newIntent(args:any[]): Promise<void> {
		let uriList:vscode.Uri[] = this._getUriList(args);

		if (uriList.length>0) {
			const path = uriList[0].toString();
			const parts = path.split('/').map(decodeURIComponent);
			const intent_type = parts[1].split('_v')[0];
			const intent_type_version = parts[1].split('_v')[1];

			this.pluginLogs.debug("newIntent(", path, ")");

			this._openWebUI("/web/intent-manager/intent-types/create-intent?intentTypeId="+encodeURIComponent(intent_type)+"&version="+intent_type_version);
		}
	}

	/**
	 * Creates a new intent-type version for the selected intent-type.
	 * 
	 * @param {any[]} args context used to issue command
	 */

	async newVersion(args:any[]): Promise<void> {
		let uriList:vscode.Uri[] = this._getUriList(args);

		if (uriList.length>0) {
			const path = uriList[0].toString();
			const parts = path.split('/').map(decodeURIComponent);
			const intent_type = parts[1].split('_v')[0];
			const intent_type_version = parts[1].split('_v')[1];

			this.pluginLogs.debug("newVersion(", path, ")");
	
			let url = "/mdt/rest/ibn/save/"+encodeURIComponent(intent_type)+"/"+intent_type_version;
			let response: any = await this._callNSP(url, {method: "POST", body: "{}"});
			if (!response)
				throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
			if (!response.ok)
				throw vscode.FileSystemError.Unavailable('Intent-type version creation failed!');

			await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
			vscode.window.showInformationMessage("New version created for intent-type "+intent_type);
		}
	}

	/**
	 * Cloning selected intent-type.
	 * 
	 * @param {any[]} args context used to issue command
	 */
	
	async clone(args:any[]): Promise<void> {
		let uriList:vscode.Uri[] = this._getUriList(args);

		if (uriList.length>0) {
			const path = uriList[0].toString();
			const parts = path.split('/').map(decodeURIComponent);
			const intent_type = parts[1].split('_v')[0];
			const intent_type_version = parts[1].split('_v')[1];

			this.pluginLogs.debug("clone(", path, ")");

			const new_intent_type = await vscode.window.showInputBox({
				placeHolder: "Intent Name",
				prompt: "Provide a name for the new intent-type",
				value: intent_type+"_copy"
			});

			if(new_intent_type) {
				if (this.intentTypes.hasOwnProperty(new_intent_type+"_v1"))
					throw vscode.FileSystemError.FileExists("The intent "+new_intent_type+" already exists");

				let url = "/mdt/rest/ibn/save/"+encodeURIComponent(intent_type)+"/"+intent_type_version+"?newIntentTypeName="+new_intent_type;		
				let response: any = await this._callNSP(url, {method: "POST", body: "{}"});
				if (!response)
					throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
				if (!response.ok)
					throw vscode.FileSystemError.Unavailable('Cloning intent-type failed!');
	
				await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
				vscode.window.showInformationMessage("New intent-type "+new_intent_type+" created!");
			}
		}
	}

	/**
	 * Creates intent-type by providing a name and optional YANG modules.
	 * The new intent-type is generated using a basic template.
	 * 
	 * @param {any[]} args context used to issue command
	 */

	async newIntentType(args:any[]): Promise<void> {
		var fs = require('fs');

		const intentName = await vscode.window.showInputBox({
			placeHolder: "Intent Name",
			prompt: "Provide a name for the new intent",
			value: "default_intent_name"
		});

		if (intentName) {		
			this.pluginLogs.debug('newIntentType(', intentName, ')');

			const uriList:vscode.Uri[] = this._getUriList(args);
			for (const entry of uriList)
				if (!entry.toString().endsWith(".yang"))
					throw vscode.FileSystemError.Unavailable("File "+entry.toString()+" is not .yang");
			
			// Checking if the intent-type already exists
			let url = "/restconf/data/ibn-administration:ibn-administration/intent-type-catalog/intent-type="+encodeURIComponent(intentName)+",1";

			let response: any = await this._callNSP(url, {method: "GET"});
			if (!response)
				throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
			if (response.ok)
				throw vscode.FileSystemError.FileExists("Intent name already exist, cannot create");
	
			// Creating a template for new intent-types (to be updated by the user)
			let meta : {[key: string]: any} = {
				"ibn-administration:intent-type": {
					"date": "-",
					"support-nested-type-in-es": false,
					"author": "Nokia IM vsCode",
					"target-component": [
						{
							"i18n-text": "Device Name",
							"function-name": "suggestDeviceNames",
							"pattern-error-message": "",
							"name": "deviceName",
							"value-type": "STRING",
							"order": 1
						}
					],
					"mapping-engine": "js-scripted",
					"label": [
						"vsCode Intent"
					],
					"priority": 50,
					"version": 1,
					"build": "-",
					"lifecycle-state": "released",
					"name": intentName,
					"live-state-retrieval": false
				}
			};
			meta["ibn-administration:intent-type"]["script-content"]="\nvar RuntimeException = Java.type('java.lang.RuntimeException');\n\nvar prefixToNsMap = {\n  \"ibn\" : \"http://www.nokia.com/management-solutions/ibn\",\n  \"nc\" : \"urn:ietf:params:xml:ns:netconf:base:1.0\",\n  \"device-manager\" : \"http://www.nokia.com/management-solutions/anv\",\n};\n\nvar nsToModule = {\n  \"http://www.nokia.com/management-solutions/anv-device-holders\" : \"anv-device-holders\"\n};\n\nfunction synchronize(input) {\n  var result = synchronizeResultFactory.createSynchronizeResult();\n  // Code to synchronize goes here\n  \n  result.setSuccess(true);\n  return result;\n}\n\nfunction audit(input) {\n  var report = auditFactory.createAuditReport(null, null);\n  // Code to audit goes here\n\n  return report\n}\n\nfunction validate(syncInput) {\n  var contextualErrorJsonObj = {};\n  var intentConfig = syncInput.getJsonIntentConfiguration();\n  \n  // Code to validation here. Add errors to contextualErrorJsonObj.\n  // contextualErrorJsonObj[\"attribute\"] = \"Attribute must be set\";\n  \n  if (Object.keys(contextualErrorJsonObj).length !== 0) {\n        utilityService.throwContextErrorException(contextualErrorJsonObj);\n  }\n}\n\n";
			
			meta["ibn-administration:intent-type"]["module"]=[];
			if (uriList) {
				for (const uri of uriList) {
					const parts = uri.toString().split('/').map(decodeURIComponent);
					const module = parts.pop();
					const content = fs.readFileSync(uri.fsPath, {encoding:'utf8', flag:'r'});
					meta["ibn-administration:intent-type"]["module"].push({"name": module, "yang-content": content});
				}
			} else meta["ibn-administration:intent-type"]["module"].push({"name":intentName+".yang","yang-content":"module "+intentName+" {\n  namespace \"http://www.nokia.com/management-solutions/"+intentName+"\";\n  prefix \""+intentName+"\";\n\n  organization        \"NOKIA Corp\";\n  contact \"\";\n  description \"\";\n  revision \"2023-03-07\" {\n    description\n      \"Initial revision.\";\n  }\n  grouping configuration-details {\n    container "+intentName+"{\n\n    }\n  }\n   \n  uses "+intentName+":configuration-details;\n}\n"})
			meta["ibn-administration:intent-type"]["resource"]=[];
			meta["ibn-administration:intent-type"]["resource"].push({"name":intentName+".js","value":""});
			
			//Consider adding composite
			let del = ["intent-type","date","category","custom-field","instance-depends-on-category","resourceDirectory","support-nested-type-in-es","supports-network-state-suspend","default-version","author","skip-device-connectivity-check","return-config-as-json","build","composite","support-aggregated-request","notify-intent-instance-events","supported-hardware-types"];
			for (const d of del) delete meta["ibn-administration:intent-type"][d];
			let body = meta;
			url = "/restconf/data/ibn-administration:ibn-administration/intent-type-catalog";

			response = await this._callNSP(url, {method: "POST", body: JSON.stringify(body)});
			if (!response)
				throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
			if (!response.ok)
				this._raiseRestconfError("Upload intent-type failed!", await response.json());

			await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
			vscode.window.showInformationMessage("Succesfully created");
		}
	}

	shareStatusBarItem(): vscode.StatusBarItem {
		return myStatusBarItem;
	}

	// --- SECTION: Manage file events --------------------------------------

	private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

	watch(_resource: vscode.Uri): vscode.Disposable {
		return new vscode.Disposable(() => { });
	}	
}
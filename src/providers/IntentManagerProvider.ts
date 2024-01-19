import * as vscode from 'vscode';

export class FileStat implements vscode.FileStat {
	id: string;
    type: vscode.FileType;
    ctime: number;
    mtime: number;
    size: number;
	signed: boolean;
	version: number;
	content: string;
	aligned: boolean;
	state: string;
	cstate: string;
	permissions?: vscode.FilePermission | undefined;

	constructor (id: string, ctime: number, mtime: number, size:number, signed:boolean, version:number, content:string) {
		this.type = vscode.FileType.File;
		this.ctime = Date.now();
		this.mtime = Date.now();
		this.size = 0;
		this.id = id;
		this.signed = signed;
		this.version = version;
		this.content = content;
		this.aligned = true;
		this.state = "";
		this.cstate = "";
	}
}

const DECORATION_SIGNED: vscode.FileDecoration =    new vscode.FileDecoration(
	'🔒',
	'Signed',
	new vscode.ThemeColor('list.deemphasizedForeground')
);

const DECORATION_UNSIGNED: vscode.FileDecoration =    new vscode.FileDecoration(
	'',
	'Unsigned',
	new vscode.ThemeColor('list.highlightForeground')
);

const DECORATION_YANG: vscode.FileDecoration =    new vscode.FileDecoration(
	'☯',
	'YANG modules',
	new vscode.ThemeColor('list.warningForeground')
);

const DECORATION_RESOURCE: vscode.FileDecoration =    new vscode.FileDecoration(
	'❯',
	'Resources',
	new vscode.ThemeColor('list.warningForeground')
);

const DECORATION_VIEWS: vscode.FileDecoration =    new vscode.FileDecoration(
	'⚯',
	'Resources',
	new vscode.ThemeColor('list.warningForeground')
);

const DECORATION_ALIGNED: vscode.FileDecoration =    new vscode.FileDecoration(
	'✔',
	'Aligned',
	new vscode.ThemeColor('list.highlightForeground')
);

const DECORATION_MISALIGNED: vscode.FileDecoration =    new vscode.FileDecoration(
	'✘',
	'Misaligned',
	new vscode.ThemeColor('list.errorForeground')
);

const DECORATION_NONACTIVE: vscode.FileDecoration =    new vscode.FileDecoration(
	'✘',
	'Inactive',
	new vscode.ThemeColor('list.deemphasizedForeground')
);

let myStatusBarItem: vscode.StatusBarItem;
myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
myStatusBarItem.command = 'nokia-intent-manager.intentStatus';


/*
	Class implementing FileSystemProvider for Intent Manager
*/

export class IntentManagerProvider implements vscode.FileSystemProvider, vscode.FileDecorationProvider {
	static scheme = 'im';

	nspAddr: string;
	username: string;
	password: string;
	port: string;
	restport: string;
	authToken: any|undefined;

	nsp_version: string;

	intents: {[name: string]: FileStat};
	intentCatalog = [];

	extContext: vscode.ExtensionContext;

	public onDidChangeFileDecorations: vscode.Event<vscode.Uri | vscode.Uri[] | undefined>;
    private _eventEmiter: vscode.EventEmitter<vscode.Uri | vscode.Uri[]>;
	
	constructor (nspAddr: string, username: string, password: string, port: string) {
		console.log("creating IntentManagerProvider("+nspAddr+")");
		this.nspAddr = nspAddr;
		this.username = username;
		this.password = password;
		this.nsp_version = "";
		

		// To be updated to only use standard ports.
		this.port = port;
		this.restport = port;
		if (port === "8545"){
			this.restport = "8547";
		}
		
		this.authToken = undefined;

		// Intents is a FileStat dictionary that is used to keep the file and folder info
		// including the file content.
		this.intents = {};

		this._eventEmiter = new vscode.EventEmitter();
        this.onDidChangeFileDecorations = this._eventEmiter.event;
	}

	dispose() {
		console.log("disposing IntentManagerProvider()");
		this._revokeAuthToken();
	}

	/*
		NSP authentication: Token management
	*/

	private async _getAuthToken(): Promise<void> {
        console.log("executing _getAuthToken()");

        if (this.authToken) {
            if (!(await this.authToken)) {
                this.authToken = undefined;
            }
        }

        if (!this.authToken) {
            this.authToken = new Promise((resolve, reject) => {
                console.log("No valid auth-token; getting a new one...");
                process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

                const fetch = require('node-fetch');
                const base64 = require('base-64');

                const timeout = new AbortController();
                setTimeout(() => timeout.abort(), 10000);

                const url = "https://"+this.nspAddr+"/rest-gateway/rest/api/v1/auth/token";
                fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-cache',
                        'Authorization': 'Basic ' + base64.encode(this.username+ ":" +this.password)
                    },
                    body: '{"grant_type": "client_credentials"}',
                    signal: timeout.signal
                }).then(response => {
                    console.log("POST", url, response.status);
                    if (!response.ok) {
                        reject("Authentication Error!");
                        throw new Error("Authentication Error!");
                    }
                    return response.json();
                }).then(json => {
                    console.log("new authToken:", json.access_token);
                    resolve(json.access_token);
                    // automatically revoke token after 10min
                    setTimeout(() => this._revokeAuthToken(), 600000);
                }).catch(error => {
                    console.error(error.message);
                    // reject("Connection Error!");
					vscode.window.showWarningMessage("NSP is not reachable");
                    resolve(undefined);
                });
            });
        }
    }

	private async _revokeAuthToken(): Promise<void> {
		if (this.authToken) {
			const token = await this.authToken;
			console.log("_revokeAuthToken("+token+")");
			this.authToken = undefined;

			const fetch = require('node-fetch');
			const base64 = require('base-64');
		
			const url = "https://"+this.nspAddr+"/rest-gateway/rest/api/v1/auth/revocation";
			fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'Authorization': 'Basic ' + base64.encode(this.username+ ":" +this.password)
				},
				body: 'token='+token+'&token_type_hint=token'
			})
			.then(response => {
				console.log("POST", url, response.status);
			});
		}
	}

	private async _callNSP(url:string, options:any): Promise<void>{
		const fetch = require('node-fetch');
		const timeout = new AbortController();
        setTimeout(() => timeout.abort(), 20000);
		options['signal']=timeout.signal;
		let response: any = new Promise((resolve, reject) => {
		 	fetch(url, options)
			.then(response => resolve(response))
			.catch(error => { 
				console.log(error.message);
				vscode.window.showWarningMessage("NSP is not reachable");
				resolve(undefined)});
		});
		return response;
	}

	// In the current implementation, NSP OS version is needed to identify OpenSearch version to used in the headers. To investigate
	async getNSPversion(): Promise<void>{
		// get auth-token
		await this._getAuthToken();
		const token = await this.authToken;
		if (!token) {
            throw vscode.FileSystemError.Unavailable('NSP is not reachable');
        }
		if (this.nsp_version===""){
			console.log("Requesting NSP version");
			const urlversion = "https://"+this.nspAddr+"/internal/shared-app-banner-utils/rest/api/v1/appBannerUtils/release-version";
			let response: any = await this._callNSP(urlversion,{
				method: "GET",
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'application/json',
					'Authorization': 'Bearer ' + token
				}
			});
			if (!response){
				throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
			}
			if (!response.ok) {
				throw vscode.FileSystemError.Unavailable('Getting NSP release failed');
			}
			console.log(response);
			let ret = await response.json();
			this.nsp_version = ret["response"]["data"]["nspOSVersion"];
			vscode.window.showInformationMessage("NSP version: "+this.nsp_version);
		}
	}

	/*
		Method:
			_createIntentFile

		Description:
			Creates a new resource, module or view file in your Intent-type.
			Called when adding a new empty file in the workspace under resources, yang or views.
	*/

	private async _createIntentFile(name: string, data: string): Promise<void>{
		let body={};
		if (name.split("/").length<3) throw vscode.FileSystemError.NoPermissions("Not allowed to create file in this directory");
		let intent = name.split("/")[2];
		let method='PUT';
		let url='https://'+this.nspAddr+':'+this.port+'/restconf/data/ibn-administration:ibn-administration/intent-type-catalog/intent-type='+intent.replace("_v",",");
		let isview = false;
		let viewdata = "{}";
		if (name.includes("intent-type-resources")) { // Generate URL and load intent-type content for resource update
			if (this.intents["im:/intent-types/"+intent].intentContent["ibn-administration:intent-type"].hasOwnProperty("resource")){
				this.intents["im:/intent-types/"+intent].intentContent["ibn-administration:intent-type"]["resource"].push({"name": decodeURIComponent(name.split("/").pop()),"value": data});
			} else {
				this.intents["im:/intent-types/"+intent].intentContent["ibn-administration:intent-type"]["resource"]=[{"name": decodeURIComponent(name.split("/").pop()),"value": data}];
			}
			body=this.intents["im:/intent-types/"+intent].intentContent;
		} else if (name.includes("yang-modules")){ // Generate URL and load intent-type content for Yang model update
			this.intents["im:/intent-types/"+intent].intentContent["ibn-administration:intent-type"]["module"].push({"name": decodeURIComponent(name.split("/").pop()), "yang-content": "module example-system {\n       yang-version 1.1;\n       namespace \"urn:example:system\";\n       prefix \"sys\";\n\n       organization \"Example Inc.\";\n       contact \"joe@example.com\";\n       description\n         \"The module for entities implementing the Example system.\";\n\n       revision 2007-06-09 {\n         description \"Initial revision.\";\n       }\n\n       container system {\n         leaf host-name {\n           type string;\n           description\n             \"Hostname for this system.\";\n         }\n\n         leaf-list domain-search {\n           type string;\n           description\n             \"List of domain names to search.\";\n         }\n\n         container login {\n           leaf message {\n             type string;\n             description\n               \"Message given at start of login session.\";\n           }\n           list user {\n             key \"name\";\n             leaf name {\n               type string;\n             }\n             leaf full-name {\n               type string;\n             }\n             leaf class {\n               type string;\n             }\n           }\n         }\n       }\n     }"});
			body=this.intents["im:/intent-types/"+intent].intentContent;
		} else if (name.includes("views")){ // Handle view creation
			if (name.includes(".viewConfig")){
				name = name.replace(".viewConfig","");
			}
			if (name.includes(".schemaForm")){
				vscode.window.showErrorMessage("You cannot upload schemaForm, only viewConfig");
				throw vscode.FileSystemError.Unavailable('You cannot upload schemaForm, only viewConfig');
			}
			if (this.intents.hasOwnProperty(name+".viewConfig") || this.intents.hasOwnProperty(name+".schemaForm")){
				vscode.window.showErrorMessage("View Exists!");
				throw vscode.FileSystemError.Unavailable('View Exists!');
			}
			if (data.length !== 0 ){
				viewdata=data;
			}
			isview=true;
			url="https://"+this.nspAddr+":"+this.restport+"/intent-manager/proxy/v1/restconf/data/nsp-intent-type-config-store:intent-type-config/intent-type-configs="+intent.replace("_v",",");
			method="PATCH";
			body={
				"nsp-intent-type-config-store:intent-type-configs":[
					{"views": [
							{
								"name": decodeURIComponent(name.split("/").pop()),
								"viewconfig": viewdata
							}
					]
					}
				]
			};
		} 
		else {
			throw vscode.FileSystemError.NoPermissions("Not allowed to create file in this directory");
		}
		// get auth-token
		await this._getAuthToken();
		const token = await this.authToken;
		if (!token) {
            throw vscode.FileSystemError.Unavailable('NSP is not reachable');
        }

		let response: any = await this._callNSP(url, {
			method: method,
			headers: {
				'Content-Type': 'application/yang-data+json',
				'Accept': 'application/yang-data+json',
				'Authorization': 'Bearer ' + token
			},
			body: JSON.stringify(body)
		});
		if (!response){
			throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
		}

		console.log(body);
		console.log(response);
		console.log(method, url, response.status);
		if (!response.ok) {
			throw vscode.FileSystemError.Unavailable('Resource creation failed!');
		}

		if (isview){
			this.intents[name+".viewConfig"]=new FileStat(name.split("/").pop()+".viewConfig", Date.now(), Date.now(), 0, false, +intent.split("_v")[1],viewdata);
			this.intents[name+".schemaForm"]=new FileStat(name.split("/").pop()+".schemaForm", Date.now(), Date.now(), 0, false, +intent.split("_v")[1],"");
		} else {
			this.intents[name]=new FileStat(name, Date.now(), Date.now(), 0, false, +intent.split("_v")[1],"");
		}

		await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
		vscode.window.showInformationMessage("Succesfully created resource");
	}

	/*
		Method:
			_updateIntentType

		Description:
			Called when saving files in your intent-type.
			Due to API limitations, this method generates the full intent-type payload for updating a single file.
	*/

	private async _updateIntentType(name: string, data: string): Promise<void> {
		let _ = require('lodash');
		
		console.log("Updating intent.");
	
		if (this.intents[name].signed){
			vscode.window.showErrorMessage("Unable to save SIGNED intent (read only).");
			return;
		}
		let body={};
		let intent = name.split("/")[2];
		let url='https://'+this.nspAddr+':'+this.port+'/restconf/data/ibn-administration:ibn-administration/intent-type-catalog/intent-type='+intent.replace("_v",",");
		let resource_name = name.split("/").pop();
		let method= 'PUT';
		if (name.includes("intent-type-resources")){ // Generate URL and load intent-type content for resource update
			for (let i = 0; i < this.intents["im:/intent-types/"+intent].intentContent["ibn-administration:intent-type"]["resource"].length; i++){
				if (this.intents["im:/intent-types/"+intent].intentContent["ibn-administration:intent-type"]["resource"][i]["name"] === decodeURIComponent(resource_name)) {
					console.log("Resource found: "+resource_name);
					this.intents["im:/intent-types/"+intent].intentContent["ibn-administration:intent-type"]["resource"][i]["value"]=data;
				}
			}
			body=JSON.stringify(this.intents["im:/intent-types/"+intent].intentContent)
			vscode.window.showInformationMessage("Updating "+intent+" resource: "+decodeURIComponent(resource_name));
		} else if (name.includes("yang-modules")) { // Generate URL and load intent-type content for yang module update
			for (let i = 0; i < this.intents["im:/intent-types/"+intent].intentContent["ibn-administration:intent-type"]["module"].length; i++){
				if (this.intents["im:/intent-types/"+intent].intentContent["ibn-administration:intent-type"]["module"][i]["name"] === decodeURIComponent(resource_name)) {
					console.log("Resource found: "+resource_name);
					this.intents["im:/intent-types/"+intent].intentContent["ibn-administration:intent-type"]["module"][i]["yang-content"]=data;
				}
			}
			body=JSON.stringify(this.intents["im:/intent-types/"+intent].intentContent)
			vscode.window.showInformationMessage("Updating "+intent+" module: "+decodeURIComponent(resource_name));
		} else if (name.includes("script-content.js")) { // Update intent-type string content
			this.intents["im:/intent-types/"+intent].intentContent["ibn-administration:intent-type"]["script-content"]=data;
			body=JSON.stringify(this.intents["im:/intent-types/"+intent].intentContent);
			vscode.window.showInformationMessage("Updating "+intent+" script-content.js");
		} else if (name.includes("views")) { // Update views
			if (resource_name?.includes("schemaForm") || resource_name?.includes("settings")) {
				vscode.window.showErrorMessage("Not allowed to save "+resource_name+". Read-only file.");
				throw vscode.FileSystemError.NoPermissions("Not allowed to save resource.");
			}
			url='https://'+this.nspAddr+':'+this.restport+'/intent-manager/proxy/v1/restconf/data/nsp-intent-type-config-store:intent-type-config/intent-type-configs='+intent.replace("_v",",");
			method='PATCH';
			body='{"nsp-intent-type-config-store:intent-type-configs":[{"views":[{"name":"'+decodeURIComponent(resource_name?.split(".")[0])+'","viewconfig":"'+data.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g,'\\n')+'"}]}]}';
			vscode.window.showInformationMessage("Updating "+decodeURIComponent(resource_name)+" view in "+intent);
		} else if (name.includes("meta-info.json")) { // Update mate-info attributes
			let meta_local = JSON.parse(data);
			let meta_server = JSON.parse(this.intents[name].content);
			for (const att of Object.keys(meta_local)){
				if (!_.isEqual(meta_local[att],meta_server[att])){
					vscode.window.showInformationMessage("Updating "+intent+" config: "+att);
				}
			};
			url='https://'+this.nspAddr+':'+this.port+'/restconf/data/ibn-administration:ibn-administration/intent-type-catalog/intent-type='+intent.replace("_v",",");

			//UPDATING CONFIG REQUIRES INCLUDING KEYS(NAME;ID), MODULES AND RESOURCES.
			meta_local["name"]=intent.split("_v")[0];
			meta_local["version"]=+intent.split("_v")[1];
			meta_local["script-content"]=this.intents[name.replace("meta-info.json","script-content.js")].content;
			meta_local["resource"]=[];
			console.log(this.intents[name.replace("meta-info.json","intent-type-resources")].content);
			for (const rname of JSON.parse(this.intents[name.replace("meta-info.json","intent-type-resources")].content)) {
				meta_local["resource"].push({"name":rname,"value":this.intents[name.replace("meta-info.json","intent-type-resources")+"/"+encodeURIComponent(rname)].content});
			}
			meta_local["module"]=[];
			console.log(this.intents[name.replace("meta-info.json","yang-modules")].content);
			for (const rname of JSON.parse(this.intents[name.replace("meta-info.json","yang-modules")].content)) {
				meta_local["module"].push({"name":rname,"yang-content":this.intents[name.replace("meta-info.json","yang-modules")+"/"+encodeURIComponent(rname)].content});
			}
			body=JSON.stringify({"ibn-administration:intent-type":meta_local});
			method='PUT';
		}

		console.log(body);

		// get auth-token
		await this._getAuthToken();
		const token = await this.authToken;
		if (!token) {
            throw vscode.FileSystemError.Unavailable('NSP is not reachable');
        }

		let response: any = await this._callNSP(url, {
			method: method,
			headers: {
				'Content-Type': 'application/yang-data+json',
				'Accept': 'application/yang-data+json',
				'Authorization': 'Bearer ' + token
			},
			body: body
		});
		if (!response){
			throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
		}
		console.log(body);
		console.log(response);
		console.log(method, url, response.status);
		if ((!response.ok)) { 
			const jsonResponse = await response.json();
			let show = "Update Intent-type failed.";
			if (Object.keys(jsonResponse).includes("ietf-restconf:errors")) show = jsonResponse["ietf-restconf:errors"]["error"][0]["error-message"];
			throw vscode.FileSystemError.Unavailable(show);
		}

		this.intents[name].content=data;
		
		await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
		vscode.window.showInformationMessage("Succesfully uploaded");
	
	}

	/*
		Method:
			_updateIntent

		Description:
			Called when saving an intent instance.
	*/

	private async _updateIntent(name: string, data: string): Promise<void> {
		
		// get auth-token
		await this._getAuthToken();
		const token = await this.authToken;
		if (!token) {
            throw vscode.FileSystemError.Unavailable('NSP is not reachable');
        }

		let method = "PUT";
		const intent = name.split("/").pop();
		const intenttype = name.split("/")[2].split("_v")[0];
		let url = "https://"+this.nspAddr+":"+this.port+"/restconf/data/ibn:ibn/intent="+intent+","+intenttype+"/intent-specific-data";

		let response: any = await this._callNSP(url, {
			method: method,
			headers: {
				'Content-Type': 'application/yang-data+json',
				'Accept': 'application/yang-data+json',
				'Authorization': 'Bearer ' + token
			},
			body: `{"ibn:intent-specific-data":`+data+`}`
		});
		if (!response){
			throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
		}
		console.log(response);
		console.log(method, url, response.status);
		if (!response.ok) {
			const jsonResponse = await response.json();
			let show = "Update Intent failed.";
			if (Object.keys(jsonResponse).includes("ietf-restconf:errors")) show = jsonResponse["ietf-restconf:errors"]["error"][0]["error-message"];
			throw vscode.FileSystemError.Unavailable(show);
		}

		this.intents[name].content=data;

		await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
		vscode.window.showInformationMessage("Succesfully uploaded");
		this._eventEmiter.fire(vscode.Uri.parse(name));
	}

	/*
		Method:
			_updateIntent

		Description:
			Called when creating a new intent instance.
			As this extension is not yang-aware, it is recommended that the user creates new instances locally and pasting into the appropriate intent folder.
	*/

	private async _createIntent(name: string, data: string): Promise<void> {
		
		// get auth-token
		await this._getAuthToken();
		const token = await this.authToken;
		if (!token) {
            throw vscode.FileSystemError.Unavailable('NSP is not reachable');
        }

		let method = "POST";
		const intent = name.split("/").pop();
		const intenttype = name.split("/")[2].split("_v")[0];
		const intentversion = name.split("/")[2].split("_v")[1];
		let url = "https://"+this.nspAddr+":"+this.port+"/restconf/data/ibn:ibn";
		let body ={};
		body["ibn:intent"]={};
		body["ibn:intent"]["ibn:intent-specific-data"] = JSON.parse(data);
		body["ibn:intent"]["target"] = intent;
		body["ibn:intent"]["intent-type"] = intenttype;
		body["ibn:intent"]["intent-type-version"] = intentversion;
		body["ibn:intent"]["required-network-state"] = "active";

		let response: any = await this._callNSP(url, {
			method: method,
			headers: {
				'Content-Type': 'application/yang-data+json',
				'Accept': 'application/yang-data+json',
				'Authorization': 'Bearer ' + token
			},
			body: JSON.stringify(body)
		});
		if (!response){
			throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
		}
		console.log(JSON.stringify(body));

		console.log(response);
		console.log(method, url, response.status);
		if (!response.ok) {
			const jsonResponse = await response.json();
			let show = "Intent creation failed.";
			if (Object.keys(jsonResponse).includes("ietf-restconf:errors")) show = jsonResponse["ietf-restconf:errors"]["error"][0]["error-message"];
			throw vscode.FileSystemError.Unavailable(show);
		}
		this.intents[name]= new FileStat(encodeURIComponent(name), Date.now(), Date.now(), 0, false, +intentversion,data);
		this.intents[name].aligned = true;
		this.intents[name].state = "active";
		this.intents[name].cstate = "";

		await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
		vscode.window.showInformationMessage("Succesfully uploaded");
		this._eventEmiter.fire(vscode.Uri.parse(name));
	}

	/*
		Method:
			_renderJSON

		Description:
			Generate web content for audit report from the json payload returned by IM.
	*/

	private _renderJSON(obj:JSON,spaces:string) {
		'use strict';
		var keys = [],
			retValue = "";
		for (var key in obj) {
			if (typeof obj[key] === 'object') {
				retValue += "<div class='tree'>"+ spaces + key;
				retValue += this._renderJSON(obj[key],spaces+"&nbsp&nbsp");
				retValue += "</div>";
			} else {
				retValue += "<div class='tree'><b>"+ spaces + key + "</b> = <em>" + obj[key] + "</em></div>";
			}
	
			keys.push(key);
		}
		return retValue;
	}

	/*
		Method:
			_getWebviewContent

		Description:
			Generate webView for audit report based on the audit response from IM.
	*/

	private async _getWebviewContent(intent: string,intenttype: string,result: JSON,panel: vscode.WebviewPanel): Promise<string> {

		const extURI = this.extContext.extensionUri;
		const onDiskPath = vscode.Uri.joinPath(extURI, 'media', 'noklogo_black.svg');
		const catGifSrc = panel.webview.asWebviewUri(onDiskPath);
		const YAML = require('yaml');

		let html=`<!doctype html><html><head><title>Audit Report</title><meta name="description" content="Audit report"><meta name="keywords" content="Audit report"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@100;300&display=swap" rel="stylesheet"><style>*{ box-sizing: border-box; -webkit-box-sizing: border-box; -moz-box-sizing: border-box;}body{ font-family: 'Poppins', sans-serif; -webkit-font-smoothing: antialiased; background-color: #F8F8F8;}h2{ font-family: 'Poppins', sans-serif; text-align: left; font-size: 14px; letter-spacing: 1px; color: #555; margin: 20px 3%; width: 94%;}h3{ font-family: 'Poppins', sans-serif; text-align: left; font-size: 12px; letter-spacing: 1px; color: #555; margin: 20px 3%; width: 94%;}.publish { height: 100px; width: 100%; overflow-y: auto; }.nokia { display: block; margin-left: auto; margin-right: auto; margin-top: 100px; width: 30%;}.icon { width: 20px; margin-right: 10px;}.accordion > input[type="checkbox"] { position: absolute; left: -100vw;}.accordion .content { overflow-y: hidden; height: 0; transition: height 0.3s ease;}.accordion > input[type="checkbox"]:checked ~ .content { height: auto; overflow: visible;}.accordion label { display: block;}/* Styling*/body { font: 16px/1.5em "Overpass", "Open Sans", Helvetica, sans-serif; color: #333; font-weight: 300;}.accordion { margin-bottom: 1em; margin-left: 3%; width: 94%;}.accordion > input[type="checkbox"]:checked ~ .content { background: #F0F0F0 ; padding: 15px; border-bottom: 1px solid #9E9E9E;}.accordion .handle { margin: 0; font-size: 15px; line-height: 1.2em; width: 100%;}.accordion label { color: #555; cursor: pointer; font-weight: normal; padding: 15px; background: #F8F8F8; border-bottom: 1px solid #9E9E9E;}.accordion label:hover,.accordion label:focus { background: #BEBEBE; color: #001135;font-weight: 500;}/* Demo purposes only*/*,*:before,*:after { box-sizing: border-box;}body { padding: 40px;}a { color: #06c;}p { margin: 0 0 1em; font-size: 13px;}h1 { margin: 0 0 1.5em; font-weight: 600; font-size: 1.5em;}.accordion { max-width: 65em;}.accordion p:last-child { margin-bottom: 0;}</style></head><body><td><img class="nokia" src="`+catGifSrc+`"></td>`;
		html=html+`<h2>Intent-type: `+intenttype+`</h2><h2>Intent: `+intent+`</h2><h2>Audit result:</h2><h3> <p>`+this._renderJSON(result,"")+`</p></h3>`;
	
		html=html+`</body></html>`;
		return html;
	}

	/*
		Method:
			_getWebviewContentLogs

		Description:
			Generate webView for OpenSearch Logs coming from a particular intent instance. This is a beta functionality.
	*/

	private async _getWebviewContentLogs(intent: string,intenttype: string,result: JSON,panel: vscode.WebviewPanel): Promise<string> {

		let html=`<!doctype html><html> <head> <title>Intent Logs</title> <meta name="description" content="Intent Logs report"> <meta name="keywords" content="Intent Logs report"> <link rel="preconnect" href="https://fonts.googleapis.com"> <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin> <link href='https://fonts.googleapis.com/css?family=Space Mono' rel='stylesheet'><style> .console { position: absolute; font-family: 'Space Mono'; width: 90%; height: 90%; box-sizing: border-box; margin-top: 2%; margin-left: 2%;}.console header { border-top-left-radius: 15px; border-top-right-radius: 15px; background-color: #555; height: 45px; line-height: 45px; text-align: center; color: #DDD;}.console .consolebody { border-bottom-left-radius: 15px; border-bottom-right-radius: 15px; box-sizing: border-box; padding: 20px; height: calc(100% - 40px); overflow: scroll; overflow-wrap: break-word; background-color: #000; color: #63de00;}.console .consolebody p { font-size: 12px; margin: 0px; padding: 0px; margin-bottom: 5px;}</style> </head> <body> <div class="console"> <header> <p>`+intenttype+` `+intent+` logs </p> </header> <div class="consolebody">`;
		
		if (result.length === 0 ){
			html=html+`<p>> No logs available in the system </p>`;
		}

		console.log(result.length);

		result.sort((a,b) => new Date(b['_source']['@datetime']) - new Date(a['_source']['@datetime']));		

		for (const hit of result){
			
			var loginfo=JSON.parse(hit['_source'].log);
			const d = new Date(loginfo['date']);
			if ((loginfo['message']) && (loginfo['message'].length!==0)){
				console.log(loginfo['message']);
				console.log(hit);
				html=html+`<p>>[`+d.toISOString()+`] : `+loginfo['message']+` </p>`;
			}
		}
		

		html=html+`</div></div></body></html>`;
		return html;
	}

	/*
		Method:
			getCustomeState

		Description:
			Maps custom states to the formal name shown by IM UI.
	*/

	getCustomeState (documentPath:string): string {
		let state=this.intents[documentPath].state;
		let cstate=this.intents[documentPath].cstate;
		if (state==="active"){
			return "Active";
		} else if (state==="suspend") {
			return "Suspended";
		} else if (state==="delete") {
			return "Not Present";
		} else if ((state==="custom") && (cstate==="saved")) {
			return "Saved";
		} else if ((state==="custom") && (cstate==="planned")) {
			return "Planned";
		} else if ((state==="custom") && (cstate==="deployed")) {
			return "Deployed";
		}
		return "";
	}

	shareStatusBarItem(): vscode.StatusBarItem {
		return myStatusBarItem;
	}

	exposeIntentStatus(documentPath:string):string {
		return this.intents[documentPath].state;
	}

	/*
		Method:
			updateIntentNetworkStatus

		Description:
			Updates the network status for a given intent instance.
	*/

	async updateIntentNetworkStatus(): Promise<void> {
		let items = [];
		const editor = vscode.window.activeTextEditor;
		let document = editor.document;

		const documentPath = document.uri.toString();

		const intent = documentPath.split("/").pop();
		const intenttype = documentPath.split("/")[2].split("_v")[0];
		let stats=["Active","Suspended","Not Present","Saved","Planned","Deployed"];
		let currentState = this.getCustomeState(documentPath);
		for (const s of stats) {
			if (s.toLowerCase()===currentState.toLowerCase()) items.push({label:s,description:"✔"})
			 else items.push({label:s,description:""})
		}
		await vscode.window.showQuickPick(items).then( async selection => {
			if (!selection) {
			  return;
			}
			selection.label.toLowerCase();
			let payload="";
		    switch (selection.label) {
				case "Active": 
					payload=`{"required-network-state":"active"}`;
					break;
				case "Suspended": 
					payload=`{"required-network-state":"suspend"}`;
					break;
				case "Not Present": 
					payload=`{"required-network-state":"delete"}`;
					break;
				case "Saved": 
					payload=`{"required-network-state":"custom","custom-required-network-state":"saved"}`;
					break;
				case "Planned": 
					payload=`{"required-network-state":"custom","custom-required-network-state":"planned"}`;
					break;
				case "Deployed": 
					payload=`{"required-network-state":"custom","custom-required-network-state":"deployed"}`;
					break;
			  	default:
					break;
			}


			let url="https://"+this.nspAddr+":"+this.port+"/restconf/data/ibn:ibn/intent="+intent+","+intenttype;
			const method = "PATCH";
	
			await this._getAuthToken();
			const token = await this.authToken;
			if (!token) {
				throw vscode.FileSystemError.Unavailable('NSP is not reachable');
			}

			let response: any = await this._callNSP(url, {
				method: method,
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'application/json',
					'Authorization': 'Bearer ' + token
				},
				body: `{"ibn:intent":`+payload+`}`
			});
			if (!response){
				throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
			}
			console.log(response);
			console.log(method, url, response.status);
			if (!response.ok) {
				throw vscode.FileSystemError.Unavailable('Intent creation failed!');
			}

			let payloadjs=JSON.parse(payload);
			this.intents[documentPath].state = payloadjs["required-network-state"];
			if (payloadjs["required-network-state"] === "custom") this.intents[documentPath].cstate = payloadjs["custom-required-network-state"];
			else this.intents[documentPath].cstate = "";
			
		  });
		  await vscode.commands.executeCommand("nokia-intent-manager.updateStatusBar");
		  await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
		  this._eventEmiter.fire(document.uri);
	}

	/*
		Method:
			writeIntentType

		Description:
			Called when changes are detected in intent-type files (create/update).
	*/

	async writeIntentType(name: string, data: string): Promise<void> {
		console.log("writeIntent("+name+")");

		if (name in this.intents) {
			await this._updateIntentType(name, data);
		} else {
			if (data.length === 0) {
				data = "";
			}
			await this._createIntentFile(name, data);
		}
	}

	/*
		Method:
			writeIntent

		Description:
			Called when changes are detected in intent-type files (create from copy).
			Empty files are not allowed (i.e. you cannot create an empty intent).
	*/

	async writeIntent(name: string, data: string): Promise<void> {
		console.log("writeIntent("+name+")");
		let decname=decodeURIComponent(name);
		if (decname in this.intents) {
			await this._updateIntent(decname, data);
		} else {
			if (data.length===0){
				vscode.window.showErrorMessage("Cannot create empty intent");
				throw vscode.FileSystemError.NoPermissions("Cannot create empty intent");
			}
			await this._createIntent(decname,data);
		}
	}

	/*
		Method:
			uploadLocalIntent

		Description:
			Uploads a local intent-type to the remote NSP IM.
			This is only allowed from the meta-info.json at this stage.
			As meta-info does not contain intent-type name nor version, if the user does not
			include it manually, the system will request it from the user (input form). 
	*/

	async uploadLocalIntent(uri:vscode.Uri): Promise<void>{
		var fs = require('fs');
		console.log("Uploading Local Intent "+uri);
		console.log(vscode.workspace.getWorkspaceFolder(uri));
		let resources:Array<string>=[];
		let modules:Array<string>=[];
		let views:Array<string>=[];
		
		let filepath= uri.toString().replace("%20"," ").replace("file://","");
		
		// Raising exceptions if some resources are not available (missing files or folders)
		if (!fs.existsSync(filepath.replace("meta-info.json","script-content.js"))){
			vscode.window.showErrorMessage("Script not found");
			throw vscode.FileSystemError.FileNotFound("Script not found");
		}
		if (!fs.existsSync(filepath.replace("meta-info.json","intent-type-resources"))) {
			vscode.window.showErrorMessage("Resources folder not found");
			throw vscode.FileSystemError.FileNotFound("Resources folder not found");
		}
		fs.readdir(filepath.replace("meta-info.json","intent-type-resources"), (err, files) => {
			files.forEach(file => {
			  resources.push(file);
			});
		  });
		if (!fs.existsSync(filepath.replace("meta-info.json","yang-modules"))){
			vscode.window.showErrorMessage("Modules folder not found");
			throw vscode.FileSystemError.FileNotFound("Modules folder not found");
		}
		fs.readdir(filepath.replace("meta-info.json","yang-modules"), (err, files) => {
			files.forEach(file => {
			  modules.push(file);
			});
		  });
		
		if (fs.existsSync(filepath.replace("meta-info.json","views"))){ // We allow upload of local intents with no Views
			fs.readdir(filepath.replace("meta-info.json","views"), (err, files) => {
				files.forEach(file => {
				  views.push(file);
				});
			  });
		} else {
			vscode.window.showWarningMessage("Views not found.");
		}

		console.log(resources);
		console.log(modules);
		const editor = vscode.window.activeTextEditor;
		let document = editor.document;

		const data = document.getText();
		let meta=JSON.parse(data);

		if (!("intent-type" in meta) || !("version" in meta)){
			const intentnameversion = await vscode.window.showInputBox({
				placeHolder: "{lowercasename}_v{version}",
				title: "Intent-type name or version not found in meta. Please insert.",
				validateInput: text => {
					var regex = /^([a-z_]+_v+[1-9])$/g;
				  return regex.test(text) ? null : '{lowercasename}_v{version}'; 
			  }});
			meta['intent-type']=intentnameversion?.split("_v")[0];
			meta['version']=parseInt(intentnameversion?.split("_v")[1]);
		}

		// get auth-token
		await this._getAuthToken();
		const token = await this.authToken;
		if (!token) {
            throw vscode.FileSystemError.Unavailable('NSP is not reachable');
        }
	
		let url = "https://"+this.nspAddr+":"+this.port+"/restconf/data/ibn-administration:ibn-administration/intent-type-catalog/intent-type="+meta['intent-type']+","+meta.version;
		let response: any = await this._callNSP(url, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-cache',
				'Authorization': 'Bearer ' + token
			}
		});
		if (!response){
			throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
		}

		// Check if the intent-type already exists in NSP
		console.log("GET", url, response.status);
		meta["script-content"]="";
		let script = fs.readFileSync(filepath.replace("meta-info.json","script-content.js"), {encoding:'utf8', flag:'r'});
		meta["script-content"]=script;
		
		meta["module"]=[];
		for (const m of modules) {
			let module = fs.readFileSync(filepath.replace("meta-info.json","yang-modules")+"/"+m, {encoding:'utf8', flag:'r'});
			meta["module"].push({"name":m,"yang-content":module});
		}
		meta["resource"]=[];
		for (const m of resources) {
			let resource = fs.readFileSync(filepath.replace("meta-info.json","intent-type-resources")+"/"+m, {encoding:'utf8', flag:'r'});
			meta["resource"].push({"name":m,"value":resource});
		}
		meta["name"]=meta['intent-type'];
		
		let del = ["intent-type","date","category","custom-field","instance-depends-on-category","resourceDirectory","support-nested-type-in-es","supports-network-state-suspend","default-version","author","skip-device-connectivity-check","return-config-as-json","build","composite","support-aggregated-request","notify-intent-instance-events","supported-hardware-types"];
		for (const d of del) delete meta[d];
		let body = {"ibn-administration:intent-type":meta};		
		let method="POST";
		if (response.ok) {
			console.log("Intent already exist, updating");
			vscode.window.showInformationMessage("Updating existing Intent-Type");
			method="PUT";
		} else {
			console.log("New Intent");
			vscode.window.showInformationMessage("Creating new Intent-Type");
			url = "https://"+this.nspAddr+":"+this.port+"/restconf/data/ibn-administration:ibn-administration/intent-type-catalog";
		}

		response = await this._callNSP(url, {
			method: method,
			headers: {
				'Content-Type': 'application/yang-data+json',
				'Accept': 'application/yang-data+json',
				'Authorization': 'Bearer ' + token
			},
			body: JSON.stringify(body)
		});
		if (!response){
			throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
		}

		console.log(method, url, response.status);
		
		if (!response.ok) {
			const jsonResponse = await response.json();
			let show = "Upload local Intent-type failed.";
			if (Object.keys(jsonResponse).includes("ietf-restconf:errors")) show = jsonResponse["ietf-restconf:errors"]["error"][0]["error-message"];
			vscode.window.showErrorMessage(show);
			throw vscode.FileSystemError.Unavailable(show);
		}

		// Uploading views after intent-type creation
		for (const v of views){
			if (v.endsWith("viewConfig")){
				const token = await this.authToken;
				url='https://'+this.nspAddr+':'+this.restport+'/intent-manager/proxy/v1/restconf/data/nsp-intent-type-config-store:intent-type-config/intent-type-configs='+meta['name']+","+meta['version'];
				let viewcontent = fs.readFileSync(filepath.replace("meta-info.json","views")+"/"+v, {encoding:'utf8', flag:'r'});
				method='PATCH';
				var vbody='{"nsp-intent-type-config-store:intent-type-configs":[{"views":[{"name":"'+v.split(".")[0]+'","viewconfig":"'+viewcontent.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g,'\\n')+'"}]}]}';
				response = await this._callNSP(url, {
					method: method,
					headers: {
						'Content-Type': 'application/yang-data+json',
						'Accept': 'application/yang-data+json',
						'Authorization': 'Bearer ' + token
					},
					body: vbody
				});
				if (!response){
					throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
				}
		
				console.log(method, url, response.status);
				
				if (!response.ok) {
					const jsonResponse = await response.json();
					let show = "Upload view failed.";
					if (Object.keys(jsonResponse).includes("ietf-restconf:errors")) show = jsonResponse["ietf-restconf:errors"]["error"][0]["error-message"];
					vscode.window.showErrorMessage(show);
				}
			}
		}
		vscode.window.showInformationMessage("Succesfully uploaded");
	}

	/*
		Method:
			createIntentFromScratch

		Description:
			Creates intent-type by only providing a name. The intent is generated using a basic template.
	*/

	async createIntentFromScratch(name:string, uris:Array<vscode.Uri>|undefined): Promise<void>{
		var fs = require('fs');
		console.log("Creating new intent "+name);
		let modules:Array<string>=[];
		
		if (typeof uris !== "undefined"){
			for (const uri of uris){
				modules.push(uri.toString().replace("%20"," ").replace("file://",""));
			}
		};
	
		console.log(modules);
		
		// get auth-token
		await this._getAuthToken();
		const token = await this.authToken;
		if (!token) {
            throw vscode.FileSystemError.Unavailable('NSP is not reachable');
        }
	
		let url = "https://"+this.nspAddr+":"+this.port+"/restconf/data/ibn-administration:ibn-administration/intent-type-catalog/intent-type="+name+",1";
		let response: any = await this._callNSP(url, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-cache',
				'Authorization': 'Bearer ' + token
			}
		});
		if (!response){
			throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
		}

		// Checking if the intent-type already exists
		console.log("GET", url, response.status);
		if (response.ok) {
			vscode.window.showInformationMessage("Intent name already exist, cannot create");
			throw vscode.FileSystemError.FileExists("Intent name already exist, cannot create");
		}

		// Creating a template for new intent-types (to be updated by the user)
		let meta = {
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
        		"name": name,
        		"live-state-retrieval": false
			}
		};
		meta["ibn-administration:intent-type"]["script-content"]="\nvar RuntimeException = Java.type('java.lang.RuntimeException');\n\nvar prefixToNsMap = {\n  \"ibn\" : \"http://www.nokia.com/management-solutions/ibn\",\n  \"nc\" : \"urn:ietf:params:xml:ns:netconf:base:1.0\",\n  \"device-manager\" : \"http://www.nokia.com/management-solutions/anv\",\n};\n\nvar nsToModule = {\n  \"http://www.nokia.com/management-solutions/anv-device-holders\" : \"anv-device-holders\"\n};\n\nfunction synchronize(input) {\n  var result = synchronizeResultFactory.createSynchronizeResult();\n  // Code to synchronize goes here\n  \n  result.setSuccess(true);\n  return result;\n}\n\nfunction audit(input) {\n  var report = auditFactory.createAuditReport(null, null);\n  // Code to audit goes here\n\n  return report\n}\n\nfunction validate(syncInput) {\n  var contextualErrorJsonObj = {};\n  var intentConfig = syncInput.getJsonIntentConfiguration();\n  \n  // Code to validation here. Add errors to contextualErrorJsonObj.\n  // contextualErrorJsonObj[\"attribute\"] = \"Attribute must be set\";\n  \n  if (Object.keys(contextualErrorJsonObj).length !== 0) {\n        utilityService.throwContextErrorException(contextualErrorJsonObj);\n  }\n}\n\n";
		
		meta["ibn-administration:intent-type"]["module"]=[];
		if (typeof uris !== "undefined"){
			for (const m of modules) {
				let module = fs.readFileSync(m, {encoding:'utf8', flag:'r'});
				meta["ibn-administration:intent-type"]["module"].push({"name":m.split("/").pop(),"yang-content":module});
			}
		} else meta["ibn-administration:intent-type"]["module"].push({"name":name+".yang","yang-content":"module "+name+" {\n  namespace \"http://www.nokia.com/management-solutions/"+name+"\";\n  prefix \""+name+"\";\n\n  organization        \"NOKIA Corp\";\n  contact \"\";\n  description \"\";\n  revision \"2023-03-07\" {\n    description\n      \"Initial revision.\";\n  }\n  grouping configuration-details {\n    container "+name+"{\n\n    }\n  }\n   \n  uses "+name+":configuration-details;\n}\n"})
		meta["ibn-administration:intent-type"]["resource"]=[];
		meta["ibn-administration:intent-type"]["resource"].push({"name":name+".js","value":""});
		
		//Consider adding composite
		let del = ["intent-type","date","category","custom-field","instance-depends-on-category","resourceDirectory","support-nested-type-in-es","supports-network-state-suspend","default-version","author","skip-device-connectivity-check","return-config-as-json","build","composite","support-aggregated-request","notify-intent-instance-events","supported-hardware-types"];
		for (const d of del) delete meta["ibn-administration:intent-type"][d];
		let body = meta;		
		let method="POST";
		url = "https://"+this.nspAddr+":"+this.port+"/restconf/data/ibn-administration:ibn-administration/intent-type-catalog";

		response = await this._callNSP(url, {
			method: method,
			headers: {
				'Content-Type': 'application/yang-data+json',
				'Accept': 'application/yang-data+json',
				'Authorization': 'Bearer ' + token
			},
			body: JSON.stringify(body)
		});
		if (!response){
			throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
		}

		console.log(method, url, response.status);
		
		if (!response.ok) {
			let json = await response.json();
			let show = "Upload local Intent-type failed.";
			if (Object.keys(json).includes("ietf-restconf:errors")) show = json["ietf-restconf:errors"]["error"][0]["error-message"];
			vscode.window.showErrorMessage(show);
			throw vscode.FileSystemError.Unavailable('Local Intent upload failed!');
		}
		await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
		vscode.window.showInformationMessage("Succesfully created");
	}

	/*
		Method:
			openIntentCreation

		Description:
			Opens the intent-type view to allow user creating new intent instances.
	*/

	async openIntentCreation():Promise<void>{
		const editor = vscode.window.activeTextEditor;
		if (editor) {
            let document = editor.document;
            const documentPath = document.uri.toString();
			const intent = documentPath.split("/")[2];
			let url="https://"+this.nspAddr+":"+this.restport+"/intent-manager/intentTypes/"+intent.replace("_v","/")+"/intents/createIntent";
			vscode.env.openExternal(vscode.Uri.parse(url));
		}
	}

	/*
		Method:
			deleteIntentFile

		Description:
			Deletes an intent-type resource file.
			Meta-info or script are not allowed.
	*/

	async deleteIntentFile(name:string): Promise<void> {
		// get auth-token

		const intent = name.toString().split("/")[2];
		const resource_name = name.toString().split("/").pop();
	
		let url="";
		let method = "DELETE";
		let body = {};
		if (name.includes("intent-type-resources")) {
			url="https://"+this.nspAddr+":"+this.restport+"/mdt/rest/restconf/data/ibn-administration:ibn-administration/intent-type-catalog/intent-type="+intent.replace("_v",",")+"/resource="+resource_name;
		} else if (name.includes("yang-modules")) {
			url="https://"+this.nspAddr+":"+this.restport+"/mdt/rest/restconf/data/ibn-administration:ibn-administration/intent-type-catalog/intent-type="+intent.replace("_v",",")+"/module="+resource_name;
		} else if (name.includes("views")) {
			url="https://"+this.nspAddr+":"+this.restport+"/intent-manager/proxy/v1/restconf/data/nsp-intent-type-config-store:intent-type-config/intent-type-configs="+intent.replace("_v",",");
			method = "PUT";
			body = {
				"nsp-intent-type-config-store:intent-type-configs": [
					{
						"intent-type": intent.split("_v")[0],
						"version": parseInt(intent.split("_v").pop()),
						"yang-entry-point": "",
						"views": [
						]
					}
				]
			};
			const view = resource_name?.split(".")[0];
			const viewspath = name.replace("/"+resource_name,"");
			const allviews = JSON.parse(this.intents[viewspath].content);
			for (const v of allviews){
				if (!v.includes(decodeURIComponent(view)) && !v.includes("schemaForm") && !v.includes("settings")){
					body["nsp-intent-type-config-store:intent-type-configs"][0]["views"].push({"name":v.split(".")[0],"viewconfig":this.intents[viewspath+"/"+encodeURIComponent(v)].content});
				}
			}
			body["nsp-intent-type-config-store:intent-type-configs"][0]["yang-entry-point"]=JSON.parse(this.intents[viewspath+"/view.settings"].content)["yang-entry-point"];
		} else {
			throw vscode.FileSystemError.Unavailable("Unrecognize file: "+name);
		}

		await this._getAuthToken();
		const token = await this.authToken;
		if (!token) {
            throw vscode.FileSystemError.Unavailable('NSP is not reachable');
        }

		let response: any = await this._callNSP(url, {
			method: method,
			headers: {
				'Content-Type': 'application/yang-data+json',
				'Accept': 'application/yang-data+json',
				'Authorization': 'Bearer ' + token
			},
			body: JSON.stringify(body)
		});

		if (!response){
			throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
		}

		console.log(response);
		console.log(body);
		console.log(method, url, response.status);

		//Removing the resource from the extension registry.
		console.log("Deleting registry for: "+name);
		delete this.intents[name];
		if (name.includes("views")){
			const schmUri = name.replace("viewConfig","schemaForm");
			delete this.intents[schmUri];
		}
		

		await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
		vscode.window.showInformationMessage("Resource "+resource_name+" from intent "+intent+" intent successfully deleted");
	}

	/*
		Method:
			deleteIntentVersion

		Description:
			Deletes an intent-type (version) from the system
	*/

	async deleteIntentVersion(name:string): Promise<void> {

		const intent = name.toString().split("/")[2];
		let url="https://"+this.nspAddr+":"+this.restport+"/mdt/rest/restconf/data/ibn-administration:ibn-administration/intent-type-catalog/intent-type="+intent.replace("_v",",");
		const method = "DELETE";

		await this._getAuthToken();
		const token = await this.authToken;
		if (!token) {
            throw vscode.FileSystemError.Unavailable('NSP is not reachable');
        }

		let response: any = await this._callNSP(url, {
			method: method,
			headers: {
				'Content-Type': 'application/yang-data+json',
				'Accept': 'application/yang-data+json',
				'Authorization': 'Bearer ' + token
			}
		});

		if (!response){
			throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
		}

		console.log(response);
		console.log(method, url, response.status);
		if (!response.ok) {
			throw vscode.FileSystemError.Unavailable('Intent deletion failed!');
		}

		await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
		vscode.window.showInformationMessage("Intent "+intent+" intent successfully deleted");
	}

	/*
		Method:
			deleteIntent

		Description:
			Deletes an intent instance from the system
	*/

	async deleteIntent(name:string): Promise<void> {

		const intent = name.split("/").pop();
		const intenttype = name.split("/")[2].split("_v")[0];
		const intentversion = name.split("/")[2].split("_v")[1];
		let url="https://"+this.nspAddr+":"+this.port+"/restconf/data/ibn:ibn/intent="+intent+","+intenttype;
		const method = "DELETE";

		await this._getAuthToken();
		const token = await this.authToken;
		if (!token) {
            throw vscode.FileSystemError.Unavailable('NSP is not reachable');
        }

		let response: any = await this._callNSP(url, {
			method: method,
			headers: {
				'Content-Type': 'application/yang-data+json',
				'Accept': 'application/yang-data+json',
				'Authorization': 'Bearer ' + token
			}
		});

		if (!response){
			throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
		}

		console.log(response);
		console.log(method, url, response.status);
		if (!response.ok) {
			throw vscode.FileSystemError.Unavailable('Intent deletion failed!');
		}

		delete this.intents[name];

		await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
		vscode.window.showInformationMessage("Intent "+intent+" intent successfully deleted");
	}

	/*
		Method:
			createNewIntentVersion

		Description:
			Creates a new intent-type version for the selected intent-type.
	*/

	async createNewIntentVersion(name:string){

		const intent = name.toString().split("/")[2];
		let url="https://"+this.nspAddr+":"+this.restport+"/mdt/rest/ibn/save/"+intent.replace("_v","/");
		const method = "POST";

		await this._getAuthToken();
		const token = await this.authToken;
		if (!token) {
            throw vscode.FileSystemError.Unavailable('NSP is not reachable');
        }

		let response: any = await this._callNSP(url, {
			method: method,
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json',
				'Authorization': 'Bearer ' + token
			},
			body: "{}"
		});

		if (!response){
			throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
		}

		console.log(response);
		console.log(method, url, response.status);
		if (!response.ok) {
			throw vscode.FileSystemError.Unavailable('Intent creation failed!');
		}

		await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
		vscode.window.showInformationMessage("New "+intent.split("_v")[0]+" intent version created");
	}

	/*
		Method:
			cloneIntent

		Description:
			Clones an intent-type. The user is requested to provide a new valid name.
	*/
	
	async cloneIntent(name:string, newName:string){

		if (Object.keys(this.intents).includes("im:/intent-types/"+newName+"_v1")){
			throw vscode.FileSystemError.FileExists("The intent "+newName+" already exists");
		}
		const intent = name.toString().split("/")[2];
		let url="https://"+this.nspAddr+":"+this.restport+"/mdt/rest/ibn/save/"+intent.replace("_v","/")+"?newIntentTypeName="+newName;
		const method = "POST";

		await this._getAuthToken();
		const token = await this.authToken;
		if (!token) {
            throw vscode.FileSystemError.Unavailable('NSP is not reachable');
        }

		let response: any = await this._callNSP(url, {
			method: method,
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json',
				'Authorization': 'Bearer ' + token
			},
			body: "{}"
		});

		if (!response){
			throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
		}

		console.log(response);
		console.log(method, url, response.status);
		if (!response.ok) {
			throw vscode.FileSystemError.Unavailable('Intent creation failed!');
		}

		await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
		vscode.window.showInformationMessage("New "+intent.split("_v")[0]+" intent version created");
	}

	/*
		Method:
			getLogs

		Description:
			Get the logs exposed by log/logger classes from OpenSearch for a particular intent instance (beta).
	*/

	async getLogs():Promise<void> {

		const editor = vscode.window.activeTextEditor;
		let document = editor.document;

		const documentPath = decodeURIComponent(document.uri.toString());

		const intent = documentPath.split("/").pop();
		const intenttype = documentPath.split("/")[2].split("_v")[0];

		// Request done to the dev tools API within OpenSearch. Beta query (to test and evaluate if requires updates).

		let url = "https://"+this.nspAddr+"/logviewer/api/console/proxy?path=nsp-mdt-logs-*/_search&method=GET";
		const method = 'POST';
		// get auth-token
		await this._getAuthToken();
		const token = await this.authToken;
		if (!token) {
            throw vscode.FileSystemError.Unavailable('NSP is not reachable');
        }

		// checking NSP release to match the correct OSD version. To investigate.
		let osdversion='2.6.0';
		if (this.nsp_version.includes("23.11")){
			osdversion='2.10.0';
		}

		let headers = {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-cache',
			'Osd-Version': osdversion,
			'Authorization': 'Bearer ' + token
		};

		let response: any = await this._callNSP(url, {
			method: method,
			headers: headers,
			body: '{"query": {"match_phrase": {"log": "\\"target\\":\\"'+intent+'\\""}},"sort": {"@datetime": "desc"},"size": 20}'
		});

		if (!response){
			throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
		}

		console.log(response);
		console.log('{"query": {"match_phrase": {"log": "\\"target\\":\\"'+intent+'\\""}},"sort": {"@datetime": "desc"},"size": 20}');
		console.log(method, url, response.status);
		
		if (!response.ok) {
			vscode.window.showErrorMessage('Error while getting logs');
			throw vscode.FileSystemError.Unavailable('Error while getting logs');
		}
		let json: any = await response.json();
		const panel = vscode.window.createWebviewPanel(
			'intentLogs',
			intent+' Logs',
			vscode.ViewColumn.Two
		);
		panel.webview.html = await this._getWebviewContentLogs(intent,intenttype,json["hits"]["hits"],panel);
	}

	/*
		Method:
			audit

		Description:
			Audits the intent instance and pulls the result to update the intent decoration. It allows to show misalignment details.
	*/

	async audit(): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		let document = editor.document;

		const documentPath = document.uri.toString();

		const intent = documentPath.split("/").pop();
		const intenttype = documentPath.split("/")[2].split("_v")[0];
		let url = "https://"+this.nspAddr+":"+this.port+"/restconf/data/ibn:ibn/intent="+intent+","+intenttype+"/audit";
		const method = 'POST';
		// get auth-token
		await this._getAuthToken();
		const token = await this.authToken;
		if (!token) {
            throw vscode.FileSystemError.Unavailable('NSP is not reachable');
        }

		let headers = {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-cache',
			'Authorization': 'Bearer ' + token
		};
		let response: any = await this._callNSP(url, {
			method: method,
			headers: headers,
			body: ""
		});

		if (!response){
			throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
		}

		console.log(response);
		console.log(method, url, response.status);
		
		if (!response.ok) {
			vscode.window.showErrorMessage('Error while auditing');
			throw vscode.FileSystemError.Unavailable('Error while auditing');
		}
		let json: any = await response.json();
		var path = require('path');
		if (Object.keys(json["ibn:output"]["audit-report"]).includes("misaligned-attribute")||Object.keys(json["ibn:output"]["audit-report"]).includes("misaligned-object")){
			vscode.window.showWarningMessage("Intent Misaligned","Details","Cancel").then( async (selectedItem) => {
				if ('Details' === selectedItem) {
					//Beta
					console.log(path.join(this.extContext.extensionPath, 'media'));
					const panel = vscode.window.createWebviewPanel(
						'auditReport',
						intent+' Audit',
						vscode.ViewColumn.Two,
						{localResourceRoots: [vscode.Uri.file(path.join(this.extContext.extensionPath, 'media'))]}
					);
					panel.webview.html = await this._getWebviewContent(intent,intenttype,json["ibn:output"]["audit-report"],panel);
				} 
			});;
			this.intents[documentPath].aligned=false;
		} else {
			vscode.window.showInformationMessage("Intent Aligned");
			this.intents[documentPath].aligned=true;
		}
		await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
		this._eventEmiter.fire(document.uri);
	}

	/*
		Method:
			sync

		Description:
			Triggers the intent-type synchronize method for the particular intent instance.
	*/

	async sync(): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		let document = editor.document;

		const documentPath = document.uri.toString();

		const intent = documentPath.split("/").pop();
		const intenttype = documentPath.split("/")[2].split("_v")[0];
		let url = "https://"+this.nspAddr+":"+this.port+"/restconf/data/ibn:ibn/intent="+intent+","+intenttype+"/synchronize";
		const method = 'POST';
		// get auth-token
		await this._getAuthToken();
		const token = await this.authToken;
		if (!token) {
            throw vscode.FileSystemError.Unavailable('NSP is not reachable');
        }

		let headers = {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-cache',
			'Authorization': 'Bearer ' + token
		};
		let response: any = await this._callNSP(url, {
			method: method,
			headers: headers,
			body: ""
		});

		if (!response){
			throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
		}

		console.log(response);
		console.log(method, url, response.status);
		
		if (!response.ok) {
			vscode.window.showErrorMessage('Error during Synchronize');
			throw vscode.FileSystemError.Unavailable('Error during Synchronize');
		}
		vscode.window.showInformationMessage("Intent Synchronized");
		await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
		this._eventEmiter.fire(document.uri);
	}

	/*
		Method:
			sync

		Description:
			Opens NSP IM web for an intent-type.
	*/

	async openInBrowser(): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
            let document = editor.document;
            const documentPath = document.uri.toString();
			const intent = documentPath.split("/")[2];
			let url="https://"+this.nspAddr+":"+this.restport+"/intent-manager/intentTypes/"+intent.replace("_v","/")+"/intents";
			vscode.env.openExternal(vscode.Uri.parse(url));
		}
	}

	// --- implement FileDecorator    
	public provideFileDecoration( uri: vscode.Uri): vscode.ProviderResult<vscode.FileDecoration> {
		if (uri.toString().startsWith('im:/intent-types/')) {
			if (this.intents[uri.toString()].signed) return DECORATION_SIGNED;
			else if (uri.toString().endsWith("yang-modules")) return DECORATION_YANG;
			else if (uri.toString().endsWith("intent-type-resources")) return DECORATION_RESOURCE;
			else if (uri.toString().endsWith("views")) return DECORATION_VIEWS;
			return DECORATION_UNSIGNED;
		} else if (uri.toString().startsWith('im:/intents/')) {
			let path = uri.toString();
			
			if (path.split("/").length === 3) return;
			if (this.intents[path].aligned) return DECORATION_ALIGNED;
			else return DECORATION_MISALIGNED;
		}
	}

	/*
		Method:
			readDirectory

		Description:
			This is the main method in charge of pulling the data from IM and keeping it updated in vsCode.
			It gets the full list of intent-types and instances, while loads the intent-type content when opening an intent-type.
			Is is called any time the user opens a folder, plus it is triggered when updating different content to keep the vscode
			content updated and in sync with the remote NSP.
	*/
	
	async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		console.log("executing readDirectory("+uri+")");
		let httpreq = true;

		console.log("workspace folder");
		console.log(vscode.workspace.getWorkspaceFolder(uri));

		let url = undefined;
		let viewsurl = undefined;
		let getviews = false;
		let method = 'GET';
		let body = "";
		if (uri.toString() === "im:/") { // Return two main folders. Nothing to be loaded from IM
			return [['intent-types', vscode.FileType.Directory],['intents', vscode.FileType.Directory]];
		} else if ((uri.toString() === "im:/intent-types") || (uri.toString() === "im:/intents")) { // Return full list of intent-types when opening intent types or intents folders
			url = "https://"+this.nspAddr+":"+this.port+"/restconf/data/ibn-administration:ibn-administration/intent-type-catalog?fields=intent-type(name;date;version;lifecycle-state;mapping-engine)";
		} else if ((uri.toString().startsWith("im:/intent-types/")) && (uri.toString().split("/").length===3)) { // Load full list of intent type scripts and resources
			url = "https://"+this.nspAddr+":"+this.port+"/restconf/data/ibn-administration:ibn-administration/intent-type-catalog/intent-type="+uri.toString().split("/").pop().replace("_v",","); 
			getviews = true;
			viewsurl = "https://"+this.nspAddr+":"+this.restport+"/intent-manager/proxy/v1/restconf/data/nsp-intent-type-config-store:intent-type-config/intent-type-configs="+uri.toString().split("/").pop().replace("_v",",");
		} else if ((uri.toString().startsWith("im:/intents/")) && (uri.toString().split("/").length===3)) { // Load full list of intent instances for an intent-type
			url = "https://"+this.nspAddr+":"+this.port+"/restconf/operations/ibn:search-intents";
			method = 'POST';
			body=`{"ibn:input": {"filter": {"intent-type-list": [{"intent-type": "`+uri.toString().split("/").pop()?.split("_v")[0]+`","intent-type-version": "`+uri.toString().split("/").pop()?.split("_v")[1]+`"}]},"page-number": 0,"page-size": 100}}`;
		} else if ((uri.toString().startsWith("im:/intent-types/"))){
			httpreq = false;
		} else {
			throw vscode.FileSystemError.FileNotADirectory('Unknown resouce!');
		}
		let json:any;
		if (httpreq) {
			// get auth-token
			await this._getAuthToken();
			const token = await this.authToken;
			if (!token) {
				throw vscode.FileSystemError.Unavailable('NSP is not reachable');
			}

			// Getting the NSP version when reconnecting. Used to check OpenSearch client API version
			this.getNSPversion();

			let headers = {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-cache',
				'Authorization': 'Bearer ' + token
			};
			let response: any;
			if (method === 'GET') {
				response = await this._callNSP(url, {
					method: method,
					headers: headers
				});
			} else {
				response = await this._callNSP(url, {
					method: method,
					headers: headers,
					body: body
				});
			}
			if (!response){
				throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
			}
			console.log(response);
			console.log(method, url, response.status);
			if (!response.ok) {
				throw vscode.FileSystemError.Unavailable('Cannot get intent list');
			}
			json = await response.json();
		}
		let result: [string, vscode.FileType][]=[];
		// Load data from IM and create folders / files depending on the selected directory
		if ((uri.toString() === "im:/intent-types") || (uri.toString() === "im:/intents")) {
			result = (json["ibn-administration:intent-type-catalog"]["intent-type"] ?? []).map<[string, vscode.FileType]> (entry => [entry.name+"_v"+entry.version, vscode.FileType.Directory]);
		} else if ((uri.toString().startsWith("im:/intent-types/")) && (uri.toString().split("/").length===3)) {
			// adding Yang modules
			result.push(["yang-modules",vscode.FileType.Directory]);
			
			this.intents[uri.toString()]= new FileStat("", Date.parse(json["ibn-administration:intent-type"].date), Date.parse(json["ibn-administration:intent-type"].date), 0, false, json["ibn-administration:intent-type"].version,JSON.stringify(json["ibn-administration:intent-type"], null, "\t"));
			this.intents[uri.toString()].intentContent=JSON.parse(JSON.stringify(json));
			let dlist = ["default-version", "supports-health", "skip-device-connectivity-check", "support-aggregated-request"];
			for (const d of dlist) delete this.intents[uri.toString()].intentContent["ibn-administration:intent-type"][d];
			///NEW
			let modules = [];
			for (const module of json["ibn-administration:intent-type"]["module"]){
				this.intents[vscode.Uri.parse(uri.toString()+"/yang-modules/"+module.name).toString()]= new FileStat(module.name, Date.parse(json["ibn-administration:intent-type"].date), Date.parse(json["ibn-administration:intent-type"].date), 0, false, json["ibn-administration:intent-type"].version,module["yang-content"]);
				modules.push(module.name);
			};
			this.intents[uri.toString()+"/yang-modules"]= new FileStat("yang-modules", Date.parse(json["ibn-administration:intent-type"].date), Date.parse(json["ibn-administration:intent-type"].date), 0, false, json["ibn-administration:intent-type"].version,JSON.stringify(modules));
			
			//adding views
			result.push(["views",vscode.FileType.Directory]);
			let views = [];
			let respviews: any;
			let viewsjson:any;
			const token = await this.authToken;
			let headers = {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-cache',
				'Authorization': 'Bearer ' + token
			};
			respviews = await this._callNSP(viewsurl, {
				method: method,
				headers: headers
			});

			if (!respviews){
				throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
			}
			
			console.log(respviews);
			console.log(method, viewsurl, respviews.status);
			if (!respviews.ok) {
				console.log("Error retrieveing views.");
				vscode.window.showWarningMessage("Unable to load views for intent-type: "+uri.toString().split("/").pop().replace("_v",","));
			} else {
				viewsjson = await respviews.json();
				if (viewsjson["nsp-intent-type-config-store:intent-type-configs"][0].hasOwnProperty("views")){
					for (const view of viewsjson["nsp-intent-type-config-store:intent-type-configs"][0]["views"]){
						const viewconfigURI = vscode.Uri.parse(uri.toString()+"/views/"+encodeURIComponent(view.name)+".viewConfig").toString();
						const schemaformURI = vscode.Uri.parse(uri.toString()+"/views/"+encodeURIComponent(view.name)+".schemaForm").toString();
						console.info('Adding viewconfig ', viewconfigURI);
						console.info('Adding schemaform ', schemaformURI);
						this.intents[viewconfigURI]= new FileStat(view.name+".viewConfig", Date.parse(json["ibn-administration:intent-type"].date), Date.parse(json["ibn-administration:intent-type"].date), 0, false, json["ibn-administration:intent-type"].version,view.viewconfig);
						this.intents[schemaformURI]= new FileStat(view.name+".schemaForm", Date.parse(json["ibn-administration:intent-type"].date), Date.parse(json["ibn-administration:intent-type"].date), 0, false, json["ibn-administration:intent-type"].version,JSON.stringify(JSON.parse(view.schemaform), null, 2));
						views.push(view.name+".viewConfig");
						views.push(view.name+".schemaForm");
					}
				}
				const viewsettingsURI = vscode.Uri.parse(uri.toString()+"/views/"+"view.settings").toString();
				this.intents[viewsettingsURI]= new FileStat("view.settings", Date.parse(json["ibn-administration:intent-type"].date), Date.parse(json["ibn-administration:intent-type"].date), 0, false, json["ibn-administration:intent-type"].version,JSON.stringify({ "yang-entry-point": viewsjson["nsp-intent-type-config-store:intent-type-configs"][0]["yang-entry-point"]}));
				views.push("view.settings");
			}
			this.intents[uri.toString()+"/views"]= new FileStat("views", Date.parse(json["ibn-administration:intent-type"].date), Date.parse(json["ibn-administration:intent-type"].date), 0, false, json["ibn-administration:intent-type"].version,JSON.stringify(views));

			// adding resources
			result.push(["intent-type-resources",vscode.FileType.Directory]);
			let resources = [];
			if (json["ibn-administration:intent-type"].hasOwnProperty("resource")){
				for (const resource of json["ibn-administration:intent-type"]["resource"]) {
					const intentTypeURI = vscode.Uri.parse(uri.toString()+"/intent-type-resources/"+encodeURIComponent(resource.name)).toString();
					console.warn('intent-type URI', intentTypeURI);

					this.intents[intentTypeURI]= new FileStat(resource.name, Date.parse(json["ibn-administration:intent-type"].date), Date.parse(json["ibn-administration:intent-type"].date), 0, false, json["ibn-administration:intent-type"].version,resource.value);
					resources.push(resource.name);
				}
			};
			this.intents[uri.toString()+"/intent-type-resources"]= new FileStat("intent-type-resources", Date.parse(json["ibn-administration:intent-type"].date), Date.parse(json["ibn-administration:intent-type"].date), 0, false, json["ibn-administration:intent-type"].version,JSON.stringify(resources));

			result.push(["script-content.js",vscode.FileType.File]);
			this.intents[uri.toString()+"/script-content.js"]= new FileStat("script-content.js", Date.parse(json["ibn-administration:intent-type"].date), Date.parse(json["ibn-administration:intent-type"].date), 0, false, json["ibn-administration:intent-type"].version,json["ibn-administration:intent-type"]["script-content"]);
			result.push(["meta-info.json",vscode.FileType.File]);
			let del = ["script-content","module","resource","date","support-nested-type-in-es","supports-network-state-suspend","default-version","author","version","skip-device-connectivity-check","return-config-as-json","build","composite","name","support-aggregated-request","notify-intent-instance-events"];
			for (const d of del) delete json["ibn-administration:intent-type"][d];
			this.intents[uri.toString()+"/meta-info.json"]= new FileStat("meta-info.json", Date.parse(json["ibn-administration:intent-type"].date), Date.parse(json["ibn-administration:intent-type"].date), 0, false, json["ibn-administration:intent-type"].version,JSON.stringify(json["ibn-administration:intent-type"], null, "\t"));
		} else if (uri.toString().startsWith("im:/intent-types/")) {
			console.log(this.intents[uri.toString()]);
			const files = JSON.parse(this.intents[uri.toString()].content);
			console.log(files);
			for (const f of files){
				result.push([f,vscode.FileType.File]);
			}
		} else if ((uri.toString().startsWith("im:/intents/")) && (uri.toString().split("/").length===3)) {
			console.log("loading intents");
			console.log(json);
			
			if (Object.keys(json["ibn:output"]["intents"]).includes("intent")){
				console.log("hay intents");
				for (const intent of json["ibn:output"]["intents"]["intent"]){
					this.intents[uri.toString()+"/"+encodeURIComponent(intent.target)]= new FileStat(intent.target, Date.now(), Date.now(), 0, false, +uri.toString().split("/").pop()?.split("_v")[1],"");
					this.intents[uri.toString()+"/"+encodeURIComponent(intent.target)].aligned = intent.aligned === "true";
					this.intents[uri.toString()+"/"+encodeURIComponent(intent.target)].state = intent["required-network-state"];
					if (intent["required-network-state"] === "custom") this.intents[uri.toString()+"/"+encodeURIComponent(intent.target)].cstate = intent["custom-required-network-state"];
					else this.intents[uri.toString()+"/"+encodeURIComponent(intent.target)].cstate = "";
				}
				result = (json["ibn:output"]["intents"]["intent"] ?? []).map<[string, vscode.FileType]> (entry => [entry.target, vscode.FileType.File]);
			}
		}

		console.log(result);
		
		return result;
	}

	/*
		Method:
			stat

		Description:
			vsCode internal method called any time a file or folder is open to get the details.
			Here we include decorations and file permissions (i.e. read-only), depending of the file type.
	*/

	async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
		console.log("executing stat("+uri+")");
		console.log("executing stat("+uri.toString()+")");

		if ((uri.toString()==='im:/') || (uri.toString()==='im:/intent-types') || (uri.toString()==='im:/intents') || ((uri.toString().startsWith("im:/intents/")) && (uri.toString().split("/").length===3)) || ((uri.toString().startsWith("im:/intent-types/")) && (["intent-type-resources","yang-modules","views"].includes(uri.toString().split("/").pop())))) {
			
			// Check if NSP is connected
			await this._getAuthToken();
            if (!await this.authToken) {
                throw vscode.FileSystemError.Unavailable('NSP is not reachable');
            }
			
			return {
				type: vscode.FileType.Directory,
				ctime: 0,
				mtime: Date.now(),
				size: 0,
				permissions: vscode.FilePermission.Readonly
			};
		} else if ((uri.toString().startsWith("im:/intent-types/")) && (uri.toString().split("/").length===3)) {
			return {
				type: vscode.FileType.Directory,
				ctime: 0,
				mtime: Date.now(),
				size: 0
			};
		} else if ((uri.toString().startsWith('im:/intent-types/')) || (uri.toString().startsWith('im:/intents/'))) {
			const key = uri.toString(); 
			if (!(key in this.intents)) {
				let readpath = uri.toString().split("/").slice(0,3).join("/");
				await this.readDirectory(vscode.Uri.parse(readpath));
			}
			if (key in this.intents) {
				if (key.includes("schemaForm") || key.includes("settings")) this.intents[key].permissions=vscode.FilePermission.Readonly;
				console.log("this is where we return: "+key);
				return this.intents[key];
			} else if (key+".viewConfig" in this.intents) {
				console.log("this is where we return 2: "+key+".viewConfig");
				return this.intents[key+".viewConfig"];
			}
			console.warn('unknown intent/intent-type');
			throw vscode.FileSystemError.FileNotFound('Unknown intent/intent-type!');
		} 
		console.warn('unknown resource');
		throw vscode.FileSystemError.FileNotFound('Unknown resouce!');
	}

	/*
		Method:
			readFile

		Description:
			vsCode internal method called any time a file is open to visualize the content.
			The method returns the content of the file that gets visualized in the editor.
	*/

	async readFile(uri: vscode.Uri): Promise<Uint8Array> {
		console.log("executing readFile("+uri+")");
		if (uri.toString().startsWith("im:/intent-types/")){
			if (!Object.keys(this.intents).includes(uri.toString())) {
				await this.readDirectory(vscode.Uri.parse(uri.toString().split("/").slice(0,3).join("/")));
				if (!Object.keys(this.intents).includes(uri.toString())) {
					if (uri.toString().includes("views")){
						await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
						await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
					}
					throw vscode.FileSystemError.FileNotADirectory('Unknown resouces!');
				}
			}
			return Buffer.from(this.intents[uri.toString()].content);
		} else if (uri.toString().startsWith("im:/intents/")) {
			if (!Object.keys(this.intents).includes(uri.toString())) {
				await this.readDirectory(vscode.Uri.parse(uri.toString().split("/").slice(0,3).join("/")));
			}
			let intentid = uri.toString().split("/").pop();
			let intenttype = uri.toString().split("/")[2].split("_v")[0];

			console.log(intentid);
			console.log(intenttype);

			// get auth-token
			await this._getAuthToken();
			const token = await this.authToken;
			if (!token) {
				throw vscode.FileSystemError.Unavailable('NSP is not reachable');
			}

			let headers = {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-cache',
				'Authorization': 'Bearer ' + token
			};
			let url ="https://"+this.nspAddr+":"+this.port+"/restconf/data/ibn:ibn/intent="+intentid+","+intenttype+"?content=config";
			let response: any = await this._callNSP(url, {
				method: 'GET',
				headers: headers
			});
			if (!response){
				throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
			}
			console.log(response);
			console.log('GET', url, response.status);
			
			if (!response.ok) {
				vscode.window.showErrorMessage('Cannot get intent content');
				throw vscode.FileSystemError.Unavailable('Cannot get intent content');
			}
			let json: any = await response.json();
			let path = uri.toString();

			this.intents[path].content=JSON.stringify(json['ibn:intent']['intent-specific-data'], null, '\t');
			return Buffer.from(JSON.stringify(json['ibn:intent']['intent-specific-data'], null, '\t'));
		}
	}

	/*
		Method:
			writeFile

		Description:
			vsCode internal method called any time a file get updated or created. The function contains the file path plus the content.
			Here we redirect to the appropriate depending on the file type (inten-type resources, intent instances).
	*/

	async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }): Promise<void> {
		console.log("executing writeFile("+uri+")");
		if (uri.toString().startsWith('im:/intent-types/')) {
			const key = uri.toString();
			await this.writeIntentType(key, content.toString());
		}  else if (uri.toString().startsWith('im:/intents/')) {
			const key = uri.toString();
			await this.writeIntent(key, content.toString());
		} else {
			throw vscode.FileSystemError.FileNotFound('Unknown resource-type!');
		}
	}

	/*
		Method:
			rename

		Description:
			We are blocking renaming files in the extension.
	*/

	async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): Promise<void> {
		throw vscode.FileSystemError.NoPermissions('Unsupported operation!');	
	}

	/*
		Method:
			delete

		Description:
			vsCode internal method called any time a file or folder gets deleted in the file system.
			Here we redirect to the appropriate functions, depending on the selected file or folder
			(intent-type, intent-type resources, intent instances).
	*/

	async delete(uri: vscode.Uri): Promise<void> {
		console.log("executing delete("+uri+")");

		if (uri.toString().includes("intent-type-resources/") || uri.toString().includes("yang-modules/") || uri.toString().includes("views/")) {
			this.deleteIntentFile(uri.toString());
		} else if ((uri.toString().split("/").length===3)&&(uri.toString().startsWith("im:/intent-types/"))) {
			this.deleteIntentVersion(uri.toString());
		} else if ((uri.toString().split("/").length===4)&&(uri.toString().startsWith("im:/intents/"))) {
			this.deleteIntent(uri.toString());
		} else {
			throw vscode.FileSystemError.NoPermissions('Permission denied!');
		}
	}

	/*
		Method:
			createDirectory

		Description:
			Not supported in this file system extension. New folders are created when creating new intent-types.
	*/

	createDirectory(uri: vscode.Uri): void {
		console.log("executing createDirectory("+uri+")");
		throw vscode.FileSystemError.NoPermissions('Unknown resource!');
	}

	// --- manage file events

	private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();

	readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

	watch(_resource: vscode.Uri): vscode.Disposable {
		// ignore, fires for all changes...
		return new vscode.Disposable(() => { });
	}	
}
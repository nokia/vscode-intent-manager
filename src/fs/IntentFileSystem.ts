import * as vscode from 'vscode';

import { raiseRestconfError, printRestconfError } from '../common/errors';
import { IntentTypeCache } from './IntentTypeCache';

export interface IntentFileSystemDeps {
	cache: IntentTypeCache;
	pluginLogs: vscode.LogOutputChannel;
	queryLimit: number;
	fileIgnore: string[];
	fileInclude: string[];
	callNSP: (url: string, options: { method: string; body?: string; headers?: object; signal?: AbortSignal }) => Promise<any>;
	fireDecoration: (uri: vscode.Uri | vscode.Uri[]) => void;
	newRemoteIntentType: (args: any[]) => Promise<void>;
}

export class IntentFileSystem {
	private readonly _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

	constructor(private readonly deps: IntentFileSystemDeps) {}

		async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
			const path = uri.toString();
			this.deps.pluginLogs.debug("readDirectory("+path+")");
	
			let result:[string, vscode.FileType][] = [];
	
			if (path === "im:/") {
				// readDirectory() was executed with IM root folder
				//
				// Function will get and return the list of all intent-types
				// while labels to ignore are applied as blacklist.
	
				const url = "/restconf/operations/ibn-administration:search-intent-types";
				const body = {"ibn-administration:input": {"page-number": 0, "page-size": this.deps.queryLimit}};
				const response: any = await this.deps.callNSP(url, {method: "POST", body: JSON.stringify(body)});
	
				if (!response)
					throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
				if (!response.ok)
					raiseRestconfError("Getting list of intent-types failed!", await response.json());
	
				const json = await response.json();
				if (json["ibn-administration:output"]["total-count"]>this.deps.queryLimit) {
					vscode.window.showWarningMessage("NSP has more than "+this.deps.queryLimit+" intent-types. Loading the first "+this.deps.queryLimit+" intent-types only.");
				}
	
				// If `includeLabels` was provided, apply whitelist (default: complete list)
				let intentTypes = json["ibn-administration:output"]["intent-type"];
				if (this.deps.fileInclude.length > 0)
					intentTypes = intentTypes.filter((entry: any) =>
						this.deps.fileInclude.some(label => entry.label.includes(label)));
				
				// If `ignoreLabels` was provided, apply blacklist (default: don't filter)
				if (this.deps.fileIgnore.length > 0)
					intentTypes = intentTypes.filter((entry: any) =>
						!this.deps.fileIgnore.some(label => entry.label.includes(label)));
	
				result = intentTypes.map((entry: { name: string; version: string; }) => [entry.name+'_v'+entry.version, vscode.FileType.Directory]);
	
				// Create missing intentType entries in cache
				for (const entry of intentTypes) {
					const intent_type_folder = entry.name+'_v'+entry.version;
					if (!(intent_type_folder in this.deps.cache.intentTypes))
						this.deps.cache.intentTypes[intent_type_folder] = {
							signed:  entry.label.includes('ArtifactAdmin'),
							timestamp: Date.now(), // We don't have the real timestamp yet!
							data:    {},
							intents: {},
							aligned: {},
							desired: {},
							views:   {}
						};
				}
			} else {
				const parts = path.split('/').map(decodeURIComponent);
				const intent_type_folder = parts[1];
				const intent_type_version = intent_type_folder.substring(intent_type_folder.lastIndexOf('_v')+2);
				const intent_type = intent_type_folder.substring(0, intent_type_folder.lastIndexOf('_v'));
	
				if (parts.length===2) {
					// readDirectory() was executed on folder "im:/{intent-type}_v{version}".
					// Get intent-type defintion using IM API to create/update cache entry.
	
					const url = `/restconf/data/ibn-administration:ibn-administration/intent-type-catalog/intent-type=${intent_type},${intent_type_version}`;
					const response: any = await this.deps.callNSP(url, {method: "GET"});
					if (!response)
						throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
					if (!response.ok)
						raiseRestconfError("Getting intent-type details failed!", await response.json());
	
					const json = await response.json();
					const data = json["ibn-administration:intent-type"];
	
					if (intent_type_folder in this.deps.cache.intentTypes) {
						// update intent-type cache entry with data and timestamp
						this.deps.cache.intentTypes[intent_type_folder].data = data;
						this.deps.cache.intentTypes[intent_type_folder].timestamp = Date.parse(data.date);
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
								"config-required": true,
								"intent-type-list": [
									{
										"intent-type": intent_type,
										"intent-type-version": intent_type_version
									}
								]
							},							
							"page-number": 0,
							"page-size": this.deps.queryLimit
						}
					};
	
					const response: any = await this.deps.callNSP(url, {method: "POST", body: JSON.stringify(body)});
					if (!response)
						throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
					if (!response.ok)
						raiseRestconfError("Getting list of intents failed!", await response.json());
	
					const json = await response.json();
					const output = json["ibn:output"];
	
					if (output["total-count"]>this.deps.queryLimit)
						vscode.window.showWarningMessage("Intent-type "+intent_type+" has more than "+this.deps.queryLimit+" intents. Loading the first "+this.deps.queryLimit+" intents only.");
	
					if ('intent' in output.intents) {
						this.deps.cache.intentTypes[intent_type_folder].intents = output.intents.intent.reduce((intents: any, item: { [key: string]: any; target: string; }) => {
							return {...intents, [item.target]: item["intent-specific-data"]};
						}, {});
						this.deps.cache.intentTypes[intent_type_folder].aligned = output.intents.intent.reduce((intents: any, item: { [key: string]: any; target: string; }) => {
							return {...intents, [item.target]: item["aligned"]==="true"};
						}, {});
						this.deps.cache.intentTypes[intent_type_folder].desired = output.intents.intent.reduce((intents: any, item: { [key: string]: any; target: string; }) => {
							if (item["required-network-state"] === "custom")
								return {...intents, [item.target]: item["custom-required-network-state"]};
							else
								return {...intents, [item.target]: item["required-network-state"]};
						}, {});
						// result = output.intents.intent.map((entry: { target: string; }) => [entry.target, vscode.FileType.File]);
						// proposed change:
						result = output.intents.intent.map((entry: { target: string; }) => [encodeURIComponent(entry.target)+".json", vscode.FileType.File]);
					} else {
						this.deps.cache.intentTypes[intent_type_folder].intents = {};
					}
				}
	
				else if (parts[2]==='yang-modules') {
					result = this.deps.cache.intentTypes[intent_type_folder].data.module.map((entry: { name: string; }) => [entry.name, vscode.FileType.File]);
				}
	
				else if (parts[2]==='views') {
					// readDirectory() was executed with 3rd level folder for views:
					// "im:/{intent-type}_v{version}/views/"
					//
					// Function will get and return the list of all views for
					// the selected intent-type/version
	
					const url = `/restconf/data/nsp-intent-type-config-store:intent-type-config/intent-type-configs=${intent_type},${intent_type_version}?include-meta=false`;
					const response: any = await this.deps.callNSP(url, {method: "GET"});
					if (!response)
						throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
					if (!response.ok)
						raiseRestconfError("Getting list of views failed!", await response.json());
		
					const json = await response.json();
	
					this.deps.cache.intentTypes[intent_type_folder].views={};
					for (const view of json["nsp-intent-type-config-store:intent-type-configs"][0]["views"]) {
						result.push([view.name+".viewConfig", vscode.FileType.File]);
						this.deps.cache.intentTypes[intent_type_folder].views[view.name+".viewConfig"] = JSON.parse(view.viewconfig);
	
						result.push([view.name+".schemaForm", vscode.FileType.File]);
						this.deps.cache.intentTypes[intent_type_folder].views[view.name+".schemaForm"] = JSON.parse(view.schemaform);
					}
				}
	
				else if (parts[2]==='intent-type-resources') {
					const intentTypeData = this.deps.cache.intentTypes[intent_type_folder].data;
	
					if ('resource' in intentTypeData) {
						const folders = new Set<string>();
						const prefix = parts.slice(3).join("/")+'/';
	
						for (const resource of intentTypeData.resource)
							if (parts.length===3 || resource.name.startsWith(prefix)) {
								const relparts = resource.name.split('/').slice(parts.length - 3);
								
								if (relparts.length===1)
									result.push([relparts[0], vscode.FileType.File]);
								else
									folders.add(relparts[0]);
							}
	
						for (const folder of folders)
							result.push([folder, vscode.FileType.Directory]);
					}
				}
	
				else {
					// unknown folder, return nothing
				}
			}
	
			this.deps.pluginLogs.info("readDirectory("+path+") returns", JSON.stringify(result));
			return result;
		}
		async readFile(uri: vscode.Uri): Promise<Uint8Array> {
			const path = uri.toString();
			const parts = path.split('/').map(decodeURIComponent);
			const pattern = /^([a-z][a-z0-9_-]+)_v\d+$/;
	
			if (pattern.test(parts[1])) {
				const intent_type_folder = parts[1];
				const intent_type_version = intent_type_folder.substring(intent_type_folder.lastIndexOf('_v')+2);
				const intent_type = intent_type_folder.substring(0, intent_type_folder.lastIndexOf('_v'));
		
				this.deps.pluginLogs.debug("readFile("+path+")");
			await this.deps.cache.ensureCacheWarm(
				intent_type_folder,
				() => this.readDirectory(vscode.Uri.parse('im:/')),
				this.deps.pluginLogs,
			);
	
				if (intent_type_folder in this.deps.cache.intentTypes) {
					if (parts[2]==="meta-info.json") {
						// meta is deep-copy of cache-entry
						const meta = JSON.parse(JSON.stringify(this.deps.cache.intentTypes[intent_type_folder].data));
	
						meta["intent-type"] = intent_type;
						meta["version"] = intent_type_version;
						const forCleanup = ["default-version", "skip-device-connectivity-check", "support-aggregated-request",	"resource",	"name",	"date",	"module", "script-content", "default-release"];
						for (const parameter of forCleanup) delete meta[parameter];
						
						return Buffer.from(JSON.stringify(meta, null, '  '));
					}
	
					if (parts[2].startsWith('script-content'))
						return Buffer.from(this.deps.cache.intentTypes[intent_type_folder].data["script-content"]);
	
					if (parts[2]==="yang-modules") {
						for (const module of this.deps.cache.intentTypes[intent_type_folder].data.module)
							if (module.name === parts[3])
								return Buffer.from(module["yang-content"]);
					}
	
					if (parts[2]==="intent-type-resources") {
						for (const resource of this.deps.cache.intentTypes[intent_type_folder].data.resource)
							if (resource.name === parts.slice(3).join("/"))
								if (resource.name.endsWith('.viewConfig'))
									return Buffer.from(JSON.stringify(JSON.parse(resource.value), null, '  '));
								else 
									return Buffer.from(resource.value);
					}
	
					if (parts[2]==="intents") {
						const target = decodeURIComponent(parts[3].slice(0,-5));
						if (target in this.deps.cache.intentTypes[intent_type_folder].intents)
							return Buffer.from(JSON.stringify(this.deps.cache.intentTypes[intent_type_folder].intents[target], null, '  '));
					}
	
					if (parts[2]==="views")
						return Buffer.from(JSON.stringify(this.deps.cache.intentTypes[intent_type_folder].views[parts[3]], null, '  '));
				}
			}
	
			throw vscode.FileSystemError.FileNotFound('Unknown file!');
		}
		async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
			const path = uri.toString();
			const parts = path.split('/').map(decodeURIComponent);
			const pattern = /^([a-z][a-z0-9_-]+)_v\d+$/;
	
			if (path==="im:/") {
				this.deps.pluginLogs.debug("stat(im:/)");
				return {type: vscode.FileType.Directory, ctime: 0, mtime: Date.now(), size: 0, permissions: vscode.FilePermission.Readonly};
			}
	
			if (pattern.test(parts[1])) {
				this.deps.pluginLogs.debug("stat("+path+")");
	
				const intent_type_folder = parts[1];
			await this.deps.cache.ensureCacheWarm(
				intent_type_folder,
				() => this.readDirectory(vscode.Uri.parse('im:/')),
				this.deps.pluginLogs,
			);
	
				if (intent_type_folder in this.deps.cache.intentTypes) {
					const timestamp = this.deps.cache.intentTypes[intent_type_folder].timestamp;
					const access = this.deps.cache.intentTypes[intent_type_folder].signed? vscode.FilePermission.Readonly : undefined;
	
					if (parts.length===2)
						return { type: vscode.FileType.Directory, ctime: 0, mtime: timestamp, size: 0 };
					
					if (parts[2]==="yang-modules") {
						if (parts.length===3)
							return {type: vscode.FileType.Directory, ctime: 0, mtime: timestamp, size: 0, permissions: vscode.FilePermission.Readonly};
	
						for (const module of this.deps.cache.intentTypes[intent_type_folder].data.module)
							if (module.name === parts[3])
								return {type: vscode.FileType.File, ctime: 0, mtime: timestamp, size: 0, permissions: access};
	
						this.deps.pluginLogs.warn("Module "+parts[3]+" not found!");				
					}
			
					if (parts[2]==="intent-type-resources") {
						const resourcename = parts.slice(3).join("/");
						if (parts.length===3) {
							return {type: vscode.FileType.Directory, ctime: 0, mtime: timestamp, size: 0, permissions: vscode.FilePermission.Readonly};
						}
						for (const resource of this.deps.cache.intentTypes[intent_type_folder].data.resource) {
							if (resource.name === resourcename)
								return {type: vscode.FileType.File, ctime: 0, mtime: timestamp, size: 0, permissions: access};
							if (resource.name.startsWith(resourcename+'/'))
								return {type: vscode.FileType.Directory, ctime: 0, mtime: timestamp, size: 0, permissions: access};
						}
						this.deps.pluginLogs.warn("Resource "+resourcename+" not found!");
						throw vscode.FileSystemError.FileNotFound('Unknown resouce!');
					}
			
					if (parts[2]==="views") {
						if (parts.length===3)
							return {type: vscode.FileType.Directory, ctime: 0, mtime: timestamp, size: 0, permissions: vscode.FilePermission.Readonly};
	
						if (parts[3] in this.deps.cache.intentTypes[intent_type_folder].views)
							if (parts[3].endsWith(".viewConfig"))
								return {type: vscode.FileType.File, ctime: 0, mtime: timestamp, size: 0};
							else
								return {type: vscode.FileType.File, ctime: 0, mtime: timestamp, size: 0, permissions: vscode.FilePermission.Readonly};
	
						this.deps.pluginLogs.warn("View "+parts[3]+" not found!");
					}
	
					else if (parts[2]==="intents") {
						if (parts.length===3)
							return {type: vscode.FileType.Directory, ctime: 0, mtime: Date.now(), size: 0, permissions: vscode.FilePermission.Readonly};
						else if (decodeURIComponent(parts[3].slice(0,-5)) in this.deps.cache.intentTypes[intent_type_folder].intents)
							return {type: vscode.FileType.File, ctime: 0, mtime: Date.now(), size: 0};
						else
							this.deps.pluginLogs.warn('Unknown intent', uri.toString());
					}
	
					if (parts[2].startsWith('script-content.'))
						return {type: vscode.FileType.File, ctime: 0, mtime: timestamp, size: 0, permissions: access};
	
					if (parts[2]==="meta-info.json")
						return {type: vscode.FileType.File, ctime: 0, mtime: timestamp, size: 0};
	
					this.deps.pluginLogs.warn('Unknown folder/file', uri.toString());
				} else {
					this.deps.pluginLogs.warn('Unknown intent-type', uri.toString());
				}
			}
		
			throw vscode.FileSystemError.FileNotFound('Unknown resouce!');
		}
		async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }): Promise<void> {
			const path = uri.toString();
			const parts = path.split('/').map(decodeURIComponent);
			const pattern = /^([a-z][a-z0-9_-]+)_v\d+$/;
	
			if (pattern.test(parts[1])) {
				const intent_type_folder = parts[1];
				const intent_type_version = intent_type_folder.substring(intent_type_folder.lastIndexOf('_v')+2);
				const intent_type = intent_type_folder.substring(0, intent_type_folder.lastIndexOf('_v'));
	
				let name_changed = false;
		
				this.deps.pluginLogs.debug("writeFile("+path+")");
			await this.deps.cache.ensureCacheWarm(
				intent_type_folder,
				() => this.readDirectory(vscode.Uri.parse('im:/')),
				this.deps.pluginLogs,
			);
	
				// Note: We can only write files if the intent-type exists and is loaded.
				if (intent_type_folder in this.deps.cache.intentTypes) {
					
					if (parts[2]==="intents") {
						if (parts[3].endsWith('.json')) {
							let target = decodeURIComponent(parts[3].slice(0,-5));
	
							if (target.endsWith(" copy") && target.slice(0,-5) in this.deps.cache.intentTypes[intent_type_folder].intents) {
								name_changed = true;
								target = target.slice(0,-5);
							}
	
							if (target in this.deps.cache.intentTypes[intent_type_folder].intents) {
								this.deps.pluginLogs.info("update intent", intent_type, target);
								const url = `/restconf/data/ibn:ibn/intent=${encodeURIComponent(target)},${intent_type}/intent-specific-data`;
	
								const body = {"ibn:intent-specific-data": JSON.parse(content.toString())};
								const response: any = await this.deps.callNSP(url, {method: "PUT", body: JSON.stringify(body)});
								if (!response)
									throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
								if (response.ok) {
									vscode.window.showInformationMessage("Intent succesfully updated");
									this.deps.cache.intentTypes[intent_type_folder].intents[target] = JSON.parse(content.toString());
									this.deps.cache.intentTypes[intent_type_folder].aligned[target] = false;
									this.deps.fireDecoration(uri);
								} else
									raiseRestconfError("Update intent failed!", await response.json());
							} else {
								this.deps.pluginLogs.info("Create new intent", intent_type, target);
	
								let intent : string | undefined = content.toString();
								if (!intent) {
									intent = await vscode.window.showInputBox({
										prompt: "Enter intent-specific data",
										title: "Create new intent",
										value: '{"'+intent_type+':'+intent_type+'": { [INTENT SPECIFIC DATA] }}',
										valueSelection: [intent_type.length*2+8, intent_type.length*2+30]
									});
								}
								if (!intent)
									throw vscode.FileSystemError.Unavailable('Intent creation cancelled!');
	
								const url = "/restconf/data/ibn:ibn";
								const body = {
									"ibn:intent": {
										"ibn:intent-specific-data": JSON.parse(intent),
										"target": target,
										"intent-type": intent_type,
										"intent-type-version": intent_type_version,
										"required-network-state": "active"
									}
								};
								
								const response: any = await this.deps.callNSP(url, {method: "POST", body: JSON.stringify(body)});
								if (!response)
									throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
								if (response.ok) {
									vscode.window.showInformationMessage("Intent succesfully created");
									this.deps.cache.intentTypes[intent_type_folder].intents[target] = JSON.parse(intent);
									this.deps.cache.intentTypes[intent_type_folder].desired[target] = "active";
									this.deps.cache.intentTypes[intent_type_folder].aligned[target] = false;
								} else
									raiseRestconfError("Intent creation failed!", await response.json());
							}
						} else throw vscode.FileSystemError.NoPermissions("Upload intent failed! Only .json files are supported");
					}
	
					else if (parts[2]==="views") {
						if (parts[3].endsWith('.viewConfig')) {
							const viewname = parts[3].slice(0,-11);
							let viewjson = content.toString();
	
							if (!viewjson) {
								// vsCode user has execute "New File..."
								// initialize with empty JSON to pass NSP validation
								viewjson = "{}";
							}
	
							const url = `/restconf/data/nsp-intent-type-config-store:intent-type-config/intent-type-configs=${intent_type},${intent_type_version}`;
							const body = {
								"nsp-intent-type-config-store:intent-type-configs":[{
									"views": [{
										"name": viewname,
										"viewconfig": viewjson
									}]
								}]
							};
							const response: any = await this.deps.callNSP(url, {method: "PATCH", body: JSON.stringify(body)});
							if (!response)
								throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
							if (response.ok) {
								vscode.window.showInformationMessage("View "+intent_type_folder+"/"+viewname+"succesfully saved");
								this.deps.cache.intentTypes[intent_type_folder].views[viewname+".viewConfig"] = JSON.parse(viewjson);
							} else raiseRestconfError("Save viewConfig failed!", await response.json());
						}
						else if (parts[3].endsWith('.schemaForm'))
							throw vscode.FileSystemError.NoPermissions('You can only upload .viewConfig file! SchemaForm is auto-generated.');
						else
							throw vscode.FileSystemError.NoPermissions("Upload view failed! Only .viewConfig files are supported");
					}
					
					else {
						let data : {[key: string]: any} = {};
	
						if (parts[2]==="meta-info.json") {
							data = JSON.parse(content.toString());
	
							// adding back module, resource, script-content
							data.module = this.deps.cache.intentTypes[intent_type_folder].data.module;
							data.resource = this.deps.cache.intentTypes[intent_type_folder].data.resource;
							data['script-content'] = this.deps.cache.intentTypes[intent_type_folder].data['script-content'];
	
							data.name = intent_type;
							data.version = intent_type_version;
	
							delete data["intent-type"];
						} else {
							// deep-copy of what we've got in the cache
							data = JSON.parse(JSON.stringify(this.deps.cache.intentTypes[intent_type_folder].data));
	
							// update data based on file provided
							if (parts[2].startsWith("script-content")) {
								data['script-content']=content.toString();
							}
							else if (parts[2]==="intent-type-resources") {
								let updated = false;
								const resourcename = parts.slice(3).join("/");
								for (const resource of data.resource) {
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
								for (const module of data.module) {
									if (module.name === parts[3]) {
										module['yang-content']=content.toString();
										updated = true;
									}
								}
								if (!updated) {
									data.module.push({name: parts[3], "yang-content": content.toString()});
								}
							}
	
							const forCleanup = ["default-version", "default-release"];
							for (const parameter of forCleanup) delete data[parameter];		
						}
	
						const url = `/restconf/data/ibn-administration:ibn-administration/intent-type-catalog/intent-type=${intent_type},${intent_type_version}`;
						const response: any = await this.deps.callNSP(url, {method: "PUT", body: JSON.stringify({"ibn-administration:intent-type": data})});
						if (!response)
							throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
						if (response.ok) {
							vscode.window.showInformationMessage(intent_type_folder+" succesfully saved");
	
							this.deps.pluginLogs.info("Update intentType entry in cache");
							this.deps.cache.intentTypes[intent_type_folder].signed = data.label.includes('ArtifactAdmin');
							this.deps.cache.intentTypes[intent_type_folder].data = data;
	
							if (parts[2]==="meta-info.json") {
								// update decorations, just in case we've toggled between signed vs unsigned
								this.deps.fireDecoration(vscode.Uri.parse("im:/"+intent_type_folder));
								this.deps.fireDecoration(vscode.Uri.parse("im:/"+intent_type_folder+"/meta-info.json"));
								this.deps.fireDecoration(vscode.Uri.parse("im:/"+intent_type_folder+"/script-content.js"));
								this.deps.fireDecoration(vscode.Uri.parse("im:/"+intent_type_folder+"/script-content.mjs"));
								this.deps.fireDecoration(vscode.Uri.parse("im:/"+intent_type_folder+"/intent-type-resources"));
								this.deps.fireDecoration(vscode.Uri.parse("im:/"+intent_type_folder+"/yang-modules"));
							}
						} else
							raiseRestconfError("Save intent-type failed!", await response.json());
					}
	
					if (name_changed) {
						this.deps.pluginLogs.warn("Filename adjusted to match Intent Manager conventions!");
						vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
						throw vscode.FileSystemError.Unavailable("Operation was successful! Filename adjusted to match Intent Manager conventions! ");
					}
	
					// if .viewConfig file was successfully written,
					// refresh explorer to ensure .schemaForm is displayed correctly:
	
					if (parts[2]==="views")
						vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
	
				} else throw vscode.FileSystemError.Unavailable("Save file failed! Unknown intent-type "+intent_type_folder+"!"); 
			} else throw vscode.FileSystemError.Unavailable("Save file failed! Unsupported folder/file!");
		}
		async delete(uri: vscode.Uri): Promise<void> {
			const path = uri.toString();
			const parts = path.split('/').map(decodeURIComponent);
			const pattern = /^([a-z][a-z0-9_-]+)_v\d+$/;
	
			if (pattern.test(parts[1])) {
				const intent_type_folder = parts[1];
				const intent_type_version = intent_type_folder.substring(intent_type_folder.lastIndexOf('_v')+2);
				const intent_type = intent_type_folder.substring(0, intent_type_folder.lastIndexOf('_v'));
		
				this.deps.pluginLogs.debug("delete("+path+")");
			await this.deps.cache.ensureCacheWarm(
				intent_type_folder,
				() => this.readDirectory(vscode.Uri.parse('im:/')),
				this.deps.pluginLogs,
			);
	
				if (intent_type_folder in this.deps.cache.intentTypes) {
					if (parts.length===3) {
						throw vscode.FileSystemError.NoPermissions("Deletion of "+path+" is prohibited");
					}
	
					let url:string|undefined = undefined;
					if (parts.length>3) {
						if (parts[2]==="intents") {
							const target = decodeURIComponent(parts[3].slice(0,-5)); // remove .json extension and decode
							url = `/restconf/data/ibn:ibn/intent=${encodeURIComponent(target)},${intent_type}`;
							this.deps.pluginLogs.info("delete intent", intent_type, target);
						} else if (parts[2]==="yang-modules") {
							const modulename = parts[3];
							url = `/restconf/data/ibn-administration:ibn-administration/intent-type-catalog/intent-type=${intent_type},${intent_type_version}/module=${modulename}`;
							this.deps.pluginLogs.info("delete module", intent_type, modulename);
						} else if (parts[2]==="views") {
							const viewname = parts[3].slice(0,-11); // remove .viewConfig extension
							url = `/restconf/data/nsp-intent-type-config-store:intent-type-config/intent-type-configs=${intent_type},${intent_type_version}/views=${viewname}`;
							this.deps.pluginLogs.info("delete view", intent_type, viewname);
						} else if (parts[2]==="intent-type-resources") {
							const resourcepath = parts.slice(3).join("/");
							const resources = this.deps.cache.intentTypes[intent_type_folder].data.resource.filter((resource:{name:string, value:string}) => resource.name.startsWith(resourcepath));
							if (resources.length>0)
								for (const resource of resources) {
									this.deps.pluginLogs.info("delete resource", intent_type, resource.name);
									const url = `/restconf/data/ibn-administration:ibn-administration/intent-type-catalog/intent-type=${intent_type},${intent_type_version}/resource=${encodeURIComponent(resource.name)}`;
									const response: any = await this.deps.callNSP(url, {method: "DELETE"});
									if (!response)
										throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
									if (!response.ok)
										raiseRestconfError("Delete resource failed!", await response.json());
								}
							else throw vscode.FileSystemError.FileNotFound(`Unknown resource ${path}!`);
						} else throw vscode.FileSystemError.Unavailable(`Delete ${path} unsupported!`);
					} else {
						this.deps.pluginLogs.info("delete intent-type", intent_type);
						url = `/restconf/data/ibn-administration:ibn-administration/intent-type-catalog/intent-type=${intent_type},${intent_type_version}`;
	
						if (Object.keys(this.deps.cache.intentTypes[intent_type_folder].intents).length===0)
							await this.readDirectory(vscode.Uri.joinPath(uri, "intents"));
	
						const targets = Object.keys(this.deps.cache.intentTypes[intent_type_folder].intents);
						if (targets.length > 0) {
							const selection = await vscode.window.showWarningMessage("Intent-type "+parts[1]+" is in-use! "+targets.length.toString()+" intents exist!", "Proceed","Cancel");
							if (selection === 'Proceed') {
								this.deps.pluginLogs.info("delete all intents for", intent_type);
	
								for (const target of targets) {
									this.deps.pluginLogs.info("delete intent", intent_type, target);
									const url = `/restconf/data/ibn:ibn/intent=${encodeURIComponent(target)},${intent_type}`;
									const response: any = await this.deps.callNSP(url, {method: "DELETE"});
									if (!response)
										throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
									if (response.ok) {
										delete this.deps.cache.intentTypes[intent_type_folder].aligned[target];
										delete this.deps.cache.intentTypes[intent_type_folder].desired[target];
										delete this.deps.cache.intentTypes[intent_type_folder].intents[target];																
									} else printRestconfError("Delete intent failed!", await response.json());
								}
							} else throw vscode.FileSystemError.NoPermissions('Operation cancelled!');	
						}
					}
	
					if (url) {
						const response: any = await this.deps.callNSP(url, {method: "DELETE"});
						if (!response)
							throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
						if (!response.ok)
							raiseRestconfError("Delete intent-type failed!", await response.json());	
					}
	
					// Deletion was successful, let's update the cache
					if (parts.length>3) {
						if (parts[2]==="intents") {
							const target = decodeURIComponent(parts[3].slice(0,-5));
							delete this.deps.cache.intentTypes[intent_type_folder].aligned[target];
							delete this.deps.cache.intentTypes[intent_type_folder].desired[target];
							delete this.deps.cache.intentTypes[intent_type_folder].intents[target];					
						} else if (parts[2]==="intent-type-resources") {
							const resourcename = parts.slice(3).join("/");
							this.deps.cache.intentTypes[intent_type_folder].data.resource = this.deps.cache.intentTypes[intent_type_folder].data.resource.filter((resource:{name:string, value:string}) => resource.name!=resourcename);
						} else if (parts[2].includes("yang-modules")) {
							const modulename = parts[3];
							this.deps.cache.intentTypes[intent_type_folder].data.module = this.deps.cache.intentTypes[intent_type_folder].data.module.filter((module:{name:string, value:string}) => module.name!=modulename);
						} else if (parts[2].includes("views")) {
							delete this.deps.cache.intentTypes[intent_type_folder].views[parts[3]];
							delete this.deps.cache.intentTypes[intent_type_folder].views[parts[3].slice(0,-11)+".schemaForm"];
							vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer"); // needed to remove schemaForm
						}
					} else {
						delete this.deps.cache.intentTypes[intent_type_folder];
					}
				
					vscode.window.showInformationMessage("Succesfully deleted");
				} else throw vscode.FileSystemError.Unavailable("Delete "+path+" failed! Unknown intent-type!");
			} else throw vscode.FileSystemError.Unavailable("Delete "+path+" failed! Unsupported folder/file!");
		}
		async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): Promise<void> {
			this.deps.pluginLogs.debug("rename(", oldUri, newUri, ")");
	
			const oldPath = oldUri.toString();
			const oldParts = oldPath.split('/').map(decodeURIComponent);
	
			const newPath = newUri.toString();
			const newParts = newPath.split('/').map(decodeURIComponent);
	
			const pattern = /^([a-z][a-z0-9_-]+)_v\d+$/;
	
			if (oldParts.length>3 && pattern.test(oldParts[1]) && oldParts[2]==="intent-type-resources" &&
				newParts.length>3 && newParts[1]===oldParts[1] && newParts[2]==="intent-type-resources")
			{
				const intent_type_folder = oldParts[1];
				const intent_type_version = intent_type_folder.substring(intent_type_folder.lastIndexOf('_v')+2);
				const intent_type = intent_type_folder.substring(0, intent_type_folder.lastIndexOf('_v'));
	
				const oldprefix = oldParts.slice(3).join("/");
				const newprefix = newParts.slice(3).join("/");
	
				for (const resource of this.deps.cache.intentTypes[intent_type_folder].data.resource)
					if (resource.name.startsWith(oldprefix)) {
						const newname = newprefix + resource.name.substring(oldprefix.length);
						this.deps.pluginLogs.info(`renaming resource ${resource.name} to ${newname}`);
						resource.name = newname;
					}
	
				const forCleanup = ["default-version", "default-release"];
				for (const parameter of forCleanup) delete this.deps.cache.intentTypes[intent_type_folder].data[parameter];
				
				const url = `/restconf/data/ibn-administration:ibn-administration/intent-type-catalog/intent-type=${intent_type},${intent_type_version}`;
				const body = {"ibn-administration:intent-type": this.deps.cache.intentTypes[intent_type_folder].data};
	
				const response: any = await this.deps.callNSP(url, {method: "PUT", body: JSON.stringify(body)});
				if (!response)
					throw vscode.FileSystemError.Unavailable("Lost connection to NSP");
				if (response.ok)
					vscode.window.showInformationMessage(intent_type_folder+" succesfully saved");
	
			} else throw vscode.FileSystemError.NoPermissions('Unsupported operation!');
		}
		async createDirectory(uri: vscode.Uri): Promise<void> {
			this.deps.pluginLogs.debug("createDirectory(", uri, ")");
	
			const path = uri.toString();
			const parts = path.split('/').map(decodeURIComponent);
			const pattern = /^([a-z][a-z0-9_-]+)_v1$/;
	
			if (parts.length===2 && pattern.test(parts[1])) {
				await this.deps.newRemoteIntentType([uri]);
			}
			if (parts.length>3 && parts[2]==="intent-type-resources") {
				this.deps.pluginLogs.info(uri.toString());
				await this.writeFile(vscode.Uri.joinPath(uri, "__placeholder__"), Buffer.from(""), {create: true, overwrite: true});
			}
			else throw vscode.FileSystemError.NoPermissions('Unsupported operation!');
		}

	watch(_resource: vscode.Uri): vscode.Disposable {
			return new vscode.Disposable(() => { });
		}	
}

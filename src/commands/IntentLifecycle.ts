import * as vscode from 'vscode';
import * as yaml from 'yaml';

// @ts-expect-error module nunjucks does not have a declaration file
import nunjucks = require('nunjucks');

import { raiseRestconfError, printRestconfError } from '../common/errors';
import { isAtLeastRelease } from '../common/paths';
import { IntentTypeCache } from '../fs/IntentTypeCache';

export interface IntentLifecycleDeps {
	cache: IntentTypeCache;
	extensionUri: vscode.Uri;
	pluginLogs: vscode.LogOutputChannel;
	serverLogs: vscode.OutputChannel;
	parallelOps: boolean;
	serverLogsOffset: string;
	serverLogsFullStack: boolean;
	logLimit: number;
	getNspAddr: () => string;
	getNspVersion: () => string | undefined;
	getOsdVersion: () => string | undefined;
	getAuthToken: () => Promise<string | undefined>;
	getNSPversion: () => Promise<void>;
	callNSP: (url: string, options: { method: string; body?: string; headers?: object; signal?: AbortSignal }) => Promise<any>;
	getUriList: (args: any[]) => vscode.Uri[];
	openWebUI: (url: string) => Promise<void>;
	fireDecoration: (uri: vscode.Uri | vscode.Uri[]) => void;
}

export class IntentLifecycle {
	constructor(private readonly deps: IntentLifecycleDeps) {}

	getState(uri: vscode.Uri): string {
		const path = uri.toString();
		this.deps.pluginLogs.debug('getState(' + path + ')');

		const localize: { [value: string]: string } = {
			'active':   'Active',
			'suspend':  'Suspended',
			'delete':   'Not Present',
			'saved':    'Saved',
			'planned':  'Planned',
			'deployed': 'Deployed',
		};

		const parts = path.split('/').map(decodeURIComponent);
		const intent_type_folder = parts[1];
		const target = decodeURIComponent(parts[3].slice(0, -5));
		const state = this.deps.cache.intentTypes[intent_type_folder].desired[target];
		return localize[state];
	}

	async setState(args: any[]): Promise<void> {
		const uriList: vscode.Uri[] = this.deps.getUriList(args);

		const states: { [value: string]: string } = {
			'Active':      'active',
			'Suspended':   'suspend',
			'Not Present': 'delete',
			'Saved':       'saved',
			'Planned':     'planned',
			'Deployed':    'deployed',
		};

		const actual = new Set();
		for (const entry of uriList) {
			actual.add(this.getState(entry));
		}

		const items = [];
		for (const state of Object.keys(states)) {
			if (actual.has(state))
				items.push({ label: state, description: '✔' });
			else
				items.push({ label: state, description: '' });
		}

		await vscode.window.showQuickPick(items).then(async (selection: vscode.QuickPickItem | undefined) => {
			if (selection) {
				const state = states[selection.label];
				let body = {};
				if (['active', 'suspend', 'delete'].includes(state))
					body = { 'ibn:intent': { 'required-network-state': state } };
				else
					body = { 'ibn:intent': { 'required-network-state': 'custom', 'custom-required-network-state': state } };

				for (const entry of uriList) {
					const parts = entry.toString().split('/').map(decodeURIComponent);
					const target = decodeURIComponent(parts[3].slice(0, -5));
					const intent_type_folder = parts[1];
					const intent_type = intent_type_folder.substring(0, intent_type_folder.lastIndexOf('_v'));

					if (this.deps.cache.intentTypes[intent_type_folder].desired[target] !== state) {
						const url = `/restconf/data/ibn:ibn/intent=${encodeURIComponent(target)},${intent_type}`;

						this.deps.pluginLogs.info('setState(', entry.toString(), ')');
						if (this.deps.parallelOps) {
							this.deps.callNSP(url, { method: 'PATCH', body: JSON.stringify(body) })
								.then((response: any) => {
									if (response.ok) {
										this.deps.cache.intentTypes[intent_type_folder].desired[target] = state;
										vscode.window.showInformationMessage(
											'Desired state for ' + intent_type + '/' + target + " updated to '" + selection.label + "'!",
										);
									} else {
										response.json().then((response: any) =>
											printRestconfError('Update desired state for ' + intent_type + '/' + target + ' failed!', response),
										);
									}
								})
								.catch(() => {
									throw vscode.FileSystemError.Unavailable('Lost connection to NSP');
								});
						} else {
							const response: any = await this.deps.callNSP(url, { method: 'PATCH', body: JSON.stringify(body) });
							if (!response)
								throw vscode.FileSystemError.Unavailable('Lost connection to NSP');
							if (response.ok) {
								this.deps.cache.intentTypes[intent_type_folder].desired[target] = state;
								vscode.window.showInformationMessage(
									'Desired state for ' + intent_type + '/' + target + " updated to '" + selection.label + "'!",
								);
							}
						}
					} else {
						this.deps.pluginLogs.info('setState(', entry.toString(), ') skipped');
					}
				}
				await vscode.commands.executeCommand('nokia-intent-manager.updateStatusBar');
			}
		});
	}

	async logs(args: any[]): Promise<void> {
		this.deps.pluginLogs.debug('logs()');

		const query: { [key: string]: any } = {
			'bool': {
				'must': [{
					'range': {
						'@datetime': {
							'gte': 'now-' + this.deps.serverLogsOffset,
						},
					},
				}, {
					'bool': {
						'should': [],
					},
				}],
			},
		};

		const uriList: vscode.Uri[] = this.deps.getUriList(args);
		for (const entry of uriList) {
			const parts = entry.toString().split('/').map(decodeURIComponent);

			if (parts[0] === 'im:') {
				this.deps.pluginLogs.info('get logs for ' + entry.toString());
				const intent_type_folder = parts[1];
				const intent_type_version = intent_type_folder.substring(intent_type_folder.lastIndexOf('_v') + 2);
				const intent_type = intent_type_folder.substring(0, intent_type_folder.lastIndexOf('_v'));

				const qentry = {
					'bool': {
						'must': [
							{ 'match_phrase': { 'log': '"intent_type":"' + intent_type + '"' } },
							{ 'match_phrase': { 'log': '"intent_type_version":"' + intent_type_version + '"' } },
						],
					},
				};

				if (parts.length === 4 && parts[2] === 'intents')
					qentry.bool.must.push({ 'match_phrase': { 'log': '"target":"' + decodeURIComponent(parts[3].slice(0, -5)) + '"' } });

				query.bool.must.at(1).bool.should.push(qentry);
			}
		}

		const token = await this.deps.getAuthToken();
		if (!token) {
			throw vscode.FileSystemError.Unavailable('NSP is not reachable');
		}

		if (!this.deps.getOsdVersion())
			await this.deps.getNSPversion();

		const url = '/logviewer/api/console/proxy?path=nsp-mdt-logs-*/_search&method=GET';
		const body = { 'query': query, 'sort': { '@datetime': 'desc' }, 'size': this.deps.logLimit };

		const response: any = await this.deps.callNSP(url, {
			method: 'POST',
			headers: {
				'Content-Type':  'application/json',
				'Cache-Control': 'no-cache',
				'Osd-Version':   this.deps.getOsdVersion(),
				'Authorization': 'Bearer ' + token,
			},
			body: JSON.stringify(body),
		});

		if (!response)
			throw vscode.FileSystemError.Unavailable('Lost connection to NSP');

		const json = await response.json();
		if (!response.ok)
			raiseRestconfError('Getting logs failed!', json, true);

		const data: { [key: string]: any }[] = json['hits']['hits'];
		if (data.length === 0) {
			vscode.window.showWarningMessage('No intent operation logs for the last ' + this.deps.serverLogsOffset);
		} else {
			const logs: Array<any> = [];
			for (const entry of data) {
				logs.push(JSON.parse(entry['_source'].log));
			}
			logs.sort((a, b) => a['date'] - b['date']);

			this.deps.serverLogs.clear();
			this.deps.serverLogs.show(true);

			let pdate = logs[0]['date'];
			for (const logentry of logs) {
				const timestamp = new Date(logentry.date);
				const level = logentry.level.toLowerCase();
				const target = logentry.target;
				const intent_type = logentry.intent_type;
				const intent_type_version = logentry.intent_type_version;
				const intent_type_folder = intent_type + '_v' + intent_type_version;

				let message = logentry.message.slice(logentry.message.indexOf(']') + 1);
				message = message.replace('[' + intent_type + ']', '').replace('[' + intent_type_version + ']', '').replace('[' + target + ']', '').trim();

				if (logentry.date > pdate + 30000)
					this.deps.serverLogs.appendLine('');

				const logdate = timestamp.toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
				const logtime = timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
				const ms = String(timestamp.getMilliseconds()).padStart(3, '0');

				if (target)
					this.deps.serverLogs.appendLine(`${logdate} ${logtime}.${ms} [${level}]\t[ ${intent_type_folder} ${target} ] ${message}`);
				else
					this.deps.serverLogs.appendLine(`${logdate} ${logtime}.${ms} [${level}]\t[ ${intent_type_folder} ] ${message}`);

				if ('throwable' in logentry && logentry.throwable) {
					if (this.deps.serverLogsFullStack)
						this.deps.serverLogs.appendLine(logentry.throwable.trim());
					else
						this.deps.serverLogs.appendLine(
							logentry.throwable.trim().split(/[\n\r]+/).filter((line: string) =>
								(line.match(/\s+at.+\.m?js:\d+/) || !line.match(/\s+at.+/)),
							).join('\n'),
						);
				}

				pdate = logentry['date'];
			}
		}
	}

	async audit(args: any[]): Promise<void> {
		const uriList: vscode.Uri[] = this.deps.getUriList(args);
		for (const entry of uriList) {
			const parts = entry.toString().split('/').map(decodeURIComponent);

			if (parts.length === 4 && parts[2] === 'intents') {
				const target = decodeURIComponent(parts[3].slice(0, -5));
				const intent_type_folder = parts[1];
				const intent_type = intent_type_folder.substring(0, intent_type_folder.lastIndexOf('_v'));
				const url = `/restconf/data/ibn:ibn/intent=${encodeURIComponent(target)},${intent_type}/audit`;

				this.deps.pluginLogs.info('audit(', entry.toString(), ')');
				if (this.deps.parallelOps && uriList.length > 1) {
					this.deps.callNSP(url, { method: 'POST', body: '' })
						.then((response: any) => {
							if (response.ok)
								response.json().then((json: any) => {
									const report = json['ibn:output']['audit-report'];
									if (
										Object.keys(report).includes('misaligned-attribute') ||
										Object.keys(report).includes('misaligned-object') ||
										Object.keys(report).includes('undesired-object')
									) {
										this.deps.cache.intentTypes[intent_type_folder].aligned[target] = false;
										vscode.window.showWarningMessage('Intent ' + intent_type + '/' + target + ' is misaligned!');
									} else {
										this.deps.cache.intentTypes[intent_type_folder].aligned[target] = true;
										vscode.window.showInformationMessage('Intent ' + intent_type + '/' + target + ' is aligned!');
									}
								});
							else {
								this.deps.cache.intentTypes[intent_type_folder].aligned[target] = false;
								response.json().then((json: any) => printRestconfError('Audit intent failed!', json));
							}
							this.deps.fireDecoration(entry);
						})
						.catch(() => {
							throw vscode.FileSystemError.Unavailable('Lost connection to NSP');
						});
				} else {
					const response: any = await this.deps.callNSP(url, { method: 'POST', body: '' });
					if (!response)
						throw vscode.FileSystemError.Unavailable('Lost connection to NSP');
					if (response.ok) {
						const json: any = await response.json();
						const report = json['ibn:output']['audit-report'];

						if (
							Object.keys(report).includes('misaligned-attribute') ||
							Object.keys(report).includes('misaligned-object') ||
							Object.keys(report).includes('undesired-object')
						) {
							this.deps.cache.intentTypes[intent_type_folder].aligned[target] = false;

							if (uriList.length === 1)
								await this.auditReport(intent_type, target, report, new Date());
							else
								vscode.window.showWarningMessage('Intent ' + intent_type + '/' + target + ' is misaligned!');
						} else {
							this.deps.cache.intentTypes[intent_type_folder].aligned[target] = true;
							vscode.window.showInformationMessage('Intent ' + intent_type + '/' + target + ' is aligned!');
						}
						this.deps.fireDecoration(entry);
					} else printRestconfError('Audit intent failed!', await response.json());
				}
			}
		}
	}

	async lastAuditReport(args: any[]): Promise<void> {
		const uriList: vscode.Uri[] = this.deps.getUriList(args);
		for (const entry of uriList) {
			this.deps.pluginLogs.debug('lastAuditReport(', entry.toString(), ')');
			const parts = entry.toString().split('/').map(decodeURIComponent);

			if (parts.length === 4 && parts[2] === 'intents') {
				const target = decodeURIComponent(parts[3].slice(0, -5));
				const intent_type_folder = parts[1];
				const intent_type = intent_type_folder.substring(0, intent_type_folder.lastIndexOf('_v'));

				const url = `/restconf/data/ibn:ibn/intent=${encodeURIComponent(target)},${intent_type}`;
				const response: any = await this.deps.callNSP(url, { method: 'GET' });
				if (!response)
					throw vscode.FileSystemError.Unavailable('Lost connection to NSP');
				if (!response.ok)
					raiseRestconfError('Getting intent details failed!', await response.json(), true);

				const json: any = await response.json();
				const report = json['ibn:intent']['last-audit-report'];
				const tstamp = new Date(json['ibn:intent']['audit-timestamp']);

				if (
					Object.keys(report).includes('misaligned-attribute') ||
					Object.keys(report).includes('misaligned-object') ||
					Object.keys(report).includes('undesired-object')
				) {
					await this.auditReport(intent_type, target, report, tstamp);
				} else {
					vscode.window.showInformationMessage('Intent ' + intent_type + '/' + target + ' is aligned!');
				}
			}
		}
	}

	async sync(args: any[]): Promise<void> {
		const uriList: vscode.Uri[] = this.deps.getUriList(args);
		for (const entry of uriList) {
			const parts = entry.toString().split('/').map(decodeURIComponent);

			if (parts.length === 4 && parts[2] === 'intents') {
				const target = decodeURIComponent(parts[3].slice(0, -5));
				const intent_type_folder = parts[1];
				const intent_type = intent_type_folder.substring(0, intent_type_folder.lastIndexOf('_v'));
				const url = `/restconf/data/ibn:ibn/intent=${encodeURIComponent(target)},${intent_type}/synchronize`;

				this.deps.pluginLogs.info('sync(', entry.toString(), ')');
				if (this.deps.parallelOps && uriList.length > 1) {
					this.deps.callNSP(url, { method: 'POST', body: '' })
						.then((response: any) => {
							if (response.ok) {
								vscode.window.showInformationMessage('Intent ' + intent_type + '/' + target + ' synchronized!');
								this.deps.cache.intentTypes[intent_type_folder].aligned[target] = true;
							} else {
								response.json().then((response: any) =>
									printRestconfError('Synchronize intent ' + intent_type + '/' + target + ' failed!', response),
								);
								this.deps.cache.intentTypes[intent_type_folder].aligned[target] = false;
							}
							this.deps.fireDecoration(entry);
						})
						.catch(() => {
							throw vscode.FileSystemError.Unavailable('Lost connection to NSP');
						});
				} else {
					const response: any = await this.deps.callNSP(url, { method: 'POST', body: '' });
					if (!response)
						throw vscode.FileSystemError.Unavailable('Lost connection to NSP');
					if (response.ok) {
						vscode.window.showInformationMessage('Intent ' + intent_type + '/' + target + ' synchronized!');
						this.deps.cache.intentTypes[intent_type_folder].aligned[target] = true;
					} else {
						printRestconfError('Synchronize intent failed!', await response.json());
						this.deps.cache.intentTypes[intent_type_folder].aligned[target] = false;
					}
					this.deps.fireDecoration(entry);
				}
			}
		}
	}

	async retrieveState(args: any[]): Promise<void> {
		const uriList: vscode.Uri[] = this.deps.getUriList(args);
		for (const entry of uriList) {
			const parts = entry.toString().split('/').map(decodeURIComponent);

			if (parts.length === 4 && parts[2] === 'intents') {
				const target = decodeURIComponent(parts[3].slice(0, -5));
				const intent_type_folder = parts[1];
				const intent_type = intent_type_folder.substring(0, intent_type_folder.lastIndexOf('_v'));

				const url = `/restconf/data/ibn:ibn/intent=${encodeURIComponent(target)},${intent_type}`;
				this.deps.callNSP(url, { method: 'GET' })
					.then((response: any) => {
						if (response.ok)
							response.json().then((json: any) => {
								const data = json['ibn:intent']['intent-specific-data'];
								for (const container of Object.keys(data))
									if (container.endsWith('-state')) {
										const date = new Date();
										let text = '# INTENT OPERATIONAL STATE\n';
										text += '# intent-type: ' + intent_type + ', target: ' + target + '\n';
										text += '# received at ' + date.toUTCString() + '\n\n';
										text += yaml.stringify(data[container]);

										vscode.workspace.openTextDocument({ content: text, language: 'yaml' })
											.then((textDocument: vscode.TextDocument) => {
												vscode.window.showTextDocument(textDocument);
											});
									}
							});
					});
			}
		}
	}

	async migrate(args: any[]): Promise<void> {
		const uriList: vscode.Uri[] = this.deps.getUriList(args);

		const intent_type_folders = Array.from(
			new Set(uriList.map(uri => decodeURIComponent(uri.toString().split('/')[1]))),
		);

		const intent_types = Array.from(
			new Set(intent_type_folders.map(folder => folder.substring(0, folder.lastIndexOf('_v')))),
		);

		if (intent_types.length !== 1) {
			const errmsg = 'All intents must be of the same intent-type to migrate!';
			vscode.window.showInformationMessage(errmsg);
			throw vscode.FileSystemError.NoPermissions(errmsg);
		}
		const intent_type = intent_types[0];

		const usedVersions = Array.from(
			new Set(intent_type_folders.map(folder => folder.substring(folder.lastIndexOf('_v') + 2))),
		);

		const allVersions = Array.from(new Set(
			Object.keys(this.deps.cache.intentTypes)
				.filter(folder => folder.substring(0, folder.lastIndexOf('_v')) === intent_type)
				.map(folder => folder.substring(folder.lastIndexOf('_v') + 2)),
		));

		const items = [];
		for (const version of allVersions) {
			if (usedVersions.includes(version))
				items.push({ label: version, description: `${intent_type}_v${version} ✔` });
			else
				items.push({ label: version, description: `${intent_type}_v${version}` });
		}

		await vscode.window.showQuickPick(items).then(async (selection: vscode.QuickPickItem | undefined) => {
			if (selection) {
				const newVersion = selection.label;

				const body = {
					'ibn:input': {
						'target-intent-type-version': newVersion,
					},
				};

				let refreshRequired = false;
				const migrations = uriList.map(async (entry) => {
					const parts = entry.toString().split('/').map(decodeURIComponent);
					const target = decodeURIComponent(parts[3].slice(0, -5));
					const intent_type_folder = parts[1];
					const intent_type = intent_type_folder.substring(0, intent_type_folder.lastIndexOf('_v'));

					if (intent_type_folder.substring(intent_type_folder.lastIndexOf('_v') + 2) !== newVersion) {
						this.deps.pluginLogs.info(`migrate( ${entry.toString()} )`);
						const url = `/restconf/data/ibn:ibn/intent=${encodeURIComponent(target)},${intent_type}/migrate-intent`;

						try {
							const response: any = await this.deps.callNSP(url, { method: 'POST', body: JSON.stringify(body) });

							if (response.ok) {
								refreshRequired = true;
								delete this.deps.cache.intentTypes[intent_type_folder].aligned[target];
								delete this.deps.cache.intentTypes[intent_type_folder].desired[target];
								delete this.deps.cache.intentTypes[intent_type_folder].intents[target];
								vscode.window.showInformationMessage(`Intent ${intent_type}/${target} migrated to version ${newVersion}`);
							} else {
								response.json().then((response: any) =>
									printRestconfError(`Intent ${intent_type}/${target} migration to version ${newVersion} failed!`, response),
								);
							}
						} catch {
							this.deps.pluginLogs.error(`Intent ${intent_type}/${target} migration to version ${newVersion} failed!`);
						}
					} else {
						this.deps.pluginLogs.info(`migrate( ${entry.toString()} ) skipped!`);
					}
				});

				await Promise.all(migrations);

				if (refreshRequired)
					vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
			}
		});
	}

	async openInBrowser(args: any[]): Promise<void> {
		const uriList: vscode.Uri[] = this.deps.getUriList(args);

		if (uriList.length > 0) {
			const path = uriList[0].toString();
			this.deps.pluginLogs.debug('openInBrowser(', path, ')');

			if (path === 'im:/') {
				if (isAtLeastRelease(this.deps.getNspVersion(), 23, 11))
					await this.deps.openWebUI('/web/intent-manager/intent-types');
				else
					await this.deps.openWebUI('/intent-manager/intentTypes');
			} else {
				const parts = path.split('/').map(decodeURIComponent);
				const intent_type_folder = parts[1];
				const intent_type_version = intent_type_folder.substring(intent_type_folder.lastIndexOf('_v') + 2);
				const intent_type = intent_type_folder.substring(0, intent_type_folder.lastIndexOf('_v'));

				if (parts.length > 3 && parts[2] === 'intents') {
					const target = decodeURIComponent(parts[3].slice(0, -5));
					if (isAtLeastRelease(this.deps.getNspVersion(), 23, 11))
						await this.deps.openWebUI(
							'/web/intent-manager/intent-types/intents-list/intent-details?intentTypeId=' +
							intent_type + '&version=' + intent_type_version + '&intentTargetId=' + encodeURIComponent(target),
						);
					else
						await this.deps.openWebUI(
							'/intent-manager/intentTypes/' + intent_type + '/' + intent_type_version + '/intents/' + encodeURIComponent(target),
						);
				} else {
					if (isAtLeastRelease(this.deps.getNspVersion(), 23, 11))
						await this.deps.openWebUI(
							'/web/intent-manager/intent-types/intents-list?intentTypeId=' + intent_type + '&version=' + intent_type_version,
						);
					else
						await this.deps.openWebUI('/intent-manager/intentTypes/' + intent_type + '/' + intent_type_version + '/intents');
				}
			}
		}
	}

	async newIntent(args: any[]): Promise<void> {
		const uriList: vscode.Uri[] = this.deps.getUriList(args);

		if (uriList.length > 0) {
			const path = uriList[0].toString();
			const parts = path.split('/').map(decodeURIComponent);
			const intent_type_folder = parts[1];
			const intent_type_version = intent_type_folder.substring(intent_type_folder.lastIndexOf('_v') + 2);
			const intent_type = intent_type_folder.substring(0, intent_type_folder.lastIndexOf('_v'));

			this.deps.pluginLogs.debug('newIntent(', path, ')');

			if (isAtLeastRelease(this.deps.getNspVersion(), 23, 11))
				await this.deps.openWebUI(
					`/web/intent-manager/intent-types/create-intent?intentTypeId=${intent_type}&version=${intent_type_version}&mode=cross-launch`,
				);
			else
				await this.deps.openWebUI('/intent-manager/intentTypes/' + intent_type + '/' + intent_type_version + '/intents/createIntent');
		}
	}

	private modelPathHTML(modelpath: string): string {
		const parts = modelpath.split('/');
		const cparts = [];
		for (const part of parts) {
			const kvp = part.split('=');
			if (kvp.length === 2)
				cparts.push(kvp[0] + '=<em>' + decodeURIComponent(kvp[1]) + '</em>');
			else
				cparts.push(part);
		}
		return cparts.join('/');
	}

	async auditReport(
		intent_type: string,
		target: string,
		report: { [key: string]: any },
		timestamp: Date,
	): Promise<void> {
		const url = '/restconf/operations/nsp-inventory:find';
		const body = {
			'input': {
				'xpath-filter': '/nsp-equipment:network/network-element',
				'depth': 3,
				'fields': 'ne-id;ne-name',
				'include-meta': false,
			},
		};

		const response: any = await this.deps.callNSP(url, { method: 'POST', body: JSON.stringify(body) });

		const nodeNames: { [key: string]: string } = {};
		if (response && response.ok) {
			const json = await response.json();
			json['nsp-inventory:output'].data.forEach((entry: { 'ne-id': string; 'ne-name': string }) => {
				nodeNames[entry['ne-id']] = entry['ne-name'];
			});
		}

		if ('misaligned-attribute' in report)
			for (const object of report['misaligned-attribute']) {
				if (object['device-name'] in nodeNames)
					object['device-name'] = nodeNames[object['device-name']] + ' (' + object['device-name'] + ')';
				object['name'] = this.modelPathHTML(object['name']);
			}

		if ('misaligned-object' in report)
			for (const object of report['misaligned-object']) {
				if (object['device-name'] in nodeNames)
					object['device-name'] = nodeNames[object['device-name']] + ' (' + object['device-name'] + ')';
				object['object-id'] = this.modelPathHTML(object['object-id']);
			}

		if ('undesired-object' in report)
			for (const object of report['undesired-object']) {
				if (object['device-name'] in nodeNames)
					object['device-name'] = nodeNames[object['device-name']] + ' (' + object['device-name'] + ')';
				object['object-id'] = this.modelPathHTML(object['object-id']);
			}

		const j2media = nunjucks.configure(vscode.Uri.joinPath(this.deps.extensionUri, 'media').fsPath);
		const panel = vscode.window.createWebviewPanel(
			'auditReport',
			'Audit ' + intent_type + '/' + target,
			vscode.ViewColumn.Active,
			{ enableScripts: true },
		);
		panel.webview.html = j2media.render('report.html.njk', {
			intent_type,
			target,
			report,
			timestamp: timestamp.toUTCString(),
		});
		this.deps.pluginLogs.info(panel.webview.html);
	}
}

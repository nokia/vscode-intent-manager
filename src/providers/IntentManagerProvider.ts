import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { ActivityStatus } from './ActivityStatus';
import { raiseRestconfError } from '../common/errors';
import { IntentLifecycle } from '../commands/IntentLifecycle';
import { IntentFileSystem } from '../fs/IntentFileSystem';
import { IntentTypeCache } from '../fs/IntentTypeCache';
import { IntentTypeScaffolder } from '../generators/IntentTypeScaffolder';
import { FixedIntentGenerator } from '../generators/FixedIntentGenerator';
import { generateFromIgenFile } from '../generators/IcmGenerator';
import { TemplateEngine } from '../generators/TemplateEngine';
import { NspRestClient } from '../nsp/NspRestClient';
import { IntentDecorations } from '../ui/IntentDecorations';

const myStatusBarItem: vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
myStatusBarItem.command = 'nokia-intent-manager.intentStatus';

/*
	Class implementing FileSystemProvider for Intent Manager
*/

export class IntentManagerProvider implements vscode.FileSystemProvider, vscode.FileDecorationProvider, vscode.CodeLensProvider {
	static scheme = 'im';

	extensionPath: string;
	extensionUri: vscode.Uri;

	private nspClient!: NspRestClient;
	private templateEngine!: TemplateEngine;
	private intentTypeScaffolder!: IntentTypeScaffolder;
	private fixedIntentGenerator!: FixedIntentGenerator;
	private readonly intentTypeCache = new IntentTypeCache();
	private readonly decorations: IntentDecorations;
	private readonly fileSystem: IntentFileSystem;
	private readonly lifecycle: IntentLifecycle;

	timeout: number;
	fileIgnore: Array<string>;
	fileInclude: Array<string>;
	parallelOps: boolean;

	serverLogsOffset: string;
	serverLogsFullStack: boolean;
	logLimit: number;
	queryLimit: number;

	secretStorage: vscode.SecretStorage;

	serverLogs: vscode.OutputChannel;
	pluginLogs: vscode.LogOutputChannel;

	get intentTypes() {
		return this.intentTypeCache.intentTypes;
	}

	get onDidChangeFileDecorations() {
		return this.decorations.onDidChangeFileDecorations;
	}

	get onDidChangeFile() {
		return this.fileSystem.onDidChangeFile;
	}

	get nspAddr(): string {
		return this.nspClient.nspAddr;
	}
	set nspAddr(value: string) {
		this.nspClient.nspAddr = value;
	}

	get username(): string {
		return this.nspClient.username;
	}
	set username(value: string) {
		this.nspClient.username = value;
	}

	get password(): string | undefined {
		return this.nspClient.password;
	}
	set password(value: string | undefined) {
		this.nspClient.password = value;
	}

	get port(): string {
		return this.nspClient.port;
	}
	set port(value: string) {
		this.nspClient.port = value;
	}

	get nspVersion(): string | undefined {
		return this.nspClient.nspVersion;
	}
	set nspVersion(value: string | undefined) {
		this.nspClient.nspVersion = value;
	}

	get osdVersion(): string | undefined {
		return this.nspClient.osdVersion;
	}
	set osdVersion(value: string | undefined) {
		this.nspClient.osdVersion = value;
	}

	constructor(context: vscode.ExtensionContext) {
		const config = vscode.workspace.getConfiguration('intentManager');
		this.secretStorage = context.secrets;

		this.serverLogs = vscode.window.createOutputChannel('NSP Server (remote logs)', 'log');
		this.pluginLogs = vscode.window.createOutputChannel('NSP Client (plugin logs)', { log: true });

		this.timeout = config.get('timeout') ?? 90;
		this.fileIgnore = config.get('ignoreLabels') ?? [];
		this.fileInclude = config.get('includeLabels') ?? [];
		this.parallelOps = config.get('parallelOperations.enable') ?? false;

		this.serverLogsOffset = config.get('serverLogsOffset') ?? '10m';
		this.serverLogsFullStack = config.get('serverLogsFullStack') ?? false;
		this.logLimit = config.get('logLimit') ?? 5000;
		this.queryLimit = config.get('queryLimit') ?? 1000;

		this.extensionPath = context.extensionPath;
		this.extensionUri = context.extensionUri;

		this.decorations = new IntentDecorations({
			cache: this.intentTypeCache,
			pluginLogs: this.pluginLogs,
			getNspVersion: () => this.nspVersion,
			getNspAddr: () => this.nspAddr,
			getUsername: () => this.username,
			readDirectory: (uri) => this.fileSystem.readDirectory(uri),
		});

		this.fileSystem = new IntentFileSystem({
			cache: this.intentTypeCache,
			pluginLogs: this.pluginLogs,
			queryLimit: this.queryLimit,
			fileIgnore: this.fileIgnore,
			fileInclude: this.fileInclude,
			callNSP: (url, options) => this._callNSP(url, options),
			fireDecoration: (uri) => this.decorations.fire(uri),
			newRemoteIntentType: (args) => this.newRemoteIntentType(args),
		});

		this.lifecycle = new IntentLifecycle({
			cache: this.intentTypeCache,
			extensionUri: this.extensionUri,
			pluginLogs: this.pluginLogs,
			serverLogs: this.serverLogs,
			parallelOps: this.parallelOps,
			serverLogsOffset: this.serverLogsOffset,
			serverLogsFullStack: this.serverLogsFullStack,
			logLimit: this.logLimit,
			getNspAddr: () => this.nspAddr,
			getNspVersion: () => this.nspVersion,
			getOsdVersion: () => this.osdVersion,
			getAuthToken: () => this._getAuthToken(),
			getNSPversion: () => this._getNSPversion(),
			callNSP: (url, options) => this._callNSP(url, options),
			getUriList: (args) => this._getUriList(args),
			openWebUI: (url) => this._openWebUI(url),
			fireDecoration: (uri) => this.decorations.fire(uri),
		});

		const nspAddr = this._getNspServer();
		const username = this._getNspUser();
		const port: string = config.get('port') ?? '443';

		this.nspClient = new NspRestClient(
			{ nspAddr, username, port, timeout: this.timeout },
			{
				pluginLogs: this.pluginLogs,
				onAuthFailure: (error, uname) => {
					this.decorations.DECORATION_DISCONNECTED.tooltip =
						'Authentication failure (user:' + uname + ', error:' + error + ')!';
					this.decorations.fire(vscode.Uri.parse('im:/'));
				},
				onUnreachable: (addr) => {
					this.decorations.DECORATION_DISCONNECTED.tooltip = addr + ' unreachable!';
					this.decorations.fire(vscode.Uri.parse('im:/'));
				},
				onVersionUpdated: (info) => {
					const msg =
						'Connected to ' + info.nspAddr + ', NSP version: ' + (info.nspVersion ?? 'unknown') +
						', OSD version: ' + (info.osdVersion ?? 'unknown');
					vscode.window.showInformationMessage(msg);
					this.decorations.fire(vscode.Uri.parse('im:/'));
				},
			},
		);

		this.templateEngine = new TemplateEngine(this.extensionUri, this.pluginLogs);
		this.intentTypeScaffolder = new IntentTypeScaffolder({
			extensionUri: this.extensionUri,
			pluginLogs: this.pluginLogs,
			intentTypes: this.intentTypes,
			getUriList: (args) => this._getUriList(args),
			callNSP: (url, options) => this._callNSP(url, options),
		});
		this.fixedIntentGenerator = new FixedIntentGenerator({
			nspClient: this.nspClient,
			logger: this.pluginLogs,
			extensionUri: this.extensionUri,
			intentTypes: this.intentTypes,
			getUriList: (args) => this._getUriList(args),
			mergeCommonUri: (suffix) => this.templateEngine.mergeCommonUri(suffix),
			fireUriChange: (uri) => this.decorations.fire(vscode.Uri.parse(uri)),
		});

		console.log('IntentManagerProvider(' + this.nspAddr + ')');
		this._addViewConfigSchema();
	}

	dispose() {
		console.log('disposing IntentManagerProvider()');
		void this._revokeAuthToken();
		this.serverLogs.dispose();
		this.pluginLogs.dispose();
	}

	private _getNspServer(): string {
		const config = vscode.workspace.getConfiguration('intentManager');
		return config.get<string | undefined>('NSPIP')?.trim() || process.env['NSP_SERVER'] || 'nsp.srexperts.net';
	}

	private _getNspUser(): string {
		const config = vscode.workspace.getConfiguration('intentManager');
		return config.get<string | undefined>('user')?.trim() || process.env['NSP_USER'] || 'admin';
	}

	private async _getNspPassword(): Promise<string> {
		return (await this.secretStorage.get('nsp_im_password')) ?? process.env.NSP_PASSWORD ?? '';
	}

	private async _getAuthToken(): Promise<string | undefined> {
		this.password = await this._getNspPassword();
		return this.nspClient.getToken();
	}

	private async _revokeAuthToken(): Promise<void> {
		return this.nspClient.revokeToken();
	}

	private async _callNSP(
		url: string,
		options: { method: string; body?: string; headers?: object; signal?: AbortSignal },
	): Promise<any> {
		return this.nspClient.call(url, options);
	}

	private async _getNSPversion(): Promise<void> {
		await this.nspClient.fetchNspVersion();
	}

	private async _openWebUI(url: string): Promise<void> {
		if (url.startsWith('/web/'))
			url = 'https://' + this.nspAddr + url;
		else if (url.startsWith('/intent-manager/'))
			url = 'https://' + this.nspAddr + ':8547' + url;
		else
			url = 'https://' + this.nspAddr + url;

		vscode.env.openExternal(vscode.Uri.parse(url));
	}

	private _getUriList(args: any[]): vscode.Uri[] {
		if (args.length === 2 && Array.isArray(args[1]))
			return args[1];

		if (args.length > 0 && args[0] instanceof vscode.Uri)
			return [args[0]];

		if (vscode.window.activeTextEditor)
			return [vscode.window.activeTextEditor.document.uri];

		return [];
	}

	private _addViewConfigSchema() {
		const jsonSchemas: { fileMatch: string[]; schema: boolean; url: string }[] | undefined =
			vscode.workspace.getConfiguration('json').get('schemas');
		const schemaPath: string = vscode.Uri.joinPath(this.extensionUri, 'media', 'viewconfig-schema.json').toString();

		if (jsonSchemas !== undefined) {
			let entryExists = false;
			for (const schema of jsonSchemas) {
				if (schema.fileMatch.includes('*.viewConfig')) {
					schema.url = schemaPath;
					entryExists = true;
					break;
				}
			}

			if (!entryExists)
				jsonSchemas.push({ fileMatch: ['*.viewConfig'], schema: false, url: schemaPath });

			vscode.workspace.getConfiguration('json').update('schemas', jsonSchemas, vscode.ConfigurationTarget.Workspace);
		}
	}

	// --- vscode.FileSystemProvider (delegated) ---------------------------

	readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		return this.fileSystem.readDirectory(uri);
	}

	readFile(uri: vscode.Uri): Promise<Uint8Array> {
		return this.fileSystem.readFile(uri);
	}

	stat(uri: vscode.Uri): Promise<vscode.FileStat> {
		return this.fileSystem.stat(uri);
	}

	writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean }): Promise<void> {
		return this.fileSystem.writeFile(uri, content, options);
	}

	delete(uri: vscode.Uri): Promise<void> {
		return this.fileSystem.delete(uri);
	}

	rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): Promise<void> {
		return this.fileSystem.rename(oldUri, newUri, options);
	}

	createDirectory(uri: vscode.Uri): Promise<void> {
		return this.fileSystem.createDirectory(uri);
	}

	watch(_resource: vscode.Uri): vscode.Disposable {
		return this.fileSystem.watch(_resource);
	}

	// --- vscode.FileDecorationProvider / CodeLensProvider (delegated) ----

	provideFileDecoration(uri: vscode.Uri): Promise<vscode.FileDecoration | undefined> {
		return this.decorations.provideFileDecoration(uri);
	}

	provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
		return this.decorations.provideCodeLenses(document);
	}

	// --- IntentManagerProvider public API --------------------------------

	async updateSettings() {
		this.pluginLogs.info('Updating IntentManagerProvider after configuration change');

		const config = vscode.workspace.getConfiguration('intentManager');

		this.timeout = config.get('timeout') ?? 90;
		this.nspClient.timeout = this.timeout;
		this.fileIgnore = config.get('ignoreLabels') ?? [];
		this.fileInclude = config.get('includeLabels') ?? [];
		this.parallelOps = config.get('parallelOperations.enable') ?? false;

		this.serverLogsOffset = config.get('serverLogsOffset') ?? '10m';
		this.serverLogsFullStack = config.get('serverLogsFullStack') ?? false;
		this.logLimit = config.get('logLimit') ?? 5000;
		this.queryLimit = config.get('queryLimit') ?? 1000;

		const nsp = this._getNspServer();
		const user = this._getNspUser();
		const port: string = config.get('port') ?? '443';
		const pass = await this._getNspPassword();

		if (nsp !== this.nspAddr || user !== this.username || port !== this.port || pass !== this.password) {
			this.pluginLogs.warn('Disconnecting from NSP', this.nspAddr);
			this._revokeAuthToken();
			this.nspAddr = nsp;
			this.username = user;
			this.port = port;
			this.nspVersion = undefined;
			this.osdVersion = undefined;

			this.decorations.resetConnectionTooltips();
			this.decorations.fire(vscode.Uri.parse('im:/'));
		}

		this.intentTypeCache.clear();
		vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
	}

	public getState(uri: vscode.Uri): string {
		return this.lifecycle.getState(uri);
	}

	public setState(args: any[]): Promise<void> {
		return this.lifecycle.setState(args);
	}

	public uploadIntentType(args: any[]): Promise<void> {
		return this.fixedIntentGenerator.uploadIntentType(args);
	}

	public uploadIntents(args: any[]): Promise<void> {
		return this.fixedIntentGenerator.uploadIntents(args);
	}

	public async setLogLevel() {
		this.pluginLogs.debug('setLogLevel()');

		const loglevels = [
			{ label: 'default' }, { label: 'trace' }, { label: 'debug' },
			{ label: 'info' }, { label: 'warn' }, { label: 'error' },
		];
		await vscode.window.showQuickPick(loglevels).then(async (selection: vscode.QuickPickItem | undefined) => {
			if (selection) {
				const url = '/mdt/rest/restconf/data/anv-platform:platform/anv-logging:logging/logger-config=ibn.intent,debug,global';
				const body = { 'anv-logging:logger-config': { 'log-level': selection.label } };

				const response: any = await this._callNSP(url, { method: 'PATCH', body: JSON.stringify(body) });
				if (!response)
					throw vscode.FileSystemError.Unavailable('Lost connection to NSP');
				if (response.ok) {
					vscode.window.showInformationMessage('Intent engine log-level updated to ' + selection.label);
				} else raiseRestconfError('Update intent engine log-level failed!', await response.json());
			}
		});
	}

	public logs(args: any[]): Promise<void> {
		return this.lifecycle.logs(args);
	}

	public audit(args: any[]): Promise<void> {
		return this.lifecycle.audit(args);
	}

	public lastAuditReport(args: any[]): Promise<void> {
		return this.lifecycle.lastAuditReport(args);
	}

	public sync(args: any[]): Promise<void> {
		return this.lifecycle.sync(args);
	}

	public retrieveState(args: any[]): Promise<void> {
		return this.lifecycle.retrieveState(args);
	}

	public migrate(args: any[]): Promise<void> {
		return this.lifecycle.migrate(args);
	}

	public openInBrowser(args: any[]): Promise<void> {
		return this.lifecycle.openInBrowser(args);
	}

	public newIntent(args: any[]): Promise<void> {
		return this.lifecycle.newIntent(args);
	}

	public newVersion(args: any[]): Promise<void> {
		return this.fixedIntentGenerator.newVersion(args);
	}

	public clone(args: any[]): Promise<void> {
		return this.fixedIntentGenerator.clone(args);
	}

	public newRemoteIntentType(args: any[]): Promise<void> {
		return this.intentTypeScaffolder.newRemoteIntentType(args);
	}

	public newLocalIntentType(args: any[]): Promise<void> {
		return this.intentTypeScaffolder.newLocalIntentType(args);
	}

	public async newIntentTypeICM(args: any[]): Promise<void> {
		this.pluginLogs.info('newIntentTypeICM(', JSON.stringify(args), ')');

		if (args.length > 1 && args[0] instanceof vscode.Uri) {
			const fileUri = args[0];
			if (fs.lstatSync(fileUri.fsPath).isFile()) {
				const intentType = path.basename(fileUri.fsPath, '.igen');
				const userActivity = new ActivityStatus(`Create "${intentType}"`, 9);
				const templatePath = vscode.Uri.joinPath(this.extensionUri, 'templates', 'icm', 'device-specific');

				try {
					await generateFromIgenFile({
						igenFilePath: fileUri.fsPath,
						templateDir: templatePath.fsPath,
						deps: {
							callNsp: (url, options) => this._callNSP(url, options),
							logger: this.pluginLogs,
						},
						onProgress: () => userActivity.refresh(),
					});
					userActivity.done();
				} catch (e) {
					if (e instanceof Error && e.message === 'Intent-type exists') {
						vscode.window.showErrorMessage('Intent-type exists');
						userActivity.failed();
						return;
					}
					userActivity.failed();
					throw e;
				} finally {
					await new Promise(resolve => setTimeout(resolve, 3000));
					userActivity.dispose();
				}
			}
		}
	}

	public newFixedIntentType(args: any[]): Promise<void> {
		return this.fixedIntentGenerator.newFixedIntentType(args);
	}

	public exportIntentType(folder: string, intent_type: string, intent_type_version: string): Promise<void> {
		return this.fixedIntentGenerator.exportIntentType(folder, intent_type, intent_type_version);
	}

	public getStatusBarItem(): vscode.StatusBarItem {
		return myStatusBarItem;
	}
}

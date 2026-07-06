import * as vscode from 'vscode';

import { IntentTypeCache } from '../fs/IntentTypeCache';

const COLOR_OK            = new vscode.ThemeColor('gitDecoration.untrackedResourceForeground');
const COLOR_READONLY      = new vscode.ThemeColor('list.deemphasizedForeground');
const COLOR_CUSTOMIZATION = new vscode.ThemeColor('list.highlightForeground');
const COLOR_ERROR         = new vscode.ThemeColor('list.errorForeground');
const COLOR_FOCUS         = new vscode.ThemeColor('list.highlightForeground');

export interface IntentDecorationsDeps {
	cache: IntentTypeCache;
	pluginLogs: vscode.LogOutputChannel;
	getNspVersion: () => string | undefined;
	getNspAddr: () => string;
	getUsername: () => string;
	readDirectory: (uri: vscode.Uri) => Promise<[string, vscode.FileType][]>;
}

export class IntentDecorations implements vscode.FileDecorationProvider, vscode.CodeLensProvider {
	readonly DECORATION_DISCONNECTED = { badge: '❗', tooltip: 'Not connected!', color: COLOR_ERROR };
	readonly DECORATION_CONNECTED    = { badge: '✔',  tooltip: 'Connecting...', color: COLOR_OK };
	readonly DECORATION_SIGNED       = { badge: '🔒', tooltip: 'IntentType: Signed', color: COLOR_READONLY };

	readonly DECORATION_VIEWS     = { tooltip: 'UI Form Customization', color: COLOR_CUSTOMIZATION };
	readonly DECORATION_INTENTS   = { tooltip: 'Intents', color: COLOR_CUSTOMIZATION };

	readonly DECORATION_UNSIGNED  = { badge: '📘', tooltip: 'IntentType: Unsigned', color: COLOR_FOCUS };
	readonly DECORATION_MODULES   = { tooltip: 'YANG Modules' };
	readonly DECORATION_RESOURCES = { tooltip: 'Resources' };

	readonly DECORATION_ALIGNED    = { badge: '✅', tooltip: 'Intent: Aligned',    color: COLOR_OK };
	readonly DECORATION_MISALIGNED = { badge: '💔', tooltip: 'Intent: Misaligned', color: COLOR_ERROR };

	private readonly _eventEmitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
	readonly onDidChangeFileDecorations = this._eventEmitter.event;

	constructor(private readonly deps: IntentDecorationsDeps) {}

	fire(uri: vscode.Uri | vscode.Uri[]): void {
		this._eventEmitter.fire(uri);
	}

	resetConnectionTooltips(): void {
		this.DECORATION_CONNECTED.tooltip = 'Connecting...';
		this.DECORATION_DISCONNECTED.tooltip = 'Not connected!';
	}

	async provideFileDecoration(uri: vscode.Uri): Promise<vscode.FileDecoration | undefined> {
		const path = uri.toString();
		const parts = path.split('/').map(decodeURIComponent);
		const pattern = /^([a-z][a-z0-9_-]+)_v\d+$/;

		if (path === 'im:/') {
			this.deps.pluginLogs.debug('provideFileDecoration(im:/)');
			if (this.deps.getNspVersion()) {
				this.DECORATION_CONNECTED.tooltip =
					'Connected to ' + this.deps.getUsername() + '@' + this.deps.getNspAddr() +
					' (Release: ' + this.deps.getNspVersion() + ')';
				this.DECORATION_DISCONNECTED.tooltip = 'Not connected!';
				return this.DECORATION_CONNECTED;
			}
			return this.DECORATION_DISCONNECTED;
		}

		if (parts[0] === 'im:' && pattern.test(parts[1])) {
			this.deps.pluginLogs.debug('provideFileDecoration(' + path + ')');

			const intent_type_folder = parts[1];
			await this.deps.cache.ensureCacheWarm(
				intent_type_folder,
				() => this.deps.readDirectory(vscode.Uri.parse('im:/')),
				this.deps.pluginLogs,
			);

			if (intent_type_folder in this.deps.cache.intentTypes) {
				if (parts.length === 2) {
					if (this.deps.cache.intentTypes[intent_type_folder].signed)
						return this.DECORATION_SIGNED;
					return this.DECORATION_UNSIGNED;
				}

				if (parts[2] === 'views') return this.DECORATION_VIEWS;

				if (parts[2] === 'intents') {
					if (parts.length === 4) {
						const target = decodeURIComponent(parts[3].slice(0, -5));

						if (this.deps.cache.intentTypes[intent_type_folder].aligned[target])
							return this.DECORATION_ALIGNED;
						return this.DECORATION_MISALIGNED;
					}
					return this.DECORATION_INTENTS;
				}

				if (parts.length === 3) {
					if (this.deps.cache.intentTypes[intent_type_folder].signed)
						return this.DECORATION_SIGNED;
					if (parts[2] === 'intent-type-resources')
						return this.DECORATION_RESOURCES;
					if (parts[2] === 'yang-modules')
						return this.DECORATION_MODULES;
				}
			}
		}
	}

	async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
		const topOfDocument = new vscode.Range(0, 0, 0, 0);

		const command = {
			title: 'Intent Manager at ' + this.deps.getNspAddr() + ' (Release: ' + this.deps.getNspVersion() + ') by NOKIA',
			command: 'nokia-intent-manager.openInBrowser',
		};

		return [new vscode.CodeLens(topOfDocument, command)];
	}
}

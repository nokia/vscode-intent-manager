'use strict';

import * as vscode from 'vscode';

import { IntentManagerProvider } from './providers';

export function activate(context: vscode.ExtensionContext) {
	const config = vscode.workspace.getConfiguration('intentManager');
	const addr : string = config.get("NSPIP") ?? "";
	const secretStorage : vscode.SecretStorage = context.secrets;

	const imProvider = new IntentManagerProvider(context);

	context.subscriptions.push(vscode.workspace.registerFileSystemProvider('im', imProvider, { isCaseSensitive: true }));
	context.subscriptions.push(vscode.window.registerFileDecorationProvider(imProvider));

	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.audit', async (...args) => imProvider.audit(args)));
	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.sync',  async (...args) => imProvider.sync(args)));
	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.logs',  async (...args) => imProvider.logs(args)));
	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.state', async (...args) => imProvider.setState(args)));
	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.migrate',  async (...args) => imProvider.migrate(args)));
	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.loglevel', async (...args) => imProvider.setLogLevel()));
	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.retrieveState', async (...args) => imProvider.retrieveState(args)));
	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.lastAuditReport', async (...args) => imProvider.lastAuditReport(args)));

	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.newIntent',     async (...args) => imProvider.newIntent(args)));
	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.openInBrowser', async (...args) => imProvider.openInBrowser(args)));

	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.uploadIntentType', async (...args) => imProvider.uploadIntentType(args)));
	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.exportIntentType', async (localPath, intentType, intentTypeVersion) => imProvider.exportIntentType(localPath, intentType, intentTypeVersion)));
	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.uploadIntents',    async (...args) => imProvider.uploadIntents(args)));	
	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.clone',            async (...args) => imProvider.clone(args)));
	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.newVersion',       async (...args) => imProvider.newVersion(args)));
	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.newLocalIntentType', async (...args) => imProvider.newLocalIntentType(args)));
	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.newRemoteIntentType', async (...args) => imProvider.newRemoteIntentType(args)));
	
	vscode.commands.registerCommand('nokia-intent-manager.setPassword', async (password: string|undefined) => {
		if (password === undefined)
			password = await vscode.window.showInputBox({password: true, title: "Password"});
		if (password !== undefined)
			secretStorage.store("nsp_im_password", password);
	});

	vscode.commands.registerCommand('nokia-intent-manager.connect', async (username: string|undefined, password: string|undefined, nspAddr: string|undefined, port: string) => {
		const config = vscode.workspace.getConfiguration('intentManager');
		if (username === undefined) {
			username = await vscode.window.showInputBox({title: "Username"});
		}
		if (username !== undefined) {
			config.update("user", username, vscode.ConfigurationTarget.Workspace);
		}
		if (password === undefined) {
			password = await vscode.window.showInputBox({password: true, title: "Password"});
		} else {
			secretStorage.store("nsp_im_password", password);
		}
		config.update("port", port, vscode.ConfigurationTarget.Workspace);
		config.update("NSPIP", nspAddr, vscode.ConfigurationTarget.Workspace);
	});

	function updateStatusBarItem() {
		const editor = vscode.window.activeTextEditor;
		const sbar = imProvider.getStatusBarItem();

		if (editor) {
			const document = editor.document;
			const parts = document.uri.toString().split('/').map(decodeURIComponent);

			if (parts[0]==="im:") {
				if (parts[2]==="intents") {
					sbar.text = parts[3]+" ["+imProvider.getState(document.uri)+"]";
					sbar.command = 'nokia-intent-manager.state';
				} else {
					sbar.text = parts[1];
					sbar.command = undefined;
				}
				sbar.show();
			} else sbar.hide();
		} else sbar.hide();
	}

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (e) => {
		if (e.affectsConfiguration('intentManager')) {
			imProvider.updateSettings(); // config has changed
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.updateStatusBar', async () => updateStatusBarItem()));
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateStatusBarItem));
	context.subscriptions.push(imProvider.getStatusBarItem());
	context.subscriptions.push(vscode.languages.registerCodeLensProvider({scheme: 'im'}, imProvider));

	const fileAssociations : {[key: string]: string} = vscode.workspace.getConfiguration('files').get('associations') || {};
	fileAssociations["/*_v*/views/*"] = "json";
	vscode.workspace.getConfiguration('files').update('associations', fileAssociations);
	vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0, null, { uri: vscode.Uri.parse('im:/'), name: "Intent Manager" });
}
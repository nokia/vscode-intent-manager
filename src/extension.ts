'use strict';

import * as vscode from 'vscode';

import { IntentManagerProvider, CodelensProvider } from './providers';

export function activate(context: vscode.ExtensionContext) {
	const config = vscode.workspace.getConfiguration('intentManager');
	const addr : string = config.get("NSPIP") ?? "";
	const user : string = config.get("user") ?? "admin";
	const port : string = config.get("port") ?? "443";
	const timeout : number = config.get("timeout") ?? 20000;
	const fileIgnore : Array<string> = config.get("ignoreLabels") ?? [];
	const secretStorage : vscode.SecretStorage = context.secrets;

	const imProvider = new IntentManagerProvider(addr, user, secretStorage, port, timeout, fileIgnore, context.extensionPath, context.extensionUri);

	context.subscriptions.push(vscode.workspace.registerFileSystemProvider('im', imProvider, { isCaseSensitive: true }));
	context.subscriptions.push(vscode.window.registerFileDecorationProvider(imProvider));



	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.audit', async (...args) => imProvider.audit(args)));
	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.sync',  async (...args) => imProvider.sync(args)));
	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.logs',  async (...args) => imProvider.logs(args)));
	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.state', async (...args) => imProvider.setState(args)));

	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.openInBrowser', async (...args) => imProvider.openInBrowser(args)));
	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.newIntent',     async (...args) => imProvider.newIntent(args)));

	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.uploadLocal',   async (...args) => imProvider.uploadLocal(args)));
	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.clone',         async (...args) => imProvider.clone(args)));
	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.newVersion',    async (...args) => imProvider.newVersion(args)));
	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.newIntentType', async (...args) => imProvider.newIntentType(args)));
	
	vscode.commands.registerCommand('nokia-intent-manager.setPassword', async () => {
		const passwordInput: string = await vscode.window.showInputBox({password: true, title: "Password"}) ?? '';
		if(passwordInput !== '')
			secretStorage.store("nsp_im_password", passwordInput);
	});

	function updateStatusBarItem(){
		const editor = vscode.window.activeTextEditor;
		let sbar = imProvider.shareStatusBarItem();

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
	
	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.updateStatusBar', async () => updateStatusBarItem()));
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateStatusBarItem));
	context.subscriptions.push(imProvider.shareStatusBarItem());

	const header = new CodelensProvider(addr);
	context.subscriptions.push(vscode.languages.registerCodeLensProvider({scheme: 'im'}, header));

	let fileAssociations : {[key: string]: string} = vscode.workspace.getConfiguration('files').get('associations') || {};
	fileAssociations["/*_v*/views/*"] = "json";
	fileAssociations["/*_v*/intents/*"] = "json";
	vscode.workspace.getConfiguration('files').update('associations', fileAssociations);
	  
	vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0, null, { uri: vscode.Uri.parse('im:/'), name: "Intent Manager" });
}
'use strict';

import * as vscode from 'vscode';

import { IntentManagerProvider, CodelensProvider } from './providers';

export function activate(context: vscode.ExtensionContext) {
	console.log('Intent Manager says "Hello"');

	const config = vscode.workspace.getConfiguration('intentManager');
	const nspAddr = config.get("NSPIP");
	const username = config.get("user");
	const secret = config.get("password");
	const port = config.get("port");

	const imProvider = new IntentManagerProvider(nspAddr, username, secret, port);
	context.subscriptions.push(vscode.workspace.registerFileSystemProvider('im', imProvider, { isCaseSensitive: true }));
	context.subscriptions.push(vscode.window.registerFileDecorationProvider(imProvider));
	
	let fileAssociations : {string: string} = vscode.workspace.getConfiguration('files').get('associations') || <{string: string}>{};
    fileAssociations["*.schemaForm"] = "json";
    fileAssociations["*.viewConfig"] = "json";
	fileAssociations["*.settings"] = "json";
	fileAssociations["/intents/*"] = "json";
    vscode.workspace.getConfiguration('files').update('associations', fileAssociations);
	imProvider.extContext=context;
	imProvider.getNSPversion();

	function updateStatusBarItem(){
		const editor = vscode.window.activeTextEditor;
		let document = editor.document;
		const documentPath = document.uri.toString().replace(/%25/g,"%");
		const intentype = documentPath.split("/")[2];
		console.log("updating status bar");
		let sbar = imProvider.shareStatusBarItem();
		let state="";
		if (documentPath.startsWith("im:/intent-types/")) {
			sbar.text = intentype;
			sbar.show();
			sbar.command = undefined;
		} else if (documentPath.startsWith("im:/intents/")) {
			sbar.text = "Intent State: "+imProvider.getCustomeState(documentPath);
			sbar.show();
			sbar.command = 'nokia-intent-manager.intentStatus';
		} else sbar.hide();
	}

	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateStatusBarItem));

	const header = new CodelensProvider(nspAddr);
	context.subscriptions.push(vscode.languages.registerCodeLensProvider({scheme: 'im'}, header));

	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.openInBrowser', async () => {
		imProvider.openInBrowser();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.updateStatusBar', async () => {
		updateStatusBarItem();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.newVersion', async (...args) => {
		console.log(args[0]);
		imProvider.createNewIntentVersion(args[0]);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.uploadLocal', async (...args) => {
		console.log(args[0]);
		imProvider.uploadLocalIntent(args[0]);
	}));
	

	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.createIntentFromYang', async (...args) => {
		console.log(args);
		for (const f of args[1]) {
			console.log(f.toString());
			if (!f.toString().endsWith(".yang")) {
				vscode.window.showErrorMessage("File "+f.toString()+"is not .yang");
				throw vscode.FileSystemError.Unavailable("File "+f.toString()+"is not .yang");
			}
		}
		const intentName = await vscode.window.showInputBox({
			placeHolder: "Intent Name",
			prompt: "Provide a name for the new intent",
			value: "default_intent_name"
		});
		if(intentName === ''){
			vscode.window.showErrorMessage('A name is mandatory');
		}
		imProvider.createIntentFromScratch(intentName,args[1]);
		console.log("All checked.");
	}));

	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.createIntentFromScratch', async () => {
		const intentName = await vscode.window.showInputBox({
			placeHolder: "Intent Name",
			prompt: "Provide a name for the new intent",
			value: "default_intent_name"
		});
		if(intentName === ''){
			vscode.window.showErrorMessage('A name is mandatory');
		}
		imProvider.createIntentFromScratch(intentName,undefined);
		console.log("All checked.");
	}));

	context.subscriptions.push(imProvider.shareStatusBarItem());

	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.newIntent', async () => {
		imProvider.openIntentCreation();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.audit', async () => {
		console.log("Audit intent");
		imProvider.audit();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.logs', async () => {
		console.log("Intent Logs");
		imProvider.getLogs();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.sync', async () => {
		console.log("Sync intent");
		imProvider.sync();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.intentStatus', () => {
		imProvider.updateIntentNetworkStatus();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('nokia-intent-manager.clone', async (...args) => {
		console.log(args[0]);
		const intentName = await vscode.window.showInputBox({
			placeHolder: "Intent Name",
			prompt: "Provide a name for the new intent",
			value: "defaultIntentName"
		});
		if(intentName === ''){
			vscode.window.showErrorMessage('A name is mandatory');
		}
		imProvider.cloneIntent(args[0],intentName);
	}));

	vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0, null, { uri: vscode.Uri.parse('im:/'), name: "Intent Manager" });

}
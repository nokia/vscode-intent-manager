import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { raiseRestconfError } from '../common/errors';
import { TemplateEngine, TemplateRenderContext } from './TemplateEngine';

export interface IntentTypeScaffolderDeps {
	extensionUri: vscode.Uri;
	pluginLogs: vscode.LogOutputChannel;
	intentTypes: Record<string, unknown>;
	getUriList: (args: any[]) => vscode.Uri[];
	callNSP: (url: string, options: { method: string; body?: string }) => Promise<any>;
}

export class IntentTypeScaffolder {
	private readonly templateEngine: TemplateEngine;

	constructor(private readonly deps: IntentTypeScaffolderDeps) {
		this.templateEngine = new TemplateEngine(deps.extensionUri, deps.pluginLogs);
	}

	async newRemoteIntentType(args: any[]): Promise<void> {
		const patharg = this.deps.getUriList(args)[0].toString();
		const parts = patharg.split('/').map(decodeURIComponent);
		const pattern = /^([a-z][a-z0-9_-]+)(_v\d+)?$/;

		let intent_type_name = 'default';
		if (parts.length === 2 && pattern.test(parts[1]))
			intent_type_name = parts[1].replace(/_v\d+$/, '');

		const data: TemplateRenderContext = {
			intent_type: intent_type_name,
			author: 'NSP DevOps',
			template: 'none',
			date: new Date().toISOString().slice(0, 10),
		};

		data.intent_type = await vscode.window.showInputBox({
			title: 'Create intent-type | Step 1 NAME',
			prompt: 'Provide a name for the new intent-type!',
			value: data.intent_type,
		});
		if (!data.intent_type) return;

		if ((data.intent_type + '_v1') in this.deps.intentTypes)
			throw vscode.FileSystemError.FileExists('Intent-type already exists! Use unique intent-type name!');

		data.author = await vscode.window.showInputBox({
			title: 'Create intent-type | Step 2 AUTHOR',
			prompt: 'Provide an author for the new intent',
			value: data.author,
		});
		if (!data.author) return;

		const items = this.templateEngine.getTemplateQuickPickItems();

		const selection = await vscode.window.showQuickPick(items, { title: 'Create intent-type | Step 3 TEMPLATE' });
		if (selection) data.template = selection.label; else return;

		const templatePath = vscode.Uri.joinPath(this.deps.extensionUri, 'templates', data.template);
		const meta = this.templateEngine.buildRemoteIntentTypeMeta(templatePath, data);
		if (!meta) return;

		meta.name = data.intent_type;
		meta.version = 1;
		delete meta['intent-type'];

		if ('targetted-device' in meta) {
			let index = 0;
			for (const entry of meta['targetted-device'] as Record<string, unknown>[]) {
				if (!('index' in entry)) entry.index = index;
				index += 1;
			}
		}

		vscode.window.showInformationMessage('Creating new Intent-Type');
		const body = { 'ibn-administration:intent-type': meta };
		const url = '/restconf/data/ibn-administration:ibn-administration/intent-type-catalog';
		const response: any = await this.deps.callNSP(url, { method: 'POST', body: JSON.stringify(body) });
		if (!response)
			throw vscode.FileSystemError.Unavailable('Lost connection to NSP');
		if (!response.ok)
			raiseRestconfError('Create intent-type failed!', await response.json(), true);

		vscode.window.showInformationMessage('Intent-Type ' + data.intent_type + ' successfully created!');
		vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
	}

	async newLocalIntentType(args: any[]): Promise<void> {
		this.deps.pluginLogs.info('newLocalIntentType(', JSON.stringify(args), ')');

		if (args.length > 1 && args[0] instanceof vscode.Uri) {
			const userinput: TemplateRenderContext = {
				intent_type: 'default',
				author: 'NSP DevOps',
				template: 'none',
				date: new Date().toISOString().slice(0, 10),
			};

			userinput.intent_type = await vscode.window.showInputBox({
				title: 'Create intent-type | Step 1 NAME',
				prompt: 'Provide a name for the new intent-type!',
				value: userinput.intent_type,
			});
			if (!userinput.intent_type) return;

			let rootUri = args[0];
			if (fs.lstatSync(rootUri.fsPath).isFile())
				rootUri = vscode.Uri.file(path.dirname(rootUri.fsPath));

			const intentTypePath = vscode.Uri.joinPath(rootUri, userinput.intent_type + '_v1');
			if (fs.existsSync(intentTypePath.fsPath)) {
				vscode.window.showErrorMessage('Intent-type exists');
				return;
			}

			userinput.author = await vscode.window.showInputBox({
				title: 'Create intent-type | Step 2 AUTHOR',
				prompt: 'Provide an author for the new intent',
				value: userinput.author,
			});
			if (!userinput.author) return;

			const items = this.templateEngine.getTemplateQuickPickItems();

			const selection = await vscode.window.showQuickPick(items, { title: 'Create intent-type | Step 3 TEMPLATE' });
			if (selection) userinput.template = selection.label; else return;

			const templatePath = vscode.Uri.joinPath(this.deps.extensionUri, 'templates', userinput.template);
			fs.mkdirSync(intentTypePath.fsPath);

			this.templateEngine.scaffoldLocalIntentType(intentTypePath, templatePath, userinput);
		}
	}
}

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// @ts-expect-error module nunjucks does not have a declaration file
import nunjucks = require('nunjucks');

export interface TemplateRenderContext {
	intent_type?: string;
	author?: string;
	template?: string;
	date?: string;
	[key: string]: unknown;
}

export class TemplateEngine {
	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly pluginLogs: vscode.LogOutputChannel,
	) {}

	mergeCommonUri(mergeSuffix: string): vscode.Uri {
		const map: Record<string, string> = {
			common_abstract: 'common/abstract',
			common_classic: 'common/classic',
			common_fixed: 'common/fixed',
		};
		const relative = map[mergeSuffix] ?? mergeSuffix;
		return vscode.Uri.joinPath(this.extensionUri, 'templates', ...relative.split('/'));
	}

	getTemplateQuickPickItems(): vscode.QuickPickItem[] {
		const templatesInfoPath = vscode.Uri.joinPath(this.extensionUri, 'templates', 'templates.json').fsPath;
		const templates: { label: string; description: string; category?: string }[] =
			JSON.parse(fs.readFileSync(templatesInfoPath, { encoding: 'utf8', flag: 'r' })).templates;
		const items: vscode.QuickPickItem[] = [];
		const sorted = [...templates].sort((a, b) =>
			(a.category ?? '').localeCompare(b.category ?? '') || a.label.localeCompare(b.label));
		let lastCategory = '';
		for (const template of sorted) {
			const category = template.category ?? 'other';
			if (category !== lastCategory) {
				items.push({ label: category, kind: vscode.QuickPickItemKind.Separator });
				lastCategory = category;
			}
			items.push({ label: template.label, description: template.description });
		}
		return items;
	}

	renderFile(fileDir: string, filename: string, data: TemplateRenderContext): string {
		const jinja = nunjucks.configure(fileDir);
		return jinja.render(filename, data);
	}

	collectMergeSuffixes(templatePath: vscode.Uri): string[] {
		return fs.readdirSync(templatePath.fsPath)
			.filter((item: string) => item.startsWith('merge_'))
			.map((item: string) => item.substring(6));
	}

	buildRemoteIntentTypeMeta(templatePath: vscode.Uri, data: TemplateRenderContext): Record<string, unknown> | undefined {
		if (!fs.existsSync(vscode.Uri.joinPath(templatePath, 'meta-info.json').fsPath)) {
			vscode.window.showErrorMessage('meta-info.json not found');
			return;
		}
		const j2root = nunjucks.configure(templatePath.fsPath);
		const meta: Record<string, unknown> = JSON.parse(j2root.render('meta-info.json', data));

		if (!('mapping-engine' in meta))
			meta['mapping-engine'] = 'js-scripted';

		let script: string | undefined;
		switch (meta['mapping-engine']) {
			case 'js-scripted':
				script = 'script-content.js';
				break;
			case 'js-scripted-graal':
				script = 'script-content.mjs';
				break;
		}
		if (!script) {
			vscode.window.showErrorMessage('Unsupported mapping-engine ' + meta['mapping-engine'] + '!');
			return;
		}
		if (!fs.existsSync(vscode.Uri.joinPath(templatePath, script).fsPath)) {
			vscode.window.showErrorMessage(script + ' not found');
			return;
		}
		meta['script-content'] = j2root.render(script, data);

		if (!fs.existsSync(vscode.Uri.joinPath(templatePath, 'yang-modules').fsPath)) {
			vscode.window.showErrorMessage('YANG modules not found');
			return;
		}
		if (!fs.existsSync(vscode.Uri.joinPath(templatePath, 'yang-modules', '[intent_type].yang').fsPath)) {
			vscode.window.showErrorMessage("Intent-type templates must have '[intent_type].yang' module!");
			return;
		}

		if (!('module' in meta)) meta.module = [];

		const modulesPath = vscode.Uri.joinPath(templatePath, 'yang-modules');
		for (const filename of fs.readdirSync(modulesPath.fsPath, { recursive: true, encoding: 'utf8', withFileTypes: false })) {
			const fullpath = vscode.Uri.joinPath(modulesPath, filename).fsPath;
			const j2modules = nunjucks.configure(path.dirname(fullpath));

			if (!fs.lstatSync(fullpath).isFile())
				this.pluginLogs.info('ignore ' + filename + ' (not a file)');
			else if (filename.startsWith('.'))
				this.pluginLogs.info('ignore hidden file ' + filename);
			else if (filename != '[intent_type].yang')
				(meta.module as { name: string; 'yang-content': string }[]).push({
					name: filename.split('\\').join('/'),
					'yang-content': fs.readFileSync(fullpath, { encoding: 'utf8', flag: 'r' }),
				});
			else
				(meta.module as { name: string; 'yang-content': string }[]).push({
					name: data.intent_type + '.yang',
					'yang-content': j2modules.render(filename, data),
				});
		}

		if (!('resource' in meta)) meta.resource = [];
		const resourcefiles: string[] = [];

		const resourcesPath = vscode.Uri.joinPath(templatePath, 'intent-type-resources');
		if (fs.existsSync(resourcesPath.fsPath))
			for (const filename of fs.readdirSync(resourcesPath.fsPath, { recursive: true, encoding: 'utf8', withFileTypes: false })) {
				const fullpath = vscode.Uri.joinPath(resourcesPath, filename).fsPath;
				const j2resources = nunjucks.configure(path.dirname(fullpath));

				if (!fs.lstatSync(fullpath).isFile())
					this.pluginLogs.info('ignore ' + filename + ' (not a file)');
				else if (filename.startsWith('.') || filename.includes('/.'))
					this.pluginLogs.info('ignore hidden file/folder ' + filename);
				else
					(meta.resource as { name: string; value: string }[]).push({
						name: filename.split('\\').join('/'),
						value: j2resources.render(path.basename(fullpath), data),
					});

				resourcefiles.push(filename);
			}
		else vscode.window.showWarningMessage('Intent-type template has no resources');

		for (const folder of this.collectMergeSuffixes(templatePath)) {
			const commonsPath = this.mergeCommonUri(folder);

			this.pluginLogs.info('merge common resources from ' + folder);
			for (const filename of fs.readdirSync(commonsPath.fsPath, { recursive: true, encoding: 'utf8', withFileTypes: false })) {
				const fullpath = vscode.Uri.joinPath(commonsPath, filename).fsPath;
				const j2resources = nunjucks.configure(path.dirname(fullpath));

				if (!fs.lstatSync(fullpath).isFile())
					this.pluginLogs.info('ignore ' + filename + ' (not a file)');
				else if (filename.startsWith('.') || filename.includes('/.'))
					this.pluginLogs.info('ignore hidden file/folder ' + filename);
				else if (resourcefiles.includes(filename))
					this.pluginLogs.info(filename + ' (common) skipped, overwritten in template');
				else
					(meta.resource as { name: string; value: string }[]).push({
						name: filename.split('\\').join('/'),
						value: j2resources.render(path.basename(fullpath), data),
					});
			}
		}

		return meta;
	}

	scaffoldLocalIntentType(intentTypePath: vscode.Uri, templatePath: vscode.Uri, data: TemplateRenderContext): void {
		const mergelist: string[] = [];
		for (const filename of fs.readdirSync(templatePath.fsPath, { recursive: true, encoding: 'utf8', withFileTypes: false })) {
			const srcpath = vscode.Uri.joinPath(templatePath, filename).fsPath;
			const dstpath = vscode.Uri.joinPath(intentTypePath, filename).fsPath;

			if (fs.lstatSync(srcpath).isDirectory())
				fs.mkdirSync(dstpath);
			else if (filename.startsWith('.') || filename.includes('/.'))
				this.pluginLogs.info('skip file/folder ', filename);
			else if (filename.startsWith('merge_'))
				mergelist.push(filename.substring(6));
			else {
				this.pluginLogs.info('processing: ', filename);
				const rendered = this.renderFile(path.dirname(srcpath), path.basename(srcpath), data);

				if (filename === 'jsconfig.json')
					fs.writeFileSync(dstpath, JSON.stringify({
						'compilerOptions': {
							'baseUrl': './intent-type-resources',
						},
						'include': ['*.js', '*.mjs', 'intent-type-resources/*.js', 'intent-type-resources/**/*.mjs'],
					}));
				else if (filename === 'yang-modules/[intent_type].yang')
					fs.writeFileSync(vscode.Uri.joinPath(intentTypePath, `yang-modules/${data.intent_type}.yang`).fsPath, rendered);
				else
					fs.writeFileSync(dstpath, rendered);
			}
		}

		const resourcePath = vscode.Uri.joinPath(intentTypePath, 'intent-type-resources');

		if (!fs.existsSync(resourcePath.fsPath))
			fs.mkdirSync(resourcePath.fsPath);

		for (const folder of mergelist) {
			this.pluginLogs.info('merging: ', folder);

			const mergePath = this.mergeCommonUri(folder);
			for (const filename of fs.readdirSync(mergePath.fsPath, { recursive: true, encoding: 'utf8', withFileTypes: false })) {
				this.pluginLogs.info('filename: ', filename);

				const srcpath = vscode.Uri.joinPath(mergePath, filename).fsPath;
				const dstpath = vscode.Uri.joinPath(resourcePath, filename).fsPath;

				if (fs.existsSync(dstpath)) {
					this.pluginLogs.info(filename + ' (common) skipped, overwritten in template');
				}
				else if (fs.lstatSync(srcpath).isDirectory())
					fs.mkdirSync(dstpath);
				else if (filename.startsWith('.') || filename.includes('/.'))
					this.pluginLogs.info('skip file/folder ', filename);
				else {
					this.pluginLogs.info('processing: ', filename);
					const rendered = this.renderFile(path.dirname(srcpath), path.basename(srcpath), data);
					fs.writeFileSync(dstpath, rendered);
				}
			}
		}
	}
}

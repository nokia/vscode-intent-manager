import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// @ts-expect-error module nunjucks does not have a declaration file
import nunjucks = require('nunjucks');

import { extractRestconfErrorMessage, printRestconfError, raiseRestconfError } from '../common/errors';
import { INspClient } from '../nsp/NspRestClient';

const MATCH_INTENT_TYPE = /^([a-z][a-z0-9_-]+_v\d+)$/;
const MATCH_IMPORTED_INTENT_TYPE = /^intent-([a-z][a-z0-9_-]+-v\d+)$/;

export interface FixedIntentContextEntry {
	path: string;
	exclude?: string[];
}

export interface IcmFixedGeneratorInput {
	contexts: Record<string, FixedIntentContextEntry>;
	device: string;
	author: string;
	labels: string[];
	date?: string;
	intent_type: string;
	intent_type_version: number;
	vendor?: string;
	family?: string;
	version?: string;
	swversion?: string;
	chassis?: string;
	template?: string;
}

export interface IntentTypeCacheEntry {
	signed: boolean;
	timestamp: number;
	data: Record<string, unknown>;
	intents: Record<string, object>;
	desired: Record<string, string>;
	aligned: Record<string, boolean>;
	views: Record<string, unknown>;
}

export type IntentTypeCache = Record<string, IntentTypeCacheEntry>;

export interface FixedIntentGeneratorLogger {
	debug(...args: unknown[]): void;
	info(...args: unknown[]): void;
	warn(...args: unknown[]): void;
	error(...args: unknown[]): void;
}

export interface FixedIntentGeneratorCoreDeps {
	nspClient: INspClient;
	logger: FixedIntentGeneratorLogger;
}

export interface LoadedIntentType {
	intentTypeFolder: string;
	intentType: string;
	intentTypeVersion: string;
	meta: Record<string, unknown>;
	modules: string[];
	resources: string[];
	views: string[];
	intents: string[];
	intentTypePath: string;
}

function throwCoreRestconfError(errmsg: string, response: Record<string, unknown>): never {
	const detail = extractRestconfErrorMessage(response);
	if (detail) {
		errmsg += '\n' + detail;
	}
	throw new Error(errmsg);
}

export function parseIntentTypeFolder(intentTypeFolder: string): { intentType: string; intentTypeVersion: string } {
	const intentType = intentTypeFolder.substring(0, intentTypeFolder.lastIndexOf('_v'));
	const intentTypeVersion = intentTypeFolder.substring(intentTypeFolder.lastIndexOf('_v') + 2);
	return { intentType, intentTypeVersion };
}

export function resolveIntentTypeFolderFromUri(uriString: string): { fsPath: string; intentTypeFolder: string } | null {
	const allparts = uriString.split('/');
	const parts: string[] = [];
	for (const part of allparts) {
		parts.push(part);
		if (MATCH_INTENT_TYPE.test(part) || MATCH_IMPORTED_INTENT_TYPE.test(part)) {
			break;
		}
	}
	let intentTypeFolder = parts.pop() ?? '';
	if (MATCH_IMPORTED_INTENT_TYPE.test(intentTypeFolder)) {
		intentTypeFolder = intentTypeFolder.slice(7).replace(/-v(?=\d+)/, '_v');
	}
	if (!MATCH_INTENT_TYPE.test(intentTypeFolder)) {
		return null;
	}
	return {
		fsPath: vscode.Uri.parse(parts.join('/')).fsPath,
		intentTypeFolder,
	};
}

export function loadIntentTypeFromDirectory(intentTypePath: string, intentTypeFolder: string): LoadedIntentType {
	const metaPath = path.join(intentTypePath, 'meta-info.json');
	if (!fs.existsSync(metaPath)) {
		throw new Error('meta-info.json not found');
	}
	const meta = JSON.parse(fs.readFileSync(metaPath, { encoding: 'utf8', flag: 'r' })) as Record<string, unknown>;

	const scriptJsPath = path.join(intentTypePath, 'script-content.js');
	const scriptMjsPath = path.join(intentTypePath, 'script-content.mjs');
	if (fs.existsSync(scriptJsPath)) {
		meta['script-content'] = fs.readFileSync(scriptJsPath, { encoding: 'utf8', flag: 'r' });
	} else if (fs.existsSync(scriptMjsPath)) {
		meta['script-content'] = fs.readFileSync(scriptMjsPath, { encoding: 'utf8', flag: 'r' });
	} else {
		throw new Error('script-content not found');
	}

	const yangModulesPath = path.join(intentTypePath, 'yang-modules');
	const modules: string[] = [];
	if (fs.existsSync(yangModulesPath)) {
		for (const filename of fs.readdirSync(yangModulesPath)) {
			const filePath = path.join(yangModulesPath, filename);
			if (fs.lstatSync(filePath).isFile() && !filename.startsWith('.')) {
				modules.push(filename);
			}
		}
	} else {
		throw new Error('YANG modules not found');
	}

	const resourcesPath = path.join(intentTypePath, 'intent-type-resources');
	const resources: string[] = [];
	if (fs.existsSync(resourcesPath)) {
		for (const filename of fs.readdirSync(resourcesPath, { recursive: true, encoding: 'utf8' })) {
			const filePath = path.join(resourcesPath, filename);
			if (fs.lstatSync(filePath).isFile() && !filename.startsWith('.') && !filename.includes('/.')) {
				resources.push(filename);
			}
		}
	}

	const viewsPath = path.join(intentTypePath, 'views');
	const views: string[] = [];
	if (fs.existsSync(viewsPath)) {
		for (const filename of fs.readdirSync(viewsPath)) {
			if (filename.endsWith('.viewConfig')) {
				views.push(filename);
			}
		}
	}

	const intentsPath = path.join(intentTypePath, 'intents');
	const intents: string[] = [];
	if (fs.existsSync(intentsPath)) {
		for (const filename of fs.readdirSync(intentsPath)) {
			if (filename.endsWith('.json')) {
				intents.push(filename);
			}
		}
	}

	const { intentType, intentTypeVersion } = parseIntentTypeFolder(intentTypeFolder);

	if ('intent-type' in meta && 'version' in meta && intentTypeFolder !== `${meta['intent-type']}_v${meta.version}`) {
		// Caller may surface mismatch warning
	}

	delete meta['intent-type'];
	meta.name = intentType;
	meta.version = parseInt(intentTypeVersion, 10);

	if ('targetted-device' in meta) {
		let index = 0;
		for (const entry of meta['targetted-device'] as Record<string, unknown>[]) {
			if (!('index' in entry)) {
				entry.index = index;
			}
			index += 1;
		}
	}

	meta.module = modules.map((module) => ({
		name: module,
		'yang-content': fs.readFileSync(path.join(intentTypePath, 'yang-modules', module), { encoding: 'utf8', flag: 'r' }),
	}));

	meta.resource = resources.map((filename) => ({
		name: filename.split('\\').join('/'),
		value: fs.readFileSync(path.join(resourcesPath, filename), { encoding: 'utf8', flag: 'r' }),
	}));

	for (const key of ['resourceDirectory', 'supported-hardware-types']) {
		delete meta[key];
	}

	if ('custom-field' in meta) {
		meta['custom-field'] = JSON.stringify(meta['custom-field']);
	}

	return {
		intentTypeFolder,
		intentType,
		intentTypeVersion,
		meta,
		modules,
		resources,
		views,
		intents,
		intentTypePath,
	};
}

export async function uploadIntentTypeCatalog(
	deps: FixedIntentGeneratorCoreDeps,
	loaded: LoadedIntentType,
	existsInCatalog: boolean,
): Promise<void> {
	const body = { 'ibn-administration:intent-type': loaded.meta };
	if (existsInCatalog) {
		const url = `/restconf/data/ibn-administration:ibn-administration/intent-type-catalog/intent-type=${loaded.intentType},${loaded.intentTypeVersion}`;
		deps.logger.info('update intent-type', loaded.intentType);
		const response = await deps.nspClient.call(url, { method: 'PUT', body: JSON.stringify(body) });
		if (!response) {
			throw new Error('Lost connection to NSP');
		}
		if (!response.ok) {
			throwCoreRestconfError('Update intent-type failed!', await response.json());
		}
	} else {
		const url = '/restconf/data/ibn-administration:ibn-administration/intent-type-catalog';
		deps.logger.info('create intent-type', loaded.intentType);
		const response = await deps.nspClient.call(url, { method: 'POST', body: JSON.stringify(body) });
		if (!response) {
			throw new Error('Lost connection to NSP');
		}
		if (!response.ok) {
			throwCoreRestconfError('Create intent-type failed!', await response.json());
		}
	}
}

export async function uploadIntentTypeView(
	deps: FixedIntentGeneratorCoreDeps,
	loaded: LoadedIntentType,
	view: string,
): Promise<{ view: object } | { error: Record<string, unknown> }> {
	const viewname = view.slice(0, -11);
	const content = fs.readFileSync(path.join(loaded.intentTypePath, 'views', view), { encoding: 'utf8', flag: 'r' });
	const url = `/restconf/data/nsp-intent-type-config-store:intent-type-config/intent-type-configs=${loaded.intentType},${loaded.intentTypeVersion}`;
	const body = {
		'nsp-intent-type-config-store:intent-type-configs': [{
			views: [{
				name: viewname,
				viewconfig: content,
			}],
		}],
	};
	deps.logger.info('upload view ', loaded.intentType, viewname);
	const response = await deps.nspClient.call(url, { method: 'PATCH', body: JSON.stringify(body) });
	if (!response) {
		throw new Error('Lost connection to NSP');
	}
	if (!response.ok) {
		return { error: await response.json() };
	}
	return { view: JSON.parse(content) as object };
}

export type UploadIntentResult = 'updated' | 'created' | 'failed';

export async function uploadSingleIntent(
	deps: FixedIntentGeneratorCoreDeps,
	intentTypeFolder: string,
	intentType: string,
	intentTypeVersion: string,
	target: string,
	content: string,
	existsInCatalog: boolean,
): Promise<{ result: UploadIntentResult; parsed: object }> {
	const parsed = JSON.parse(content) as object;
	if (existsInCatalog) {
		const url = `/restconf/data/ibn:ibn/intent=${encodeURIComponent(target)},${intentType}/intent-specific-data`;
		const body = { 'ibn:intent-specific-data': parsed };
		deps.logger.info('update intent', intentType, target);
		const response = await deps.nspClient.call(url, { method: 'PUT', body: JSON.stringify(body) });
		if (!response) {
			throw new Error('Lost connection to NSP');
		}
		if (response.ok) {
			return { result: 'updated', parsed };
		}
		printRestconfError('Update intent failed!', await response.json());
		return { result: 'failed', parsed };
	}

	const url = '/restconf/data/ibn:ibn';
	const body = {
		'ibn:intent': {
			target,
			'intent-type': intentType,
			'intent-type-version': intentTypeVersion,
			'ibn:intent-specific-data': parsed,
			'required-network-state': 'active',
		},
	};
	deps.logger.info('create intent', intentType, target);
	const response = await deps.nspClient.call(url, { method: 'POST', body: JSON.stringify(body) });
	if (!response) {
		throw new Error('Lost connection to NSP');
	}
	if (response.ok) {
		return { result: 'created', parsed };
	}
	printRestconfError('Create intent failed!', await response.json());
	return { result: 'failed', parsed };
}

export async function createIntentTypeNewVersion(
	deps: FixedIntentGeneratorCoreDeps,
	intentType: string,
	intentTypeVersion: string,
): Promise<void> {
	const url = `/mdt/rest/ibn/save/${intentType}/${intentTypeVersion}`;
	const response = await deps.nspClient.call(url, { method: 'POST', body: '{}' });
	if (!response) {
		throw new Error('Lost connection to NSP');
	}
	if (!response.ok) {
		throwCoreRestconfError('Intent-type version creation failed!', await response.json());
	}
}

export async function cloneIntentTypeOnServer(
	deps: FixedIntentGeneratorCoreDeps,
	intentType: string,
	intentTypeVersion: string,
	newIntentType: string,
): Promise<void> {
	const url = `/mdt/rest/ibn/save/${intentType}/${intentTypeVersion}?newIntentTypeName=${newIntentType}`;
	const response = await deps.nspClient.call(url, { method: 'POST', body: '{}' });
	if (!response) {
		throw new Error('Lost connection to NSP');
	}
	if (!response.ok) {
		throwCoreRestconfError('Intent-type cloning failed!', await response.json());
	}
}

export async function exportIntentTypeToFile(
	deps: FixedIntentGeneratorCoreDeps,
	folder: string,
	intentType: string,
	intentTypeVersion: string,
): Promise<boolean> {
	const url = `/mdt/export/${intentType}/${intentTypeVersion}`;
	const response = await deps.nspClient.call(url, { method: 'GET' });
	if (!response) {
		deps.logger.error('Lost connection to NSP');
		return false;
	}
	if (!response.ok) {
		return false;
	}
	const buf = await response.buffer();
	deps.logger.info('Exporting intent-type');
	const filename = path.join(folder, `${intentType}_v${intentTypeVersion}.zip`);
	fs.writeFileSync(filename, buf);
	return true;
}

function removePath(node: unknown, parts: string[]): void {
	if (!node || parts.length === 0) {
		return;
	}
	const [head, ...rest] = parts;
	if (Array.isArray(node)) {
		for (const item of node) {
			removePath(item, parts);
		}
	} else if (typeof node === 'object' && node !== null) {
		const record = node as Record<string, unknown>;
		if (rest.length === 0) {
			delete record[head];
		} else if (record[head] !== undefined) {
			removePath(record[head], rest);
		}
	}
}

export async function fetchDeviceInfo(
	deps: FixedIntentGeneratorCoreDeps,
	device: string,
): Promise<Pick<IcmFixedGeneratorInput, 'vendor' | 'family' | 'version' | 'swversion' | 'chassis'>> {
	const url = `/restconf/data/nsp-ne-control:ne-control/discovered-ne=${encodeURI(device)}`;
	const response = await deps.nspClient.call(url, { method: 'GET' });
	if (!response) {
		throw new Error('Lost connection to NSP');
	}
	if (!response.ok) {
		throwCoreRestconfError('Getting device info failed!', await response.json());
	}
	const json = await response.json();
	const ne = json['nsp-ne-control:discovered-ne'][0];
	return {
		vendor: ne['ne-vendor'],
		family: ne['ne-family'],
		version: ne.version,
		swversion: ne['software-version'],
		chassis: ne['ne-chassis-type'],
	};
}

export async function resolveMapperTemplate(
	deps: FixedIntentGeneratorCoreDeps,
	device: string,
): Promise<string> {
	const url = `/restconf/data/manager-directory-service:manager-directory/manager-info=MDC/device=${encodeURI(device)}`;
	const response = await deps.nspClient.call(url, { method: 'GET' });
	if (!response) {
		throw new Error('Lost connection to NSP');
	}
	if (!response.ok) {
		throwCoreRestconfError('Getting mediator info failed!', await response.json());
	}
	const json = await response.json();
	const familyTypeRelease = json['manager-directory-service:device']['family-type-release'] as string;
	const neType = familyTypeRelease.split(':')[0];

	if (['7250 IXR', '7450 ESS', '7750 SR', '7950 XRS'].includes(neType)) {
		return 'mappers/SR OS.ftl';
	}
	if (familyTypeRelease.includes('SRLinux')) {
		return 'mappers/SRLinux.ftl';
	}
	if (familyTypeRelease.includes('Ciena')) {
		return 'mappers/SAOS.ftl';
	}
	if (familyTypeRelease.includes('IOS-XR')) {
		return 'mappers/IOS-XR.ftl';
	}
	if (familyTypeRelease.includes('Juniper')) {
		return 'mappers/JunOS MX.ftl';
	}
	return 'mappers/OpenConfig.ftl';
}

export async function fetchContextMapping(
	deps: FixedIntentGeneratorCoreDeps,
	input: IcmFixedGeneratorInput,
): Promise<Record<string, unknown>> {
	const mapping: Record<string, unknown> = {};

	for (const key of Object.keys(input.contexts)) {
		const ctx = input.contexts[key];
		const contextPath = ctx.path
			.replace(/^\/+/, '')
			.replace(/^([^:]+):\/?/, '$1:/');

		const url =
			`/restconf/data/network-device-mgr:network-devices/` +
			`network-device=${input.device}/root/${contextPath}?content=config`;

		const response = await deps.nspClient.call(url, { method: 'GET' });
		if (!response) {
			throw new Error('Lost connection to NSP');
		}
		if (!response.ok) {
			throw new Error('Get NE Configuration Failed');
		}

		const json = await response.json();

		if (ctx.exclude && ctx.exclude.length > 0) {
			let cfg: unknown = Object.values(json as Record<string, unknown>)[0];
			if (Array.isArray(cfg)) {
				cfg = cfg.length > 0 ? cfg[0] : {};
			}
			for (const rule of ctx.exclude) {
				removePath(cfg, rule.split('/'));
			}
			mapping[key] = {
				config: {
					target: contextPath,
					operation: 'replace',
					value: json,
					ignoreChildren: ctx.exclude,
				},
			};
		} else {
			mapping[key] = {
				config: {
					target: contextPath,
					operation: 'replace',
					value: json,
				},
			};
		}
	}

	return mapping;
}

export function determineNextIntentTypeVersion(parentDir: string, intentType: string): number {
	let intentTypeVersion = 1;
	for (const entry of fs.readdirSync(parentDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) {
			continue;
		}
		const match = entry.name.match(new RegExp(`^${intentType}_v(\\d+)$`));
		if (match) {
			const version = parseInt(match[1], 10);
			if (intentTypeVersion <= version) {
				intentTypeVersion = version + 1;
			}
		}
	}
	return intentTypeVersion;
}

export function normalizeFixedGeneratorInput(
	input: IcmFixedGeneratorInput,
	ifxgenBasename: string,
): void {
	if (!input.intent_type) {
		input.intent_type = ifxgenBasename;
	}
	if (!input.date) {
		input.date = new Date().toISOString().slice(0, 10);
	}
	if (!input.author) {
		input.author = 'NOKIA';
	}
}

export function renderFixedIntentTypeFromTemplate(
	templateDir: string,
	intentTypePath: string,
	input: IcmFixedGeneratorInput,
	logger: FixedIntentGeneratorLogger,
	mergeCommonPath: (suffix: string) => string,
): void {
	fs.mkdirSync(intentTypePath);

	const mergelist: string[] = [];
	for (const filename of fs.readdirSync(templateDir, { recursive: true, encoding: 'utf8', withFileTypes: false })) {
		const srcpath = path.join(templateDir, filename);
		const dstpath = path.join(intentTypePath, filename);

		if (fs.lstatSync(srcpath).isDirectory()) {
			fs.mkdirSync(dstpath);
		} else if (filename.startsWith('.') || filename.includes('/.')) {
			logger.info('skip file/folder ', filename);
		} else if (filename.startsWith('merge_')) {
			mergelist.push(filename.substring(6));
		} else {
			logger.info('processing: ', filename);
			const jinja = nunjucks.configure(path.dirname(srcpath));
			const data = jinja.render(path.basename(srcpath), input);

			if (filename === 'jsconfig.json') {
				fs.writeFileSync(dstpath, JSON.stringify({
					compilerOptions: {
						baseUrl: './intent-type-resources',
					},
					include: ['*.js', '*.mjs', 'intent-type-resources/*.js', 'intent-type-resources/**/*.mjs'],
				}));
			} else if (filename === 'yang-modules/[intent_type].yang') {
				fs.writeFileSync(path.join(intentTypePath, `yang-modules/${input.intent_type}.yang`), data);
			} else {
				fs.writeFileSync(dstpath, data);
			}
		}
	}

	const resourcePath = path.join(intentTypePath, 'intent-type-resources');
	if (!fs.existsSync(resourcePath)) {
		fs.mkdirSync(resourcePath);
	}

	for (const folder of mergelist) {
		logger.info('merging: ', folder);
		const mergePath = mergeCommonPath(folder);
		for (const filename of fs.readdirSync(mergePath, { recursive: true, encoding: 'utf8', withFileTypes: false })) {
			logger.info('filename: ', filename);
			const srcpath = path.join(mergePath, filename);
			const dstpath = path.join(resourcePath, filename);

			if (fs.existsSync(dstpath)) {
				logger.info(filename + ' (common) skipped, overwritten in template');
			} else if (fs.lstatSync(srcpath).isDirectory()) {
				fs.mkdirSync(dstpath);
			} else if (filename.startsWith('.') || filename.includes('/.')) {
				logger.info('skip file/folder ', filename);
			} else {
				logger.info('processing: ', filename);
				const jinja = nunjucks.configure(path.dirname(srcpath));
				const data = jinja.render(path.basename(srcpath), input);
				fs.writeFileSync(dstpath, data);
			}
		}
	}
}

export interface FixedIntentGeneratorDeps extends FixedIntentGeneratorCoreDeps {
	extensionUri: vscode.Uri;
	intentTypes: IntentTypeCache;
	getUriList: (args: unknown[]) => vscode.Uri[];
	mergeCommonUri: (suffix: string) => vscode.Uri;
	fireUriChange: (uri: string) => void;
}

export class FixedIntentGenerator {
	constructor(private readonly deps: FixedIntentGeneratorDeps) {}

	async uploadIntentType(args: unknown[]): Promise<void> {
		const uri = this.deps.getUriList(args)[0];
		const resolved = resolveIntentTypeFolderFromUri(uri.toString());
		if (!resolved) {
			vscode.window.showErrorMessage('Intent-type must be stored in directory {intent_type}_v{version} or intent-{intent_type}-v{version}');
			throw vscode.FileSystemError.FileNotFound('Intent-type must be stored in directory {intent_type}_v{version} or intent-{intent_type}-v{version}');
		}

		this.deps.logger.debug('uploadIntentType(' + resolved.fsPath + ')');

		let loaded: LoadedIntentType;
		try {
			loaded = loadIntentTypeFromDirectory(resolved.fsPath, resolved.intentTypeFolder);
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			vscode.window.showErrorMessage(message);
			throw vscode.FileSystemError.FileNotFound(message);
		}

		if (!loaded.resources.length) {
			vscode.window.showWarningMessage('Intent-type has no resources');
		}

		this.deps.logger.info('modules: ' + JSON.stringify(loaded.modules));
		this.deps.logger.info('resources: ' + JSON.stringify(loaded.resources));
		this.deps.logger.info('views: ' + JSON.stringify(loaded.views));
		this.deps.logger.info('intents: ' + JSON.stringify(loaded.intents));

		const metaPath = path.join(resolved.fsPath, 'meta-info.json');
		const rawMeta = JSON.parse(fs.readFileSync(metaPath, { encoding: 'utf8', flag: 'r' })) as Record<string, unknown>;
		if ('intent-type' in rawMeta && 'version' in rawMeta && resolved.intentTypeFolder !== `${rawMeta['intent-type']}_v${rawMeta.version}`) {
			vscode.window.showWarningMessage(`Mismatch with meta-info: ${rawMeta['intent-type']}_v${rawMeta.version}! Uploading under: ${resolved.intentTypeFolder}`);
		}

		const existsInCatalog = resolved.intentTypeFolder in this.deps.intentTypes;
		try {
			await uploadIntentTypeCatalog(this.deps, loaded, existsInCatalog);
		} catch (e) {
			if (e instanceof Error) {
				raiseRestconfError(e.message, {}, true);
			}
			throw e;
		}

		if (existsInCatalog) {
			this.deps.logger.info('Update intentType entry in cache');
			this.deps.intentTypes[resolved.intentTypeFolder].signed = (loaded.meta.label as string).includes('ArtifactAdmin');
			this.deps.intentTypes[resolved.intentTypeFolder].data = loaded.meta;
		} else {
			this.deps.logger.info('Create missing intentType entry in cache');
			this.deps.intentTypes[resolved.intentTypeFolder] = {
				signed: (loaded.meta.label as string).includes('ArtifactAdmin'),
				timestamp: Date.now(),
				data: loaded.meta,
				intents: {},
				aligned: {},
				desired: {},
				views: {},
			};
		}
		vscode.window.showInformationMessage('Intent-Type ' + resolved.intentTypeFolder + ' successfully uploaded');

		this.deps.fireUriChange('im:/' + resolved.intentTypeFolder);
		this.deps.fireUriChange('im:/' + resolved.intentTypeFolder + '/meta-info.json');
		this.deps.fireUriChange('im:/' + resolved.intentTypeFolder + '/script-content.js');
		this.deps.fireUriChange('im:/' + resolved.intentTypeFolder + '/script-content.mjs');
		this.deps.fireUriChange('im:/' + resolved.intentTypeFolder + '/intent-type-resources');
		this.deps.fireUriChange('im:/' + resolved.intentTypeFolder + '/yang-modules');

		for (const view of loaded.views) {
			try {
				const result = await uploadIntentTypeView(this.deps, loaded, view);
				if ('view' in result) {
					const viewname = view.slice(0, -11);
					vscode.window.showInformationMessage('View ' + resolved.intentTypeFolder + '/' + viewname + ' successfully uploaded');
					this.deps.intentTypes[resolved.intentTypeFolder].views[view] = result.view;
				} else {
					printRestconfError('Upload view(s) failed!', result.error);
				}
			} catch (e) {
				if (e instanceof Error && e.message === 'Lost connection to NSP') {
					throw vscode.FileSystemError.Unavailable(e.message);
				}
				throw e;
			}
		}

		for (const filename of loaded.intents) {
			const target = decodeURIComponent(filename.slice(0, -5));
			const content = fs.readFileSync(path.join(loaded.intentTypePath, 'intents', filename), { encoding: 'utf8', flag: 'r' });
			const intentExists = target in this.deps.intentTypes[resolved.intentTypeFolder].intents;
			try {
				const { result, parsed } = await uploadSingleIntent(
					this.deps,
					resolved.intentTypeFolder,
					loaded.intentType,
					loaded.intentTypeVersion,
					target,
					content,
					intentExists,
				);
				if (result === 'updated') {
					vscode.window.showInformationMessage('Intent ' + loaded.intentType + '/' + target + ' successfully updated');
					this.deps.intentTypes[resolved.intentTypeFolder].intents[target] = parsed;
					this.deps.intentTypes[resolved.intentTypeFolder].aligned[target] = false;
					this.deps.fireUriChange('im:/' + resolved.intentTypeFolder + '/intents/' + filename);
				} else if (result === 'created') {
					vscode.window.showInformationMessage('Intent ' + loaded.intentType + '/' + target + ' successfully uploaded');
					this.deps.intentTypes[resolved.intentTypeFolder].intents[target] = parsed;
					this.deps.intentTypes[resolved.intentTypeFolder].aligned[target] = false;
					this.deps.intentTypes[resolved.intentTypeFolder].desired[target] = 'active';
				}
			} catch (e) {
				if (e instanceof Error && e.message === 'Lost connection to NSP') {
					throw vscode.FileSystemError.Unavailable(e.message);
				}
				throw e;
			}
		}

		vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
	}

	async uploadIntents(args: unknown[]): Promise<void> {
		const uriList = this.deps.getUriList(args);
		for (const entry of uriList) {
			const parts = entry.toString().split('/');
			const filename = parts.pop();
			const intentFolder = parts.pop();
			const intentTypeFolder = parts.pop();

			if (intentTypeFolder && MATCH_INTENT_TYPE.test(intentTypeFolder) && intentFolder === 'intents' && filename?.endsWith('.json')) {
				const { intentType, intentTypeVersion } = parseIntentTypeFolder(intentTypeFolder);
				const target = decodeURIComponent(decodeURIComponent(filename.slice(0, -5)));
				const content = fs.readFileSync(entry.fsPath, { encoding: 'utf8', flag: 'r' });
				const intentExists = target in this.deps.intentTypes[intentTypeFolder].intents;
				try {
					const { result, parsed } = await uploadSingleIntent(
						this.deps,
						intentTypeFolder,
						intentType,
						intentTypeVersion,
						target,
						content,
						intentExists,
					);
					if (result === 'updated') {
						vscode.window.showInformationMessage('Intent ' + intentType + '/' + target + ' successfully updated');
						this.deps.intentTypes[intentTypeFolder].intents[target] = parsed;
						this.deps.intentTypes[intentTypeFolder].aligned[target] = false;
						this.deps.fireUriChange('im:/' + intentTypeFolder + '/intents/' + filename);
					} else if (result === 'created') {
						vscode.window.showInformationMessage('Intent ' + intentType + '/' + target + ' successfully uploaded');
						this.deps.intentTypes[intentTypeFolder].intents[target] = parsed;
						this.deps.intentTypes[intentTypeFolder].aligned[target] = false;
						this.deps.intentTypes[intentTypeFolder].desired[target] = 'active';
					}
				} catch (e) {
					if (e instanceof Error && e.message === 'Lost connection to NSP') {
						throw vscode.FileSystemError.Unavailable(e.message);
					}
					throw e;
				}
			} else {
				this.deps.logger.warn('uploadIntent(', filename, ') failed! URI does not match expected folder structure!');
				vscode.window.showErrorMessage('Failed to upload ' + entry.toString() + '! Intents must be stored in directory {intent_type}_v{version}/intents/{target}.json');
			}
		}

		vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
	}

	async newVersion(args: unknown[]): Promise<void> {
		const uriList = this.deps.getUriList(args);
		if (uriList.length > 0) {
			const pathStr = uriList[0].toString();
			const parts = pathStr.split('/').map(decodeURIComponent);
			const intentTypeFolder = parts[1];
			const { intentType, intentTypeVersion } = parseIntentTypeFolder(intentTypeFolder);

			this.deps.logger.debug('newVersion(', pathStr, ')');

			try {
				await createIntentTypeNewVersion(this.deps, intentType, intentTypeVersion);
			} catch (e) {
				if (e instanceof Error) {
					if (e.message === 'Lost connection to NSP') {
						throw vscode.FileSystemError.Unavailable(e.message);
					}
					raiseRestconfError(e.message, {}, true);
				}
				throw e;
			}

			vscode.window.showInformationMessage('New version created for intent-type ' + intentType);
			vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
		}
	}

	async clone(args: unknown[]): Promise<void> {
		const uriList = this.deps.getUriList(args);
		if (uriList.length > 0) {
			const pathStr = uriList[0].toString();
			const parts = pathStr.split('/').map(decodeURIComponent);
			const intentTypeFolder = parts[1];
			const { intentType, intentTypeVersion } = parseIntentTypeFolder(intentTypeFolder);

			this.deps.logger.debug('clone(', pathStr, ')');

			const newIntentType = await vscode.window.showInputBox({
				placeHolder: 'Intent Name',
				prompt: 'Provide a name for the new intent-type',
				value: intentType + '_copy',
			});

			if (newIntentType) {
				if ((newIntentType + '_v1') in this.deps.intentTypes) {
					vscode.window.showErrorMessage('The intent-type ' + newIntentType + ' already exists!');
					throw vscode.FileSystemError.FileExists('The intent-type ' + newIntentType + ' already exists!');
				}

				try {
					await cloneIntentTypeOnServer(this.deps, intentType, intentTypeVersion, newIntentType);
				} catch (e) {
					if (e instanceof Error) {
						if (e.message === 'Lost connection to NSP') {
							throw vscode.FileSystemError.Unavailable(e.message);
						}
						raiseRestconfError(e.message, {}, true);
					}
					throw e;
				}

				vscode.window.showInformationMessage('New intent-type ' + newIntentType + ' created!');
				vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
			}
		}
	}

	async newFixedIntentType(args: unknown[]): Promise<void> {
		this.deps.logger.info('newFixedIntentType(', JSON.stringify(args), ')');

		if (args.length > 1 && args[0] instanceof vscode.Uri) {
			const fileUri = args[0];
			if (fs.lstatSync(fileUri.fsPath).isFile()) {
				const parentDir = path.dirname(fileUri.fsPath);
				const input: IcmFixedGeneratorInput = JSON.parse(
					fs.readFileSync(fileUri.fsPath, { encoding: 'utf8', flag: 'r' }),
				);

				normalizeFixedGeneratorInput(input, path.basename(fileUri.fsPath, '.ifxgen'));
				input.intent_type_version = determineNextIntentTypeVersion(parentDir, input.intent_type);

				const intentTypePath = path.join(parentDir, `${input.intent_type}_v${input.intent_type_version}`);

				try {
					const deviceInfo = await fetchDeviceInfo(this.deps, input.device);
					Object.assign(input, deviceInfo);
					input.template = await resolveMapperTemplate(this.deps, input.device);
					const mapping = await fetchContextMapping(this.deps, input);

					const templatePath = vscode.Uri.joinPath(this.deps.extensionUri, 'templates', 'common', 'fixed').fsPath;
					renderFixedIntentTypeFromTemplate(
						templatePath,
						intentTypePath,
						input,
						this.deps.logger,
						(suffix) => this.deps.mergeCommonUri(suffix).fsPath,
					);

					const mapperPath = path.join(intentTypePath, 'intent-type-resources', input.template!);
					fs.writeFileSync(mapperPath, JSON.stringify(mapping, null, 4));
				} catch (e) {
					if (e instanceof Error) {
						if (e.message === 'Lost connection to NSP' || e.message === 'Get NE Configuration Failed') {
							throw vscode.FileSystemError.Unavailable(e.message);
						}
						if (e.message.startsWith('Getting ')) {
							raiseRestconfError(e.message, {});
						}
					}
					throw e;
				}
			}
		}
	}

	async exportIntentType(folder: string, intentType: string, intentTypeVersion: string): Promise<void> {
		const exportFolder = vscode.Uri.parse(folder).fsPath;
		try {
			const ok = await exportIntentTypeToFile(this.deps, exportFolder, intentType, intentTypeVersion);
			if (!ok) {
				vscode.window.showErrorMessage('Issue exporting intent-type');
			}
		} catch {
			vscode.window.showErrorMessage('Issue exporting intent-type');
		}
	}
}

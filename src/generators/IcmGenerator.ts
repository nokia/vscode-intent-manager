import * as fs from 'fs';
import * as path from 'path';

// @ts-expect-error module nunjucks does not have a declaration file
import nunjucks = require('nunjucks');

import { icmGeneratorInput } from './yang/types';
import {
	getPathKeys,
	schema2yang,
	typedef2yang,
	YangGeneratorDeps,
	YangGeneratorLogger,
} from './yang/YangGenerator';

export interface IcmGeneratorDeps extends YangGeneratorDeps {
	logger: YangGeneratorLogger;
}

export function normalizeIcmGeneratorInput(input: icmGeneratorInput, intentTypeFromFile: string): void {
	if (!input.icmDescriptor)
		input.icmDescriptor = {category: input.category, role: input.role};

	if (!input.icmDescriptor['device-scope'])
		input.icmDescriptor['device-scope'] = "mdm";

	if (input.description && !input.icmDescriptor.description)
		input.icmDescriptor.description = input.description;

	input.context = input.context.replace(/^\/+|\/+$/g, "").replace(/^([a-zA-Z_][a-zA-Z0-9_.-]*):\/*/, "$1:/");
	input.plainContext = input.context.replace(/=[^/]+/g, '');

	const parts = input.plainContext.split('/');
	input.module = parts.filter(e => e.includes(':')).reverse()[0].split(':')[0];
	input.root   = parts[parts.length-1].split(':').reverse()[0];
	input.identifier = `${input.module}:${input.root}`;

	if (!input.intent_type)
		input.intent_type = intentTypeFromFile;

	if (!input.date)
		input.date = new Date().toISOString().slice(0,10);

	if (!input.author)
		input.author = "NOKIA";

	if (!input.exclude)
		input.exclude = [];

	if (!input.maxdepth)
		input.maxdepth = -1;

	input.lastIndex = 1;
	input.targetComponents = [];
	input.suggestPaths = [];
	input.suggestMethods = [];
	input.encryptedPaths = [];
	input.listkeys = {};
	input.pathRC = '';
	input.pathUI = '';
}

export async function getNeInfo(
	deps: IcmGeneratorDeps,
	input: icmGeneratorInput,
	onProgress?: () => void
): Promise<void> {
	const url = `/restconf/data/nsp-ne-control:ne-control/discovered-ne=${encodeURI(input.device)}`;

	const response = await deps.callNsp(url, {method: "GET"});
	onProgress?.();

	if (!response)
		throw new Error("Lost connection to NSP");
	if (!response.ok) {
		const body = await response.json();
		let errmsg = "Getting device info failed!";
		const errors = body['ietf-restconf:errors'] as Record<string, unknown> | undefined;
		if (errors) {
			const detail = JSON.stringify(errors);
			errmsg += '\n' + detail;
		}
		throw new Error(errmsg);
	}

	const json = await response.json() as Record<string, unknown>;
	const discovered = json['nsp-ne-control:discovered-ne'] as Array<Record<string, string>>;

	input.vendor    = discovered[0]['ne-vendor'];
	input.family    = discovered[0]['ne-family'];
	input.version   = discovered[0]['version'];
	input.swversion = discovered[0]['software-version'];
	input.chassis   = discovered[0]['ne-chassis-type'];
}

export function buildYangModuleContent(
	input: icmGeneratorInput,
	ydef: string[],
	yang: string[]
): string {
	const yangcontent: string[] = [];
	yangcontent.push(`module ${input.intent_type} {`);
	yangcontent.push(`  namespace "urn:nokia.com:nsp:yang:icm:${input.intent_type}";`);
	yangcontent.push(`  prefix "${input.intent_type}";`);
	yangcontent.push("");
	yangcontent.push("  import ietf-inet-types {");
	yangcontent.push("	  prefix inet;");
	yangcontent.push("  }");
	yangcontent.push("");
	yangcontent.push("  import ietf-yang-types {");
	yangcontent.push("	  prefix yang;");
	yangcontent.push("  }");
	yangcontent.push("");
	yangcontent.push("  organization");
	yangcontent.push(`	  "${input.author}";`);
	yangcontent.push("  contact");
	yangcontent.push(`	  "${input.author}";`);
	yangcontent.push("  description");
	yangcontent.push(`	  "";`);
	yangcontent.push("");
	yangcontent.push(`  revision "${input.date}" {`);
	yangcontent.push("	  description");
	yangcontent.push(`	    "Initial revision.";`);
	yangcontent.push("  }");
	yangcontent.push("");
	yangcontent.push(...ydef.map(line => `  ${line}`));
	yangcontent.push("");
	yangcontent.push(`  container ${input.intent_type} {`);
	if (input.icmstyle) {
		yangcontent.push(`    container ${input.root} {`);
		yangcontent.push(...yang.map(line => `      ${line}`));
		yangcontent.push("    }");
	} else {
		yangcontent.push(...yang.map(line => `    ${line}`));
	}
	yangcontent.push("  }");
	yangcontent.push("}");

	return yangcontent.join('\n');
}

export interface GenerateIcmOptions {
	igenFilePath: string;
	templateDir: string;
	deps: IcmGeneratorDeps;
	onProgress?: () => void;
}

export interface GenerateIcmResult {
	intentTypePath: string;
	input: icmGeneratorInput;
}

/**
 * Core .igen generation: enrich input from NSP, render templates, write YANG module.
 */
export async function generateFromIgenFile(options: GenerateIcmOptions): Promise<GenerateIcmResult> {
	const { igenFilePath, templateDir, deps, onProgress } = options;
	const parentDir = path.dirname(igenFilePath);
	const input: icmGeneratorInput = JSON.parse(fs.readFileSync(igenFilePath, {encoding:'utf8', flag:'r'}));

	normalizeIcmGeneratorInput(input, path.basename(igenFilePath, '.igen'));

	const intentTypePath = path.join(parentDir, `${input.intent_type}_v1`);
	if (fs.existsSync(intentTypePath)) {
		throw new Error("Intent-type exists");
	}

	await getNeInfo(deps, input, onProgress);
	await getPathKeys(deps, input, onProgress);

	const customTypes: Record<string, import('./yang/types').mdcAttribute> = {};
	const module_ref: Record<string, string> = {};
	const yang = await schema2yang(deps, module_ref, input, "", customTypes, onProgress);
	input.moduleRefs = JSON.stringify(module_ref);
	const auditModulePrefixSet = new Set<string>();
	const ydef = typedef2yang(customTypes, auditModulePrefixSet, deps.logger);
	input.auditModulePrefixes = JSON.stringify([...auditModulePrefixSet].sort((a, b) => b.length - a.length));

	deps.logger.info('data for intent-type rendering: ', input);

	fs.mkdirSync(intentTypePath);

	for (const filename of fs.readdirSync(templateDir, {recursive: true, encoding: 'utf8', withFileTypes: false })) {
		const srcpath = path.join(templateDir, filename);
		const dstpath = path.join(intentTypePath, filename);

		if (fs.lstatSync(srcpath).isDirectory())
			fs.mkdirSync(dstpath);
		else if (filename.startsWith('.') || filename.includes('/.'))
			deps.logger.info("skip file/folder ", filename);
		else {
			deps.logger.info("processing: ", filename);
			const jinja = nunjucks.configure(path.dirname(srcpath));
			const data = jinja.render(path.basename(srcpath), input);

			fs.writeFileSync(dstpath, data);
		}
	}

	const yangcontent = buildYangModuleContent(input, ydef, yang);
	fs.writeFileSync(path.join(intentTypePath, `yang-modules/${input.intent_type}.yang`), yangcontent);

	return { intentTypePath, input };
}

import { icmGeneratorInput, mdcAttribute, targetComponentType } from './types';

export interface YangGeneratorLogger {
	info(...args: unknown[]): void;
	debug(...args: unknown[]): void;
}

export interface NspResponse {
	ok: boolean;
	json(): Promise<Record<string, unknown>>;
}

export type NspCaller = (
	url: string,
	options: { method: string }
) => Promise<NspResponse | null | undefined>;

export interface YangGeneratorDeps {
	callNsp: NspCaller;
	logger: YangGeneratorLogger;
}

function extractRestconfErrorMessage(response: Record<string, unknown>): string | undefined {
	let node: Record<string, unknown> | undefined = response;
	if (!Object.keys(response).includes('ietf-restconf:errors')) {
		return undefined;
	}
	while (node && Object.keys(node)[0] !== 'error') {
		node = node[Object.keys(node)[0]] as Record<string, unknown>;
	}
	const errors = node?.error as Array<{ 'error-message'?: string }> | undefined;
	return errors?.[0]?.['error-message'];
}

function raiseRestconfError(errmsg: string, response: Record<string, unknown>): never {
	const detail = extractRestconfErrorMessage(response);
	if (detail) {
		errmsg += '\n' + detail;
	}
	throw new Error(errmsg);
}

/**
 * Encode YANG range/length constraint using MDC schema list of min/max values provided.
 */
export function getRangeString(baseType: string, ranges?: {min: number, max: number}[]) : string {
	let converted: string[] = [];

	if (ranges && ranges.length>0) {
		if (/^uint(8|16|32|64)$/.test(baseType)) {
			const YANG_MAX_VALUES: Record<string, bigint | number> = {uint8: 255, uint16: 65535, uint32: 4294967295, uint64: 18446744073709551615n};

			converted = ranges.map(({ min, max }) => {
				const adjustedMax = BigInt(max) < BigInt(YANG_MAX_VALUES[baseType]) ? max : "max";
				return min === adjustedMax ? min.toString() : `${min}..${adjustedMax}`;
			}).filter(value => value != "0..max");
		}
		else if (/^int(8|16|32|64)$/.test(baseType)) {
			const YANG_MIN_VALUES: Record<string, bigint | number> = {int8: -128, int16: -32768, int32: -2147483648, int64: -9223372036854775808n};
			const YANG_MAX_VALUES: Record<string, bigint | number> = {int8: 127, int16: 32767, int32: 2147483647, int64: 9223372036854775807n};

			converted = ranges.map(({ min, max }) => {
				const adjustedMin = BigInt(min) > BigInt(YANG_MIN_VALUES[baseType]) ? min : "min";
				const adjustedMax = BigInt(max) < BigInt(YANG_MAX_VALUES[baseType]) ? max : "max";
				return adjustedMin === adjustedMax ? adjustedMin.toString() : `${adjustedMin}..${adjustedMax}`;
			}).filter(value => value != "min..max");
		}
		else if (baseType === "decimal64")
			converted = ranges.map(({ min, max }) => min === max ? min.toString() : `${min}..${max}`);
		else
			converted = ranges.map(({ min, max }) => min === max ? min.toString() : (max >= 2147483647 ? `${min}..max` : `${min}..${max}`)).filter(value => value != "0..max");
	}

	return converted.join('|');
}

export function getConstraints(a: mdcAttribute & { fraction?: number }, dataType: string) {
	const constraints : string[] = [];

	if (dataType === 'leafref')
		constraints.push(`path "${a.leafRefPath}";`);

	if (dataType === 'enumeration' && a.enum)
		a.enum.forEach((entry: {name: string, value?: number}) => {
			if ('value' in entry) {
				constraints.push(`enum ${entry.name} {`);
				constraints.push(`  value ${entry.value};`);
				constraints.push("}");
			} else {
				constraints.push(`enum ${entry.name};`);
			}
		});

	if (dataType === 'string') {
		const rangeString = getRangeString(dataType, a.length);

		if (rangeString.length>0)
			constraints.push(`length "${rangeString}";`);

		if (a.patterns)
			a.patterns.forEach((pattern: string) => constraints.push(`pattern '${pattern}';`));
	}

	if (dataType === 'decimal64' && a.fraction !== undefined)
		constraints.push(`fraction-digits ${a.fraction};`);

	if (/^(u?int(8|16|32|64)|decimal64)$/.test(dataType)) {
		const rangeString = getRangeString(dataType, a.constraints?.ranges);
		if (rangeString.length>0) constraints.push(`range "${rangeString}";`);
	}

	return constraints;
}

export function getIdentityRefTypeInfo(a: mdcAttribute): string
{
	const identityName = a.identityName;
	const identities = a.identities?.[identityName ?? ''];
	if (!identities || typeof identities !== "object") {
		return "enumeration {\n}\n";
	}
	let enumString : string = "enumeration {\n";
	const keys = Object.keys(identities).sort();
	for (let i = 0; i < keys.length; i++) {
		let identifyRef = keys[i];
		const includeModuleRef = identifyRef && identifyRef.includes(":");
		if (includeModuleRef) {
			const nameAndModule = identifyRef.split(":");
			if (nameAndModule.length > 1) {
				identifyRef = nameAndModule[1].trim();
			}
		}
		enumString =
		enumString +
		"\n" +
		"          enum "+identifyRef+";";
	}
	enumString = enumString + "}\n";
	return enumString;
}

/**
 * First segment of a QName used in identityref keys (same convention as RESTCONF-qualified leaf values).
 */
export function collectAuditPrefixFromIdentityRefKey(auditPrefixes: Set<string>, line: string): void {
	if (!line || typeof line !== "string" || !line.includes(":"))
		return;
	const first = line.split(":")[0].trim();
	if (first.length > 0)
		auditPrefixes.add(first);
}

export function typedef2yang(
	customYangTypes: Record<string, mdcAttribute>,
	auditModulePrefixes: Set<string>,
	logger: YangGeneratorLogger
) {
	const stack = [...Object.values(customYangTypes)];

	while (stack.length > 0) {
		const c = stack.pop();
		if (c?.baseType === 'union') {
			c.types.forEach(u => {
				if (u.type !== u.baseType)
					if (!(u.type in customYangTypes))
						customYangTypes[u.type] = u;

				if (u.baseType === 'union')
					stack.push(u);
			});
		}
	}

	logger.info("typedefs for yang rendering:", Object.keys(customYangTypes).join(', '));

	const yang: string[] = [];
	Object.values(customYangTypes).forEach(a => {
		yang.push(`typedef ${a.type} {`);

		const constraints = getConstraints(a, a.baseType);

		if (a.baseType === 'union') {
			a.types.forEach(u => {
				let dataType = u.type;

				if (u.typeNameSpace?.startsWith("urn:ietf:params:xml:ns:yang:ietf-inet-types,")) dataType = `inet:${u.type}`;
				if (u.typeNameSpace?.startsWith("urn:ietf:params:xml:ns:yang:ietf-yang-types,")) dataType = `yang:${u.type}`;

				if (u.baseType === 'enumeration' && u.enum === undefined) {
					constraints.push(`  // skipped: type ${u.baseType} (enumeration w/o enum entries)`);
				} else {
					const uConstraints = getConstraints(u, dataType);

					if (uConstraints.length > 0) {
						constraints.push(`  type ${dataType} {`);
						constraints.push(...uConstraints.map(line => `    ${line}`));
						constraints.push("  }");
					}
					else if (dataType === 'union') {
						constraints.push(`  // skipped: type union; (union of native union is unsupported`);
					}
					else {
						constraints.push(`  type ${dataType};`);
					}
				}
			});
		}

		if (constraints.length>0) {
			yang.push(`  type ${a.baseType} {`);
			yang.push(...constraints.map(line => `    ${line}`));
			yang.push("  }");
		} else {
			if(a.baseType === "identityref")
			{
				const idMap = (a.identityName && a.identities) ? a.identities[a.identityName] : undefined;
				const idKeys = idMap ? Object.keys(idMap) : [];
				if (a.identityName)
					collectAuditPrefixFromIdentityRefKey(auditModulePrefixes, a.identityName);
				for (const line of idKeys)
					collectAuditPrefixFromIdentityRefKey(auditModulePrefixes, line);
				yang.push(`  type enumeration {`);
				yang.push(
					...idKeys.map(line => {
						const enumName = line.replace(/^.*:/, "");
						return `    enum ${enumName};`;
					})
				);
				yang.push(`  }`);
			}
			else
			{
				yang.push(`  type ${a.baseType};`);
			}

		}

		if (a.units)
			yang.push(`  units "${a.units}";`);

		yang.push(`}`);
		yang.push("");
	});

	return yang;
}

export async function schema2yang(
	deps: YangGeneratorDeps,
	module_ref: Record<string, string>,
	input: icmGeneratorInput,
	subcontext: string,
	customYangTypes: Record<string, mdcAttribute>,
	onProgress?: () => void
): Promise<string[]> {
	const NODETYPE_TO_YANG: Record<string, string> = {property: "leaf", propertylist: "leaf-list", union: "union", group: "container", list: "list"};

	const url = `/restconf/meta/api/v1/model/schema/${input.device}/${input.plainContext}${subcontext}`;
	const response = await deps.callNsp(url, {method: "GET"});
	onProgress?.();

	if (!response)
		throw new Error("Lost connection to NSP");
	if (!response.ok)
		raiseRestconfError("Getting device schema failed!", await response.json());

	const json = await response.json() as {
		help?: string;
		isListWithKey?: boolean;
		keys?: string;
		presence?: boolean;
		attributes: mdcAttribute[];
		choice?: Record<string, { cases: Record<string, string[]> }>;
	};

	json.attributes = [
		...json.attributes.filter((a) => a.nodetype === "property" || a.nodetype === "propertylist"),
		...json.attributes.filter((a) => a.nodetype !== "property" && a.nodetype !== "propertylist")
	];

	const yang: string[] = [];

	const depth = subcontext.split('/').length;

	if (json.help)
		yang.push(`description "${json.help}";`);

	if (depth==1 && json.isListWithKey)
		input.keys = json.keys ?? '';

	const choices: {[key: string]: string[]} = {};

	yang.push("");
	for (const a of json.attributes) {
		const relpath = `${subcontext}/${a.name}`.substring(1);

		if (a.readonly)
			continue;

		if (a.leafRef && a.leafRefPath?.startsWith("nokia-conf:/configure/groups") && !input.applygroups) {
			yang.push(`// skipped: ${a.name} (SROS apply-groups)`);
			continue;
		}

		if (depth==1 && a.isKey) {
			yang.push(`// skipped: ${a.name} (root-key)`);
			continue;
		}

		if (["group", "list"].includes(a.nodetype) && (depth == input.maxdepth)) {
			yang.push(`// skipped: ${a.name} (maxdepth reached)`);
			input.exclude.push(relpath);
			continue;
		}

		if (input.exclude.includes(relpath)) {
			yang.push(`// skipped: ${a.name} (excluded/ignore-children)`);
			continue;
		}

		if ((a.typeNameSpace === "urn:nokia.com:sros:ns:yang:sr:types-sros,encrypted-leaf") ||
			['user-password', 'routing-password'].includes(a.type) ||
			(a.name === 'password')
		)
			if (input.icmstyle)
				input.encryptedPaths.push(`${input.root}.${relpath.split('/').join('.')}`);
			else
				input.encryptedPaths.push(`${relpath.split('/').join('.')}`);

		if (a.help)
			a.help = a.help.replace(/"/g, "'");

		const a_yang: string[] = [];

		if (a.name.includes(":")) {
			const valueAfterColon = a.name.split(":")[1].trim();
			const parts = relpath.trim().split("/");

			const keyParts = parts.map(part => {
				return part.includes(":") ? part.split(":")[1] : part;
			});

			const key = keyParts.join("/");
			const lastPrefix = parts[parts.length - 1].split(":")[0];
			module_ref[key] = lastPrefix;

			a_yang.push(`${NODETYPE_TO_YANG[a.nodetype]} ${valueAfterColon} {`);
		}
		else {
			a_yang.push(`${NODETYPE_TO_YANG[a.nodetype]} ${a.name} {`);
		}

		a.constraints?.when?.forEach(whenstmt => {
			if (whenstmt.includes('../'.repeat(depth+1)))
				a_yang.push(`  // when "${a.constraints.when[0]}";`);
			else
				a_yang.push(`  when "${a.constraints.when[0]}";`);
		});

		if (a.nodetype === "group" && a.presence && a.help)
			a_yang.push(`  presence "${a.help}";`);

		if (a.nodetype === "list") {
			a_yang.push(`  key "${a.keys.join(' ')}";`);

			if (input.icmstyle)
				input.listkeys[`${input.root}.${relpath.split('/').join('.')}`] = a.keys;
			else
				input.listkeys[`${relpath.split('/').join('.')}`] = a.keys;
		}

		if (["group", "list"].includes(a.nodetype)) {
			const lines = await schema2yang(deps, module_ref, input, `${subcontext}/${a.name}`, customYangTypes, onProgress);
			a_yang.push(...lines.map(line => `  ${line}`));
		}

		if (["property", "propertylist"].includes(a.nodetype)) {
			let dataType = a.type;

			if (a.typeNameSpace?.startsWith("urn:ietf:params:xml:ns:yang:ietf-inet-types,")) dataType = `inet:${a.type}`;
			if (a.typeNameSpace?.startsWith("urn:ietf:params:xml:ns:yang:ietf-yang-types,")) dataType = `yang:${a.type}`;

			if (dataType === a.type && dataType !== a.baseType && a.leafRefPath === undefined) {
				deps.logger.debug("typedef needed:", a.type, a.baseType, JSON.stringify(a));
				if (!(dataType in customYangTypes)) customYangTypes[dataType] = a;
			}

			if (a.leafRef && a.leafRefPath && a.leafRefPath.startsWith(input.plainContext)) {
				if (input.plainContext.split("/").length + 1 < a.leafRefPath.split("/").length) {
					if (!input.exclude.some(entry => a.leafRefPath.startsWith(`${input.plainContext}/${entry}`))) {
						let aPath = `${input.plainContext}${subcontext}/${a.name}`.split('/');
						let rPath = a.leafRefPath.split('/');

						while (aPath.length > 0 && rPath.length > 0 && aPath[0] == rPath[0]) {
							aPath = aPath.slice(1);
							rPath = rPath.slice(1);
						}

						const name = a.leafRefPath.replace(/[^/]+:/g, '').split('/').slice(-3).join('-').replace(/(\b\w+\b)(-\1)+/g, '$1');
						const suggest = "suggest"+name.split(/[-_]/).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('');

						if (!input.suggestMethods.some(entry => entry.suggest === suggest)) {
							const formpath = a.leafRefPath.split('/').slice(input.plainContext.split('/').length).join('.');
							if (input.icmstyle)
								input.suggestMethods.push({"suggest": suggest, "formPath": `${input.root}.${formpath}`});
							else
								input.suggestMethods.push({"suggest": suggest, "formPath": formpath});
						}

						if (input.icmstyle)
							input.suggestPaths.push({
								"viewConfigPath": `${input.intent_type}.${input.root}.${relpath
													.split('/')
													.map(part => part.includes(':') ? part.split(':')[1] : part)
													.join('.')}`,
								"isList": (a.nodetype === "propertylist"),
								"dataType": dataType,
								"suggest": suggest
							});
						else
							input.suggestPaths.push({
								"viewConfigPath": `${input.intent_type}.${relpath.split('/').join('.')}`,
								"isList": (a.nodetype === "propertylist"),
								"dataType": dataType,
								"suggest": suggest
							});

						dataType = "leafref";
						a.type = dataType;
						a.leafRefPath = '../'.repeat(aPath.length)+rPath.join('/');
					}
				}
			}

			if (["identityref"].includes(a.baseType))
			{
				dataType = getIdentityRefTypeInfo(a);
			}

			const constraints = getConstraints(a, dataType);

			if (a.type === 'union') {
				a.types.forEach(u => {
					let dataType = u.type;

					if (u.typeNameSpace?.startsWith("urn:ietf:params:xml:ns:yang:ietf-inet-types,")) dataType = `inet:${u.type}`;
					if (u.typeNameSpace?.startsWith("urn:ietf:params:xml:ns:yang:ietf-yang-types,")) dataType = `yang:${u.type}`;

					if (u.baseType === 'enumeration' && u.enum === undefined) {
						constraints.push(`  // skipped: type ${u.baseType} (enumeration w/o enum entries)`);
					} else {
						if (dataType === u.type && dataType !== u.baseType && !u.leafRef) {
							deps.logger.debug("typedef needed:", u.type, u.baseType, JSON.stringify(u));
							if (!(dataType in customYangTypes)) customYangTypes[dataType] = u;
						}

						const uConstraints = getConstraints(u, dataType);

						if (uConstraints.length > 0) {
							constraints.push(`  type ${dataType} {`);
							constraints.push(...uConstraints.map(line => `    ${line}`));
							constraints.push("  }");
						}
						else if (dataType === 'union') {
							constraints.push(`  // skipped: type union; (union of native union is unsupported`);
						}
						else {
							constraints.push(`  type ${dataType};`);
						}
					}
				});
			}

			if (constraints.length>0) {
				a_yang.push(`  type ${dataType} {`);
				a_yang.push(...constraints.map(line => `    ${line}`));
				a_yang.push("  }");
			} else {
				if(["identityref"].includes(a.baseType))
				{
					a_yang.push(`  type ${dataType}`);
				}
				else
				{
					a_yang.push(`  type ${dataType};`);
				}
			}

			if (a.units)
				a_yang.push(`  units "${a.units}";`);

			if (a.constraints?.must && input.constraints)
				a.constraints.must.forEach(entry => {
					if ("error-message" in entry) {
						constraints.push(`  must "${entry.xpath}" {`);
						constraints.push(`    error-message ${entry["error-message"]};`);
						constraints.push("  }");
					} else {
						constraints.push(`  must "${entry.xpath}";`);
					}
				});

			if (a.default)
				if (input.withdefaults)
					a_yang.push(`  default "${a.default}";`);
				else
					a_yang.push(`  // default "${a.default}";`);

			if (a.mandatory)
				if (json.presence)
					a_yang.push(`  // mandatory true;`);
				else
					a_yang.push(`  mandatory true;`);
		}

		if (["list", "propertylist"].includes(a.nodetype)) {
			if (a.elementCount?.minElements)
				a_yang.push(`  min-elements ${a.elementCount.minElements};`);

			if (a.elementCount?.maxElements)
				a_yang.push(`  max-elements ${a.elementCount.maxElements};`);

			if (a.userMustOrder)
				a_yang.push("  ordered-by user;");
		}

		if (["property", "propertylist"].includes(a.nodetype)) {
			if (a.help)
				a_yang.push(`  description "${a.help}";`);

			if (a.leafRef && a.leafRefPath && a.type !== 'leafref') {
				const name = a.leafRefPath.replace(/[^/]+:/g, '').split('/').slice(-3).join('-').replace(/(\b\w+\b)(-\1)+/g, '$1');
				const suggest = "suggest"+name.split(/[-_]/).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('');

				if (!input.suggestMethods.some(entry => entry.suggest === suggest)) {
					const pathElements = a.leafRefPath.split('/').slice(0,-1);
					const rootPathElements = input.pathUI.split('/');

					for (let idx=0; idx < pathElements.length-1; idx++) {
						if (pathElements[idx] === rootPathElements[idx]?.split('=')[0]) {
							if (rootPathElements[idx].includes('='))
								pathElements[idx] = rootPathElements[idx];
						} else break;
					}

					input.suggestMethods.push({
						"suggest": suggest,
						"devicePath":  pathElements.join('/')
					});
				}

				if (input.icmstyle) {
					input.suggestPaths.push({
						"viewConfigPath": `${input.intent_type}.${input.root}.${relpath
											.split('/')
											.map(part => part.includes(':') ? part.split(':')[1] : part)
											.join('.')}`,
						"isList": (a.nodetype === "propertylist"),
						"suggest": suggest
					});
				} else {
					input.suggestPaths.push({
						"viewConfigPath": `${input.intent_type}.${relpath.split('/').join('.')}`,
						"isList": (a.nodetype === "propertylist"),
						"suggest": suggest
					});
				}
			}
		}

		a_yang.push("}");

		if (a.choice) {
			choices[`${a.choice}.${a.name}`] = a_yang;
		} else {
			yang.push(...a_yang);
		}
	}

	if (json.choice) {
		for (const [choiceKey, choiceValue] of Object.entries(json.choice)) {
			yang.push(`choice ${choiceKey} {`);
			for (const [caseKey, caseEntries] of Object.entries(choiceValue.cases)) {
				yang.push(`  case ${caseKey} {`);
				yang.push(...caseEntries.flatMap(attribute =>
					(choices[`${choiceKey}.${caseKey}.${attribute}`] || []).map(line => `    ${line}`)
				));
				yang.push("  }");
			}
			yang.push("}");
		}
	}

	return yang;
}

export async function getPathKeys(
	deps: YangGeneratorDeps,
	input: icmGeneratorInput,
	onProgress?: () => void
): Promise<void> {
	const index = input.pathUI.split('/').length+1;
	const context  = input.context.split('/').slice(0, index).join('/');
	const plainctx = input.plainContext.split('/').slice(0, index).join('/');
	const pathElement = input.context.split('/')[index-1];

	if (index==2) {
		input.pathUI = context;
		input.pathRC = context;
	} else {
		input.pathUI += `/${pathElement}`;
		input.pathRC += `/${pathElement}`;
	}

	const url     = `/restconf/meta/api/v1/model/schema/${input.device}/${plainctx}`;
	const response = await deps.callNsp(url, {method: "GET"});
	onProgress?.();

	if (!response)
		throw new Error("Lost connection to NSP");
	if (!response.ok)
		raiseRestconfError("Getting device schema failed!", await response.json());

	const data = await response.json() as {
		isList?: boolean;
		yangname?: string;
		attributes: mdcAttribute[];
	};

	if (data.isList) {
		if (index === input.context.split('/').length)
			input.rootInstance = {};

		const keyAttributes = data.attributes.filter(entry => entry.isKey);

		const pathUI : string[] = [];
		const pathRC : string[] = [];

		if (pathElement.includes('=')) {
			if (index === input.context.split('/').length) {
				const values = pathElement.split('=')[1].split(',');
				keyAttributes.forEach(a => {
					if (/^(u?int(8|16|32|64)|decimal64)$/.test(a.baseType))
						input.rootInstance[a.name] = values.shift();
					else
						input.rootInstance[a.name] = `"${values.shift()}"`;
				});
			}
		} else {
			keyAttributes.forEach(a => {
				input.lastIndex += 1;
				const name = `${data.yangname}-${a.name}`.toLowerCase().replace(/(\b\w+\b)(-\1)+/g, '$1');
				const suggest = "suggest"+name.split(/[-_]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');

				deps.logger.info("key attribute:", name, suggest, JSON.stringify(a));

				const targetComponent: targetComponentType = {
					name: name,
					uiname: name.split(/[-_]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' '),
					type: "STRING",
					order: input.lastIndex,
					suggest: suggest,
					range: undefined,
					length: undefined,
					pattern: undefined
				};

				if (a.baseType === 'string') {
					targetComponent.type = "STRING";
					targetComponent.length = getRangeString(a.baseType, a.length);

					if (a.patterns && a.patterns.length===1) {
						const pattern = a.patterns[0].replace(/\\/g, "\\\\");
						if (pattern.length < 255) targetComponent.pattern = pattern;
					}
				}

				if (/^(u?int(8|16|32|64)|decimal64)$/.test(a.baseType)) {
					targetComponent.type = "NUMBER";
					targetComponent.range = getRangeString(a.baseType, a.ranges);
				}

				input.targetComponents.push(targetComponent);

				if (a.leafRef && a.leafRefPath) {
					const pathElements = a.leafRefPath.split('/').slice(0,-1);
					const rootPathElements = input.pathUI.split('/');

					for (let idx=0; idx < pathElements.length-1; idx++) {
						if (pathElements[idx] === rootPathElements[idx]?.split('=')[0]) {
							if (rootPathElements[idx].includes('='))
								pathElements[idx] = rootPathElements[idx];
						} else break;
					}

					input.suggestMethods.push({
						"suggest": suggest,
						"devicePath":  pathElements.join('/'),
						"devicePathBF":  input.pathUI,
						"deviceKeyBF": a.name
					});
				} else {
					input.suggestMethods.push({
						"suggest": suggest,
						"devicePathBF":  input.pathUI,
						"deviceKeyBF": a.name
					});
				}

				input.suggestPaths.push({
					"viewConfigPath": `_target.${name}`,
					"isList": false,
					"suggest": suggest
				});

				pathUI.push(`\${encodeURIComponent(target['${name}'])}`);
				pathRC.push(`\${encodeURIComponent(items[${input.lastIndex}])}`);

				if (index === input.context.split('/').length)
					if (/^(u?int(8|16|32|64)|decimal64)$/.test(a.baseType))
						input.rootInstance[a.name] = `Number(items[${input.lastIndex}])`;
					else
						input.rootInstance[a.name] = `items[${input.lastIndex}]`;

			});

			input.pathUI += `=${pathUI.join(',')}`;
			input.pathRC += `=${pathRC.join(',')}`;
		}
	}

	if (index < input.context.split('/').length) {
		await getPathKeys(deps, input, onProgress);
	}

	if (input.targetComponents.length === 0) {
		const dummyTarget: targetComponentType = {
			name: "identifier",
			uiname: "Identifier",
			type: "STRING",
			order: 2,
			pattern: "^single$",
			suggest: "suggestSingle",
		};
		input.targetComponents.push(dummyTarget);
	}
}

export interface mdcAttribute {
	name: string;
	help: string;
	readonly: boolean;
	mandatory: boolean;
	default: string;
	keys: string[];
	enum: {name: string, value?: number}[];

	nodetype: string;
	type: string;
	baseType: string;
	leafRef: string;
	leafRefPath: string;
	presence: boolean;
	isKey: boolean;
	typeNameSpace: string;

	patterns: string[];
	ranges: {min: number, max: number}[];
	length: {min: number, max: number}[];
	elementCount: {minElements: number, maxElements: number};

	constraints: {
		patterns: string[];
		length: {min: number, max: number}[];
		ranges?: {min: number, max: number}[];
		when: string[];
		must: {xpath: string, "error-message"?: string}[];
	};

	userMustOrder: boolean;
	units: string;
	choice: string;
	types: mdcAttribute[];
	identityName?: string;
	identities?: {
		[key: string]: string[];
	};
}

export interface targetComponentType {
	name: string,
	order: number,
	type: string,
	uiname: string,
	suggest?: string,
	range?: string,
	length?: string,
	pattern?: string
}

export interface icmDescriptorType {
	category: string,
	role: string,
	"device-scope"?: string,

	description?: string,
	"select-template"?: string,
	"select-target"?: string,
	"target-xpath"?: string,
	"targets"?: string,
	"target-labels"?: string,
	labels?: string,
	isPayloadWithMandatoryAttribute?: boolean
}

export interface icmGeneratorInput {
	role: string,
	category: string,
	description?: string,

	context: string,
	device: string,
	icmDescriptor: icmDescriptorType,

	author: string,
	exclude: string[],
	maxdepth: number,
	labels: string[],
	date?: string,

	withdefaults?: boolean,
	applygroups?: boolean,
	constraints?: boolean,
	icmstyle?: boolean,

	plainContext: string,
	intent_type: string,
	identifier: string,
	module: string,
	root: string,

	vendor?: string,
	family?: string,
	version?: string,
	swversion?: string,
	chassis?: string,

	keys: string,
	pathRC: string,
	pathUI: string,
	listkeys: Record<string, string[]>,
	rootInstance: Record<string, string|number|undefined>,
	targetComponents: targetComponentType[],
	lastIndex: number,
	suggestMethods: {suggest: string, devicePath?: string, formPath?: string, devicePathBF?: string, deviceKeyBF?: string}[],
	suggestPaths: {viewConfigPath: string, isList: boolean, dataType?: string, suggest: string}[],
	encryptedPaths: string[];
	moduleRefs?: string;
	/** JSON array of module name prefixes from identityref QName keys (typedef2yang); used to strip device-qualified leaf values during audit. */
	auditModulePrefixes?: string
}

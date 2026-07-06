import * as vscode from 'vscode';

export interface IntentTypeCacheEntry {
	signed: boolean;
	timestamp: number;
	data: { [key: string]: any };
	intents: { [target: string]: object };
	desired: { [target: string]: string };
	aligned: { [target: string]: boolean };
	views: { [filename: string]: string };
}

export type IntentTypesMap = {
	[key: string]: IntentTypeCacheEntry;
};

export class IntentTypeCache {
	readonly intentTypes: IntentTypesMap = {};

	clear(): void {
		for (const key of Object.keys(this.intentTypes)) {
			delete this.intentTypes[key];
		}
	}

	async ensureCacheWarm(
		intent_type_folder: string,
		warmRoot: () => Promise<unknown>,
		pluginLogs: vscode.LogOutputChannel,
	): Promise<void> {
		if (!(intent_type_folder in this.intentTypes)) {
			pluginLogs.info(
				'Intent-type',
				intent_type_folder,
				'not yet(?) in cache! Calling readDirectory(im:/) to populate/update cache.',
			);
			await warmRoot();
		}
	}
}

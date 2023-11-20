import * as vscode from 'vscode';


export class CodelensProvider implements vscode.CodeLensProvider
{

	ip: string;
	constructor (ip: string) {
		this.ip = ip;
	}

	async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
		let topOfDocument = new vscode.Range(0, 0, 0, 0);

		let header = {
			title: 'Intent Manager at '+this.ip+' by NOKIA',
			command: 'nokia-intent-manager.openInBrowser'
		};
	
		let codeLens = new vscode.CodeLens(topOfDocument, header);
		return [codeLens];
	}
}
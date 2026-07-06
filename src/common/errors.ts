import * as vscode from 'vscode';

/** Extract the first RESTCONF error message from a response body. */
export function extractRestconfErrorMessage(response: Record<string, unknown>): string | undefined {
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

export function raiseRestconfError(errmsg: string, response: Record<string, unknown>, show = false): never {
	const detail = extractRestconfErrorMessage(response);
	if (detail) {
		errmsg += '\n' + detail;
	}
	if (show) {
		vscode.window.showErrorMessage(errmsg);
	}
	throw vscode.FileSystemError.NoPermissions(errmsg);
}

export function printRestconfError(errmsg: string, response: Record<string, unknown>): void {
	const detail = extractRestconfErrorMessage(response);
	if (detail) {
		vscode.window.showWarningMessage(errmsg + '\n' + detail);
	} else {
		vscode.window.showWarningMessage(errmsg);
	}
}

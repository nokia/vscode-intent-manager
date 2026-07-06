import Module from 'module';

const originalLoad = (Module as NodeModule & { _load: Function })._load;

(Module as NodeModule & { _load: Function })._load = function (
	request: string,
	parent: NodeModule,
	isMain: boolean,
) {
	if (request === 'vscode') {
		return {
			FileSystemError: {
				NoPermissions: (message: string) => Object.assign(new Error(message), { code: 'NoPermissions' }),
				Unavailable: (message: string) => Object.assign(new Error(message), { code: 'Unavailable' }),
			},
			window: {
				showErrorMessage: () => undefined,
				showWarningMessage: () => undefined,
			},
			LogLevel: { Trace: 1, Debug: 2, Info: 3, Warning: 4, Error: 5 },
		};
	}
	return originalLoad(request, parent, isMain);
};

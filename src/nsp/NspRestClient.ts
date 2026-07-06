import * as vscode from 'vscode';

// @ts-expect-error module node-fetch does not have a declaration file
import fetch = require('node-fetch');
// @ts-expect-error module base-64 does not have a declaration file
import base64 = require('base-64');

export interface NspCallOptions {
	method: string;
	body?: string;
	headers?: object;
	signal?: AbortSignal;
}

export interface NspVersionInfo {
	nspVersion?: string;
	osdVersion?: string;
}

export interface INspClient {
	getToken(): Promise<string | undefined>;
	revokeToken(): Promise<void>;
	call(url: string, options: NspCallOptions): Promise<any>;
	fetchNspVersion(): Promise<NspVersionInfo>;
	resolveUrl(path: string): string;
	disconnect(): void;

	nspAddr: string;
	username: string;
	password?: string;
	port: string;
	timeout: number;
	nspVersion?: string;
	osdVersion?: string;
}

export interface NspRestClientCallbacks {
	pluginLogs: vscode.LogOutputChannel;
	onAuthFailure?: (error: string, username: string) => void;
	onUnreachable?: (nspAddr: string) => void;
	onVersionUpdated?: (info: NspVersionInfo & { nspAddr: string }) => void;
}

export class NspRestClient implements INspClient {
	private _nspAddr: string;
	private _username: string;
	private _password?: string;
	private _port: string;
	private _timeout: number;
	private _nspVersion?: string;
	private _osdVersion?: string;

	private authToken?: Promise<string | undefined>;
	private authTokenRevokeTimer?: ReturnType<typeof setTimeout>;

	private readonly callbacks: NspRestClientCallbacks;

	constructor(
		config: {
			nspAddr: string;
			username: string;
			port: string;
			timeout: number;
			password?: string;
		},
		callbacks: NspRestClientCallbacks,
	) {
		this._nspAddr = config.nspAddr;
		this._username = config.username;
		this._port = config.port;
		this._timeout = config.timeout;
		this._password = config.password;
		this.callbacks = callbacks;
	}

	get nspAddr(): string {
		return this._nspAddr;
	}
	set nspAddr(value: string) {
		this._nspAddr = value;
	}

	get username(): string {
		return this._username;
	}
	set username(value: string) {
		this._username = value;
	}

	get password(): string | undefined {
		return this._password;
	}
	set password(value: string | undefined) {
		this._password = value;
	}

	get port(): string {
		return this._port;
	}
	set port(value: string) {
		this._port = value;
	}

	get timeout(): number {
		return this._timeout;
	}
	set timeout(value: number) {
		this._timeout = value;
	}

	get nspVersion(): string | undefined {
		return this._nspVersion;
	}
	set nspVersion(value: string | undefined) {
		this._nspVersion = value;
	}

	get osdVersion(): string | undefined {
		return this._osdVersion;
	}
	set osdVersion(value: string | undefined) {
		this._osdVersion = value;
	}

	disconnect(): void {
		this._clearAuthTokenRevokeTimer();
		this.authToken = undefined;
	}

	async getToken(): Promise<string | undefined> {
		if (this.authToken) {
			const token = await this.authToken;
			if (token) {
				return token;
			}
			this.authToken = undefined;
		}

		if (!this._password) {
			return undefined;
		}

		if (!this.authToken) {
			this.authToken = new Promise<string | undefined>((resolve) => {
				this.callbacks.pluginLogs.warn('No valid auth-token for IM plugin; Getting a new one...');
				process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

				const timeout = new AbortController();
				setTimeout(() => timeout.abort(), 10000);

				const url = 'https://' + this._nspAddr + '/rest-gateway/rest/api/v1/auth/token';
				const startTS = Date.now();

				fetch(url, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Cache-Control': 'no-cache',
						'Authorization': 'Basic ' + base64.encode(this._username + ':' + this._password),
					},
					body: '{"grant_type": "client_credentials"}',
					signal: timeout.signal,
				}).then(async (response: any) => {
					const duration = Date.now() - startTS;
					this.callbacks.pluginLogs.info('POST', url, 'finished within', duration, 'ms');

					const json = await response.json();
					if (response.ok) {
						this.callbacks.pluginLogs.info('IM response:', response.status);
						const accessToken: string = json.access_token;
						const expiresIn: number = json.expires_in ?? 600;
						this.callbacks.pluginLogs.info('new authToken:', accessToken);
						this._scheduleAuthTokenRevoke(expiresIn);
						void this.fetchNspVersion();
						resolve(accessToken);
					} else {
						this.callbacks.pluginLogs.warn('IM response:', response.status, json.error);
						this.callbacks.onAuthFailure?.(json.error, this._username);
						this.authToken = undefined;
						resolve(undefined);
					}
				}).catch((error: any) => {
					if (error.message.includes('user aborted')) {
						this.callbacks.pluginLogs.error('Getting authToken for IM plugin timed out (no response within 10sec)');
					} else {
						this.callbacks.pluginLogs.error('Getting authToken for IM plugin failed with', error.message);
					}

					this._nspVersion = undefined;
					this._osdVersion = undefined;
					this.callbacks.onUnreachable?.(this._nspAddr);
					this.authToken = undefined;
					resolve(undefined);
				});
			});
		}

		return await this.authToken;
	}

	async revokeToken(): Promise<void> {
		this._clearAuthTokenRevokeTimer();
		if (this.authToken) {
			const token = await this.authToken;
			this.callbacks.pluginLogs.debug('_revokeAuthToken(' + token + ')');
			this.authToken = undefined;

			const url = 'https://' + this._nspAddr + '/rest-gateway/rest/api/v1/auth/revocation';
			fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'Authorization': 'Basic ' + base64.encode(this._username + ':' + this._password),
				},
				body: 'token=' + token + '&token_type_hint=token',
			}).then((response: any) => {
				this.callbacks.pluginLogs.info('POST', url, response.status);
			});
		}
	}

	resolveUrl(url: string): string {
		if (url.startsWith('https://')) {
			return url;
		}
		if (['443', ''].includes(this._port)) {
			return 'https://' + this._nspAddr + url;
		}
		if (url.startsWith('/logviewer')) {
			return 'https://' + this._nspAddr + url;
		}
		if (url.startsWith('/mdt/rest')) {
			return 'https://' + this._nspAddr + ':' + this._port + url;
		}
		return 'https://' + this._nspAddr + ':8545' + url;
	}

	async call(url: string, options: NspCallOptions): Promise<any> {
		const timeout = new AbortController();
		setTimeout(() => timeout.abort(), this._timeout * 1000);
		options.signal = timeout.signal;

		if (!('headers' in options)) {
			const token = await this.getToken();
			if (!token) {
				if (!this._password) {
					throw vscode.FileSystemError.Unavailable('NSP credentials not configured');
				}
				throw vscode.FileSystemError.Unavailable('NSP is not reachable');
			}

			if (url.startsWith('/restconf/data') || url.startsWith('/restconf/operations') || url.startsWith('/mdt/rest/restconf')) {
				options.headers = {
					'Content-Type': 'application/yang-data+json',
					'Accept': 'application/yang-data+json',
					'Authorization': 'Bearer ' + token,
				};
			} else {
				options.headers = {
					'Content-Type': 'application/json',
					'Accept': 'application/json',
					'Authorization': 'Bearer ' + token,
				};
			}
		}

		url = this.resolveUrl(url);

		const startTS = Date.now();
		const response: any = new Promise((resolve) => {
			fetch(url, options).then((response: any) => {
				response.clone().text().then((body: string) => {
					const duration = Date.now() - startTS;

					this.callbacks.pluginLogs.info(options.method, url, options.body ?? '', 'finished within', duration, 'ms');

					if (response.status >= 400) {
						this.callbacks.pluginLogs.warn('IM response:', response.status, body);
					} else if ((body.length < 1000) || (this.callbacks.pluginLogs.logLevel === vscode.LogLevel.Trace)) {
						this.callbacks.pluginLogs.info('IM response:', response.status, body);
					} else {
						this.callbacks.pluginLogs.info('IM response:', response.status, body.substring(0, 1000) + '...');
					}
				});
				return response;
			})
				.then((response: any) => {
					resolve(response);
				})
				.catch((error: any) => {
					const duration = Date.now() - startTS;
					let errmsg = options.method + ' ' + url + ' failed with ' + error.message + ' after ' + duration.toString() + 'ms!';

					if (error.message.includes('ENETUNREACH')) {
						this._nspVersion = undefined;
						this._osdVersion = undefined;
						this.authToken = undefined;
						this.callbacks.onUnreachable?.(this._nspAddr);
					}

					if (error.message.includes('user aborted')) {
						errmsg = 'No response for ' + options.method + ' ' + url + '. Call terminated after ' + duration.toString() + 'ms.';
					}

					this.callbacks.pluginLogs.error(errmsg);
					vscode.window.showErrorMessage(errmsg);
					resolve(undefined);
				});
		});
		return response;
	}

	async fetchNspVersion(): Promise<NspVersionInfo> {
		let updated = false;

		if (!this._nspVersion) {
			this.callbacks.pluginLogs.info('IM plugin is getting NSP release');
			const url = 'https://' + this._nspAddr + '/internal/shared-app-banner-utils/rest/api/v1/appBannerUtils/release-version';
			const response: any = await this.call(url, { method: 'GET' });
			if (!response) {
				this.callbacks.pluginLogs.error('Lost connection to IM');
			} else if (response.ok) {
				const json = await response.json();
				this._nspVersion = json.response.data.nspOSVersion.match(/\d+\.\d+(?=\.\d+)/)[0];
				updated = true;
			} else {
				this.callbacks.pluginLogs.error('Getting NSP release failed!');
			}
		}

		if (!this._osdVersion) {
			this.callbacks.pluginLogs.info('Requesting OSD version');
			const response: any = await this.call('/logviewer/api/status', { method: 'GET' });
			if (!response) {
				this.callbacks.pluginLogs.error('Lost connection to NSP logviewer (opensearch)');
			} else if (response.ok) {
				const json = await response.json();
				this._osdVersion = json.version.number;
				updated = true;
			} else {
				this.callbacks.pluginLogs.error('Getting OSD version failed!');
			}
		}

		if (updated) {
			const info = {
				nspVersion: this._nspVersion,
				osdVersion: this._osdVersion,
				nspAddr: this._nspAddr,
			};
			const msg = 'Connected to ' + this._nspAddr + ', NSP version: ' + (this._nspVersion ?? 'unknown') + ', OSD version: ' + (this._osdVersion ?? 'unknown');
			this.callbacks.pluginLogs.info(msg);
			this.callbacks.onVersionUpdated?.(info);
		}

		return { nspVersion: this._nspVersion, osdVersion: this._osdVersion };
	}

	private _clearAuthTokenRevokeTimer(): void {
		if (this.authTokenRevokeTimer !== undefined) {
			clearTimeout(this.authTokenRevokeTimer);
			this.authTokenRevokeTimer = undefined;
		}
	}

	private _scheduleAuthTokenRevoke(expiresInSeconds: number): void {
		this._clearAuthTokenRevokeTimer();
		const ms = Math.max(expiresInSeconds * 1000, 60000);
		this.authTokenRevokeTimer = setTimeout(() => void this.revokeToken(), ms);
	}
}

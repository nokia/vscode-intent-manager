import * as fs from 'fs';
import * as path from 'path';
import { INspClient, NspCallOptions, NspVersionInfo } from '../src/nsp/NspRestClient';

export interface NspFixtureDevice {
	name?: string;
	osType: string;
	osRelease: string;
	type: string;
	mode: string;
}

export interface NspFixtureErrorEntry {
	status: number;
	body: unknown;
}

export interface NspFixture {
	release: string;
	releaseVersion?: unknown;
	osdVersion?: string;
	devices: Record<string, NspFixtureDevice>;
	responses: Record<string, unknown>;
	errors: Record<string, NspFixtureErrorEntry>;
	readOnly: Record<string, string[]>;
	modelExtensions?: Record<string, unknown>;
}

export interface FixtureResponse {
	ok: boolean;
	status: number;
	json(): Promise<unknown>;
	text(): Promise<string>;
	clone(): FixtureResponse;
}

function fixturePathForRelease(release: string): string {
	return path.join(__dirname, 'fixtures', `nsp-${release}.json`);
}

export function loadNspFixture(release?: string): NspFixture {
	const version = release ?? process.env.NSP_VERSION ?? '25.10';
	const fixturePath = fixturePathForRelease(version);
	if (!fs.existsSync(fixturePath)) {
		throw new Error(`NSP fixture not found: ${fixturePath}`);
	}
	return JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as NspFixture;
}

function normalizeLookupKey(method: string, url: string): string {
	let pathname = url;
	try {
		const parsed = new URL(url);
		pathname = parsed.pathname + parsed.search;
	} catch {
		// relative path
	}
	return `${method.toUpperCase()} ${pathname}`;
}

function makeFixtureResponse(status: number, body: unknown): FixtureResponse {
	const textBody = typeof body === 'string' ? body : JSON.stringify(body);
	const ok = status >= 200 && status < 300;
	return {
		ok,
		status,
		json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
		text: async () => textBody,
		clone() {
			return makeFixtureResponse(status, body);
		},
	};
}

export class FixtureNspClient implements INspClient {
	nspAddr: string;
	username: string;
	password?: string;
	port: string;
	timeout: number;
	nspVersion?: string;
	osdVersion?: string;

	private readonly fixture: NspFixture;
	private token?: string;

	constructor(
		config: {
			nspAddr?: string;
			username?: string;
			password?: string;
			port?: string;
			timeout?: number;
			release?: string;
		} = {},
	) {
		this.fixture = loadNspFixture(config.release);
		this.nspAddr = config.nspAddr ?? 'fixture-nsp.local';
		this.username = config.username ?? 'fixture-user';
		this.password = config.password ?? 'fixture-pass';
		this.port = config.port ?? '443';
		this.timeout = config.timeout ?? 90;
		this.nspVersion = this.fixture.release;
		this.osdVersion = this.fixture.osdVersion;
	}

	get devices(): Record<string, NspFixtureDevice> {
		return this.fixture.devices;
	}

	get readOnly(): Record<string, string[]> {
		return this.fixture.readOnly;
	}

	disconnect(): void {
		this.token = undefined;
	}

	async getToken(): Promise<string | undefined> {
		if (this.token) {
			return this.token;
		}
		const key = 'POST /rest-gateway/rest/api/v1/auth/token';
		const body = this.fixture.responses[key] as { access_token?: string } | undefined;
		this.token = body?.access_token ?? 'fixture-token';
		return this.token;
	}

	async revokeToken(): Promise<void> {
		this.token = undefined;
	}

	resolveUrl(url: string): string {
		if (url.startsWith('https://')) {
			return url;
		}
		if (['443', ''].includes(this.port)) {
			return 'https://' + this.nspAddr + url;
		}
		if (url.startsWith('/logviewer')) {
			return 'https://' + this.nspAddr + url;
		}
		if (url.startsWith('/mdt/rest')) {
			return 'https://' + this.nspAddr + ':' + this.port + url;
		}
		return 'https://' + this.nspAddr + ':8545' + url;
	}

	async call(url: string, options: NspCallOptions): Promise<FixtureResponse | undefined> {
		const resolved = this.resolveUrl(url);
		const key = normalizeLookupKey(options.method, resolved);

		const errorEntry = this.fixture.errors[key];
		if (errorEntry) {
			return makeFixtureResponse(errorEntry.status, errorEntry.body);
		}

		const body = this.fixture.responses[key];
		if (body !== undefined) {
			return makeFixtureResponse(200, body);
		}

		return makeFixtureResponse(404, {
			'ietf-restconf:errors': {
				error: [{ 'error-message': `No fixture response for ${key}` }],
			},
		});
	}

	async fetchNspVersion(): Promise<NspVersionInfo> {
		if (this.fixture.releaseVersion) {
			const data = (this.fixture.releaseVersion as { response?: { data?: { nspOSVersion?: string } } }).response?.data;
			const match = data?.nspOSVersion?.match(/\d+\.\d+(?=\.\d+)/);
			if (match) {
				this.nspVersion = match[0];
			}
		}
		if (!this.osdVersion) {
			const statusKey = 'GET /logviewer/api/status';
			const statusBody = this.fixture.responses[statusKey] as { version?: { number?: string } } | undefined;
			this.osdVersion = statusBody?.version?.number ?? this.fixture.osdVersion;
		}
		return { nspVersion: this.nspVersion, osdVersion: this.osdVersion };
	}
}

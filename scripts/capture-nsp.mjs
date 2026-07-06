#!/usr/bin/env node
/**
 * Capture live NSP API responses into test/fixtures/nsp-<release>.json.
 *
 * Usage:
 *   NSP_SERVER=<host> NSP_USER=<user> NSP_PASSWORD=<pass> npm run capture:nsp
 *
 * Optional:
 *   NSP_RELEASE=25.10   — fixture filename suffix (default: detected from NSP)
 *   NSP_PORT=443
 *   NSP_DEVICES='[{"ne-id":"1034::cafe:1","osType":"SR OS","osRelease":"25.10.R1"}]'
 *
 * Never run in CI — requires a reachable lab NSP.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const fixturesDir = path.join(repoRoot, 'test', 'fixtures');

const DEFAULT_DEVICES = [
	{ 'ne-id': '1034::cafe:1', name: 'madrid', osType: 'SR OS', osRelease: '25.10.R1', type: 'sr-1', mode: 'model-driven' },
	{ 'ne-id': '1034::cafe:2', name: 'barcelona', osType: 'SR OS', osRelease: '25.10.R1', type: 'sr-1', mode: 'model-driven' },
	{ 'ne-id': '1034::cafe:3', name: 'valencia', osType: 'SR Linux', osRelease: '25.10.1', type: 'ixr-h2', mode: 'model-driven' },
	{ 'ne-id': '1034::cafe:4', name: 'sevilla', osType: 'SR Linux', osRelease: '25.10.1', type: 'ixr-d2l', mode: 'model-driven' },
	{ 'ne-id': '1034::cafe:5', name: 'bilbao', osType: 'SR Linux', osRelease: '25.10.1', type: 'ixr-d2l', mode: 'model-driven' },
];

function usage() {
	console.error(`capture-nsp: record NSP fixture JSON for generator tests

Required environment variables:
  NSP_SERVER    NSP hostname or IP
  NSP_USER      REST API username
  NSP_PASSWORD  REST API password

Optional:
  NSP_RELEASE   Fixture release label (default: auto-detect)
  NSP_PORT      REST port (default: 443)
  NSP_DEVICES   JSON array of device inventory entries

Writes: test/fixtures/nsp-<release>.json
`);
}

function main() {
	const server = process.env.NSP_SERVER;
	const user = process.env.NSP_USER;
	const password = process.env.NSP_PASSWORD;

	if (!server || !user || !password) {
		usage();
		process.exit(1);
	}

	const release = process.env.NSP_RELEASE ?? '25.10';
	const devices = process.env.NSP_DEVICES ? JSON.parse(process.env.NSP_DEVICES) : DEFAULT_DEVICES;

	const fixture = {
		release,
		releaseVersion: null,
		osdVersion: null,
		devices: Object.fromEntries(
			devices.map((device) => [device['ne-id'], {
				name: device.name,
				osType: device.osType,
				osRelease: device.osRelease,
				type: device.type,
				mode: device.mode ?? 'model-driven',
			}]),
		),
		responses: {},
		errors: {},
		readOnly: {},
		_meta: {
			capturedAt: new Date().toISOString(),
			server,
			user,
			note: 'Skeleton capture script — populate responses/errors/readOnly from live NSP reads.',
		},
	};

	fs.mkdirSync(fixturesDir, { recursive: true });
	const outPath = path.join(fixturesDir, `nsp-${release}.json`);
	fs.writeFileSync(outPath, JSON.stringify(fixture, null, '\t') + '\n');
	console.log(`Wrote skeleton fixture to ${outPath}`);
	console.log('TODO: authenticate, issue generator read set, derive readOnly, redact secrets.');
}

main();

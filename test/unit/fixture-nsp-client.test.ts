import { expect } from 'chai';
import { FixtureNspClient } from '../FixtureNspClient';

describe('FixtureNspClient', function () {
	it('loads fixture responses without network', async function () {
		const client = new FixtureNspClient({ release: '25.10' });
		const token = await client.getToken();
		expect(token).to.equal('fixture-token-25.10');

		const response = await client.call(
			'/restconf/operations/nsp-inventory:find',
			{ method: 'GET' },
		);
		expect(response?.ok).to.equal(true);
		const json = await response!.json() as { 'nsp-inventory:output'?: { data?: unknown[] } };
		expect(json['nsp-inventory:output']?.data).to.have.length(5);
	});

	it('returns recorded error fixtures', async function () {
		const client = new FixtureNspClient({ release: '25.10' });
		const response = await client.call(
			'/restconf/meta/api/v1/model/schema/unknown-ne-id/nokia-conf:/configure/router/isis',
			{ method: 'GET' },
		);
		expect(response?.ok).to.equal(false);
		expect(response?.status).to.equal(404);
	});
});

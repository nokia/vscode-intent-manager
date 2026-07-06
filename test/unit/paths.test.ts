import { expect } from 'chai';
import { isAtLeastRelease, parseIntentTarget, parseIntentTypeFolder } from '../../src/common/paths';

describe('paths', function () {
	describe('parseIntentTypeFolder', function () {
		it('splits name and version from _vN suffix', function () {
			expect(parseIntentTypeFolder('demo_icm_mdsr_port_v3')).to.deep.equal({
				folder: 'demo_icm_mdsr_port_v3',
				name: 'demo_icm_mdsr_port',
				version: 3,
			});
		});

		it('defaults version to 1 when suffix is absent', function () {
			expect(parseIntentTypeFolder('legacy_intent')).to.deep.equal({
				folder: 'legacy_intent',
				name: 'legacy_intent',
				version: 1,
			});
		});
	});

	describe('parseIntentTarget', function () {
		it('strips .json suffix and decodes URI segments', function () {
			expect(parseIntentTarget('my%20intent.json')).to.equal('my intent');
		});

		it('returns segment unchanged when not a json file', function () {
			expect(parseIntentTarget('router-isis')).to.equal('router-isis');
		});
	});

	describe('isAtLeastRelease', function () {
		it('returns false for undefined release', function () {
			expect(isAtLeastRelease(undefined, 24, 11)).to.equal(false);
		});

		it('compares major.minor thresholds', function () {
			expect(isAtLeastRelease('25.10.0', 25, 10)).to.equal(true);
			expect(isAtLeastRelease('25.9.0', 25, 10)).to.equal(false);
			expect(isAtLeastRelease('24.11.0', 25, 10)).to.equal(false);
			expect(isAtLeastRelease('26.4.0', 25, 10)).to.equal(true);
		});
	});
});

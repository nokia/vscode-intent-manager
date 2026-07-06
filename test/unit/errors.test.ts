import { expect } from 'chai';
import { extractRestconfErrorMessage, raiseRestconfError } from '../../src/common/errors';

describe('errors', function () {
	describe('extractRestconfErrorMessage', function () {
		it('returns the first RESTCONF error message', function () {
			const response = {
				'ietf-restconf:errors': {
					error: [{ 'error-message': 'Context does not exist on device' }],
				},
			};
			expect(extractRestconfErrorMessage(response)).to.equal('Context does not exist on device');
		});

		it('returns undefined when no RESTCONF errors are present', function () {
			expect(extractRestconfErrorMessage({ status: 'ok' })).to.equal(undefined);
		});
	});

	describe('raiseRestconfError', function () {
		it('appends RESTCONF detail and throws', function () {
			const response = {
				'ietf-restconf:errors': {
					error: [{ 'error-message': 'Unknown ne-id' }],
				},
			};
			expect(() => raiseRestconfError('Generator failed', response)).to.throw('Generator failed\nUnknown ne-id');
		});
	});
});

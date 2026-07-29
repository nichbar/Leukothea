import { describe, expect, test } from 'vitest';

import { compareSemver } from './semver';

describe('compareSemver', () => {
	test('equal versions', () => {
		expect(compareSemver('7.0.11', '7.0.11')).toBe(0);
		expect(compareSemver('v1.2.3', '1.2.3')).toBe(0);
	});

	test('ordering', () => {
		expect(compareSemver('7.0.10', '7.0.11')).toBeLessThan(0);
		expect(compareSemver('7.0.11', '7.0.10')).toBeGreaterThan(0);
		expect(compareSemver('8.0.0', '7.9.9')).toBeGreaterThan(0);
		expect(compareSemver('1.0', '1.0.1')).toBeLessThan(0);
	});

	test('missing treated as 0.0.0', () => {
		expect(compareSemver(null, '0.0.0')).toBe(0);
		expect(compareSemver(undefined, '1.0.0')).toBeLessThan(0);
		expect(compareSemver('', '0.0.1')).toBeLessThan(0);
	});
});

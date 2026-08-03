import { describe, expect, test, vi } from 'vitest';

import { formatDecodeErrors, summarizeDecodeValue, tryDecode, type } from './types';

describe('summarizeDecodeValue', () => {
	test('primitives and empty values', () => {
		expect(summarizeDecodeValue(undefined)).toBe('undefined');
		expect(summarizeDecodeValue(null)).toBe('null');
		expect(summarizeDecodeValue(true)).toBe('true');
		expect(summarizeDecodeValue(12)).toBe('12');
		expect(summarizeDecodeValue('hi')).toBe('"hi"');
	});

	test('collections', () => {
		expect(summarizeDecodeValue([1, 2, 3])).toBe('array(length=3)');
		expect(summarizeDecodeValue({ a: 1, b: 2 })).toBe('object(keys=[a,b])');
	});
});

describe('formatDecodeErrors', () => {
	test('formats path errors and truncates', () => {
		const text = formatDecodeErrors(
			[
				{ key: 'language', value: 1, typeName: 'string' },
				{ key: '', value: undefined, typeName: 'AppConfig' },
			],
			1,
		);
		expect(text).toContain('language: expected string, got 1');
		expect(text).toContain('(+1 more)');
	});
});

describe('tryDecode', () => {
	const Person = type.type({
		name: type.string,
		age: type.number,
	});

	test('returns decoded value', () => {
		expect(tryDecode(Person, { name: 'Ada', age: 36 })).toEqual({
			name: 'Ada',
			age: 36,
		});
	});

	test('returns default data on failure', () => {
		const fallback = { name: 'fallback', age: 0 };
		expect(tryDecode(Person, { name: 'Ada' }, fallback)).toEqual(fallback);
		expect(tryDecode(type.null, 'nope', null)).toBeNull();
	});

	test('throws diagnostic Invalid type with codec and path details', () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		expect(() => tryDecode(Person, { name: 'Ada', age: 'x' })).toThrowError(
			/Invalid type \(.*\): age: expected number, got "x"/,
		);

		errorSpy.mockRestore();
	});

	test('includes context label when provided as options bag', () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		expect(() =>
			tryDecode(Person, undefined, { context: 'backend:getConfig:response' }),
		).toThrowError(/^backend:getConfig:response: Invalid type/);

		expect(errorSpy).toHaveBeenCalled();
		const [, details] = errorSpy.mock.calls[0] ?? [];
		expect(details).toMatchObject({
			context: 'backend:getConfig:response',
			data: undefined,
		});

		errorSpy.mockRestore();
	});

	test('options bag is not treated as defaultData', () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		expect(() => tryDecode(type.string, 1, { context: 'x' })).toThrowError(
			/^x: Invalid type/,
		);

		errorSpy.mockRestore();
	});
});

import { describe, expect, test } from 'vitest';

import {
	parseDictionaryEnvelope,
	serializeDictionaryEnvelope,
} from './dictionaryEnvelope';

describe('dictionaryEnvelope', () => {
	const sampleEntries = [
		{
			timestamp: 1_730_000_000_000,
			translation: {
				from: 'en',
				to: 'zh',
				originalText: 'hello',
				translatedText: '你好',
			},
		},
	];

	test('serialize + parse roundtrip', () => {
		const text = serializeDictionaryEnvelope(
			sampleEntries,
			1_730_000_000_000,
			'7.0.12',
		);
		const parsed = parseDictionaryEnvelope(text);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.envelope.version).toBe(1);
		expect(parsed.envelope.updatedAt).toBe(1_730_000_000_000);
		expect(parsed.envelope.extensionVersion).toBe('7.0.12');
		expect(parsed.envelope.entries).toEqual(sampleEntries);
	});

	test('parse rejects invalid JSON and invalid entries', () => {
		expect(parseDictionaryEnvelope('not-json').ok).toBe(false);

		const bad = JSON.stringify({
			version: 1,
			updatedAt: 1,
			extensionVersion: '7.0.12',
			entries: [{ no: 'good' }],
		});
		const result = parseDictionaryEnvelope(bad);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.extensionVersion).toBe('7.0.12');
		expect(result.updatedAt).toBe(1);
	});

	test('parse accepts empty entries array', () => {
		const text = serializeDictionaryEnvelope([], 100, '7.0.12');
		const parsed = parseDictionaryEnvelope(text);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.envelope.entries).toEqual([]);
	});

	test('parse rejects missing entries field', () => {
		const text = JSON.stringify({
			version: 1,
			updatedAt: 1,
			extensionVersion: '7.0.12',
		});
		const result = parseDictionaryEnvelope(text);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toMatch(/missing entries/i);
	});
});

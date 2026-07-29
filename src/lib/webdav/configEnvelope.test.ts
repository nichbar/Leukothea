import { describe, expect, test } from 'vitest';

import { defaultConfig } from '../../config';
import { decideSyncAction, parseEnvelope, serializeEnvelope } from './configEnvelope';

describe('configEnvelope', () => {
	test('serialize + parse roundtrip', () => {
		const text = serializeEnvelope(defaultConfig, 1_730_000_000_000, '7.0.11');
		const parsed = parseEnvelope(text);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.envelope.version).toBe(1);
		expect(parsed.envelope.updatedAt).toBe(1_730_000_000_000);
		expect(parsed.envelope.extensionVersion).toBe('7.0.11');
		expect(parsed.envelope.config.translatorModule).toBe(
			defaultConfig.translatorModule,
		);
	});

	test('parse rejects invalid JSON and invalid config', () => {
		expect(parseEnvelope('not-json').ok).toBe(false);
		const bad = JSON.stringify({
			version: 1,
			updatedAt: 1,
			extensionVersion: '7.0.11',
			config: { no: 'good' },
		});
		const result = parseEnvelope(bad);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.extensionVersion).toBe('7.0.11');
		expect(result.updatedAt).toBe(1);
	});
});

describe('decideSyncAction', () => {
	test('404 / missing remote → push', () => {
		expect(
			decideSyncAction({
				localWriteAt: 100,
				remoteUpdatedAt: null,
				localExt: '7.0.11',
				remoteExt: null,
				remoteMissing: true,
			}),
		).toBe('push');
	});

	test('local 7.0.10 vs remote 7.0.11 → never push', () => {
		expect(
			decideSyncAction({
				localWriteAt: 200,
				remoteUpdatedAt: 100,
				localExt: '7.0.10',
				remoteExt: '7.0.11',
			}),
		).toBe('skipPushOlderExtension');
	});

	test('older local may still pull when remote newer and valid', () => {
		expect(
			decideSyncAction({
				localWriteAt: 100,
				remoteUpdatedAt: 200,
				localExt: '7.0.10',
				remoteExt: '7.0.11',
				remoteConfigValid: true,
			}),
		).toBe('pull');
	});

	test('equal extension versions → LWW on updatedAt', () => {
		expect(
			decideSyncAction({
				localWriteAt: 200,
				remoteUpdatedAt: 100,
				localExt: '7.0.11',
				remoteExt: '7.0.11',
			}),
		).toBe('push');
		expect(
			decideSyncAction({
				localWriteAt: 100,
				remoteUpdatedAt: 200,
				localExt: '7.0.11',
				remoteExt: '7.0.11',
			}),
		).toBe('pull');
		expect(
			decideSyncAction({
				localWriteAt: 100,
				remoteUpdatedAt: 100,
				localExt: '7.0.11',
				remoteExt: '7.0.11',
			}),
		).toBe('noop');
	});

	test('local newer extension + older updatedAt → pull (not stomp)', () => {
		expect(
			decideSyncAction({
				localWriteAt: 100,
				remoteUpdatedAt: 200,
				localExt: '7.0.12',
				remoteExt: '7.0.11',
			}),
		).toBe('pull');
	});

	test('invalid remote config → skipIncompatibleRemote (no push)', () => {
		expect(
			decideSyncAction({
				localWriteAt: 300,
				remoteUpdatedAt: 100,
				localExt: '7.0.11',
				remoteExt: '7.0.11',
				remoteConfigValid: false,
			}),
		).toBe('skipIncompatibleRemote');
	});

	test('missing remote extensionVersion treated as 0.0.0', () => {
		expect(
			decideSyncAction({
				localWriteAt: 200,
				remoteUpdatedAt: 100,
				localExt: '7.0.11',
				remoteExt: undefined,
			}),
		).toBe('push');
	});
});

import { describe, expect, test } from 'vitest';

import { getDefaultConfig } from '../../config';
import { AppConfigType } from '../../types/runtime';

import { cloneAppConfig, mergeRemoteConfig, prepareConfigForPush } from './syncSecrets';

const withCredentials = (
	config: AppConfigType,
	opts: {
		apiKey: string;
		webdavUsername: string;
		webdavPassword: string;
		syncSecrets?: boolean;
	},
): AppConfigType => {
	const next = cloneAppConfig(config);
	next.llmTranslator.apiKey = opts.apiKey;
	next.sync.webdav.username = opts.webdavUsername;
	next.sync.webdav.password = opts.webdavPassword;
	next.sync.webdav.syncSecrets = opts.syncSecrets ?? false;
	return next;
};

describe('prepareConfigForPush', () => {
	test('never uploads WebDAV username/password', () => {
		const local = withCredentials(getDefaultConfig(), {
			apiKey: 'local-key',
			webdavUsername: 'dav-user',
			webdavPassword: 'dav-pass',
			syncSecrets: true,
		});
		const remote = withCredentials(getDefaultConfig(), {
			apiKey: 'remote-key',
			webdavUsername: 'remote-user',
			webdavPassword: 'remote-pass',
			syncSecrets: false,
		});

		local.sync.webdav.url = 'https://local.example/dav/';
		remote.sync.webdav.url = 'https://remote.example/dav/';
		const withSecretsOn = prepareConfigForPush(local, remote);
		expect(withSecretsOn.sync.webdav.url).toBe('');
		expect(withSecretsOn.sync.webdav.username).toBe('');
		expect(withSecretsOn.sync.webdav.password).toBe('');
		expect(withSecretsOn.llmTranslator.apiKey).toBe('local-key');

		const withSecretsOff = prepareConfigForPush(
			withCredentials(local, {
				apiKey: 'local-key',
				webdavUsername: 'dav-user',
				webdavPassword: 'dav-pass',
				syncSecrets: false,
			}),
			null,
		);
		expect(withSecretsOff.sync.webdav.url).toBe('');
		expect(withSecretsOff.sync.webdav.username).toBe('');
		expect(withSecretsOff.sync.webdav.password).toBe('');
		expect(withSecretsOff.llmTranslator.apiKey).toBe('');
	});

	test('strips LLM key when syncSecrets is false and no remote', () => {
		const local = withCredentials(getDefaultConfig(), {
			apiKey: 'local-key',
			webdavUsername: 'u',
			webdavPassword: 'p',
			syncSecrets: false,
		});
		const payload = prepareConfigForPush(local, null);
		expect(payload.llmTranslator.apiKey).toBe('');
		expect(payload.language).toBe(local.language);
		expect(local.llmTranslator.apiKey).toBe('local-key');
	});

	test('preserves remote LLM key when syncSecrets is false', () => {
		const local = withCredentials(getDefaultConfig(), {
			apiKey: 'local-key',
			webdavUsername: 'u',
			webdavPassword: 'p',
			syncSecrets: false,
		});
		local.language = 'de';
		const remote = withCredentials(getDefaultConfig(), {
			apiKey: 'remote-key',
			webdavUsername: 'ru',
			webdavPassword: 'rp',
			syncSecrets: true,
		});
		const payload = prepareConfigForPush(local, remote);
		expect(payload.language).toBe('de');
		expect(payload.llmTranslator.apiKey).toBe('remote-key');
		expect(payload.sync.webdav.username).toBe('');
		expect(payload.sync.webdav.password).toBe('');
	});

	test('includes local LLM key when syncSecrets is true', () => {
		const local = withCredentials(getDefaultConfig(), {
			apiKey: 'local-key',
			webdavUsername: 'u',
			webdavPassword: 'p',
			syncSecrets: true,
		});
		const remote = withCredentials(getDefaultConfig(), {
			apiKey: 'remote-key',
			webdavUsername: 'ru',
			webdavPassword: 'rp',
			syncSecrets: false,
		});
		const payload = prepareConfigForPush(local, remote);
		expect(payload.llmTranslator.apiKey).toBe('local-key');
		expect(payload.sync.webdav.username).toBe('');
		expect(payload.sync.webdav.password).toBe('');
	});
});

describe('mergeRemoteConfig', () => {
	test('always keeps local WebDAV connection (url/username/password)', () => {
		const local = withCredentials(getDefaultConfig(), {
			apiKey: 'local-key',
			webdavUsername: 'local-user',
			webdavPassword: 'local-dav',
			syncSecrets: true,
		});
		local.sync.webdav.url = 'https://local.example/dav/';
		const remote = withCredentials(getDefaultConfig(), {
			apiKey: 'remote-key',
			webdavUsername: 'remote-user',
			webdavPassword: 'remote-dav',
			syncSecrets: false,
		});
		remote.sync.webdav.url = 'https://remote.example/dav/';
		remote.language = 'ja';
		const merged = mergeRemoteConfig(remote, local);
		expect(merged.language).toBe('ja');
		expect(merged.sync.webdav.url).toBe('https://local.example/dav/');
		expect(merged.sync.webdav.username).toBe('local-user');
		expect(merged.sync.webdav.password).toBe('local-dav');
		// syncSecrets on → accept remote API key, but not WebDAV login
		expect(merged.llmTranslator.apiKey).toBe('remote-key');
		expect(merged.sync.webdav.syncSecrets).toBe(true);
	});

	test('keeps local LLM key when local syncSecrets is false', () => {
		const local = withCredentials(getDefaultConfig(), {
			apiKey: 'local-key',
			webdavUsername: 'local-user',
			webdavPassword: 'local-dav',
			syncSecrets: false,
		});
		local.language = 'en';
		const remote = withCredentials(getDefaultConfig(), {
			apiKey: 'remote-key',
			webdavUsername: 'remote-user',
			webdavPassword: 'remote-dav',
			syncSecrets: true,
		});
		remote.language = 'ja';
		const merged = mergeRemoteConfig(remote, local);
		expect(merged.language).toBe('ja');
		expect(merged.llmTranslator.apiKey).toBe('local-key');
		expect(merged.sync.webdav.username).toBe('local-user');
		expect(merged.sync.webdav.password).toBe('local-dav');
		expect(merged.sync.webdav.syncSecrets).toBe(false);
	});
});

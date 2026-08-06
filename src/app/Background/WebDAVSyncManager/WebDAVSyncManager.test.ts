import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import browser from 'webextension-polyfill';

import { getDefaultConfig } from '../../../config';
import { clearAllMocks } from '../../../lib/tests';
import {
	serializeEnvelope,
	type ConfigEnvelope,
} from '../../../lib/webdav/configEnvelope';
import type {
	WebDAVClientLike,
	WebDAVGetResult,
	WebDAVPutResult,
} from '../../../lib/webdav/WebDAVClient';
import { WebDAVPreconditionFailedError } from '../../../lib/webdav/WebDAVClient';
import { AppConfigType } from '../../../types/runtime';
import { ConfigStorage, ObservableAsyncStorage } from '../../ConfigStorage/ConfigStorage';

import { serializeDictionaryEnvelope } from '../../../lib/webdav/dictionaryEnvelope';
import * as translationsStore from '../../../requests/backend/translations/data';

import {
	WEBDAV_CONFIG_PATH,
	WEBDAV_DICTIONARY_PATH,
	WEBDAV_PUSH_ALARM_NAME,
	WEBDAV_SYNC_ALARM_NAME,
	WebDAVSyncManager,
} from './WebDAVSyncManager';
import {
	defaultDictionarySyncMeta,
	getDictionarySyncMeta,
	setDictionarySyncMeta,
} from './dictionarySyncMeta';
import {
	CONFIG_SYNC_META_KEY,
	defaultConfigSyncMeta,
	getConfigSyncMeta,
	setConfigSyncMeta,
} from './syncMeta';

type MockClient = WebDAVClientLike & {
	get: ReturnType<typeof vi.fn>;
	put: ReturnType<typeof vi.fn>;
	path: string;
};

const makeDictionaryEnvelope = (
	entries: Array<{
		timestamp: number;
		translation: {
			from: string;
			to: string;
			originalText: string;
			translatedText: string;
		};
	}> = [],
	updatedAt = 1000,
	extensionVersion = '7.0.12',
): string => serializeDictionaryEnvelope(entries, updatedAt, extensionVersion);

const makeMockClient = (path: string): MockClient => ({
	path,
	get: vi.fn(async (): Promise<WebDAVGetResult> => {
		// Dictionary defaults to empty remote create path (404) so config tests
		// only need to assert on the config client unless they set dictionary state.
		if (path === WEBDAV_DICTIONARY_PATH) {
			return { status: 404, bodyText: '', etag: null };
		}
		return { status: 404, bodyText: '', etag: null };
	}),
	put: vi.fn(async (): Promise<WebDAVPutResult> => ({ etag: '"etag-1"' })),
	resolveFileUrl: vi.fn(() => `https://example.com/dav/files/user/${path}`),
	ensureParentCollections: vi.fn(async () => undefined),
});

const ensureAlarmsMock = () => {
	const alarms = (
		browser as unknown as {
			alarms?: {
				create: ReturnType<typeof vi.fn>;
				clear: ReturnType<typeof vi.fn>;
				onAlarm: { addListener: ReturnType<typeof vi.fn> };
			};
		}
	).alarms;

	if (alarms?.create && alarms?.clear) {
		return alarms;
	}

	const created: Array<{ name: string; info: unknown }> = [];
	const mock = {
		create: vi.fn((name: string, info: unknown) => {
			created.push({ name, info });
		}),
		clear: vi.fn(async (name?: string) => {
			if (name == null) {
				created.length = 0;
				return true;
			}
			const idx = created.findIndex((a) => a.name === name);
			if (idx >= 0) created.splice(idx, 1);
			return true;
		}),
		onAlarm: {
			addListener: vi.fn(),
		},
		_created: created,
	};
	(browser as unknown as { alarms: typeof mock }).alarms = mock;
	(globalThis as unknown as { chrome: { alarms: typeof mock } }).chrome =
		(globalThis as unknown as { chrome: { alarms: typeof mock } }).chrome ??
		({} as { alarms: typeof mock });
	(globalThis as unknown as { chrome: { alarms: typeof mock } }).chrome.alarms = mock;
	return mock;
};

const configuredConfig = (): AppConfigType => {
	const config = getDefaultConfig();
	return {
		...config,
		sync: {
			webdav: {
				enabled: true,
				url: 'https://example.com/dav/files/user/',
				username: 'user',
				password: 'secret',
				syncSecrets: false,
			},
		},
	};
};

const makeEnvelope = (
	config: AppConfigType,
	updatedAt: number,
	extensionVersion = '7.0.12',
): string => serializeEnvelope(config, updatedAt, extensionVersion);

describe('WebDAVSyncManager', () => {
	let storage: ObservableAsyncStorage<AppConfigType>;
	let mockClient: MockClient;
	let dictionaryClient: MockClient;
	let createClient: ReturnType<typeof vi.fn>;
	const clientsByPath = new Map<string, MockClient>();

	beforeEach(async () => {
		await clearAllMocks();
		ensureAlarmsMock();
		translationsStore.closeDB();
		clientsByPath.clear();

		vi.spyOn(browser.runtime, 'getManifest').mockReturnValue({
			manifest_version: 3,
			name: 'leukothea-test',
			version: '7.0.12',
		} as browser.Manifest.WebExtensionManifest);

		const initial = configuredConfig();
		const configStorage = new ConfigStorage(initial);
		// Seed storage so ObservableAsyncStorage reads configured state
		await configStorage.set(initial);
		storage = new ObservableAsyncStorage(configStorage);

		mockClient = makeMockClient(WEBDAV_CONFIG_PATH);
		dictionaryClient = makeMockClient(WEBDAV_DICTIONARY_PATH);
		clientsByPath.set(WEBDAV_CONFIG_PATH, mockClient);
		clientsByPath.set(WEBDAV_DICTIONARY_PATH, dictionaryClient);

		createClient = vi.fn((credentials: { path: string }) => {
			const existing = clientsByPath.get(credentials.path);
			if (existing) return existing;
			const created = makeMockClient(credentials.path);
			clientsByPath.set(credentials.path, created);
			return created;
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		translationsStore.closeDB();
	});

	const createManager = () =>
		new WebDAVSyncManager(storage, { createClient: createClient as never });

	test('404 create path uses createOnly PUT and records push meta', async () => {
		const manager = createManager();
		await manager.reconcile('manual');

		expect(mockClient.get).toHaveBeenCalledTimes(1);
		expect(mockClient.put).toHaveBeenCalledTimes(1);
		expect(mockClient.put.mock.calls[0]?.[1]).toMatchObject({ createOnly: true });

		const meta = await getConfigSyncMeta();
		expect(meta.lastDirection).toBe('push');
		expect(meta.lastError).toBeNull();
		expect(meta.lastRemoteEtag).toBe('"etag-1"');
		expect(meta.lastSyncAt).not.toBeNull();

		// Dictionary also creates on 404 in the same drain
		expect(dictionaryClient.get).toHaveBeenCalled();
		expect(dictionaryClient.put).toHaveBeenCalled();
		const dictMeta = await getDictionarySyncMeta();
		expect(dictMeta.lastDirection).toBe('push');
	});

	test('local newer pushes with If-Match when etag known', async () => {
		const local = configuredConfig();
		local.language = 'de';
		await storage.set(local);
		await setConfigSyncMeta({
			...defaultConfigSyncMeta(),
			lastLocalWriteAt: 2000,
			lastRemoteUpdatedAt: 1000,
		});

		const remoteConfig = configuredConfig();
		remoteConfig.language = 'en';
		mockClient.get.mockResolvedValue({
			status: 200,
			bodyText: makeEnvelope(remoteConfig, 1000),
			etag: '"remote-old"',
		});
		// Keep dictionary as equal-clocks noop so it does not muddy config assertions
		await setDictionarySyncMeta({
			...defaultDictionarySyncMeta(),
			lastLocalWriteAt: 1000,
			lastRemoteUpdatedAt: 1000,
		});
		dictionaryClient.get.mockResolvedValue({
			status: 200,
			bodyText: makeDictionaryEnvelope([], 1000),
			etag: '"dict-etag"',
		});

		const manager = createManager();
		await manager.reconcile('manual');

		expect(mockClient.put).toHaveBeenCalledTimes(1);
		expect(mockClient.put.mock.calls[0]?.[1]).toMatchObject({
			ifMatch: '"remote-old"',
		});
		const body = mockClient.put.mock.calls[0]?.[0] as string;
		const parsed = JSON.parse(body) as ConfigEnvelope;
		expect(parsed.config.language).toBe('de');
		expect(parsed.updatedAt).toBe(2000);

		const meta = await getConfigSyncMeta();
		expect(meta.lastDirection).toBe('push');
		expect(meta.lastRemoteEtag).toBe('"etag-1"');
	});

	test('remote newer pulls and applies config without echo push', async () => {
		const local = configuredConfig();
		local.language = 'en';
		await storage.set(local);
		await setConfigSyncMeta({
			...defaultConfigSyncMeta(),
			lastLocalWriteAt: 1000,
			lastRemoteUpdatedAt: 1000,
		});

		const remoteConfig = configuredConfig();
		remoteConfig.language = 'ja';
		mockClient.get.mockResolvedValue({
			status: 200,
			bodyText: makeEnvelope(remoteConfig, 3000),
			etag: '"remote-new"',
		});
		await setDictionarySyncMeta({
			...defaultDictionarySyncMeta(),
			lastLocalWriteAt: 1000,
			lastRemoteUpdatedAt: 1000,
		});
		dictionaryClient.get.mockResolvedValue({
			status: 200,
			bodyText: makeDictionaryEnvelope([], 1000),
			etag: '"dict-etag"',
		});

		const manager = createManager();
		// start() wires applyingRemote suppression and runs startup reconcile → pull
		await manager.start();

		const applied = await storage.get();
		expect(applied.language).toBe('ja');
		// applyingRemote must not schedule a push of the pulled config
		expect(mockClient.put).not.toHaveBeenCalled();

		const meta = await getConfigSyncMeta();
		expect(meta.lastDirection).toBe('pull');
		expect(meta.lastLocalWriteAt).toBe(3000);
		expect(meta.lastRemoteEtag).toBe('"remote-new"');
	});

	test('older local extension never pushes over newer remote writer', async () => {
		vi.spyOn(browser.runtime, 'getManifest').mockReturnValue({
			manifest_version: 3,
			name: 'leukothea-test',
			version: '7.0.10',
		} as browser.Manifest.WebExtensionManifest);

		await setConfigSyncMeta({
			...defaultConfigSyncMeta(),
			lastLocalWriteAt: 5000,
		});

		const remoteConfig = configuredConfig();
		mockClient.get.mockResolvedValue({
			status: 200,
			bodyText: makeEnvelope(remoteConfig, 1000, '7.0.12'),
			etag: '"x"',
		});

		const manager = createManager();
		await manager.reconcile('manual');

		expect(mockClient.put).not.toHaveBeenCalled();
		const meta = await getConfigSyncMeta();
		expect(meta.lastError).toMatch(/newer extension/i);
		expect(meta.lastDirection).toBe('none');
	});

	test('412 on push re-runs and pulls when remote is newer', async () => {
		const local = configuredConfig();
		local.language = 'de';
		await storage.set(local);
		await setConfigSyncMeta({
			...defaultConfigSyncMeta(),
			lastLocalWriteAt: 2000,
		});

		const remoteOld = configuredConfig();
		remoteOld.language = 'en';
		const remoteNew = configuredConfig();
		remoteNew.language = 'fr';

		let getCount = 0;
		mockClient.get.mockImplementation(async () => {
			getCount += 1;
			if (getCount === 1) {
				return {
					status: 200,
					bodyText: makeEnvelope(remoteOld, 1000),
					etag: '"old"',
				};
			}
			// After 412, remote has moved ahead of local write clock
			return {
				status: 200,
				bodyText: makeEnvelope(remoteNew, 9000),
				etag: '"new"',
			};
		});

		let putCount = 0;
		mockClient.put.mockImplementation(async () => {
			putCount += 1;
			if (putCount === 1) {
				throw new WebDAVPreconditionFailedError();
			}
			return { etag: '"should-not-reach"' };
		});

		const manager = createManager();
		await manager.reconcile('manual');

		expect(putCount).toBe(1);
		expect(getCount).toBeGreaterThanOrEqual(2);
		const applied = await storage.get();
		expect(applied.language).toBe('fr');
		const meta = await getConfigSyncMeta();
		expect(meta.lastDirection).toBe('pull');
	});

	test('local write while reconcile is in flight is not dropped', async () => {
		const local = configuredConfig();
		local.language = 'en';
		await storage.set(local);
		await setConfigSyncMeta({
			...defaultConfigSyncMeta(),
			lastLocalWriteAt: 1000,
		});

		const remote = configuredConfig();
		remote.language = 'en';

		let releaseGet: (() => void) | null = null;
		const getGate = new Promise<void>((resolve) => {
			releaseGet = resolve;
		});

		let getCount = 0;
		mockClient.get.mockImplementation(async () => {
			getCount += 1;
			if (getCount === 1) {
				await getGate;
			}
			// Always report remote older so push wins with latest local
			return {
				status: 200,
				bodyText: makeEnvelope(remote, 500),
				etag: `"e${getCount}"`,
			};
		});

		const putBodies: string[] = [];
		mockClient.put.mockImplementation(async (body: string) => {
			putBodies.push(body);
			return { etag: `"p${putBodies.length}"` };
		});

		const manager = createManager();
		const first = manager.reconcile('manual');

		// Wait until first GET is blocked
		await vi.waitFor(() => {
			expect(getCount).toBe(1);
		});

		// Mid-flight local edit
		const edited = await storage.get();
		edited.language = 'ko';
		await storage.set(edited);
		await setConfigSyncMeta({ lastLocalWriteAt: 8000 });

		// Concurrent reconcile should mark dirty and wait
		const second = manager.reconcile('localWrite');

		releaseGet?.();
		await Promise.all([first, second]);

		// Dirty re-run should push the later language
		expect(putBodies.length).toBeGreaterThanOrEqual(1);
		const lastBody = putBodies[putBodies.length - 1];
		const parsed = JSON.parse(lastBody) as ConfigEnvelope;
		expect(parsed.config.language).toBe('ko');
		expect(parsed.updatedAt).toBe(8000);
	});

	test('schedules push alarm on local config write when enabled', async () => {
		const alarms = ensureAlarmsMock();
		const manager = createManager();
		// Avoid start() network side effects; exercise the local-write path directly.
		await setConfigSyncMeta({
			...defaultConfigSyncMeta(),
			lastLocalWriteAt: 1,
		});
		alarms.create.mockClear();

		await (
			manager as unknown as {
				onLocalConfigWrite: () => Promise<void>;
			}
		).onLocalConfigWrite();

		expect(alarms.create).toHaveBeenCalledWith(
			WEBDAV_PUSH_ALARM_NAME,
			expect.objectContaining({
				delayInMinutes: 1,
			}),
		);
	});

	test('invalid remote envelope is never overwritten', async () => {
		await setConfigSyncMeta({
			...defaultConfigSyncMeta(),
			lastLocalWriteAt: 9999,
		});
		mockClient.get.mockResolvedValue({
			status: 200,
			bodyText:
				'{"version":1,"updatedAt":1,"extensionVersion":"7.0.12","config":{}}',
			etag: '"bad"',
		});

		const manager = createManager();
		await manager.reconcile('manual');

		expect(mockClient.put).not.toHaveBeenCalled();
		const meta = await getConfigSyncMeta();
		expect(meta.lastError).toMatch(/validation|incompatible|failed/i);
		expect(meta.recovery).toBe('forcePushInvalidRemote');
	});

	test('forcePushRemote overwrites invalid remote with local envelope', async () => {
		await setConfigSyncMeta({
			...defaultConfigSyncMeta(),
			lastLocalWriteAt: 5000,
			recovery: 'forcePushInvalidRemote',
			lastError: 'Remote config failed AppConfig validation',
			lastRemoteEtag: '"bad"',
		});
		const invalidBody =
			'{"version":1,"updatedAt":1,"extensionVersion":"7.0.12","config":{}}';
		mockClient.get.mockResolvedValue({
			status: 200,
			bodyText: invalidBody,
			etag: '"bad"',
		});
		mockClient.put.mockResolvedValue({ etag: '"forced"' });

		const manager = createManager();
		const status = await manager.forcePushRemote();

		expect(mockClient.put).toHaveBeenCalledTimes(1);
		expect(mockClient.put.mock.calls[0]?.[1]).toMatchObject({ ifMatch: '"bad"' });
		const putBody = mockClient.put.mock.calls[0]?.[0] as string;
		const putParsed = JSON.parse(putBody) as ConfigEnvelope;
		expect(putParsed.config).toBeDefined();
		expect(putParsed.updatedAt).toBe(5000);

		expect(status.lastError).toBeNull();
		expect(status.recovery).toBeNull();
		expect(status.lastDirection).toBe('push');
		expect(status.lastRemoteEtag).toBe('"forced"');
	});

	test('forcePushRemote aborts when remote is readable again', async () => {
		const remoteConfig = configuredConfig();
		remoteConfig.language = 'de';
		await setConfigSyncMeta({
			...defaultConfigSyncMeta(),
			lastLocalWriteAt: 1000,
			recovery: 'forcePushInvalidRemote',
			lastError: 'Remote config failed AppConfig validation',
		});
		mockClient.get.mockResolvedValue({
			status: 200,
			bodyText: makeEnvelope(remoteConfig, 9000),
			etag: '"ok"',
		});

		const manager = createManager();
		const status = await manager.forcePushRemote();

		expect(mockClient.put).not.toHaveBeenCalled();
		expect(status.lastError).toMatch(/readable again|Sync now/i);
		expect(status.recovery).toBeNull();
	});

	test('forcePushRemote retries once after 412 when remote still invalid', async () => {
		await setConfigSyncMeta({
			...defaultConfigSyncMeta(),
			lastLocalWriteAt: 4000,
			recovery: 'forcePushInvalidRemote',
		});
		const invalidBody =
			'{"version":1,"updatedAt":1,"extensionVersion":"7.0.12","config":{}}';
		mockClient.get
			.mockResolvedValueOnce({
				status: 200,
				bodyText: invalidBody,
				etag: '"e1"',
			})
			.mockResolvedValueOnce({
				status: 200,
				bodyText: invalidBody,
				etag: '"e2"',
			});
		mockClient.put
			.mockRejectedValueOnce(new WebDAVPreconditionFailedError('stale'))
			.mockResolvedValueOnce({ etag: '"e3"' });

		const manager = createManager();
		const status = await manager.forcePushRemote();

		expect(mockClient.get).toHaveBeenCalledTimes(2);
		expect(mockClient.put).toHaveBeenCalledTimes(2);
		expect(mockClient.put.mock.calls[1]?.[1]).toMatchObject({ ifMatch: '"e2"' });
		expect(status.lastError).toBeNull();
		expect(status.recovery).toBeNull();
		expect(status.lastDirection).toBe('push');
	});

	test('equal clocks report already-in-sync direction none', async () => {
		const local = configuredConfig();
		local.language = 'en';
		await storage.set(local);
		await setConfigSyncMeta({
			...defaultConfigSyncMeta(),
			lastLocalWriteAt: 3000,
			lastRemoteUpdatedAt: 3000,
		});

		const remoteConfig = configuredConfig();
		remoteConfig.language = 'en';
		mockClient.get.mockResolvedValue({
			status: 200,
			bodyText: makeEnvelope(remoteConfig, 3000),
			etag: '"same"',
		});

		const manager = createManager();
		await manager.reconcile('manual');

		expect(mockClient.put).not.toHaveBeenCalled();
		const meta = await getConfigSyncMeta();
		expect(meta.lastDirection).toBe('none');
		expect(meta.lastError).toBeNull();
		expect(meta.lastSyncAt).not.toBeNull();
	});

	test('trailing noop after pull keeps lastDirection pull', async () => {
		const local = configuredConfig();
		local.language = 'en';
		await storage.set(local);
		await setConfigSyncMeta({
			...defaultConfigSyncMeta(),
			lastLocalWriteAt: 1000,
			lastRemoteUpdatedAt: 1000,
		});

		const remoteConfig = configuredConfig();
		remoteConfig.language = 'ja';

		let getCount = 0;
		mockClient.get.mockImplementation(async () => {
			getCount += 1;
			if (getCount === 1) {
				return {
					status: 200,
					bodyText: makeEnvelope(remoteConfig, 3000),
					etag: '"remote-new"',
				};
			}
			// Second cycle in the same drain sees equal clocks after pull adopted remote.updatedAt.
			return {
				status: 200,
				bodyText: makeEnvelope(remoteConfig, 3000),
				etag: '"remote-new"',
			};
		});

		const manager = createManager();
		// Mark dirty during applyRemote's config.set so drainReconcile runs a trailing cycle.
		const originalSet = storage.set.bind(storage);
		let forcedDirty = false;
		vi.spyOn(storage, 'set').mockImplementation(async (next) => {
			const result = await originalSet(next);
			if (!forcedDirty) {
				forcedDirty = true;
				// Concurrent reconcile while drain owns the lock → dirty flag + re-entry.
				void manager.reconcile('localWrite');
			}
			return result;
		});

		await manager.reconcile('manual');

		const applied = await storage.get();
		expect(applied.language).toBe('ja');
		expect(mockClient.put).not.toHaveBeenCalled();
		expect(getCount).toBeGreaterThanOrEqual(2);

		const meta = await getConfigSyncMeta();
		// Trailing equal-clocks cycle must not wipe the pull transfer for status UI.
		expect(meta.lastDirection).toBe('pull');
		expect(meta.lastError).toBeNull();
		expect(meta.lastLocalWriteAt).toBe(3000);
	});

	test('sequential reconcile after a pull keeps lastDirection pull (no wipe)', async () => {
		// Remote (3000) is newer than local (1000). A preceding reconcile — e.g. the
		// saveChanges-triggered localWrite sync that fires when "Sync now" saves first —
		// pulls and advances the local clock to 3000. The manual Sync now then runs as a
		// SEPARATE drain, sees equal clocks, and noops; it must keep reporting the pull
		// from the same Sync-now operation instead of "already in sync".
		const local = configuredConfig();
		local.language = 'en';
		await storage.set(local);
		await setConfigSyncMeta({
			...defaultConfigSyncMeta(),
			lastLocalWriteAt: 1000,
			lastRemoteUpdatedAt: 1000,
		});

		const remoteConfig = configuredConfig();
		remoteConfig.language = 'ja';
		mockClient.get.mockResolvedValue({
			status: 200,
			bodyText: makeEnvelope(remoteConfig, 3000),
			etag: '"remote-new"',
		});

		const manager = createManager();
		// saveChanges wrote config → bumped the clock below remote and fired localWrite sync.
		await setConfigSyncMeta({ lastLocalWriteAt: 2500 });
		await (
			manager as unknown as {
				reconcile: (
					r: 'startup' | 'alarm' | 'manual' | 'localWrite',
				) => Promise<void>;
			}
		).reconcile('localWrite');

		const status = await manager.syncNow();

		const applied = await storage.get();
		expect(applied.language).toBe('ja');
		expect(status.lastDirection).toBe('pull');
		expect(status.lastLocalWriteAt).toBe(3000);
		expect(status.lastError).toBeNull();
	});

	test('legacy configSyncMeta without lastRemoteEtag still loads', async () => {
		await browser.storage.local.set({
			[CONFIG_SYNC_META_KEY]: {
				lastLocalWriteAt: 10,
				lastRemoteUpdatedAt: 5,
				lastSyncAt: null,
				lastError: null,
				lastDirection: null,
			},
		});

		const meta = await getConfigSyncMeta();
		expect(meta.lastLocalWriteAt).toBe(10);
		expect(meta.lastRemoteEtag).toBeNull();
	});

	test('pull alarm is scheduled when sync is enabled on start', async () => {
		const alarms = ensureAlarmsMock();
		alarms.create.mockClear();

		const manager = createManager();
		await manager.start();

		const pullScheduled = alarms.create.mock.calls.some(
			(call: unknown[]) => call[0] === WEBDAV_SYNC_ALARM_NAME,
		);
		expect(pullScheduled).toBe(true);
	});

	test('push never uploads WebDAV username/password (create)', async () => {
		const local = configuredConfig();
		local.llmTranslator.apiKey = 'should-not-upload';
		local.sync.webdav.username = 'dav-user';
		local.sync.webdav.password = 'dav-secret';
		local.sync.webdav.syncSecrets = false;
		await storage.set(local);

		const manager = createManager();
		await manager.reconcile('manual');

		expect(mockClient.put).toHaveBeenCalledTimes(1);
		const body = mockClient.put.mock.calls[0]?.[0] as string;
		const parsed = JSON.parse(body) as ConfigEnvelope;
		expect(parsed.config.llmTranslator.apiKey).toBe('');
		expect(parsed.config.sync.webdav.url).toBe('');
		expect(parsed.config.sync.webdav.username).toBe('');
		expect(parsed.config.sync.webdav.password).toBe('');
	});

	test('push includes LLM key when syncSecrets is true but still strips WebDAV login', async () => {
		const local = configuredConfig();
		local.llmTranslator.apiKey = 'upload-me';
		local.sync.webdav.username = 'dav-user';
		local.sync.webdav.password = 'dav-secret';
		local.sync.webdav.syncSecrets = true;
		await storage.set(local);

		const manager = createManager();
		await manager.reconcile('manual');

		const body = mockClient.put.mock.calls[0]?.[0] as string;
		const parsed = JSON.parse(body) as ConfigEnvelope;
		expect(parsed.config.llmTranslator.apiKey).toBe('upload-me');
		expect(parsed.config.sync.webdav.url).toBe('');
		expect(parsed.config.sync.webdav.username).toBe('');
		expect(parsed.config.sync.webdav.password).toBe('');
	});

	test('pull always retains local WebDAV login; retains LLM key when syncSecrets is false', async () => {
		const local = configuredConfig();
		local.language = 'en';
		local.llmTranslator.apiKey = 'keep-local-key';
		local.sync.webdav.url = 'https://local.example/dav/';
		local.sync.webdav.username = 'keep-local-user';
		local.sync.webdav.password = 'keep-local-dav';
		local.sync.webdav.syncSecrets = false;
		await storage.set(local);
		await setConfigSyncMeta({
			...defaultConfigSyncMeta(),
			lastLocalWriteAt: 1000,
		});

		const remoteConfig = configuredConfig();
		remoteConfig.language = 'ja';
		remoteConfig.llmTranslator.apiKey = 'remote-key';
		remoteConfig.sync.webdav.url = 'https://remote.example/dav/';
		remoteConfig.sync.webdav.username = 'remote-user';
		remoteConfig.sync.webdav.password = 'remote-dav';
		// Remote may claim syncSecrets true; local policy still wins for API key
		remoteConfig.sync.webdav.syncSecrets = true;
		mockClient.get.mockResolvedValue({
			status: 200,
			bodyText: makeEnvelope(remoteConfig, 3000),
			etag: '"remote-new"',
		});

		const manager = createManager();
		await manager.start();

		const applied = await storage.get();
		expect(applied.language).toBe('ja');
		expect(applied.llmTranslator.apiKey).toBe('keep-local-key');
		expect(applied.sync.webdav.url).toBe('https://local.example/dav/');
		expect(applied.sync.webdav.username).toBe('keep-local-user');
		expect(applied.sync.webdav.password).toBe('keep-local-dav');
		// Local device policy must not flip on because remote enabled secrets
		expect(applied.sync.webdav.syncSecrets).toBe(false);
	});

	test('manual sync when not configured records error (no silent success)', async () => {
		const disabled = getDefaultConfig();
		disabled.sync.webdav.enabled = false;
		disabled.sync.webdav.url = '';
		await storage.set(disabled);

		const manager = createManager();
		const status = await manager.syncNow();
		expect(mockClient.get).not.toHaveBeenCalled();
		expect(status.lastError).toMatch(/not configured/i);
		expect(status.lastSyncAt).toBeNull();
	});

	test('dictionary remote newer replaces local IndexedDB entries', async () => {
		await translationsStore.addEntry({
			timestamp: 1,
			translation: {
				from: 'en',
				to: 'de',
				originalText: 'local-only',
				translatedText: 'lokal',
			},
		});

		// Config equal-clocks so only dictionary transfer is asserted
		await setConfigSyncMeta({
			...defaultConfigSyncMeta(),
			lastLocalWriteAt: 1000,
			lastRemoteUpdatedAt: 1000,
		});
		const remoteConfig = configuredConfig();
		mockClient.get.mockResolvedValue({
			status: 200,
			bodyText: makeEnvelope(remoteConfig, 1000),
			etag: '"cfg"',
		});

		await setDictionarySyncMeta({
			...defaultDictionarySyncMeta(),
			lastLocalWriteAt: 1000,
			lastRemoteUpdatedAt: 1000,
		});
		const remoteEntries = [
			{
				timestamp: 9,
				translation: {
					from: 'en',
					to: 'zh',
					originalText: 'hello',
					translatedText: '你好',
				},
			},
		];
		dictionaryClient.get.mockResolvedValue({
			status: 200,
			bodyText: makeDictionaryEnvelope(remoteEntries, 5000),
			etag: '"dict-new"',
		});

		const manager = createManager();
		await manager.reconcile('manual');

		const local = await translationsStore.getEntries(undefined, undefined, {
			order: 'asc',
		});
		expect(local.map(({ data }) => data.translation.originalText)).toEqual(['hello']);
		expect(dictionaryClient.put).not.toHaveBeenCalled();

		const dictMeta = await getDictionarySyncMeta();
		expect(dictMeta.lastDirection).toBe('pull');
		expect(dictMeta.lastLocalWriteAt).toBe(5000);
		expect(dictMeta.lastRemoteEtag).toBe('"dict-new"');
	});

	test('dictionary local newer pushes snapshot JSON without IDB keys', async () => {
		await translationsStore.addEntry({
			timestamp: 42,
			translation: {
				from: 'en',
				to: 'zh',
				originalText: 'word',
				translatedText: '词',
			},
		});

		await setConfigSyncMeta({
			...defaultConfigSyncMeta(),
			lastLocalWriteAt: 1000,
			lastRemoteUpdatedAt: 1000,
		});
		mockClient.get.mockResolvedValue({
			status: 200,
			bodyText: makeEnvelope(configuredConfig(), 1000),
			etag: '"cfg"',
		});

		await setDictionarySyncMeta({
			...defaultDictionarySyncMeta(),
			lastLocalWriteAt: 8000,
			lastRemoteUpdatedAt: 1000,
		});
		dictionaryClient.get.mockResolvedValue({
			status: 200,
			bodyText: makeDictionaryEnvelope([], 1000),
			etag: '"dict-old"',
		});

		const manager = createManager();
		await manager.reconcile('manual');

		expect(dictionaryClient.put).toHaveBeenCalledTimes(1);
		expect(dictionaryClient.put.mock.calls[0]?.[1]).toMatchObject({
			ifMatch: '"dict-old"',
		});
		const body = dictionaryClient.put.mock.calls[0]?.[0] as string;
		const parsed = JSON.parse(body) as {
			updatedAt: number;
			entries: Array<Record<string, unknown>>;
		};
		expect(parsed.updatedAt).toBe(8000);
		expect(parsed.entries).toHaveLength(1);
		expect(parsed.entries[0]).not.toHaveProperty('id');
		expect(parsed.entries[0]?.translation).toMatchObject({
			originalText: 'word',
			translatedText: '词',
		});

		const dictMeta = await getDictionarySyncMeta();
		expect(dictMeta.lastDirection).toBe('push');
	});

	test('onLocalDictionaryWrite bumps meta and schedules push when enabled', async () => {
		const alarms = ensureAlarmsMock();
		const manager = createManager();

		// Avoid start() network; exercise the public mutation hook directly.
		await setDictionarySyncMeta({
			...defaultDictionarySyncMeta(),
			lastLocalWriteAt: 0,
		});

		await manager.onLocalDictionaryWrite();

		const meta = await getDictionarySyncMeta();
		expect(meta.lastLocalWriteAt).toBeGreaterThan(0);
		expect(alarms.create).toHaveBeenCalledWith(
			WEBDAV_PUSH_ALARM_NAME,
			expect.objectContaining({ delayInMinutes: expect.any(Number) }),
		);
	});
});

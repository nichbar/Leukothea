import { isEqual } from 'lodash';
import browser from 'webextension-polyfill';

import { createSelector } from '../../../lib/effector/createSelector';
import {
	decideSyncAction,
	parseEnvelope,
	serializeEnvelope,
} from '../../../lib/webdav/configEnvelope';
import { WebDAVClient, WebDAVCredentials } from '../../../lib/webdav/WebDAVClient';
import { AppConfigType } from '../../../types/runtime';
import { ObservableAsyncStorage } from '../../ConfigStorage/ConfigStorage';

import {
	bumpLocalWriteAt,
	ConfigSyncMeta,
	getConfigSyncMeta,
	setConfigSyncMeta,
} from './syncMeta';

export const WEBDAV_SYNC_ALARM_NAME = 'webdav-config-sync';

/** Fixed remote filename under the configured WebDAV base URL. */
export const WEBDAV_CONFIG_PATH = 'linguist/linguist-config.json';

/** Fixed periodic pull interval (once per day). */
export const WEBDAV_PULL_INTERVAL_MINUTES = 1440;

const PUSH_DEBOUNCE_MS = 1000;

export type WebDAVSyncStatus = ConfigSyncMeta & {
	enabled: boolean;
	url: string;
	path: string;
};

type WebDAVSettings = AppConfigType['sync']['webdav'];

const isConfigured = (settings: WebDAVSettings): boolean =>
	settings.enabled && settings.url.trim() !== '';

/**
 * Bidirectional WebDAV sync of full AppConfig (last-write-wins + extension version gate).
 */
export class WebDAVSyncManager {
	private readonly config: ObservableAsyncStorage<AppConfigType>;
	private applyingRemote = false;
	private pushTimer: ReturnType<typeof setTimeout> | null = null;
	private reconcilePromise: Promise<void> | null = null;
	private started = false;
	private lastSettings: WebDAVSettings | null = null;

	constructor(config: ObservableAsyncStorage<AppConfigType>) {
		this.config = config;
	}

	public async start() {
		if (this.started) return;
		this.started = true;

		const $config = await this.config.getObservableStore();

		const $webdav = createSelector($config, (cfg) => cfg.sync.webdav, {
			updateFilter: (update, state) => !isEqual(update, state),
		});

		// Watch settings: enable / credentials.
		// Skip the synchronous initial emission; we apply once below so start() can await it.
		let seenInitialWebdav = false;
		$webdav.watch((settings) => {
			if (!seenInitialWebdav) {
				seenInitialWebdav = true;
				return;
			}
			void this.onSettingsChange(settings);
		});

		// Any config write that is not applyRemote → local write + debounced push.
		// Skip the initial store.watch emission (current state is not a local write).
		let seenInitialConfig = false;
		$config.watch(() => {
			if (!seenInitialConfig) {
				seenInitialConfig = true;
				return;
			}
			if (this.applyingRemote) return;
			void this.onLocalConfigWrite();
		});

		// Alarms for periodic pull
		if (browser.alarms?.onAlarm) {
			browser.alarms.onAlarm.addListener((alarm) => {
				if (alarm.name === WEBDAV_SYNC_ALARM_NAME) {
					void this.reconcile('alarm');
				}
			});
		}

		// Initial settings application (startup reconcile when configured)
		await this.onSettingsChange($webdav.getState());
	}

	public async getStatus(): Promise<WebDAVSyncStatus> {
		const config = await this.config.get();
		const meta = await getConfigSyncMeta();
		const webdav = config.sync.webdav;
		return {
			...meta,
			enabled: webdav.enabled,
			url: webdav.url,
			path: WEBDAV_CONFIG_PATH,
		};
	}

	/**
	 * Force a reconcile cycle (manual Sync now / test path).
	 */
	public async syncNow(): Promise<WebDAVSyncStatus> {
		await this.reconcile('manual');
		return this.getStatus();
	}

	/**
	 * Test connection with provided or current credentials (GET remote path).
	 */
	public async testConnection(
		override?: Partial<WebDAVCredentials>,
	): Promise<{ ok: boolean; error?: string; status?: number }> {
		const config = await this.config.get();
		const webdav = config.sync.webdav;
		const credentials: WebDAVCredentials = {
			url: override?.url ?? webdav.url,
			username: override?.username ?? webdav.username,
			password: override?.password ?? webdav.password,
			path: WEBDAV_CONFIG_PATH,
		};

		if (credentials.url.trim() === '') {
			return { ok: false, error: 'URL is required' };
		}

		try {
			const client = new WebDAVClient(credentials);
			const result = await client.get();
			// 404 means auth + path parent may be OK (file not created yet)
			if (result.status === 404 || (result.status >= 200 && result.status < 300)) {
				return { ok: true, status: result.status };
			}
			return {
				ok: false,
				status: result.status,
				error: `HTTP ${result.status}`,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Connection failed';
			return { ok: false, error: message };
		}
	}

	private async onSettingsChange(settings: WebDAVSettings) {
		const prev = this.lastSettings;
		this.lastSettings = settings;

		if (!isConfigured(settings)) {
			await this.clearAlarm();
			return;
		}

		const credentialsChanged =
			prev == null ||
			prev.url !== settings.url ||
			prev.username !== settings.username ||
			prev.password !== settings.password ||
			prev.enabled !== settings.enabled;

		// Fixed daily pull; reschedule when enabling / credentials change.
		if (prev == null || credentialsChanged || prev.enabled !== settings.enabled) {
			await this.scheduleAlarm();
		}

		if (credentialsChanged || prev == null) {
			await this.reconcile('startup');
		}
	}

	private async onLocalConfigWrite() {
		const config = await this.config.get();
		if (!isConfigured(config.sync.webdav)) {
			// Still track local write time so LWW works once sync is enabled
			await bumpLocalWriteAt(Date.now());
			return;
		}

		await bumpLocalWriteAt(Date.now());
		this.scheduleDebouncedPush();
	}

	private scheduleDebouncedPush() {
		if (this.pushTimer !== null) {
			clearTimeout(this.pushTimer);
		}
		this.pushTimer = setTimeout(() => {
			this.pushTimer = null;
			void this.reconcile('localWrite');
		}, PUSH_DEBOUNCE_MS);
	}

	private async scheduleAlarm() {
		if (!browser.alarms?.create) return;
		await browser.alarms.clear(WEBDAV_SYNC_ALARM_NAME);
		browser.alarms.create(WEBDAV_SYNC_ALARM_NAME, {
			periodInMinutes: WEBDAV_PULL_INTERVAL_MINUTES,
			delayInMinutes: WEBDAV_PULL_INTERVAL_MINUTES,
		});
	}

	private async clearAlarm() {
		if (!browser.alarms?.clear) return;
		await browser.alarms.clear(WEBDAV_SYNC_ALARM_NAME);
	}

	/**
	 * GET-first reconcile. Serializes concurrent calls via a single in-flight promise.
	 */
	public async reconcile(
		_reason: 'startup' | 'alarm' | 'manual' | 'localWrite',
	): Promise<void> {
		if (this.reconcilePromise) {
			await this.reconcilePromise;
			return;
		}

		this.reconcilePromise = this.runReconcile().finally(() => {
			this.reconcilePromise = null;
		});
		await this.reconcilePromise;
	}

	private async runReconcile(): Promise<void> {
		const config = await this.config.get();
		const settings = config.sync.webdav;

		if (!isConfigured(settings)) {
			return;
		}

		const client = new WebDAVClient({
			url: settings.url,
			username: settings.username,
			password: settings.password,
			path: WEBDAV_CONFIG_PATH,
		});

		const localExt = browser.runtime.getManifest().version;
		let meta = await getConfigSyncMeta();

		// Ensure we have a local write clock
		if (!meta.lastLocalWriteAt) {
			meta = await bumpLocalWriteAt(Date.now());
		}

		let getResult: { status: number; bodyText: string };
		try {
			getResult = await client.get();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'WebDAV GET failed';
			await setConfigSyncMeta({ lastError: message, lastDirection: 'none' });
			return;
		}

		// Create on 404
		if (getResult.status === 404) {
			try {
				const updatedAt = meta.lastLocalWriteAt || Date.now();
				const body = serializeEnvelope(config, updatedAt, localExt);
				await client.put(body);
				await setConfigSyncMeta({
					lastRemoteUpdatedAt: updatedAt,
					lastSyncAt: Date.now(),
					lastError: null,
					lastDirection: 'push',
				});
			} catch (error) {
				const message =
					error instanceof Error ? error.message : 'WebDAV PUT (create) failed';
				await setConfigSyncMeta({ lastError: message, lastDirection: 'none' });
			}
			return;
		}

		if (getResult.status < 200 || getResult.status >= 300) {
			await setConfigSyncMeta({
				lastError: `WebDAV GET failed: HTTP ${getResult.status}`,
				lastDirection: 'none',
			});
			return;
		}

		const parsed = parseEnvelope(getResult.bodyText);

		// Unreadable / invalid envelope — never push over it
		if (!parsed.ok) {
			// Still try to extract extensionVersion for messaging when partial
			const remoteExt = parsed.extensionVersion;
			const remoteUpdatedAt = parsed.updatedAt ?? null;
			const action = decideSyncAction({
				localWriteAt: meta.lastLocalWriteAt,
				remoteUpdatedAt,
				localExt,
				remoteExt,
				remoteConfigValid: false,
				remoteMissing: false,
			});

			const message =
				action === 'skipPushOlderExtension'
					? `Remote config was written by a newer extension (${remoteExt ?? 'unknown'}); upgrade this install to sync. Also: ${parsed.error}`
					: parsed.error;

			await setConfigSyncMeta({
				lastError: message,
				lastDirection: 'none',
				...(remoteUpdatedAt != null
					? { lastRemoteUpdatedAt: remoteUpdatedAt }
					: {}),
			});
			return;
		}

		const remote = parsed.envelope;
		const action = decideSyncAction({
			localWriteAt: meta.lastLocalWriteAt,
			remoteUpdatedAt: remote.updatedAt,
			localExt,
			remoteExt: remote.extensionVersion,
			remoteConfigValid: true,
		});

		if (action === 'noop') {
			await setConfigSyncMeta({
				lastRemoteUpdatedAt: remote.updatedAt,
				lastSyncAt: Date.now(),
				lastError: null,
				lastDirection: 'none',
			});
			return;
		}

		if (action === 'skipPushOlderExtension') {
			// Optional pull already handled inside decide when remote newer+valid;
			// if we landed here, either remote is older/equal or we shouldn't pull.
			await setConfigSyncMeta({
				lastRemoteUpdatedAt: remote.updatedAt,
				lastError: `Remote config was written by a newer extension (${remote.extensionVersion}); upgrade this install to sync.`,
				lastDirection: 'none',
			});
			return;
		}

		if (action === 'skipIncompatibleRemote') {
			await setConfigSyncMeta({
				lastRemoteUpdatedAt: remote.updatedAt,
				lastError: 'Remote config is incompatible with this extension version',
				lastDirection: 'none',
			});
			return;
		}

		if (action === 'pull') {
			try {
				await this.applyRemote(remote.config, remote.updatedAt);
				await setConfigSyncMeta({
					lastLocalWriteAt: remote.updatedAt,
					lastRemoteUpdatedAt: remote.updatedAt,
					lastSyncAt: Date.now(),
					lastError: null,
					lastDirection: 'pull',
				});
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: 'Failed to apply remote config';
				await setConfigSyncMeta({ lastError: message, lastDirection: 'none' });
			}
			return;
		}

		if (action === 'push') {
			try {
				const updatedAt = meta.lastLocalWriteAt || Date.now();
				// Re-read config in case it changed during GET
				const latest = await this.config.get();
				const body = serializeEnvelope(latest, updatedAt, localExt);
				await client.put(body);
				await setConfigSyncMeta({
					lastRemoteUpdatedAt: updatedAt,
					lastSyncAt: Date.now(),
					lastError: null,
					lastDirection: 'push',
				});
			} catch (error) {
				const message =
					error instanceof Error ? error.message : 'WebDAV PUT failed';
				await setConfigSyncMeta({ lastError: message, lastDirection: 'none' });
			}
		}
	}

	private async applyRemote(remoteConfig: AppConfigType, remoteUpdatedAt: number) {
		this.applyingRemote = true;
		try {
			await this.config.set(remoteConfig);
			// Clocks updated by caller; keep applyingRemote until set settles watches
			void remoteUpdatedAt;
		} finally {
			// Allow microtask queue for effector watchers that run sync
			await Promise.resolve();
			this.applyingRemote = false;
		}
	}
}

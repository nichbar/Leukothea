import { isEqual } from 'lodash';
import browser from 'webextension-polyfill';

import { createSelector } from '../../../lib/effector/createSelector';
import {
	decideSyncAction,
	parseEnvelope,
	serializeEnvelope,
} from '../../../lib/webdav/configEnvelope';
import { mergeRemoteConfig, prepareConfigForPush } from '../../../lib/webdav/syncSecrets';
import {
	WebDAVClient,
	WebDAVClientLike,
	WebDAVCredentials,
	WebDAVPreconditionFailedError,
} from '../../../lib/webdav/WebDAVClient';
import { AppConfigType } from '../../../types/runtime';
import { ObservableAsyncStorage } from '../../ConfigStorage/ConfigStorage';

import {
	bumpLocalWriteAt,
	ConfigSyncDirection,
	ConfigSyncMeta,
	getConfigSyncMeta,
	setConfigSyncMeta,
} from './syncMeta';

/** Periodic pull alarm (daily). */
export const WEBDAV_SYNC_ALARM_NAME = 'webdav-config-sync';

/** One-shot push debounce / MV3 reliability backstop after local writes. */
export const WEBDAV_PUSH_ALARM_NAME = 'webdav-config-push';

/** Fixed remote filename under the configured WebDAV base URL. */
export const WEBDAV_CONFIG_PATH = 'linguist/linguist-config.json';

/** Fixed periodic pull interval (once per day). */
export const WEBDAV_PULL_INTERVAL_MINUTES = 1440;

/**
 * Chromium MV3 minimum practical alarm delay is 1 minute.
 * Immediate reconcile runs while the SW is awake; this is the sleep backstop.
 */
export const WEBDAV_PUSH_DEBOUNCE_MINUTES = 1;

/** Cap dirty re-runs in one reconcile() call to avoid tight loops on flaky servers. */
const MAX_DIRTY_RERUNS = 5;

/**
 * How recent a transfer's lastSyncAt must be for a trailing equal-clocks cycle to
 * keep reporting it. chainTransferDirection already covers those in the same drain;
 * this window covers a cycle in a *following* drain — e.g. saveChanges' local-write
 * reconcile pulls, then the manual Sync now cycle finds equal clocks. Without it,
 * the manual sync would report "already in sync" right after a real transfer.
 */
const TRAILING_NOOP_DIRECTION_WINDOW_MS = 30_000;

export type WebDAVSyncStatus = ConfigSyncMeta & {
	enabled: boolean;
	url: string;
	path: string;
};

export type WebDAVSyncManagerOptions = {
	/** Inject client for tests. Defaults to real WebDAVClient. */
	createClient?: (credentials: WebDAVCredentials) => WebDAVClientLike;
};

type WebDAVSettings = AppConfigType['sync']['webdav'];

type ReconcileReason = 'startup' | 'alarm' | 'manual' | 'localWrite';

const isConfigured = (settings: WebDAVSettings): boolean =>
	settings.enabled && settings.url.trim() !== '';

/**
 * Bidirectional WebDAV sync of full AppConfig (last-write-wins + extension version gate).
 *
 * See docs/dev/WebDAVSync.md for the runtime contract (dirty re-run, alarms, conditional PUT).
 */
export class WebDAVSyncManager {
	private readonly config: ObservableAsyncStorage<AppConfigType>;
	private readonly createClient: (credentials: WebDAVCredentials) => WebDAVClientLike;
	private applyingRemote = false;
	private reconcilePromise: Promise<void> | null = null;
	private dirtyWhileReconciling = false;
	/** Most recent trigger reason while a chain is active (used for dirty re-entry). */
	private latestReconcileReason: ReconcileReason = 'manual';
	/**
	 * Successful push/pull inside the current drainReconcile loop.
	 * Trailing noop cycles must not wipe this for status UI ("already in sync"
	 * after a real transfer in the same Sync now / reconcile chain).
	 */
	private chainTransferDirection: 'push' | 'pull' | null = null;
	private started = false;
	private lastSettings: WebDAVSettings | null = null;
	/** One-shot credentials for manual sync/test-aligned reconcile. */
	private credentialsOverride: Partial<WebDAVCredentials> | null = null;

	constructor(
		config: ObservableAsyncStorage<AppConfigType>,
		options?: WebDAVSyncManagerOptions,
	) {
		this.config = config;
		this.createClient =
			options?.createClient ?? ((credentials) => new WebDAVClient(credentials));
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

		// Any config write that is not applyRemote → local write + push schedule.
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

		// Alarms for periodic pull + debounced push backstop
		if (browser.alarms?.onAlarm) {
			browser.alarms.onAlarm.addListener((alarm) => {
				if (alarm.name === WEBDAV_SYNC_ALARM_NAME) {
					void this.reconcile('alarm');
				} else if (alarm.name === WEBDAV_PUSH_ALARM_NAME) {
					void this.reconcile('localWrite');
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
	 * Force a reconcile cycle. Optional credentials override uses the same source
	 * as "Test connection" (form values) so Sync now cannot diverge after save.
	 */
	public async syncNow(
		override?: Partial<WebDAVCredentials>,
	): Promise<WebDAVSyncStatus> {
		this.credentialsOverride = override ?? null;
		try {
			await this.reconcile('manual');
			return this.getStatus();
		} finally {
			this.credentialsOverride = null;
		}
	}

	/**
	 * Manually overwrite a remote envelope that failed AppConfig validation.
	 * Never used by automatic reconcile — only Options "Force push" recovery.
	 */
	public async forcePushRemote(
		override?: Partial<WebDAVCredentials>,
	): Promise<WebDAVSyncStatus> {
		this.credentialsOverride = override ?? null;
		try {
			await this.runForcePushRemote();
			return this.getStatus();
		} finally {
			this.credentialsOverride = null;
		}
	}

	/**
	 * Test connection with provided or current credentials.
	 *
	 * GET-only (same as the original client): 404 means auth worked and the file
	 * is simply not created yet. Do not probe MKCOL here — many servers reject
	 * MKCOL on existing collections (or return 401 for write methods) while
	 * GET/PUT still work. That write-probe is what broke Test after our changes.
	 */
	public async testConnection(
		override?: Partial<WebDAVCredentials>,
	): Promise<{ ok: boolean; error?: string; status?: number }> {
		const config = await this.config.get();
		const webdav = config.sync.webdav;
		const credentials: WebDAVCredentials = {
			url: (override?.url ?? webdav.url).trim(),
			username: (override?.username ?? webdav.username).trim(),
			password: (override?.password ?? webdav.password).replace(/[\r\n]+$/g, ''),
			path: WEBDAV_CONFIG_PATH,
		};

		if (credentials.url.trim() === '') {
			return { ok: false, error: 'URL is required' };
		}

		try {
			const client = this.createClient(credentials);
			const result = await client.get();
			// 404 = auth + base path OK (file not created yet); 2xx = readable
			if (result.status === 404 || (result.status >= 200 && result.status < 300)) {
				return { ok: true, status: result.status };
			}
			if (result.status === 401) {
				return {
					ok: false,
					status: 401,
					error: '401 Unauthorized — check username/password (use an app password if required).',
				};
			}
			if (result.status === 403) {
				return {
					ok: false,
					status: 403,
					error: '403 Forbidden — authenticated but not allowed to read this path.',
				};
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
			await this.clearAlarm(WEBDAV_SYNC_ALARM_NAME);
			await this.clearAlarm(WEBDAV_PUSH_ALARM_NAME);
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
			await this.schedulePullAlarm();
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
		// MV3 backstop: alarm survives SW sleep. Also reconcile immediately while awake.
		await this.schedulePushAlarm();
		void this.reconcile('localWrite');
	}

	private async schedulePullAlarm() {
		if (!browser.alarms?.create) return;
		await browser.alarms.clear(WEBDAV_SYNC_ALARM_NAME);
		browser.alarms.create(WEBDAV_SYNC_ALARM_NAME, {
			periodInMinutes: WEBDAV_PULL_INTERVAL_MINUTES,
			delayInMinutes: WEBDAV_PULL_INTERVAL_MINUTES,
		});
	}

	private async schedulePushAlarm() {
		if (!browser.alarms?.create) return;
		// Reset debounce window on each local write.
		await browser.alarms.clear(WEBDAV_PUSH_ALARM_NAME);
		browser.alarms.create(WEBDAV_PUSH_ALARM_NAME, {
			delayInMinutes: WEBDAV_PUSH_DEBOUNCE_MINUTES,
		});
	}

	private async clearAlarm(name: string) {
		if (!browser.alarms?.clear) return;
		await browser.alarms.clear(name);
	}

	private async clearPushAlarm() {
		await this.clearAlarm(WEBDAV_PUSH_ALARM_NAME);
	}

	/**
	 * GET-first reconcile. Single-flight with dirty re-run if work arrives mid-cycle.
	 *
	 * Every caller marks dirty first. One owner drains until clean (or hit rerun cap).
	 * Waiters await the owner; if dirty remains after the lock is released (gap race),
	 * they re-enter and become the next owner.
	 */
	public async reconcile(reason: ReconcileReason): Promise<void> {
		this.dirtyWhileReconciling = true;
		this.latestReconcileReason = reason;

		if (this.reconcilePromise) {
			await this.reconcilePromise;
			if (this.dirtyWhileReconciling && !this.reconcilePromise) {
				await this.reconcile(this.latestReconcileReason);
			}
			return;
		}

		this.reconcilePromise = this.drainReconcile().finally(() => {
			this.reconcilePromise = null;
		});
		await this.reconcilePromise;

		if (this.dirtyWhileReconciling) {
			await this.reconcile(this.latestReconcileReason);
		}
	}

	private async drainReconcile(): Promise<void> {
		// Reset per drain so a pure equal-clocks sync still reports "already in sync".
		this.chainTransferDirection = null;
		let reruns = 0;
		while (this.dirtyWhileReconciling && reruns < MAX_DIRTY_RERUNS) {
			this.dirtyWhileReconciling = false;
			const cycleReason: ReconcileReason =
				reruns === 0 ? this.latestReconcileReason : 'localWrite';
			await this.runReconcile(cycleReason);
			reruns += 1;
		}
	}

	/**
	 * lastDirection for a successful no-transfer cycle.
	 *
	 * Prefers the in-drain chainTransferDirection, then a transfer that completed in
	 * an immediately-preceding reconcile (same Sync now / saveChanges operation) so a
	 * trailing equal-clocks cycle does not wipe a real push/pull from status UI.
	 */
	private directionForSuccessfulNoop(meta: ConfigSyncMeta): ConfigSyncDirection {
		if (this.chainTransferDirection != null) {
			return this.chainTransferDirection;
		}
		const lastDirection = meta.lastDirection;
		if (
			(lastDirection === 'push' || lastDirection === 'pull') &&
			meta.lastSyncAt != null &&
			Date.now() - meta.lastSyncAt < TRAILING_NOOP_DIRECTION_WINDOW_MS
		) {
			return lastDirection;
		}
		return 'none';
	}

	private async runReconcile(_reason: ReconcileReason): Promise<void> {
		const config = await this.config.get();
		const settings = config.sync.webdav;

		if (!isConfigured(settings)) {
			// Surface a real error so UI does not show "finished" while idle.
			await setConfigSyncMeta({
				lastError:
					'Sync is not configured. Enable WebDAV sync, set a base URL, and save settings first.',
				lastDirection: 'none',
				recovery: null,
			});
			return;
		}

		const override = this.credentialsOverride;
		const client = this.createClient({
			url: (override?.url ?? settings.url).trim(),
			username: (override?.username ?? settings.username).trim(),
			password: (override?.password ?? settings.password).replace(/[\r\n]+$/g, ''),
			path: WEBDAV_CONFIG_PATH,
		});

		const localExt = browser.runtime.getManifest().version;
		let meta = await getConfigSyncMeta();

		// Ensure we have a local write clock
		if (!meta.lastLocalWriteAt) {
			meta = await bumpLocalWriteAt(Date.now());
		}

		let getResult: { status: number; bodyText: string; etag: string | null };
		try {
			getResult = await client.get();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'WebDAV GET failed';
			await setConfigSyncMeta({
				lastError: message,
				lastDirection: 'none',
				recovery: null,
			});
			return;
		}

		// Create on 404
		if (getResult.status === 404) {
			await this.pushCreate(client, localExt);
			return;
		}

		if (getResult.status < 200 || getResult.status >= 300) {
			const detail =
				getResult.status === 401
					? 'WebDAV GET failed: 401 Unauthorized. Check username/password (or app password).'
					: getResult.status === 403
						? 'WebDAV GET failed: 403 Forbidden. Authenticated but not allowed to read this path.'
						: `WebDAV GET failed: HTTP ${getResult.status}`;
			await setConfigSyncMeta({
				lastError: detail,
				lastDirection: 'none',
				recovery: null,
			});
			return;
		}

		// Remember etag from successful GET for conditional update
		if (getResult.etag != null) {
			meta = await setConfigSyncMeta({ lastRemoteEtag: getResult.etag });
		}

		const parsed = parseEnvelope(getResult.bodyText);

		// Unreadable / invalid envelope — never auto-push; offer manual force push
		if (!parsed.ok) {
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
				recovery: 'forcePushInvalidRemote',
				...(remoteUpdatedAt != null
					? { lastRemoteUpdatedAt: remoteUpdatedAt }
					: {}),
			});
			return;
		}

		const remote = parsed.envelope;
		// Re-read local write clock — may have advanced during GET
		meta = await getConfigSyncMeta();
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
				recovery: null,
				// Keep push/pull from an earlier cycle in this drain (trailing noop).
				lastDirection: this.directionForSuccessfulNoop(meta),
				...(getResult.etag != null ? { lastRemoteEtag: getResult.etag } : {}),
			});
			await this.clearPushAlarm();
			return;
		}

		if (action === 'skipPushOlderExtension') {
			await setConfigSyncMeta({
				lastRemoteUpdatedAt: remote.updatedAt,
				lastError: `Remote config was written by a newer extension (${remote.extensionVersion}); upgrade this install to sync.`,
				lastDirection: 'none',
				recovery: null,
				...(getResult.etag != null ? { lastRemoteEtag: getResult.etag } : {}),
			});
			return;
		}

		if (action === 'skipIncompatibleRemote') {
			await setConfigSyncMeta({
				lastRemoteUpdatedAt: remote.updatedAt,
				lastError: 'Remote config is incompatible with this extension version',
				lastDirection: 'none',
				recovery: null,
				...(getResult.etag != null ? { lastRemoteEtag: getResult.etag } : {}),
			});
			return;
		}

		if (action === 'pull') {
			try {
				await this.applyRemote(remote.config, remote.updatedAt);
				this.chainTransferDirection = 'pull';
				await setConfigSyncMeta({
					lastLocalWriteAt: remote.updatedAt,
					lastRemoteUpdatedAt: remote.updatedAt,
					lastSyncAt: Date.now(),
					lastError: null,
					lastDirection: 'pull',
					recovery: null,
					...(getResult.etag != null ? { lastRemoteEtag: getResult.etag } : {}),
				});
				await this.clearPushAlarm();
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: 'Failed to apply remote config';
				await setConfigSyncMeta({
					lastError: message,
					lastDirection: 'none',
					recovery: null,
				});
			}
			return;
		}

		if (action === 'push') {
			await this.pushUpdate(
				client,
				localExt,
				getResult.etag ?? meta.lastRemoteEtag,
				remote.config,
			);
		}
	}

	/**
	 * Safety re-GET then conditional PUT of local config over an invalid remote.
	 * Aborts if the remote is readable again (user should Sync now for LWW).
	 */
	private async runForcePushRemote(): Promise<void> {
		const config = await this.config.get();
		const settings = config.sync.webdav;

		if (!isConfigured(settings)) {
			await setConfigSyncMeta({
				lastError:
					'Sync is not configured. Enable WebDAV sync, set a base URL, and save settings first.',
				lastDirection: 'none',
				recovery: null,
			});
			return;
		}

		const override = this.credentialsOverride;
		const client = this.createClient({
			url: (override?.url ?? settings.url).trim(),
			username: (override?.username ?? settings.username).trim(),
			password: (override?.password ?? settings.password).replace(/[\r\n]+$/g, ''),
			path: WEBDAV_CONFIG_PATH,
		});

		const localExt = browser.runtime.getManifest().version;
		let meta = await getConfigSyncMeta();
		if (!meta.lastLocalWriteAt) {
			meta = await bumpLocalWriteAt(Date.now());
		}

		const tryForceOnce = async (
			etag: string | null,
		): Promise<'done' | 'retry412'> => {
			let getResult: { status: number; bodyText: string; etag: string | null };
			try {
				getResult = await client.get();
			} catch (error) {
				const message =
					error instanceof Error ? error.message : 'WebDAV GET failed';
				await setConfigSyncMeta({
					lastError: message,
					lastDirection: 'none',
					recovery: null,
				});
				return 'done';
			}

			if (getResult.status === 404) {
				// Nothing to recover — normal create path is fine
				await this.pushCreate(client, localExt);
				return 'done';
			}

			if (getResult.status < 200 || getResult.status >= 300) {
				const detail =
					getResult.status === 401
						? 'WebDAV GET failed: 401 Unauthorized. Check username/password (or app password).'
						: getResult.status === 403
							? 'WebDAV GET failed: 403 Forbidden. Authenticated but not allowed to read this path.'
							: `WebDAV GET failed: HTTP ${getResult.status}`;
				await setConfigSyncMeta({
					lastError: detail,
					lastDirection: 'none',
					recovery: null,
				});
				return 'done';
			}

			const effectiveEtag = getResult.etag ?? etag;
			if (getResult.etag != null) {
				await setConfigSyncMeta({ lastRemoteEtag: getResult.etag });
			}

			const parsed = parseEnvelope(getResult.bodyText);
			if (parsed.ok) {
				await setConfigSyncMeta({
					lastError:
						'Remote config is readable again. Use Sync now instead of force push.',
					lastDirection: 'none',
					recovery: null,
					lastRemoteUpdatedAt: parsed.envelope.updatedAt,
					...(effectiveEtag != null ? { lastRemoteEtag: effectiveEtag } : {}),
				});
				return 'done';
			}

			// Still invalid — overwrite with local (create-style payload; no remote secrets to preserve)
			try {
				meta = await getConfigSyncMeta();
				const updatedAt = meta.lastLocalWriteAt || Date.now();
				const latest = await this.config.get();
				const payload = prepareConfigForPush(latest, null);
				const body = serializeEnvelope(payload, updatedAt, localExt);
				const putResult = await client.put(body, {
					...(effectiveEtag != null && effectiveEtag !== ''
						? { ifMatch: effectiveEtag }
						: {}),
				});
				this.chainTransferDirection = 'push';
				await setConfigSyncMeta({
					lastRemoteUpdatedAt: updatedAt,
					lastSyncAt: Date.now(),
					lastError: null,
					lastDirection: 'push',
					recovery: null,
					lastRemoteEtag: putResult.etag ?? effectiveEtag,
				});
				await this.clearPushAlarm();
				return 'done';
			} catch (error) {
				if (error instanceof WebDAVPreconditionFailedError) {
					await setConfigSyncMeta({ lastRemoteEtag: null });
					return 'retry412';
				}
				const message =
					error instanceof Error ? error.message : 'WebDAV PUT failed';
				await setConfigSyncMeta({
					lastError: message,
					lastDirection: 'none',
					// Keep recovery so the user can try force push again
					recovery: 'forcePushInvalidRemote',
				});
				return 'done';
			}
		};

		// One 412 retry: re-GET; if still invalid, force with new etag; if valid, abort.
		const first = await tryForceOnce(meta.lastRemoteEtag);
		if (first === 'retry412') {
			await tryForceOnce(null);
		}
	}

	private async pushCreate(client: WebDAVClientLike, localExt: string): Promise<void> {
		try {
			const meta = await getConfigSyncMeta();
			const updatedAt = meta.lastLocalWriteAt || Date.now();
			const latest = await this.config.get();
			const payload = prepareConfigForPush(latest, null);
			const body = serializeEnvelope(payload, updatedAt, localExt);
			const putResult = await client.put(body, { createOnly: true });
			this.chainTransferDirection = 'push';
			await setConfigSyncMeta({
				lastRemoteUpdatedAt: updatedAt,
				lastSyncAt: Date.now(),
				lastError: null,
				lastDirection: 'push',
				recovery: null,
				lastRemoteEtag: putResult.etag ?? null,
			});
			await this.clearPushAlarm();
		} catch (error) {
			if (error instanceof WebDAVPreconditionFailedError) {
				// File appeared mid-flight — re-run as normal reconcile
				this.dirtyWhileReconciling = true;
				await setConfigSyncMeta({
					lastError: 'Remote file appeared during create; retrying',
					lastDirection: 'none',
					recovery: null,
				});
				return;
			}
			const message =
				error instanceof Error ? error.message : 'WebDAV PUT (create) failed';
			await setConfigSyncMeta({
				lastError: message,
				lastDirection: 'none',
				recovery: null,
			});
		}
	}

	private async pushUpdate(
		client: WebDAVClientLike,
		localExt: string,
		etag: string | null,
		remoteConfig: AppConfigType | null,
	): Promise<void> {
		try {
			// Always re-read clocks + config at push time (mid-cycle edits)
			const meta = await getConfigSyncMeta();
			const updatedAt = meta.lastLocalWriteAt || Date.now();
			const latest = await this.config.get();
			const payload = prepareConfigForPush(latest, remoteConfig);
			const body = serializeEnvelope(payload, updatedAt, localExt);
			const putResult = await client.put(body, {
				// Only send If-Match when we have an etag; otherwise degrade to unconditional.
				...(etag != null && etag !== '' ? { ifMatch: etag } : {}),
			});
			this.chainTransferDirection = 'push';
			await setConfigSyncMeta({
				lastRemoteUpdatedAt: updatedAt,
				lastSyncAt: Date.now(),
				lastError: null,
				lastDirection: 'push',
				recovery: null,
				lastRemoteEtag: putResult.etag ?? etag,
			});
			await this.clearPushAlarm();
		} catch (error) {
			if (error instanceof WebDAVPreconditionFailedError) {
				// Remote changed under us — mark dirty so outer loop re-GETs and re-decides
				this.dirtyWhileReconciling = true;
				await setConfigSyncMeta({
					lastError:
						'Remote config changed on another device (precondition failed); retrying',
					lastDirection: 'none',
					recovery: null,
					lastRemoteEtag: null,
				});
				return;
			}
			const message = error instanceof Error ? error.message : 'WebDAV PUT failed';
			await setConfigSyncMeta({
				lastError: message,
				lastDirection: 'none',
				recovery: null,
			});
		}
	}

	private async applyRemote(remoteConfig: AppConfigType, remoteUpdatedAt: number) {
		this.applyingRemote = true;
		try {
			const local = await this.config.get();
			const merged = mergeRemoteConfig(remoteConfig, local);
			await this.config.set(merged);
			// Clocks updated by caller; keep applyingRemote until set settles watches
			void remoteUpdatedAt;
		} finally {
			// Allow microtask queue for effector watchers that run sync
			await Promise.resolve();
			this.applyingRemote = false;
		}
	}
}

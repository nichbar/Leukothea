import browser from 'webextension-polyfill';

import { decodeStruct, type } from '../../../lib/types';

export const CONFIG_SYNC_META_KEY = 'configSyncMeta';

export type ConfigSyncDirection = 'push' | 'pull' | 'none';

/** Manual recovery action the Options UI may offer after a failed sync. */
export type ConfigSyncRecovery = 'forcePushInvalidRemote';

export type ConfigSyncMeta = {
	lastLocalWriteAt: number;
	lastRemoteUpdatedAt: number;
	lastSyncAt: number | null;
	lastError: string | null;
	lastDirection: ConfigSyncDirection | null;
	/** Last known remote ETag for conditional PUT (null if unknown / unsupported). */
	lastRemoteEtag: string | null;
	/**
	 * When set, Options may offer a recovery action (e.g. force-push over a
	 * remote envelope that failed AppConfig validation). Cleared on success
	 * and on non-recovery errors.
	 */
	recovery: ConfigSyncRecovery | null;
};

const ConfigSyncMetaCodec = type.type({
	lastLocalWriteAt: type.number,
	lastRemoteUpdatedAt: type.number,
	lastSyncAt: type.union([type.number, type.null]),
	lastError: type.union([type.string, type.null]),
	lastDirection: type.union([
		type.literal('push'),
		type.literal('pull'),
		type.literal('none'),
		type.null,
	]),
	// Optional in stored blobs for forward-compat with meta written before etag support.
	lastRemoteEtag: type.union([type.string, type.null]),
	// Optional for meta written before recovery UX.
	recovery: type.union([type.literal('forcePushInvalidRemote'), type.null]),
});

export const defaultConfigSyncMeta = (): ConfigSyncMeta => ({
	lastLocalWriteAt: 0,
	lastRemoteUpdatedAt: 0,
	lastSyncAt: null,
	lastError: null,
	lastDirection: null,
	lastRemoteEtag: null,
	recovery: null,
});

export const getConfigSyncMeta = async (): Promise<ConfigSyncMeta> => {
	const { [CONFIG_SYNC_META_KEY]: raw } =
		await browser.storage.local.get(CONFIG_SYNC_META_KEY);

	if (raw === undefined) {
		return defaultConfigSyncMeta();
	}

	// Accept legacy meta without lastRemoteEtag by filling the default.
	const withDefaults =
		raw != null && typeof raw === 'object' && !Array.isArray(raw)
			? { ...defaultConfigSyncMeta(), ...(raw as Record<string, unknown>) }
			: raw;

	const decoded = decodeStruct(ConfigSyncMetaCodec, withDefaults);
	if (decoded.errors !== null) {
		return defaultConfigSyncMeta();
	}

	return decoded.data;
};

export const setConfigSyncMeta = async (
	meta: ConfigSyncMeta | Partial<ConfigSyncMeta>,
): Promise<ConfigSyncMeta> => {
	const current = await getConfigSyncMeta();
	const next: ConfigSyncMeta = {
		...current,
		...meta,
	};
	await browser.storage.local.set({ [CONFIG_SYNC_META_KEY]: next });
	return next;
};

export const bumpLocalWriteAt = async (
	at: number = Date.now(),
): Promise<ConfigSyncMeta> => {
	return setConfigSyncMeta({ lastLocalWriteAt: at });
};
